import { Inject, Injectable, Optional } from '@nestjs/common';
import { TelemetryService } from '../../observability/telemetry.service.js';
import { toBusinessDate } from '../business-date.js';
import { CheckpointRepository } from '../checkpoint/checkpoint.repository.js';
import { TransportCheckpointCoreFacts } from '../checkpoint/checkpoint-facts.port.js';
import type { RunCheckpoint } from '../checkpoint/checkpoint.types.js';
import { isUniqueViolationOn } from '../storage-conflict.js';
import {
  TRANSPORT_CLOCK,
  TRANSPORT_CORE_POLICY,
  type TransportCorePolicy,
} from '../transport-policy.js';
import { TransportDomainError } from '../transport.errors.js';
import {
  TRANSPORT_WAITING_DECISIONS,
  type TransportWaitingDecisionReason,
  type WaitingStartReason,
} from './waiting-decisions.js';
import {
  WAITING_ANCHOR_CHECKPOINT,
  evaluateWaitingClose,
  evaluateWaitingStart,
} from './waiting-lifecycle.js';
import {
  WAITING_CLIENT_EVENT,
  WAITING_OPEN_PER_LEG,
  WaitingSessionAlreadyClosedError,
  WaitingSessionRepository,
} from './waiting.repository.js';
import type {
  CloseWaitingByOperatorCommand,
  DeliveryWaitingSession,
  StartWaitingCommand,
} from './waiting.types.js';
import { toWaitingSessionView, type WaitingSessionView } from './waiting.view.js';

/**
 * PHIEN CHO NGUOI NHAN — `#279` O5.
 *
 * ============================================================================================
 * MOT PHIEN CHO DONG LAI BANG DUNG MOT SU KIEN NGHIEP VU
 * ============================================================================================
 *
 * `closeByAcceptance` KHONG phai mot tuyen HTTP. No duoc goi tu `WaitingCheckpointBridge` khi moc
 * `DELIVERY_ACCEPTED` duoc ghi — nghia la lai xe bam DUNG MOT nut (`Khach da nhan hang`) va ca hai
 * su that duoc ghi cung luc.
 *
 * Ly do khong mo mot tuyen `POST /waiting/:id/close` cho lai xe:
 *
 *   · hai duong ghi cho cung mot su that se co luc lech nhau — mot phien da dong ma khong co moc
 *     nhan hang, hoac nguoc lai;
 *   · `endedAt` phai la gio may chu cua CHINH lan nhan hang. Lay tu mot lenh thu hai la lay mot gio
 *     KHAC, va khoang chenh giua hai lan goi se roi vao con so phu cap;
 *   · va mot nut thu hai la mot cham thu hai, dung cai ma `#279` O9 doi cat di.
 *
 * Duong `closeByOperator` ton tai cho mot su that KHAC han (phien bo quen), mang mot ma rieng, va
 * KHONG duoc cap cho ke toan — xem `ACCOUNTING_DENIED` trong `transport-actions.ts`.
 *
 * ============================================================================================
 * GIO MAY CHU LA GIO DUY NHAT
 * ============================================================================================
 *
 * `startedAt` do `TRANSPORT_CLOCK` dat. `endedAt` la `receivedAt` cua moc dong — cung mot dong ho.
 * Khong mot gio nao den tu than yeu cau, va `waiting.schemas.ts` dung `.strict()` de mot may khach
 * gui `startedAt` bi bao 400 chu khong bi bo qua im lang. `#279` O4/O5.
 */
@Injectable()
export class WaitingSessionService {
  constructor(
    private readonly sessions: WaitingSessionRepository,
    private readonly checkpoints: CheckpointRepository,
    private readonly core: TransportCheckpointCoreFacts,
    @Inject(TRANSPORT_CORE_POLICY) private readonly corePolicy: TransportCorePolicy,
    @Optional() private readonly telemetry?: TelemetryService,
    @Optional() @Inject(TRANSPORT_CLOCK) private readonly clock?: () => Date,
  ) {}

  /** Duong cua LAI XE — danh tinh tu phien, quyen tu phan cong. */
  async start(command: StartWaitingCommand): Promise<DeliveryWaitingSession> {
    const driver = await this.core.findDriverByAuthUserId(command.authUserId);
    if (!driver) {
      this.deny('waiting.start', 'WAITING_DRIVER_BINDING_MISSING', {
        authUserId: command.authUserId,
      });
      throw TransportDomainError.denied(
        'WAITING_DRIVER_BINDING_MISSING',
        'Tai khoan dang nhap chua noi voi mot ho so lai xe nao',
      );
    }

    // GUI LAI TRUOC MOI PHEP KIEM KHAC — cung quy uoc voi `CheckpointService.append`. Mot lenh da
    // thanh cong roi mat song tren duong ve phai tra ve dung ket qua cu, ke ca khi chinh lan ghi do
    // da lam moi phep kiem sau no tu choi (`WAITING_ALREADY_OPEN`).
    const replayed = await this.sessions.findByEvent(command.legId, command.clientEventId);
    if (replayed) {
      this.allow('waiting.start', 'WAITING_REPLAYED', { sessionId: replayed.id });
      return replayed;
    }

    const run = await this.core.findRun(command.runId);
    if (!run) {
      this.deny('waiting.start', 'WAITING_RUN_NOT_FOUND', { runId: command.runId });
      throw TransportDomainError.notFound('WAITING_RUN_NOT_FOUND', 'Khong tim thay vong chay');
    }

    if (!(await this.core.wasDriverEverAssignedToRun(run.id, driver.id))) {
      this.deny('waiting.start', 'WAITING_DRIVER_NOT_ASSIGNED', { runId: run.id });
      throw TransportDomainError.denied(
        'WAITING_DRIVER_NOT_ASSIGNED',
        `Lai xe ${driver.fullName} chua tung duoc phan cong vao vong chay ${run.code}`,
      );
    }

    const leg = await this.core.findLeg(command.legId);
    if (!leg) {
      this.deny('waiting.start', 'WAITING_LEG_NOT_FOUND', { legId: command.legId });
      throw TransportDomainError.notFound('WAITING_LEG_NOT_FOUND', 'Khong tim thay chang');
    }
    if (leg.runId !== run.id) {
      this.deny('waiting.start', 'WAITING_LEG_NOT_IN_RUN', { legId: leg.id, runId: run.id });
      throw TransportDomainError.denied(
        'WAITING_LEG_NOT_IN_RUN',
        'Chang do khong thuoc vong chay nay',
      );
    }

    const legCheckpoints = await this.checkpoints.listForLeg(leg.id);
    const decision = evaluateWaitingStart({
      runTerminal: run.status === 'COMPLETED' || run.status === 'CANCELLED',
      legCheckpointTypes: legCheckpoints.map((row) => row.type),
      hasOpenSession: (await this.sessions.findOpenForLeg(leg.id)) !== null,
    });
    if (!decision.allowed) {
      this.deny('waiting.start', decision.reason, { legId: leg.id, runId: run.id });
      throw this.startErrorFor(decision.reason);
    }

    const anchor = this.resolveAnchor(legCheckpoints, command.arrivalCheckpointId, driver.id);
    return this.append(command, leg.runId, driver.id, anchor);
  }

  /**
   * NEO cua phien — mot moc `DELIVERY_ARRIVAL` CUA CHINH LAI XE NAY, tren CHINH chang nay.
   *
   * Ba phep kiem, va khong cai nao thua:
   *
   *   · ton tai — mot ma bat ky nguoi dung go vao khong tro thanh mot lan den noi;
   *   · dung loai va dung chang — mot moc `PICKUP_ARRIVAL` khong mo duoc mot phien cho giao hang;
   *   · dung nguoi — `#279` O12 *"Driver A cannot attach ... to Driver B's work"*. Neo cua nguoi
   *     khac se cho ra mot khoang cho duoc chung minh bang vi tri cua mot chiec xe khac.
   */
  private resolveAnchor(
    legCheckpoints: readonly RunCheckpoint[],
    arrivalCheckpointId: string,
    driverId: string,
  ): RunCheckpoint {
    const anchor = legCheckpoints.find((row) => row.id === arrivalCheckpointId);
    if (!anchor) {
      this.deny('waiting.start', 'WAITING_ARRIVAL_NOT_APPLICABLE', { arrivalCheckpointId });
      throw TransportDomainError.invalid(
        'WAITING_ARRIVAL_NOT_APPLICABLE',
        'Moc do khong phai lan den noi giao cua chang nay',
      );
    }
    if (anchor.type !== WAITING_ANCHOR_CHECKPOINT) {
      this.deny('waiting.start', 'WAITING_ARRIVAL_NOT_APPLICABLE', {
        arrivalCheckpointId,
        type: anchor.type,
      });
      throw TransportDomainError.invalid(
        'WAITING_ARRIVAL_NOT_APPLICABLE',
        'Moc do khong phai lan den noi giao cua chang nay',
      );
    }
    if (anchor.driverId !== driverId) {
      this.deny('waiting.start', 'WAITING_ARRIVAL_NOT_OWNED', { arrivalCheckpointId });
      throw TransportDomainError.denied(
        'WAITING_ARRIVAL_NOT_OWNED',
        'Lan den noi do khong phai cua ban',
      );
    }
    return anchor;
  }

  private async append(
    command: StartWaitingCommand,
    runId: string,
    driverId: string,
    anchor: RunCheckpoint,
  ): Promise<DeliveryWaitingSession> {
    const startedAt = this.now();
    try {
      const session = await this.sessions.create({
        runId,
        legId: command.legId,
        driverId,
        arrivalCheckpointId: anchor.id,
        reason: command.reason,
        startedAt,
        startedBy: command.authUserId,
        startClientEventId: command.clientEventId,
        note: command.note ?? null,
        businessDate: toBusinessDate(startedAt, this.corePolicy.timeZone),
      });
      this.allow('waiting.start', 'WAITING_STARTED', {
        sessionId: session.id,
        legId: session.legId,
        reason: session.reason,
      });
      return session;
    } catch (error) {
      // HAI YEU CAU SONG SONG cua cung mot lan bam. Phep doc o dau ham khong thay ban kia vi no
      // chua commit; unique cua kho thi thay. Doc lai va tra ve — khong bao loi cho mot viec da
      // thanh cong.
      if (isUniqueViolationOn(error, WAITING_CLIENT_EVENT)) {
        const already = await this.sessions.findByEvent(command.legId, command.clientEventId);
        if (already) {
          this.allow('waiting.start', 'WAITING_REPLAYED', { sessionId: already.id });
          return already;
        }
      }
      // HAI LAN BAM KHAC NHAU cung luc — hai `clientEventId`, mot chang. Unique MOT PHAN chan ban
      // thu hai, va do CHINH LA cau tra loi dung: `#279` O13 bai 5.
      if (isUniqueViolationOn(error, WAITING_OPEN_PER_LEG)) {
        this.deny('waiting.start', 'WAITING_ALREADY_OPEN', { legId: command.legId });
        throw TransportDomainError.conflict(
          'WAITING_ALREADY_OPEN',
          'Chang nay dang co mot phien cho mo',
        );
      }
      throw error;
    }
  }

  /**
   * DONG bang lan nhan hang — duong BINH THUONG, goi tu `WaitingCheckpointBridge`.
   *
   * KHONG NEM khi chang khong co phien nao dang mo: phan lon cac lan giao khong he phai cho, va mot
   * ngoai le o day se lam moc `DELIVERY_ACCEPTED` — mot su that doc lap — that bai vi mot ban ghi
   * khong ton tai. Tra ve `null` va di tiep.
   */
  async closeByAcceptance(checkpoint: RunCheckpoint): Promise<DeliveryWaitingSession | null> {
    if (checkpoint.legId === null) return null;
    const open = await this.sessions.findOpenForLeg(checkpoint.legId);
    if (!open) return null;

    const decision = evaluateWaitingClose({
      status: open.status,
      startedAt: open.startedAt,
      endedAt: checkpoint.receivedAt,
      by: 'ACCEPTANCE',
    });
    if (!decision.allowed) {
      this.deny('waiting.close', decision.reason, { sessionId: open.id });
      // Mot khoang am (dong ho may chu bi keo lui) khong duoc lam hong lan ghi moc. Phien o lai
      // trang thai mo va van phong don duoc bang `closeByOperator` — mot su that ma nguoi doc
      // phan biet duoc, thay vi mot con so cho AM nam yen trong bao cao.
      return null;
    }

    try {
      const closed = await this.sessions.close({
        sessionId: open.id,
        endedAt: checkpoint.receivedAt,
        endedBy: checkpoint.recordedBy,
        closeReason: 'RECEIVER_ACCEPTED',
        closingCheckpointId: checkpoint.id,
        closeNote: null,
      });
      this.allow('waiting.close', 'WAITING_CLOSED_BY_ACCEPTANCE', {
        sessionId: closed.id,
        checkpointId: checkpoint.id,
      });
      return closed;
    } catch (error) {
      // HAI YEU CAU SONG SONG cua cung mot lan bam `Khach da nhan hang`. Ban thua cuoc sua zero
      // hang. Do la KET QUA DUNG, khong phai mot loi: phien da dong roi, boi chinh viec do.
      if (error instanceof WaitingSessionAlreadyClosedError) {
        this.allow('waiting.close', 'WAITING_ALREADY_CLOSED', { sessionId: open.id });
        return this.sessions.find(open.id);
      }
      throw error;
    }
  }

  /**
   * DON DEP cua van hanh — mot su that KHAC, mang mot ma khac, va mot quyen khac.
   *
   * `note` BAT BUOC va khong duoc rong (`waiting.schemas.ts`): mot phien bi dong bang tay ma khong
   * ai noi vi sao la mot khoang thoi gian bi cat cut khong giai thich duoc — va no la can cu cua
   * mot khoan tien.
   */
  async closeByOperator(command: CloseWaitingByOperatorCommand): Promise<DeliveryWaitingSession> {
    const session = await this.sessions.find(command.sessionId);
    if (!session) {
      this.deny('waiting.close', 'WAITING_SESSION_NOT_FOUND', { sessionId: command.sessionId });
      throw TransportDomainError.notFound('WAITING_SESSION_NOT_FOUND', 'Khong tim thay phien cho');
    }

    const endedAt = this.now();
    const decision = evaluateWaitingClose({
      status: session.status,
      startedAt: session.startedAt,
      endedAt,
      by: 'OPERATOR',
    });
    if (!decision.allowed) {
      this.deny('waiting.close', decision.reason, { sessionId: session.id });
      throw decision.reason === 'WAITING_ALREADY_CLOSED'
        ? TransportDomainError.conflict(decision.reason, 'Phien cho nay da dong tu truoc')
        : TransportDomainError.conflict(
            decision.reason,
            'Gio dong nam truoc gio mo — khong ghi mot khoang am',
          );
    }

    try {
      const closed = await this.sessions.close({
        sessionId: session.id,
        endedAt,
        endedBy: command.authUserId,
        closeReason: 'OPERATOR_CLOSED',
        closingCheckpointId: null,
        closeNote: command.note,
      });
      this.allow('waiting.close', 'WAITING_CLOSED_BY_OPERATOR', { sessionId: closed.id });
      return closed;
    } catch (error) {
      if (error instanceof WaitingSessionAlreadyClosedError) {
        this.deny('waiting.close', 'WAITING_ALREADY_CLOSED', { sessionId: session.id });
        throw TransportDomainError.conflict(
          'WAITING_ALREADY_CLOSED',
          'Phien cho nay da dong tu truoc',
        );
      }
      throw error;
    }
  }

  async listForRun(runId: string): Promise<readonly DeliveryWaitingSession[]> {
    return this.sessions.listForRun(runId);
  }

  /**
   * MOT PHIEN, NHIN TU MOT MAN HINH — thoi luong da tinh bang dong ho MAY CHU.
   *
   * Dat o day chu khong o controller: hai controller (lai xe, van hanh) doc cung mot con so, va
   * hai lan goi `new Date()` o hai cho se cho ra hai con so lech nhau vai mili giay ma khong ai
   * giai thich duoc. Quan trong hon: `TRANSPORT_CLOCK` chi duoc tiem vao day, nen mot bai test dat
   * dong ho gia van do duoc ca duong doc.
   */
  view(session: DeliveryWaitingSession): WaitingSessionView {
    return toWaitingSessionView(session, this.now());
  }

  viewAll(sessions: readonly DeliveryWaitingSession[]): readonly WaitingSessionView[] {
    const now = this.now();
    return sessions.map((session) => toWaitingSessionView(session, now));
  }

  /** Phien cho CUA CHINH MINH — danh tinh tu phien, khong tu than yeu cau. */
  async listOwn(authUserId: string): Promise<readonly DeliveryWaitingSession[]> {
    const driver = await this.core.findDriverByAuthUserId(authUserId);
    if (!driver) {
      this.deny('waiting.start', 'WAITING_DRIVER_BINDING_MISSING', { authUserId });
      throw TransportDomainError.denied(
        'WAITING_DRIVER_BINDING_MISSING',
        'Tai khoan dang nhap chua noi voi mot ho so lai xe nao',
      );
    }
    return this.sessions.listForDriver(driver.id);
  }

  private startErrorFor(reason: WaitingStartReason): TransportDomainError {
    switch (reason) {
      case 'WAITING_RUN_TERMINAL':
        return TransportDomainError.conflict(
          reason,
          'Vong chay da o trang thai cuoi, khong mo phien cho duoc',
        );
      case 'WAITING_ALREADY_OPEN':
        return TransportDomainError.conflict(reason, 'Chang nay dang co mot phien cho mo');
      case 'WAITING_DELIVERY_ALREADY_ACCEPTED':
        return TransportDomainError.conflict(
          reason,
          'Nguoi nhan da nhan hang — khong con gi de cho',
        );
      case 'WAITING_ARRIVAL_NOT_FOUND':
        return TransportDomainError.invalid(reason, 'Phai bam `Da den noi` truoc khi bat dau cho');
      default:
        return TransportDomainError.invalid(reason, 'Khong mo duoc phien cho');
    }
  }

  private allow(
    point: 'waiting.start' | 'waiting.close',
    reason: TransportWaitingDecisionReason,
    detail: Record<string, unknown>,
  ): void {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_WAITING_DECISIONS,
      point,
      outcome: 'allowed',
      reason,
      detail,
    });
  }

  private deny(
    point: 'waiting.start' | 'waiting.close',
    reason: TransportWaitingDecisionReason,
    detail: Record<string, unknown>,
  ): void {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_WAITING_DECISIONS,
      point,
      outcome: 'denied',
      reason,
      detail,
    });
  }

  private now(): Date {
    return this.clock ? this.clock() : new Date();
  }
}
