import {
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Roles } from '../../auth/roles.decorator.js';
import type { AuthenticatedRequest } from '../../auth/session.types.js';
import { FuelDocumentService } from '../fuel/fuel-document.service.js';
import type { FuelDocumentDetail } from '../fuel/fuel-document.types.js';
import { FuelReadService } from '../fuel/fuel-read.service.js';
import { FuelService } from '../fuel/fuel.service.js';
import type { FuelReceiptEvidenceView } from '../fuel/fuel.types.js';
import { TransportDomainError } from '../transport.errors.js';
import {
  RequiresTransportAction,
  TransportActionGuard,
  transportErrorToHttp,
} from '../transport-action.guard.js';
import { transportActorOf } from '../transport-actor.js';
import { sendEvidence, uploadedBytes, type UploadedEvidenceFile } from './evidence-http.js';
import { TransportEvidenceService } from './transport-evidence.service.js';

/**
 * ANH CHUNG TU cua phieu dau — BE MAT VAN HANH (`#169`).
 *
 * Doi ban cua `DriverFuelEvidenceController`, va la HAI controller chu khong mot: cung ly le da
 * dung cho `DriverFuelController` / `FuelEntriesController` o T4 (`GD-23`). Nhap chung roi re nhanh
 * theo vai se lam mot lan doi quyen o mot nhanh am tham mo be mat kia.
 *
 * Cung KHONG co ma hanh dong moi:
 *   · tai anh HO mot lai xe  -> `transport.fuel.entry.submit_for_driver` (dung ma ma T4 danh cho
 *     "nop/sua HO mot phieu" — quyen ma khong lai xe nao co);
 *   · xem anh                -> `transport.fuel.entry.read`.
 *
 * Ke toan xem duoc anh cua MOI phieu, va do la dung: doi soat bang ke voi cay xang la cong viec cua
 * ho. Khong co pham vi "cua chinh minh" o be mat nay, nen khong co phep kiem so huu — cong la chinh
 * ma hanh dong.
 */
@Controller('transport/fuel/entries/:id/evidence')
@UseGuards(TransportActionGuard)
export class FuelEvidenceController {
  constructor(
    private readonly evidence: TransportEvidenceService,
    private readonly fuel: FuelService,
    private readonly read: FuelReadService,
    private readonly documents: FuelDocumentService,
  ) {}

  /**
   * `upload` la duong rieng — cung ly do voi `DriverFuelEvidenceController`.
   *
   * `FuelEntriesController` giu `POST entries/:id/evidence` (gan chuoi dinh vi) va duoc dang ky
   * TRUOC controller nay, nen route tai anh o day bi che khuat y het ban cua lai xe. Khac dung mot
   * dieu: chua giao dien nao goi no, nen khong ai bao cao. Mot route chet ma khong ai keu con kho
   * thay hon mot route chet co nguoi keu.
   */
  @Post('upload')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.fuel.entry.submit_for_driver')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @UploadedFile() file: UploadedEvidenceFile | undefined,
  ): Promise<FuelReceiptEvidenceView> {
    const upload = uploadedBytes(file);
    return this.guard(async () => {
      const stored = await this.evidence.put(upload);
      // `attachEvidence` tu chan phieu da nam trong ky doi soat DA CHOT (T4R §4) — khong lap lai
      // phep kiem do o day.
      return this.fuel.attachEvidence(
        id,
        { locator: stored.locator, contentType: stored.contentType, byteSize: stored.byteSize },
        transportActorOf(request),
      );
    });
  }

  @Get(':evidenceId')
  @RequiresTransportAction('transport.fuel.entry.read')
  async serve(
    @Param('id') id: string,
    @Param('evidenceId') evidenceId: string,
    @Res() response: Response,
  ): Promise<void> {
    const row = await this.guard(() => this.read.fuelEntryEvidence(id, evidenceId));
    sendEvidence(response, await this.guard(() => this.evidence.read(row.locator)));
  }

  /**
   * DOC MOT TAM ANH DA LUU — `#295` Lane V, canh con thieu cua chuoi bang chung.
   *
   * ============================================================================================
   * CHUOI NAY TRUOC DAY DUT O DUNG MOT CHO
   * ============================================================================================
   *
   * Hai nua deu da ton tai va deu chay:
   *
   * ```text
   *   TAI LEN (chay)                          TRICH XUAT (chay)
   *   evidence.put(bytes)                     Buffer.from(base64)
   *     -> locator ben vung                     -> FuelReceiptExtractionPort.extract()
   *     -> TransportFuelReceiptEvidence         -> TransportFuelCandidate + do tin cay
   *                          ^  KHONG CANH NAO  ^
   * ```
   *
   * `FuelReceiptExtractionPort.extract()` nhan mot `Buffer`, khong nhan mot dinh vi, va caller san
   * xuat duy nhat cua no la `POST /transport/fuel/documents/image` — mot route nhan `contentBase64`
   * tu than yeu cau. Hau qua doc len rat don gian: **anh phieu do lai xe tai len khong bao gio
   * trich xuat duoc**. Ke toan muon doc no phai tai ve roi dan lai duoi dang base64.
   *
   * ============================================================================================
   * VI SAO CUA VAO LA `evidenceId` CHU KHONG PHAI MOT DINH VI
   * ============================================================================================
   *
   * Duong de nhat la nhan `{ locator }` tu client. Nhung the thi client phai BIET dinh vi — dung
   * thu ma cung lane nay vua cat khoi moi DTO (xem `FuelReceiptEvidenceView`). Nhan `evidenceId`
   * roi tu tra cuu dinh vi o phia may chu giu duoc ca hai: client khong hoc duoc khoa kho, va
   * `fuelEntryEvidence()` doi chieu tam anh voi DUNG phieu nen doi `:evidenceId` sang cua phieu
   * khac se khong ra gi.
   *
   * Khong ma hanh dong moi: `transport.fuel.document.ingest` — cung ma voi hai cua vao kia, vi
   * nghiep vu la MOT (dua mot chung tu nguon vao he thong). `Throttle` chat bang duong anh: moi lan
   * goi o day la mot lan doc anh, ton tien that.
   *
   * `sourceRef` mang `id` cua tam anh, KHONG mang dinh vi: no nam trong mot hang se doc ra o mau
   * kiem duyet, va mot khoa kho o do se lam chinh viec vua cat o tren tro nen vo nghia.
   *
   * Anh khong doc duoc (PDF, tep hong, qua lon) KHONG nem: `guardReceiptImage` cua `#243` tu choi
   * o tang duoi va `ingestReceiptImage` ghi mot chung tu `REJECTED` kem ly do. Do la mot ket qua
   * nghiep vu doc duoc, khong phai mot loi ha tang.
   */
  @Post(':evidenceId/extract')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.fuel.document.ingest')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  extract(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('evidenceId') evidenceId: string,
  ): Promise<FuelDocumentDetail> {
    return this.guard(async () => {
      const row = await this.read.fuelEntryEvidence(id, evidenceId);
      const stored = await this.evidence.read(row.locator);
      if (stored.kind === 'MISSING') {
        throw TransportDomainError.notFound(
          'FUEL_EVIDENCE_NOT_FOUND',
          `Byte cua bang chung ${evidenceId} khong con trong kho anh`,
        );
      }

      return this.documents.ingestReceiptImage(
        {
          sourceRef: `fuel-evidence:${row.id}`,
          mediaType: stored.object.contentType,
          content: stored.object.body,
        },
        transportActorOf(request),
      );
    });
  }

  private async guard<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      return transportErrorToHttp(error);
    }
  }
}
