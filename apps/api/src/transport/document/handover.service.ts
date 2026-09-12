import { Inject, Injectable, Optional } from '@nestjs/common';
import { TelemetryService } from '../../observability/telemetry.service.js';
import { toBusinessDate } from '../business-date.js';
import { TransportCheckpointCoreFacts } from '../checkpoint/checkpoint-facts.port.js';
import { isUniqueViolationOn } from '../storage-conflict.js';
import {
  TRANSPORT_CLOCK,
  TRANSPORT_CORE_POLICY,
  type TransportCorePolicy,
} from '../transport-policy.js';
import { TransportDomainError } from '../transport.errors.js';
import {
  TRANSPORT_DOCUMENT_DECISIONS,
  type ReceiptHandoverReason,
} from './document-decisions.js';
import { TransportDocumentCoreFacts } from './document-facts.port.js';
import { OperationalDocumentRepository } from './document.repository.js';
import {
  HANDOVER_CLIENT_EVENT,
  HANDOVER_STATE_ONCE,
  PhysicalReceiptHandoverRepository,
} from './handover.repository.js';
import {
  RECEIPT_HANDOVER_PREDECESSOR,
  type PhysicalReceiptHandover,
  type ReceiptHandoverState,
  type ReceiptHandoverStatus,
  type RecordDriverHandoverCommand,
  type RecordOfficeHandoverCommand,
} from './handover.types.js';

/**
 * BAN GIAO BIEN NHAN GIAY — `#279` O7.
 *
 * ============================================================================================
 * DIEU QUAN TRONG NHAT VE DICH VU NAY LA THU NO KHONG LAM
 * ============================================================================================
 *
 * No khong dung vao `TransportOrder`, khong dung vao truc nghiem thu, khong dung vao mot dong tien
 * nao. Ghi `RETURNED_TO_OFFICE` KHONG ket thuc mot don:
 *
 *     bien nhan da ve  !=  don da ket thuc ve thuong mai
 *
 * `#274` va `#279` O7 deu phat bieu ranh gioi do, va `no-order-completion.spec.ts` quet ca thu muc
 * de giu no. Ke toan/Giam doc van phai bam `Da ket thuc` tren DON (Lane K), va ho co the DOC chuoi
 * ban giao nay lam mot phan can cu.
 *
 * ============================================================================================
 * HAI DUONG GHI, VA CHUNG KHONG PHAI MOT
 * ============================================================================================
 *
 * `recordAsDriver` chi ghi duoc `WITH_DRIVER`. `recordAsOffice` ghi hai buoc con lai. Tach ra chu
 * khong gop lam mot ham nhan them mot co `state`: mot nhanh `if` thi co ngay bi mot lan sua sau
 * nay dao dieu kien, va luc do mot lai xe se tu khai duoc rang giay da ve toi van phong — trong khi
 * tren ban cua van phong khong co gi.
 */
@Injectable()
export class PhysicalReceiptHandoverService {
  constructor(
    private readonly handovers: PhysicalReceiptHandoverRepository,
    private readonly documents: OperationalDocumentRepository,
    private readonly core: TransportDocumentCoreFacts,
    private readonly identity: TransportCheckpointCoreFacts,
    @Inject(TRANSPORT_CORE_POLICY) private readonly corePolicy: TransportCorePolicy,
    @Optional() private readonly telemetry?: TelemetryService,
    @Optional() @Inject(TRANSPORT_CLOCK) private readonly clock?: () => Date,
  ) {}

  async recordAsDriver(command: RecordDriverHandoverCommand): Promise<PhysicalReceiptHandover> {
    const driver = await this.identity.findDriverByAuthUserId(command.authUserId);
    if (!driver) {
      this.deny('RECEIPT_HANDOVER_DRIVER_BINDING_MISSING', { authUserId: command.authUserId });
      throw TransportDomainError.denied(
        'RECEIPT_HANDOVER_DRIVER_BINDING_MISSING',
        'Tai khoan dang nhap chua noi voi mot ho so lai xe nao',
      );
    }

    // Lai xe chi ghi duoc buoc nay cho DON HO DA CHAY. Doc qua chinh chang cua don — mot don ma ho
    // khong co chang nao thi ho khong cam to giay do.
    const legIds = await this.core.legIdsForOrder(command.orderId);
    const runIds = new Set<string>();
    for (const legId of legIds) {
      const leg = await this.core.findLeg(legId);
      if (leg) runIds.add(leg.runId);
    }
    let assigned = false;
    for (const runId of runIds) {
      if (await this.identity.wasDriverEverAssignedToRun(runId, driver.id)) {
        assigned = true;
        break;
      }
    }
    if (!assigned) {
      this.deny('RECEIPT_HANDOVER_DRIVER_NOT_ASSIGNED', { orderId: command.orderId });
      throw TransportDomainError.denied(
        'RECEIPT_HANDOVER_DRIVER_NOT_ASSIGNED',
        'Ban chua tung chay don nay',
      );
    }

    return this.append({
      orderId: command.orderId,
      state: 'WITH_DRIVER',
      legId: command.legId ?? null,
      documentId: command.documentId ?? null,
      externalNote: command.externalNote ?? null,
      note: command.note ?? null,
      clientEventId: command.clientEventId,
      authUserId: command.authUserId,
      driverId: driver.id,
    });
  }

  async recordAsOffice(command: RecordOfficeHandoverCommand): Promise<PhysicalReceiptHandover> {
    return this.append({
      orderId: command.orderId,
      state: command.state,
      legId: null,
      documentId: command.documentId ?? null,
      externalNote: command.externalNote ?? null,
      note: command.note ?? null,
      clientEventId: command.clientEventId,
      authUserId: command.authUserId,
      driverId: null,
    });
  }

  private async append(input: {
    orderId: string;
    state: ReceiptHandoverState;
    legId: string | null;
    documentId: string | null;
    externalNote: string | null;
    note: string | null;
    clientEventId: string;
    authUserId: string;
    driverId: string | null;
  }): Promise<PhysicalReceiptHandover> {
    // GUI LAI TRUOC MOI PHEP KIEM KHAC — cung quy uoc voi `CheckpointService.append`.
    const replayed = await this.handovers.findByEvent(input.orderId, input.clientEventId);
    if (replayed) {
      this.allow('RECEIPT_HANDOVER_REPLAYED', { handoverId: replayed.id });
      return replayed;
    }

    if (!(await this.core.orderExists(input.orderId))) {
      this.deny('RECEIPT_HANDOVER_ORDER_NOT_FOUND', { orderId: input.orderId });
      throw TransportDomainError.notFound(
        'RECEIPT_HANDOVER_ORDER_NOT_FOUND',
        'Khong tim thay don hang',
      );
    }

    // CAN CU: hoac mot chung tu ban so CUA CHINH DON NAY, hoac mot cau mo ta ban giay. `#279` O7
    // doi duong giay phai di duoc *"using an auditable external-physical basis rather than a fake
    // file"* — nen mot buoc ban giao trong ca hai la mot su that khong doi chieu duoc voi gi.
    if (input.documentId !== null) {
      const document = await this.documents.find(input.documentId);
      if (!document || document.orderId !== input.orderId || document.status !== 'ACTIVE') {
        this.deny('RECEIPT_HANDOVER_DOCUMENT_NOT_FOR_ORDER', { orderId: input.orderId });
        throw TransportDomainError.denied(
          'RECEIPT_HANDOVER_DOCUMENT_NOT_FOR_ORDER',
          'Chung tu do khong thuoc don nay',
        );
      }
    } else if ((input.externalNote ?? '').trim().length === 0) {
      this.deny('RECEIPT_HANDOVER_BASIS_REQUIRED', { orderId: input.orderId });
      throw TransportDomainError.invalid(
        'RECEIPT_HANDOVER_BASIS_REQUIRED',
        'Phai co ban so hoac ghi ro dang ban giao cai gi',
      );
    }

    const history = await this.handovers.listForOrder(input.orderId);
    if (history.some((row) => row.state === input.state)) {
      this.deny('RECEIPT_HANDOVER_ALREADY_RECORDED', { orderId: input.orderId });
      throw TransportDomainError.conflict(
        'RECEIPT_HANDOVER_ALREADY_RECORDED',
        'Buoc nay da duoc ghi tu truoc',
      );
    }

    // THU TU: mot chuoi ban giao nhay coc la mot chuoi khong doi chieu duoc voi thuc te. Van phong
    // khong the gui di mot to giay ma chinh ho chua ghi la da nhan.
    const predecessor = RECEIPT_HANDOVER_PREDECESSOR[input.state];
    if (predecessor !== null && !history.some((row) => row.state === predecessor)) {
      this.deny('RECEIPT_HANDOVER_OUT_OF_ORDER', { orderId: input.orderId, needs: predecessor });
      throw TransportDomainError.invalid(
        'RECEIPT_HANDOVER_OUT_OF_ORDER',
        `Phai ghi buoc ${predecessor} truoc da`,
      );
    }

    const recordedAt = this.now();
    try {
      const handover = await this.handovers.create({
        orderId: input.orderId,
        sequence: history.length + 1,
        state: input.state,
        legId: input.legId,
        documentId: input.documentId,
        externalNote: input.externalNote,
        driverId: input.driverId,
        recordedBy: input.authUserId,
        recordedAt,
        clientEventId: input.clientEventId,
        note: input.note,
        businessDate: toBusinessDate(recordedAt, this.corePolicy.timeZone),
      });
      this.allow('RECEIPT_HANDOVER_RECORDED', {
        handoverId: handover.id,
        state: handover.state,
        hasDocument: handover.documentId !== null,
      });
      return handover;
    } catch (error) {
      if (isUniqueViolationOn(error, HANDOVER_CLIENT_EVENT)) {
        const already = await this.handovers.findByEvent(input.orderId, input.clientEventId);
        if (already) {
          this.allow('RECEIPT_HANDOVER_REPLAYED', { handoverId: already.id });
          return already;
        }
      }
      // HAI NGUOI cung ghi mot buoc. Rang buoc cua kho chan ban thu hai — va do CHINH LA cau tra
      // loi dung: buoc thu hai khong them mot su that nao.
      if (isUniqueViolationOn(error, HANDOVER_STATE_ONCE)) {
        this.deny('RECEIPT_HANDOVER_ALREADY_RECORDED', { orderId: input.orderId });
        throw TransportDomainError.conflict(
          'RECEIPT_HANDOVER_ALREADY_RECORDED',
          'Buoc nay da duoc ghi tu truoc',
        );
      }
      throw error;
    }
  }

  /**
   * TRANG THAI HIEN TAI cua mot don — mot PHEP CHIEU tu chuoi buoc, khong mot cot.
   *
   * `null` khi chua ai ban giao gi, va do la mot cau tra loi DUNG chu khong mot khoang trong: phan
   * lon cac don o mot thoi diem bat ky deu chua den luc do. Mot cot `handoverState` tren
   * `TransportOrder` se phai duoc backfill cho moi don cu — va `#275` K6 da cam dung
   * `APPROVED by system` hang loat vi cung ly le do.
   */
  async statusOf(orderId: string): Promise<ReceiptHandoverStatus> {
    const history = await this.handovers.listForOrder(orderId);
    const latest = history.at(-1) ?? null;
    return {
      orderId,
      state: latest?.state ?? null,
      latestAt: latest?.recordedAt ?? null,
      latestBy: latest?.recordedBy ?? null,
      history,
    };
  }

  /** Trang thai cua CA LO don — dong thoi gian van hanh khong duoc goi N+1 lan (`#279` O11). */
  async statusForOrders(
    orderIds: readonly string[],
  ): Promise<ReadonlyMap<string, ReceiptHandoverStatus>> {
    const rows = await this.handovers.listForOrders(orderIds);
    const byOrder = new Map<string, PhysicalReceiptHandover[]>();
    for (const row of rows) {
      byOrder.set(row.orderId, [...(byOrder.get(row.orderId) ?? []), row]);
    }
    return new Map(
      orderIds.map((orderId) => {
        const history = byOrder.get(orderId) ?? [];
        const latest = history.at(-1) ?? null;
        return [
          orderId,
          {
            orderId,
            state: latest?.state ?? null,
            latestAt: latest?.recordedAt ?? null,
            latestBy: latest?.recordedBy ?? null,
            history,
          },
        ];
      }),
    );
  }

  private allow(reason: ReceiptHandoverReason, detail: Record<string, unknown>): void {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_DOCUMENT_DECISIONS,
      point: 'receipt_handover.record',
      outcome: 'allowed',
      reason,
      detail,
    });
  }

  private deny(reason: ReceiptHandoverReason, detail: Record<string, unknown>): void {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_DOCUMENT_DECISIONS,
      point: 'receipt_handover.record',
      outcome: 'denied',
      reason,
      detail,
    });
  }

  private now(): Date {
    return this.clock ? this.clock() : new Date();
  }
}
