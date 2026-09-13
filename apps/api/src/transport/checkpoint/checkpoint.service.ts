import { Inject, Injectable, Optional } from '@nestjs/common';
import { TelemetryService } from '../../observability/telemetry.service.js';
import { toBusinessDate } from '../business-date.js';
import { isUniqueViolationOn } from '../storage-conflict.js';
import {
  TRANSPORT_CLOCK,
  TRANSPORT_CORE_POLICY,
  type TransportCorePolicy,
} from '../transport-policy.js';
import { TransportDomainError } from '../transport.errors.js';
import { TRANSPORT_CHECKPOINT_DECISIONS } from './checkpoint-decisions.js';
import type { CheckpointRecordReason } from './checkpoint-decisions.js';
import {
  TransportCheckpointCoreFacts,
  TransportCheckpointLocationFacts,
} from './checkpoint-facts.port.js';
import {
  DEFAULT_CHECKPOINT_POLICY,
  evaluateCheckpoint,
  isRunScoped,
  type CheckpointPolicy,
} from './checkpoint-lifecycle.js';
import {
  CHECKPOINT_CLIENT_EVENT,
  CHECKPOINT_OBSERVATION_ONCE,
  CheckpointRepository,
} from './checkpoint.repository.js';
import type { RecordCheckpointCommand, RunCheckpoint } from './checkpoint.types.js';
import { DeliveryWaitingCloser } from '../waiting/waiting-close.port.js';
import { buildRunTimeline, type RunTimeline } from './run-timeline.js';

export const TRANSPORT_CHECKPOINT_POLICY = Symbol('TRANSPORT_CHECKPOINT_POLICY');

/**
 * MOC VAN HANH — `#243` F1.
 *
 * ============================================================================================
 * HAI DUONG GHI, VA CHUNG KHONG PHAI MOT
 * ============================================================================================
 *
 * `recordAsDriver` va `recordAsOperator` tach han nhau. Gop chung thanh mot ham nhan them mot co
 * `isDriver` se lam phep kiem so huu phan cong tro thanh mot nhanh `if` — va mot nhanh `if` thi co
 * ngay bi mot lan sua sau nay dao dieu kien. Tach ra thi duong cua dieu hanh KHONG HE CO cau lenh
 * doc phan cong de ma bo qua.
 *
 * Dieu hanh KHONG dinh kem ban dinh vi duoc: nguoi ngoi o van phong khong o hien truong, va mot
 * ban dinh vi gan boi nguoi khong o do la mot bang chung sai. Duong do don gian la khong ton tai.
 *
 * ============================================================================================
 * GIO MAY CHU LA GIO DUY NHAT DUOC TINH
 * ============================================================================================
 *
 * `receivedAt` do dich vu nay dat, tu `TRANSPORT_CLOCK`. `capturedAt` lay tu BAN DINH VI (da qua
 * kiem bien cua Lane B), khong lay tu than yeu cau — nen mot may khach van nguoc dong ho khong
 * dat duoc mot moc vao qua khu. Bai `F7`.
 */
@Injectable()
export class CheckpointService {
  constructor(
    private readonly checkpoints: CheckpointRepository,
    private readonly core: TransportCheckpointCoreFacts,
    private readonly location: TransportCheckpointLocationFacts,
    @Inject(TRANSPORT_CORE_POLICY) private readonly corePolicy: TransportCorePolicy,
    @Optional()
    @Inject(TRANSPORT_CHECKPOINT_POLICY)
    private readonly policy: CheckpointPolicy = DEFAULT_CHECKPOINT_POLICY,
    @Optional() private readonly telemetry?: TelemetryService,
    @Optional() @Inject(TRANSPORT_CLOCK) private readonly clock?: () => Date,
    /**
     * PHIEN CHO NGUOI NHAN (`#279` O4) — vang mat o khach khong dung khoang cho nguoi nhan.
     *
     * Xem `DeliveryWaitingCloser`: cong nay duoc goi o CA duong ghi moi LAN duong gui lai, de mot
     * lan mat song dung giua hai buoc tu sua duoc o lan bam ke tiep.
     */
    @Optional() private readonly waiting?: DeliveryWaitingCloser,
  ) {}

  /** Duong cua LAI XE — danh tinh tu phien, quyen tu phan cong. */
  async recordAsDriver(command: RecordCheckpointCommand): Promise<RunCheckpoint> {
    const driver = await this.core.findDriverByAuthUserId(command.authUserId);
    if (!driver) {
      this.deny('CHECKPOINT_DRIVER_BINDING_MISSING', { authUserId: command.authUserId });
      throw TransportDomainError.denied(
        'CHECKPOINT_DRIVER_BINDING_MISSING',
        'Tai khoan dang nhap chua noi voi mot ho so lai xe nao',
      );
    }

    const run = await this.requireRun(command.runId);

    if (!(await this.core.wasDriverEverAssignedToRun(run.id, driver.id))) {
      this.deny('CHECKPOINT_DRIVER_NOT_ASSIGNED', { runId: run.id, driverId: driver.id });
      throw TransportDomainError.denied(
        'CHECKPOINT_DRIVER_NOT_ASSIGNED',
        `Lai xe ${driver.fullName} chua tung duoc phan cong vao vong chay ${run.code}`,
      );
    }

    return this.append(command, run.status, driver.id);
  }

  /**
   * Duong cua DIEU HANH — khong co ban dinh vi, khong co ho so lai xe.
   *
   * Quyen do `TransportActionGuard` chot o controller (`transport.checkpoint.record`). O day chi
   * con phan nghiep vu.
   */
  async recordAsOperator(command: RecordCheckpointCommand): Promise<RunCheckpoint> {
    const run = await this.requireRun(command.runId);
    return this.append({ ...command, observationId: undefined }, run.status, null);
  }

  async timelineForRun(runId: string): Promise<RunTimeline> {
    await this.requireRun(runId);
    const rows = await this.checkpoints.listForRun(runId);
    return buildRunTimeline(runId, rows, this.policy);
  }

  /** Moc CUA CHINH MINH — danh tinh tu phien, khong tu than yeu cau. */
  async listOwn(authUserId: string): Promise<readonly RunCheckpoint[]> {
    const driver = await this.core.findDriverByAuthUserId(authUserId);
    if (!driver) {
      this.deny('CHECKPOINT_DRIVER_BINDING_MISSING', { authUserId });
      throw TransportDomainError.denied(
        'CHECKPOINT_DRIVER_BINDING_MISSING',
        'Tai khoan dang nhap chua noi voi mot ho so lai xe nao',
      );
    }
    return this.checkpoints.listForDriver(driver.id);
  }

  private async requireRun(runId: string) {
    const run = await this.core.findRun(runId);
    if (!run) {
      this.deny('CHECKPOINT_RUN_NOT_FOUND', { runId });
      throw TransportDomainError.notFound('CHECKPOINT_RUN_NOT_FOUND', 'Khong tim thay vong chay');
    }
    return run;
  }

  private async append(
    command: RecordCheckpointCommand,
    runStatus: string,
    driverId: string | null,
  ): Promise<RunCheckpoint> {
    // GUI LAI TRUOC MOI PHEP KIEM KHAC. Mot lenh da thanh cong roi mat song tren duong ve phai tra
    // ve dung ket qua cu — ke ca khi lan ghi do da lam chinh no thanh mot moc "da ton tai".
    const replayed = await this.checkpoints.findByEvent(
      command.runId,
      command.type,
      command.clientEventId,
    );
    if (replayed) {
      this.allow('CHECKPOINT_REPLAYED', { checkpointId: replayed.id, type: replayed.type });
      return this.settleWaiting(replayed);
    }

    const legId = command.legId ?? null;
    if (legId !== null) {
      const leg = await this.core.findLeg(legId);
      if (!leg) {
        this.deny('CHECKPOINT_LEG_NOT_FOUND', { legId });
        throw TransportDomainError.notFound('CHECKPOINT_LEG_NOT_FOUND', 'Khong tim thay chang');
      }
      if (leg.runId !== command.runId) {
        this.deny('CHECKPOINT_LEG_NOT_IN_RUN', { legId, runId: command.runId });
        throw TransportDomainError.denied(
          'CHECKPOINT_LEG_NOT_IN_RUN',
          'Chang do khong thuoc vong chay nay',
        );
      }
    }

    // Pham vi dang xet: mot chang cu the, hoac muc vong chay. Doc dung pham vi do de mot chang
    // thu hai khong bi chan boi moc cua chang thu nhat.
    const scoped = isRunScoped(command.type)
      ? (await this.checkpoints.listForRun(command.runId)).filter((row) => row.legId === null)
      : legId === null
        ? []
        : await this.checkpoints.listForLeg(legId);

    const decision = evaluateCheckpoint({
      type: command.type,
      runTerminal: runStatus === 'COMPLETED' || runStatus === 'CANCELLED',
      hasLeg: legId !== null,
      recordedTypes: scoped.map((row) => row.type),
      hasObservation: command.observationId !== undefined,
      policy: this.policy,
    });

    if (!decision.allowed) {
      this.deny(decision.reason, {
        runId: command.runId,
        legId,
        type: command.type,
        ...(decision.requires ? { requires: decision.requires } : {}),
      });
      throw this.errorFor(decision.reason, decision.requires);
    }

    let observationId: string | null = null;
    let capturedAt: Date | null = null;
    if (command.observationId !== undefined) {
      const observation = await this.location.findObservation(command.observationId);
      if (!observation) {
        this.deny('CHECKPOINT_OBSERVATION_NOT_FOUND', { observationId: command.observationId });
        throw TransportDomainError.notFound(
          'CHECKPOINT_OBSERVATION_NOT_FOUND',
          'Khong tim thay ban dinh vi cho moc nay',
        );
      }
      // Ban dinh vi phai thuoc ve CHINH lai xe dang ghi moc. Khong co cong nay thi mot lai xe tro
      // duoc moc cua minh vao ban dinh vi cua dong nghiep — muon vi tri nguoi khac lam bang chung.
      if (driverId === null || observation.driverId !== driverId) {
        this.deny('CHECKPOINT_OBSERVATION_NOT_OWNED', {
          observationId: observation.id,
          driverId,
        });
        throw TransportDomainError.denied(
          'CHECKPOINT_OBSERVATION_NOT_OWNED',
          'Ban dinh vi do khong thuoc ve ban',
        );
      }
      observationId = observation.id;
      capturedAt = observation.capturedAt;
    }

    const receivedAt = this.now();
    try {
      const checkpoint = await this.checkpoints.create({
        type: command.type,
        runId: command.runId,
        legId,
        recordedBy: command.authUserId,
        driverId,
        observationId,
        clientEventId: command.clientEventId,
        capturedAt,
        receivedAt,
        businessDate: toBusinessDate(receivedAt, this.corePolicy.timeZone),
        note: command.note ?? null,
      });
      this.allow('CHECKPOINT_RECORDED', {
        checkpointId: checkpoint.id,
        type: checkpoint.type,
        hasLocationProof: observationId !== null,
      });
      return this.settleWaiting(checkpoint);
    } catch (error) {
      // HAI YEU CAU SONG SONG cua cung mot lan bam. Phep doc o dau ham khong thay ban kia vi no
      // chua commit; unique cua kho thi thay. Doc lai va tra ve — khong bao loi cho mot viec da
      // thanh cong.
      if (isUniqueViolationOn(error, CHECKPOINT_CLIENT_EVENT)) {
        const already = await this.checkpoints.findByEvent(
          command.runId,
          command.type,
          command.clientEventId,
        );
        if (already) {
          this.allow('CHECKPOINT_REPLAYED', { checkpointId: already.id, type: already.type });
          return this.settleWaiting(already);
        }
      }
      if (isUniqueViolationOn(error, CHECKPOINT_OBSERVATION_ONCE)) {
        this.deny('CHECKPOINT_OBSERVATION_ALREADY_USED', { observationId });
        throw TransportDomainError.conflict(
          'CHECKPOINT_OBSERVATION_ALREADY_USED',
          'Ban dinh vi do da duoc dung cho mot moc khac',
        );
      }
      throw error;
    }
  }

  /**
   * DONG PHIEN CHO khi moc vua ghi la lan nguoi nhan nhan hang — `#279` O4.
   *
   * Goi o CA duong ghi moi LAN duong gui lai, va khong o mot duong nao khac. Loi cua cong nay
   * KHONG bi nuot: neu phien cho khong dong duoc thi lan bam do phai bao that bai, de lai xe bam
   * lai — va lan bam lai se di vao nhanh `CHECKPOINT_REPLAYED` roi hoan tat not viec dong phien.
   *
   * Nuot loi o day se cho ra dung trang thai ma `#279` O10 goi ten: mot thao tac hien thanh cong
   * tren may lai xe trong khi may chu chua ghi xong.
   */
  private async settleWaiting(checkpoint: RunCheckpoint): Promise<RunCheckpoint> {
    if (checkpoint.type === 'DELIVERY_ACCEPTED') {
      await this.waiting?.closeByAcceptance(checkpoint);
    }
    return checkpoint;
  }

  private errorFor(reason: CheckpointRecordReason, requires?: string): TransportDomainError {
    switch (reason) {
      case 'CHECKPOINT_RUN_TERMINAL':
        return TransportDomainError.conflict(
          reason,
          'Vong chay da o trang thai cuoi, khong ghi them moc duoc',
        );
      case 'CHECKPOINT_ALREADY_RECORDED':
        return TransportDomainError.conflict(reason, 'Moc nay da duoc ghi tu truoc');
      case 'CHECKPOINT_PREDECESSOR_MISSING':
        return TransportDomainError.invalid(reason, `Phai ghi moc ${requires} truoc da`);
      case 'CHECKPOINT_LOCATION_REQUIRED':
        return TransportDomainError.invalid(
          reason,
          'Moc nay bat buoc co vi tri hien tai — bat dinh vi roi thu lai',
        );
      case 'CHECKPOINT_LEG_REQUIRED':
        return TransportDomainError.invalid(reason, 'Moc nay phai gan vao mot chang cu the');
      case 'CHECKPOINT_LEG_NOT_APPLICABLE':
        return TransportDomainError.invalid(
          reason,
          'Moc nay thuoc muc vong chay, khong gan vao chang',
        );
      default:
        return TransportDomainError.invalid(reason, 'Khong ghi duoc moc van hanh');
    }
  }

  private allow(reason: CheckpointRecordReason, detail: Record<string, unknown>): void {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_CHECKPOINT_DECISIONS,
      point: 'checkpoint.record',
      outcome: 'allowed',
      reason,
      detail,
    });
  }

  private deny(reason: CheckpointRecordReason, detail: Record<string, unknown>): void {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_CHECKPOINT_DECISIONS,
      point: 'checkpoint.record',
      outcome: 'denied',
      reason,
      detail,
    });
  }

  private now(): Date {
    return this.clock ? this.clock() : new Date();
  }
}
