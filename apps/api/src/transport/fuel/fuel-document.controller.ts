import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { z } from 'zod';
import { Roles } from '../../auth/roles.decorator.js';
import type { AuthenticatedRequest } from '../../auth/session.types.js';
import {
  RequiresTransportAction,
  TransportActionGuard,
  transportErrorToHttp,
} from '../transport-action.guard.js';
import { transportActorOf } from '../transport-actor.js';
import { firstIssue } from '../transport.schemas.js';
import {
  ingestFuelDocumentSchema,
  ingestFuelReceiptImageSchema,
  listFuelDocumentsQuerySchema,
} from './fuel-document.schemas.js';
import { FuelDocumentService } from './fuel-document.service.js';

/**
 * CHUNG TU NGUON NHIEN LIEU qua HTTP — be mat VAN HANH (Giam doc / Ke toan).
 *
 * ===========================================================================
 * KHONG CO `DELETE`, VA KHONG CO `PATCH`.
 *
 * Mot chung tu la ANH CHUP cua mot thu ai do gui vao he thong, va mot ung vien la ket qua doc anh
 * chup do. Sua chung nghia la noi doi ve viec chung tu da noi gi. Khi phep doc sai, duong dung la
 * sua BO DOC roi nhap lai — va vi phep doc TAT DINH, lan nhap lai cho ra dung bo ung vien moi.
 *
 * Mot chung tu BI TU CHOI cung khong xoa duoc: no la bang chung rang mot thu gi do da den va khong
 * doc duoc. Xoa no di lam nguoi doi soat thay mot thang thieu chung tu ma khong biet thieu bao nhieu.
 */
@Controller('transport/fuel')
@UseGuards(TransportActionGuard)
export class FuelDocumentController {
  constructor(private readonly documents: FuelDocumentService) {}

  @Get('documents')
  @RequiresTransportAction('transport.fuel.document.read')
  list(@Query() query: unknown) {
    const parsed = listFuelDocumentsQuerySchema.parse(query ?? {});
    return this.guard(() =>
      this.documents.listDocuments({
        supplierId: parsed.supplierId ?? null,
        status: parsed.status ?? null,
        limit: parsed.limit,
        offset: parsed.offset,
      }),
    );
  }

  @Get('documents/:id')
  @RequiresTransportAction('transport.fuel.document.read')
  detail(@Param('id') id: string) {
    return this.guard(() => this.documents.documentDetail(id));
  }

  /**
   * CHUNG TU KEM MOI DIEU KHONG ON CUA NO — duong doc cua man hinh ra soat (C4).
   *
   * `.read` chu khong mot ma moi: day la cung mot chung tu, chi kem ket qua cua nhung phep kiem
   * TAT DINH chay luc doc. Che mot quyen moi cho mot goc nhin moi tren cung mot du lieu se lam
   * bang phan quyen mo ta CONG NGHE thay vi mo ta NGHIEP VU.
   */
  @Get('documents/:id/review')
  @RequiresTransportAction('transport.fuel.document.read')
  review(@Param('id') id: string) {
    return this.guard(() => this.documents.documentReview(id));
  }

  /**
   * NHAP MOT CHUNG TU.
   *
   * `Throttle` chat hon duong nop phieu cua lai xe: moi lan goi la mot lan doc XML va (o duong
   * thanh cong) mot giao dich ghi N hang. Duong nay duoc goi boi mot tien trinh, nen mot vong lap
   * hong o phia ben kia se dap vao day chu khong vao mot con nguoi.
   *
   * Tra ve `200` cho CA BON ket cuc — ke ca `REJECTED` va `DUPLICATE`. Do la co y: ca bon deu la
   * mot lan nhap DA DUOC GHI NHAN, va ben goi can doc `status` de biet chuyen gi da xay ra. Mot
   * `4xx` cho chung tu khong doc duoc se lam tien trinh goi coi day la loi cua chinh no va gui lai
   * mai mai.
   */
  @Post('documents')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.fuel.document.ingest')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  ingest(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = this.parse(ingestFuelDocumentSchema, body);
    // `Buffer.from(..., 'base64')` KHONG nem tren chuoi rac — no bo qua ky tu la va tra ve mot
    // buffer ngan hon. Nen mot chuoi hong di tiep xuong tang doc va ra `MALFORMED_XML` co ten,
    // thay vi mot `500` khong noi gi.
    const content = Buffer.from(input.contentBase64, 'base64');
    return this.guard(() =>
      this.documents.ingest(
        { sourceRef: input.sourceRef, kind: input.kind, content },
        transportActorOf(request),
      ),
    );
  }

  /**
   * NHAP MOT BUC ANH PHIEU DO DAU (C3).
   *
   * `transport.fuel.document.ingest` — CUNG mot hanh dong voi duong XML, khong mot ma quyen moi.
   * Nghiep vu la mot: dua mot chung tu nguon vao he thong. Ai duoc lam viec do thi duoc lam bang ca
   * hai duong; tach ra se lam bang phan quyen mo ta CONG NGHE thay vi mo ta viec.
   *
   * `Throttle` CHAT HON duong XML — mot phan sau — vi moi lan goi o day la mot lan doc anh: ton
   * tien that va thoi gian that. Mot vong lap hong o phia goi dap vao han nay truoc khi no dap vao
   * hoa don cua khach.
   */
  @Post('documents/image')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.fuel.document.ingest')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  ingestImage(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = this.parse(ingestFuelReceiptImageSchema, body);
    const content = Buffer.from(input.contentBase64, 'base64');
    return this.guard(() =>
      this.documents.ingestReceiptImage(
        { sourceRef: input.sourceRef, mediaType: input.mediaType, content },
        transportActorOf(request),
      ),
    );
  }

  private parse<S extends z.ZodType>(schema: S, body: unknown): z.infer<S> {
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(firstIssue(parsed.error));
    return parsed.data as z.infer<S>;
  }

  private async guard<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      return transportErrorToHttp(error);
    }
  }
}
