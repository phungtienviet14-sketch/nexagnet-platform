import { BadRequestException, Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Roles } from '../../auth/roles.decorator.js';
import type { AuthenticatedRequest } from '../../auth/session.types.js';
import {
  RequiresTransportAction,
  TransportActionGuard,
  requireAuthUserId,
  transportErrorToHttp,
} from '../transport-action.guard.js';
import { firstIssue } from '../transport.schemas.js';
import { driverHandoverSchema, recordDocumentSchema } from './document.schemas.js';
import { OperationalDocumentService } from './document.service.js';
import type { OperationalDocument } from './document.types.js';
import { PhysicalReceiptHandoverService } from './handover.service.js';
import type { PhysicalReceiptHandover } from './handover.types.js';

/**
 * BE MAT LAI XE cua chung tu van hanh — `#279` O1/O3/O7/O9.
 *
 * MOT tuyen ghi cho ca nam loai chung tu, phan biet bang `type` trong than yeu cau — cung quy uoc
 * voi `DriverCheckpointsController`. Nam tuyen se la nam cho de quen mot phep kiem.
 *
 * KHONG co tuyen BIA MO o day. Lai xe khong go duoc mot to bang chung cua chinh ho ra khoi ho so:
 * `#279` O2 goi day la *"immutable boundary prevents driver deletion once evidence is
 * authoritative"*, va cach re nhat de giu no la khong co duong.
 *
 * Tuyen ban giao chi ghi duoc MOT buoc (`WITH_DRIVER`), va than yeu cau khong mang truong `state`.
 * Xem `PhysicalReceiptHandoverService`: chi lai xe biet to giay dang trong tay ho, va chi van phong
 * biet ho da nhan duoc no.
 */
@Controller('transport/me')
@UseGuards(TransportActionGuard)
export class DriverDocumentsController {
  constructor(
    private readonly documents: OperationalDocumentService,
    private readonly handovers: PhysicalReceiptHandoverService,
  ) {}

  @Get('documents')
  @Roles('SALE', 'ADMIN')
  @RequiresTransportAction('transport.driver.self.document.record')
  listOwn(@Req() request: AuthenticatedRequest): Promise<readonly OperationalDocument[]> {
    const authUserId = requireAuthUserId(request);
    return this.guard(() => this.documents.listOwn(authUserId));
  }

  @Post('documents')
  @Roles('SALE', 'ADMIN')
  @RequiresTransportAction('transport.driver.self.document.record')
  record(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<OperationalDocument> {
    const authUserId = requireAuthUserId(request);
    const parsed = recordDocumentSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(firstIssue(parsed.error));

    return this.guard(() =>
      this.documents.recordAsDriver({
        type: parsed.data.type,
        runId: parsed.data.runId,
        legId: parsed.data.legId,
        checkpointId: parsed.data.checkpointId,
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

  /**
   * `Toi dang giu to bien nhan` — va KHONG gi hon.
   *
   * `#279` O7: *"driver may record/hand over according to workflow, but cannot set Order
   * `Da ket thuc`"*. Tuyen nay khong dung vao `TransportOrder`, va khong co tuyen thu hai o be mat
   * lai xe de lam viec do.
   */
  @Post('receipt-handovers')
  @Roles('SALE', 'ADMIN')
  @RequiresTransportAction('transport.driver.self.receipt_handover.record')
  handover(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<PhysicalReceiptHandover> {
    const authUserId = requireAuthUserId(request);
    const parsed = driverHandoverSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(firstIssue(parsed.error));

    return this.guard(() =>
      this.handovers.recordAsDriver({
        orderId: parsed.data.orderId,
        legId: parsed.data.legId,
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
