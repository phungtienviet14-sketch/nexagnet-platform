import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../auth/roles.decorator.js';
import type { AuthenticatedRequest } from '../../auth/session.types.js';
import {
  RequiresTransportAction,
  TransportActionGuard,
  requireAuthUserId,
  transportErrorToHttp,
} from '../transport-action.guard.js';
import { firstIssue } from '../transport.schemas.js';
import {
  officeHandoverSchema,
  recordDocumentSchema,
  withdrawDocumentSchema,
} from './document.schemas.js';
import { OperationalDocumentService } from './document.service.js';
import type { OperationalDocument } from './document.types.js';
import { PhysicalReceiptHandoverService } from './handover.service.js';
import type { PhysicalReceiptHandover, ReceiptHandoverStatus } from './handover.types.js';

/**
 * BE MAT VAN HANH cua chung tu van hanh va ban giao bien nhan — `#279` O1/O7/O11.
 *
 * Tach han khoi `DriverDocumentsController`, cung quy uoc voi cap `driver-checkpoints`/
 * `checkpoints`: hai be mat, hai quyen, hai duong ghi khac han nhau.
 *
 * `transport.operational_document.withdraw` nam trong `ACCOUNTING_DENIED`. Ke toan DOC duoc moi
 * chung tu — do la ca cong viec cua ho — nhung go mot to ra khoi chinh ho so ho dang doi soat thi
 * khong. `#279` O12: *"[Accounting] cannot mutate source evidence used for its own acceptance
 * decision"*.
 *
 * KHONG mot tuyen nao o day dung vao `TransportOrder`. Ghi `RETURNED_TO_OFFICE` la mot su that VAN
 * HANH; bam `Da ket thuc` la mot quyet dinh THUONG MAI cua Lane K.
 */
@Controller('transport')
@UseGuards(TransportActionGuard)
export class DocumentsController {
  constructor(
    private readonly documents: OperationalDocumentService,
    private readonly handovers: PhysicalReceiptHandoverService,
  ) {}

  @Get('runs/:runId/documents')
  @Roles('ADMIN', 'ACCOUNTING')
  @RequiresTransportAction('transport.operational_document.read')
  listForRun(@Param('runId') runId: string): Promise<readonly OperationalDocument[]> {
    return this.guard(() => this.documents.listForRun(runId));
  }

  @Get('orders/:orderId/documents')
  @Roles('ADMIN', 'ACCOUNTING')
  @RequiresTransportAction('transport.operational_document.read')
  listForOrder(@Param('orderId') orderId: string): Promise<readonly OperationalDocument[]> {
    return this.guard(() => this.documents.listForOrder(orderId));
  }

  @Get('orders/:orderId/receipt-handover')
  @Roles('ADMIN', 'ACCOUNTING')
  @RequiresTransportAction('transport.operational_document.read')
  handoverStatus(@Param('orderId') orderId: string): Promise<ReceiptHandoverStatus> {
    return this.guard(() => this.handovers.statusOf(orderId));
  }

  /**
   * `runId` lay tu DUONG DAN, khong tu than yeu cau: mot lieu do vua co `runId` vua nam duoi mot
   * duong dan co `:runId` la hai nguon cho cung mot su that, va se co luc chung lech nhau.
   */
  @Post('runs/:runId/documents')
  @Roles('ADMIN')
  @RequiresTransportAction('transport.operational_document.record')
  record(
    @Req() request: AuthenticatedRequest,
    @Param('runId') runId: string,
    @Body() body: unknown,
  ): Promise<OperationalDocument> {
    const authUserId = requireAuthUserId(request);
    const parsed = recordDocumentSchema.safeParse({ ...(body as object), runId });
    if (!parsed.success) throw new BadRequestException(firstIssue(parsed.error));

    return this.guard(() =>
      this.documents.recordAsOperator({
        type: parsed.data.type,
        runId,
        legId: parsed.data.legId,
        counterpartySiteId: parsed.data.counterpartySiteId,
        basis: parsed.data.basis,
        fileId: parsed.data.fileId,
        externalNote: parsed.data.externalNote,
        label: parsed.data.label,
        captureMode: parsed.data.captureMode,
        clientEventId: parsed.data.clientEventId,
        authUserId,
      }),
    );
  }

  @Post('documents/:documentId/withdraw')
  @Roles('ADMIN')
  @RequiresTransportAction('transport.operational_document.withdraw')
  withdraw(
    @Req() request: AuthenticatedRequest,
    @Param('documentId') documentId: string,
    @Body() body: unknown,
  ): Promise<OperationalDocument> {
    const authUserId = requireAuthUserId(request);
    const parsed = withdrawDocumentSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(firstIssue(parsed.error));

    return this.guard(() =>
      this.documents.withdraw({ documentId, reason: parsed.data.reason, authUserId }),
    );
  }

  /**
   * `Da nhan duoc to giay` / `Da gui di de xac nhan` — hai buoc CUA VAN PHONG.
   *
   * Ke toan CO ma nay: chinh ho la nguoi nhan to giay tren ban. Nhung ghi `RETURNED_TO_OFFICE`
   * KHONG ket thuc mot don — do van la mot lan bam RIENG tren truc nghiem thu cua Lane K, voi mot
   * ma quyen RIENG. `#279` O7: *"office may confirm receipt was received without silently
   * completing settlement"*.
   */
  @Post('receipt-handovers')
  @Roles('ADMIN', 'ACCOUNTING')
  @RequiresTransportAction('transport.receipt_handover.record')
  handover(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<PhysicalReceiptHandover> {
    const authUserId = requireAuthUserId(request);
    const parsed = officeHandoverSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(firstIssue(parsed.error));

    return this.guard(() =>
      this.handovers.recordAsOffice({
        orderId: parsed.data.orderId,
        state: parsed.data.state,
        documentId: parsed.data.documentId,
        externalNote: parsed.data.externalNote,
        note: parsed.data.note,
        clientEventId: parsed.data.clientEventId,
        authUserId,
      }),
    );
  }

  private async guard<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      return transportErrorToHttp(error);
    }
  }
}
