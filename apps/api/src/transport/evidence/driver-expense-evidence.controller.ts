import {
  BadRequestException,
  Body,
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
import type { z } from 'zod';
import { Roles } from '../../auth/roles.decorator.js';
import type { AuthenticatedRequest } from '../../auth/session.types.js';
import { CostingReadService } from '../costing/costing-read.service.js';
import type { CorrelatedPosting } from '../costing/costing.repository.js';
import { driverSelfExpenseMultipartSchema } from '../costing/costing.schemas.js';
import { CostingService } from '../costing/costing.service.js';
import {
  RequiresTransportAction,
  TransportActionGuard,
  requireAuthUserId,
  transportErrorToHttp,
} from '../transport-action.guard.js';
import { transportActorOf } from '../transport-actor.js';
import { firstIssue } from '../transport.schemas.js';
import { sendEvidence, uploadedBytes, type UploadedEvidenceFile } from './evidence-http.js';
import { TransportEvidenceService } from './transport-evidence.service.js';

/**
 * BANG CHUNG cho KHOAN CHI THUONG cua lai xe — acceptance 4 cua #169, mo duoc sau khi #179 dua
 * `POST /transport/me/expenses` vao `main`.
 *
 * BA quyet dinh o day khac voi be mat phieu dau, va ca ba deu la HE QUA cua mot su that ve luu tru.
 *
 * ### 1. GHI ANH VA GHI KHOAN CHI LA MOT LAN GOI — vi khong the la hai
 *
 * Phieu dau giu bang chung o mot BANG CON (`TransportFuelReceiptEvidence`), nen "gan them mot anh"
 * la mot lan THEM HANG. Khoan chi thi giu bang chung o mot COT tren chinh hang do
 * (`TransportTripExpense.evidenceLocator` — xem chu thich cua no trong `schema.prisma`).
 *
 * Nen mot route `POST /me/expenses/:id/evidence` theo khuon phieu dau se phai SUA mot hang DA GHI
 * — dung dieu `INV-22` cam va la ly do so cai nay append-only. Vi vay o day chi co MOT route tao:
 * gui ca truong lan tep, byte vao kho truoc, roi khoan chi duoc ghi kem dinh vi ngay tu `INSERT`.
 *
 * ### 2. KIEM QUYEN TRUOC KHI LUU BYTE
 *
 * `MediaStore` khong co lenh xoa (`media-store.ts`). Neu ghi byte roi moi de `recordSelfTripExpense`
 * tu choi, moi lan tu choi de lai mot object mo coi khong ai don. Nen thu tu la
 * **danh gia som → luu byte → ghi khoan chi**, dung khuon `DriverFuelEvidenceController`
 * (`getMyFuelSlip` → `put` → `attach`).
 *
 * `assertSelfTripExpenseAllowed()` KHONG phai mot luat thu hai: no goi dung hai phep kiem ma lenh
 * ghi se goi lai, va lenh ghi van kiem lai day du.
 *
 * ### 3. KHONG MOT MA HANH DONG MOI NAO
 *
 * Bang chung THUA KE cong cua chung tu no gan vao — cung nguyen tac da ghi o
 * `DriverFuelEvidenceController`. Ca hai route deu doi `transport.driver.self.expense.record`
 * (ma cua #179 B3). Khoan chi khong co mot ma "chi doc" rieng, va bia ra mot bo
 * `transport.evidence.*` se tao HAI phep kiem cho cung mot cau hoi.
 */
@Controller('transport/me/expenses')
@UseGuards(TransportActionGuard)
export class DriverExpenseEvidenceController {
  constructor(
    private readonly evidence: TransportEvidenceService,
    private readonly costing: CostingService,
    private readonly read: CostingReadService,
  ) {}

  @Post('with-evidence')
  @Roles('SALE', 'ADMIN')
  @RequiresTransportAction('transport.driver.self.expense.record')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file'))
  record(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
    @UploadedFile() file: UploadedEvidenceFile | undefined,
  ): Promise<CorrelatedPosting> {
    const authUserId = requireAuthUserId(request);
    const input = this.parse(driverSelfExpenseMultipartSchema, body);
    const upload = uploadedBytes(file);
    return this.guard(async () => {
      await this.costing.assertSelfTripExpenseAllowed(authUserId, input.tripId);
      const stored = await this.evidence.put(upload);
      return this.costing.recordSelfTripExpense(
        authUserId,
        { ...input, evidenceLocator: stored.locator },
        transportActorOf(request),
      );
    });
  }

  @Get(':expenseId/evidence')
  @Roles('SALE', 'ADMIN')
  @RequiresTransportAction('transport.driver.self.expense.record')
  async serve(
    @Req() request: AuthenticatedRequest,
    @Param('expenseId') expenseId: string,
    @Res() response: Response,
  ): Promise<void> {
    const authUserId = requireAuthUserId(request);
    const row = await this.guard(() => this.read.selfTripExpenseEvidence(authUserId, expenseId));
    sendEvidence(response, await this.guard(() => this.evidence.read(row.locator)));
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
