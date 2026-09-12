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
import {
  TRANSPORT_WAITING_ALLOWANCE_DECISIONS,
  type TransportWaitingAllowanceDecisionReason,
} from './allowance-decisions.js';
import { evaluateAllowanceDecision, evaluateAllowanceProposal } from './allowance-lifecycle.js';
import {
  WAITING_ALLOWANCE_APPROVED_PER_SESSION,
  WAITING_ALLOWANCE_DECISION_KEY,
  WaitingAllowanceAlreadyDecidedError,
  WaitingAllowanceRepository,
  type ApprovedWaitingAllowanceTotal,
} from './allowance.repository.js';
import type {
  DecideWaitingAllowanceCommand,
  DriverWaitingAllowance,
  ProposeWaitingAllowanceCommand,
} from './allowance.types.js';
import { WaitingAllowanceDriverIdentityFacts } from './allowance-facts.port.js';
import { WaitingSessionRepository } from './waiting.repository.js';

/** `GD-03` — tien la so NGUYEN DONG. Cung mac dinh voi moi bang tien cua mien van tai. */
const DEFAULT_CURRENCY_CODE = 'VND';

/**
 * PHU CAP CHO CUA LAI XE — `#279` O6.
 *
 * ============================================================================================
 * HAI NGUOI, HAI LAN BAM, VA KHONG AI TRONG SO DO LA LAI XE
 * ============================================================================================
 *
 *     thoi luong cho THUC TE (phien da dong)
 *     -> van phong go mot con so de nghi + ly do
 *     -> mot NGUOI duyet / tu choi
 *     -> chi so DA DUYET moi di vao thu nhap cua lai xe, DUNG MOT LAN
 *
 * Dich vu nay khong tinh mot dong nao tu thoi luong. `allowance-lifecycle.ts` khong co mot phep
 * nhan nao, va `no-auto-waiting-allowance-formula.spec.ts` quet ca thu muc de giu dieu do.
 *
 * ============================================================================================
 * `selfDealing` KIEM TREN DANH TINH, KHONG TREN VAI
 * ============================================================================================
 *
 * Vai `SALE` (vai as-built cua lai xe) khong co mot ma van hanh nao, nen tang vai da chan phan lon.
 * Nhung mot nguoi CO CA HAI ho so — mot tai khoan `ADMIN` duoc noi voi mot `TransportDriver` — thi
 * tang vai khong noi duoc gi ve ho.
 *
 * Nen phep kiem that nam o day, tren `Driver.authUserId`, va no chan CA duong de nghi LAN duong
 * duyet. `#279` O6: *"driver cannot approve their own allowance"*.
 */
@Injectable()
export class WaitingAllowanceService {
  constructor(
    private readonly allowances: WaitingAllowanceRepository,
    private readonly sessions: WaitingSessionRepository,
    private readonly identity: WaitingAllowanceDriverIdentityFacts,
    @Inject(TRANSPORT_CORE_POLICY) private readonly corePolicy: TransportCorePolicy,
    @Optional() private readonly telemetry?: TelemetryService,
    @Optional() @Inject(TRANSPORT_CLOCK) private readonly clock?: () => Date,
  ) {}

  async propose(command: ProposeWaitingAllowanceCommand): Promise<DriverWaitingAllowance> {
    const session = await this.sessions.find(command.waitingSessionId);
    if (!session || session.driverId === null) {
      this.deny('waiting_allowance.propose', 'WAITING_ALLOWANCE_SESSION_NOT_FOUND', {
        waitingSessionId: command.waitingSessionId,
      });
      throw TransportDomainError.notFound(
        'WAITING_ALLOWANCE_SESSION_NOT_FOUND',
        'Khong tim thay phien cho',
      );
    }

    const decision = evaluateAllowanceProposal({
      sessionStatus: session.status,
      existingStatuses: (await this.allowances.listForSession(session.id)).map((row) => row.status),
      candidateAmount: command.candidateAmount,
      reason: command.reason,
      selfDealing: await this.isSelfDealing(command.authUserId, session.driverId),
    });
    if (!decision.allowed) {
      this.deny('waiting_allowance.propose', decision.reason, { waitingSessionId: session.id });
      throw this.proposeErrorFor(decision.reason);
    }

    const proposedAt = this.now();
    const allowance = await this.allowances.create({
      waitingSessionId: session.id,
      driverId: session.driverId,
      // `VND` la mac dinh cua CSDL (`@default("VND")`, cung khuon moi bang tien cua mien nay).
      // Khai o day de tang mien khong phu thuoc mot mac dinh cua Prisma cho mot gia tri co nghia
      // nghiep vu — `GD-03`: tien la so NGUYEN DONG.
      currencyCode: DEFAULT_CURRENCY_CODE,
      candidateAmount: command.candidateAmount,
      reason: command.reason.trim(),
      proposedBy: command.authUserId,
      proposedAt,
      businessDate: toBusinessDate(proposedAt, this.corePolicy.timeZone),
    });
    this.allow('waiting_allowance.propose', 'WAITING_ALLOWANCE_PROPOSED', {
      allowanceId: allowance.id,
      waitingSessionId: session.id,
    });
    return allowance;
  }

  async decide(command: DecideWaitingAllowanceCommand): Promise<DriverWaitingAllowance> {
    // GUI LAI TRUOC MOI PHEP KIEM KHAC — cung quy uoc voi `CheckpointService.append`. Mot lan bam
    // `Duyet` da thanh cong roi mat song tren duong ve phai tra ve dung ket qua cu, KHONG quyet lan
    // hai. `#279` O13 bai 11.
    const replayed = await this.allowances.findByDecisionKey(command.idempotencyKey);
    if (replayed) {
      this.allow('waiting_allowance.decide', 'WAITING_ALLOWANCE_DECISION_REPLAYED', {
        allowanceId: replayed.id,
        status: replayed.status,
      });
      return replayed;
    }

    const allowance = await this.allowances.find(command.allowanceId);
    if (!allowance) {
      this.deny('waiting_allowance.decide', 'WAITING_ALLOWANCE_NOT_FOUND', {
        allowanceId: command.allowanceId,
      });
      throw TransportDomainError.notFound(
        'WAITING_ALLOWANCE_NOT_FOUND',
        'Khong tim thay de nghi phu cap',
      );
    }

    const decision = evaluateAllowanceDecision({
      status: allowance.status,
      outcome: command.outcome,
      candidateAmount: allowance.candidateAmount,
      approvedAmount: command.approvedAmount,
      selfDealing: await this.isSelfDealing(command.authUserId, allowance.driverId),
    });
    if (!decision.allowed) {
      this.deny('waiting_allowance.decide', decision.reason, { allowanceId: allowance.id });
      throw this.decideErrorFor(decision.reason);
    }

    try {
      const decided = await this.allowances.decide({
        allowanceId: allowance.id,
        outcome: command.outcome,
        approvedAmount: command.outcome === 'APPROVED' ? command.approvedAmount : null,
        decidedBy: command.authUserId,
        decidedAt: this.now(),
        decisionNote: command.note,
        decisionIdempotencyKey: command.idempotencyKey,
      });
      this.allow('waiting_allowance.decide', decision.reason, {
        allowanceId: decided.id,
        outcome: decided.status,
        // KHONG log so tien. Mot dong thoi gian van hanh khong phai cho de doc bang luong.
        hasApprovedAmount: decided.approvedAmount !== null,
      });
      return decided;
    } catch (error) {
      if (isUniqueViolationOn(error, WAITING_ALLOWANCE_DECISION_KEY)) {
        const already = await this.allowances.findByDecisionKey(command.idempotencyKey);
        if (already) {
          this.allow('waiting_allowance.decide', 'WAITING_ALLOWANCE_DECISION_REPLAYED', {
            allowanceId: already.id,
          });
          return already;
        }
      }
      // HAI DE NGHI KHAC NHAU tren cung mot phien, ca hai duoc duyet cung luc. Unique MOT PHAN
      // chan ban thu hai — va do CHINH LA cau tra loi dung: mot khoang cho khong duoc tra tien
      // hai lan.
      if (isUniqueViolationOn(error, WAITING_ALLOWANCE_APPROVED_PER_SESSION)) {
        this.deny('waiting_allowance.decide', 'WAITING_ALLOWANCE_ALREADY_DECIDED', {
          allowanceId: allowance.id,
        });
        throw TransportDomainError.conflict(
          'WAITING_ALLOWANCE_ALREADY_APPROVED',
          'Phien nay da co mot khoan phu cap duoc duyet',
        );
      }
      if (error instanceof WaitingAllowanceAlreadyDecidedError) {
        this.deny('waiting_allowance.decide', 'WAITING_ALLOWANCE_ALREADY_DECIDED', {
          allowanceId: allowance.id,
        });
        throw TransportDomainError.conflict(
          'WAITING_ALLOWANCE_ALREADY_DECIDED',
          'De nghi nay da duoc quyet tu truoc',
        );
      }
      throw error;
    }
  }

  async listForSession(waitingSessionId: string): Promise<readonly DriverWaitingAllowance[]> {
    return this.allowances.listForSession(waitingSessionId);
  }

  /** Hang cho duyet — nguon cua muc `DRIVER_WAITING_ALLOWANCE_AWAITING_APPROVAL` (`#278`). */
  async listPending(): Promise<readonly DriverWaitingAllowance[]> {
    return this.allowances.listByStatus('PENDING');
  }

  async approvedTotalsBetween(
    startDate: string,
    endDate: string,
  ): Promise<readonly ApprovedWaitingAllowanceTotal[]> {
    return this.allowances.approvedTotalsBetween(startDate, endDate);
  }

  /**
   * Nguoi dang thao tac CO PHAI chinh lai xe huong khoan nay khong.
   *
   * Doc qua `Driver.authUserId` — tuc cau noi PHIEN DANG NHAP -> HO SO LAI XE, dung cau ma
   * `CheckpointService` da dung. Khong so sanh ten, khong so sanh so dien thoai: hai thu do doi
   * duoc, con lien ket tai khoan thi khong.
   */
  private async isSelfDealing(authUserId: string, driverId: string): Promise<boolean> {
    const actor = await this.identity.findDriverIdByAuthUserId(authUserId);
    return actor !== null && actor === driverId;
  }

  private proposeErrorFor(reason: TransportWaitingAllowanceDecisionReason): TransportDomainError {
    switch (reason) {
      case 'WAITING_ALLOWANCE_SELF_DEALING':
        return TransportDomainError.denied(reason, 'Khong tu de nghi khoan phu cap cua chinh minh');
      case 'WAITING_ALLOWANCE_SESSION_STILL_OPEN':
        return TransportDomainError.conflict(
          reason,
          'Phien cho chua dong — chua co thoi luong thuc te de de nghi',
        );
      case 'WAITING_ALLOWANCE_ALREADY_APPROVED':
      case 'WAITING_ALLOWANCE_ALREADY_PENDING':
        return TransportDomainError.conflict(reason, 'Phien nay da co mot de nghi phu cap');
      case 'WAITING_ALLOWANCE_REASON_REQUIRED':
        return TransportDomainError.invalid(reason, 'Phai ghi ly do de nghi');
      default:
        return TransportDomainError.invalid(reason, 'So tien phai la so nguyen duong');
    }
  }

  private decideErrorFor(reason: TransportWaitingAllowanceDecisionReason): TransportDomainError {
    switch (reason) {
      case 'WAITING_ALLOWANCE_SELF_DEALING':
        return TransportDomainError.denied(reason, 'Khong tu duyet khoan phu cap cua chinh minh');
      case 'WAITING_ALLOWANCE_ALREADY_DECIDED':
        return TransportDomainError.conflict(reason, 'De nghi nay da duoc quyet tu truoc');
      case 'WAITING_ALLOWANCE_ABOVE_CANDIDATE':
        return TransportDomainError.invalid(reason, 'So duyet khong duoc lon hon so de nghi');
      default:
        return TransportDomainError.invalid(reason, 'So tien phai la so nguyen duong');
    }
  }

  private allow(
    point: 'waiting_allowance.propose' | 'waiting_allowance.decide',
    reason: TransportWaitingAllowanceDecisionReason,
    detail: Record<string, unknown>,
  ): void {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_WAITING_ALLOWANCE_DECISIONS,
      point,
      outcome: 'allowed',
      reason,
      detail,
    });
  }

  private deny(
    point: 'waiting_allowance.propose' | 'waiting_allowance.decide',
    reason: TransportWaitingAllowanceDecisionReason,
    detail: Record<string, unknown>,
  ): void {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_WAITING_ALLOWANCE_DECISIONS,
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
