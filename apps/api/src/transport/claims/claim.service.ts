import { Inject, Injectable, Optional } from '@nestjs/common';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { TelemetryService } from '../../observability/telemetry.service.js';
import { assertBusinessDate, toBusinessDate } from '../business-date.js';
import { CostingService } from '../costing/costing.service.js';
import { TransportCoreFacts } from '../costing/transport-core-facts.port.js';
import { FleetRepository } from '../fleet/fleet.repository.js';
import { MoneyError, nonNegativeMoney } from '../money.js';
import { MovementRepository } from '../movement/movement.repository.js';
import { TRANSPORT_CORE_POLICY, type TransportCorePolicy } from '../transport-policy.js';
import { TransportDomainError } from '../transport.errors.js';
import {
  TRANSPORT_EXPENSE_CLAIM_DECISIONS,
  type TransportExpenseClaimDecisionReason,
} from './claim-decisions.js';
import { ExpenseClaimRepository, type ExpenseClaimFilter } from './claim.repository.js';
import {
  isReservedClaimCategory,
  type ExpenseClaim,
  type ExpenseClaimDetail,
} from './claim.types.js';

export interface SubmitExpenseClaimCommand {
  readonly driverId: string;
  readonly categoryCode: string;
  readonly claimedAmount: number;
  readonly businessDate?: string;
  readonly tripId?: string | null;
  readonly runId?: string | null;
  readonly legId?: string | null;
  readonly note?: string | null;
  readonly evidenceLocator?: string | null;
}

export interface ReviewExpenseClaimCommand {
  readonly reasonCode: string;
  /** Bo trong = duyet TRON KHOAN (`D-06`). Chi co nghia khi duyet. */
  readonly approvedAmount?: number;
  readonly note?: string | null;
}

type DecisionPoint = (typeof TRANSPORT_EXPENSE_CLAIM_DECISIONS)['points'][number];

/**
 * DE NGHI CHI cua lai xe va CONG DUYET (R1-C, #232 `D-06` / #234 A2).
 *
 * MOT CAU quyet dinh toan bo thiet ke: *chi khoan DA DUYET moi cham vao gia thanh va so quy*.
 *
 * Nen service nay KHONG tu ghi mot but toan nao. Khi duyet, no goi
 * `CostingService.recordTripExpense()` -- dung cai cua duy nhat ma T3 mo cho tien di vao (`INV-03`:
 * hai chan cua mot su kien kinh te ghi trong MOT giao dich). Dung mot duong ghi thu hai o day se
 * tao ra mot so cai song song, va hai so se lech nhau ma khong co gi bao.
 *
 * `correlationKey = claim:<id>` lam viec ghi so TAT DINH: bam duyet hai lan khong the tru tien hai
 * lan, vi T3 nhan ra khoa trung va tra lai ban da ghi.
 */
@Injectable()
export class ExpenseClaimService {
  constructor(
    private readonly repository: ExpenseClaimRepository,
    private readonly costing: CostingService,
    private readonly core: TransportCoreFacts,
    private readonly movement: MovementRepository,
    private readonly fleet: FleetRepository,
    private readonly audit: AuditLogService,
    @Inject(TRANSPORT_CORE_POLICY) private readonly policy: TransportCorePolicy,
    @Optional() private readonly telemetry?: TelemetryService,
  ) {}

  /* ------------------------------------------------------------------ *
   * NOP DE NGHI
   * ------------------------------------------------------------------ */

  async submit(command: SubmitExpenseClaimCommand, actor: string): Promise<ExpenseClaim> {
    const tripId = command.tripId ?? null;
    const runId = command.runId ?? null;
    const legId = command.legId ?? null;

    if (tripId === null && runId === null && legId === null) {
      throw this.deny('expense_claim.submit', 'CLAIM_REFERENCE_REQUIRED', {
        driverId: command.driverId,
      });
    }
    if (isReservedClaimCategory(command.categoryCode)) {
      throw this.deny('expense_claim.submit', 'CLAIM_CATEGORY_ROUTED_ELSEWHERE', {
        categoryCode: command.categoryCode,
      });
    }

    const claimedAmount = this.checkMoney(command.claimedAmount);
    const businessDate = this.resolveBusinessDate(command.businessDate);
    await this.requireDriver(command.driverId);
    await this.requireReferences(command.driverId, tripId, runId, legId);

    const claim = await this.repository.create({
      driverId: command.driverId,
      categoryCode: command.categoryCode,
      claimedAmount,
      businessDate,
      tripId,
      runId,
      legId,
      note: command.note ?? null,
      evidenceLocator: command.evidenceLocator ?? null,
      submittedBy: actor,
    });

    this.allow('expense_claim.submit', 'CLAIM_SUBMITTED', {
      claimId: claim.id,
      driverId: claim.driverId,
    });
    await this.audit.append({
      actor,
      action: 'transport.expense.claim.submit',
      entityType: 'TransportExpenseClaim',
      entityId: claim.id,
      before: null,
      after: claim,
    });
    return claim;
  }

  /* ------------------------------------------------------------------ *
   * DUYET / TU CHOI
   * ------------------------------------------------------------------ */

  /**
   * THU TU cac buoc o day la mot phan hop dong, khong phai chi tiet thi cong.
   *
   * Ghi so (`recordTripExpense`) chay TRUOC khi ghi quyet dinh. Neu T3 tu choi -- ky quy dong bang,
   * chuyen da doi soat, lai xe khong con phan cong -- thi KHONG co gi duoc ghi, va nguoi duyet
   * nhan dung ma ly do cua T3. Dao thu tu lai se de ra mot de nghi mang nhan "da duyet" trong khi
   * tien chua bao gio vao so.
   */
  async approve(
    id: string,
    command: ReviewExpenseClaimCommand,
    actor: string,
  ): Promise<ExpenseClaimDetail> {
    const claim = await this.requireDecidable(id, actor);
    const approvedAmount = this.resolveApprovedAmount(claim, command.approvedAmount);

    const settlementExpenseId = await this.settle(claim, approvedAmount, actor);

    const { claim: decided } = await this.repository.decide(id, {
      outcome: 'APPROVED',
      approvedAmount,
      reasonCode: command.reasonCode,
      note: command.note ?? null,
      decidedBy: actor,
      decidedAt: new Date(),
      settlementExpenseId,
    });

    this.allow('expense_claim.review', 'CLAIM_APPROVED', {
      claimId: id,
      approvedAmount,
      settled: settlementExpenseId !== null,
    });
    await this.audit.append({
      actor,
      action: 'transport.expense.claim.approve',
      entityType: 'TransportExpenseClaim',
      entityId: id,
      before: claim,
      after: decided,
    });
    return { claim: decided, decisions: await this.repository.listDecisions(id) };
  }

  async reject(
    id: string,
    command: ReviewExpenseClaimCommand,
    actor: string,
  ): Promise<ExpenseClaimDetail> {
    const claim = await this.requireDecidable(id, actor);

    const { claim: decided } = await this.repository.decide(id, {
      outcome: 'REJECTED',
      approvedAmount: null,
      reasonCode: command.reasonCode,
      note: command.note ?? null,
      decidedBy: actor,
      decidedAt: new Date(),
      settlementExpenseId: null,
    });

    this.allow('expense_claim.review', 'CLAIM_REJECTED', { claimId: id });
    await this.audit.append({
      actor,
      action: 'transport.expense.claim.reject',
      entityType: 'TransportExpenseClaim',
      entityId: id,
      before: claim,
      after: decided,
    });
    return { claim: decided, decisions: await this.repository.listDecisions(id) };
  }

  /* ------------------------------------------------------------------ *
   * DOC
   * ------------------------------------------------------------------ */

  list(filter: ExpenseClaimFilter): Promise<ExpenseClaim[]> {
    return this.repository.list(filter);
  }

  async get(id: string): Promise<ExpenseClaimDetail> {
    const claim = await this.require(id);
    return { claim, decisions: await this.repository.listDecisions(id) };
  }

  /** Danh tinh lai xe den tu PHIEN, khong tu than yeu cau. */
  async listForAuthUser(authUserId: string): Promise<ExpenseClaim[]> {
    const driver = await this.requireDriverBinding(authUserId);
    return this.repository.list({ driverId: driver.id });
  }

  async submitForAuthUser(
    authUserId: string,
    command: Omit<SubmitExpenseClaimCommand, 'driverId'>,
    actor: string,
  ): Promise<ExpenseClaim> {
    const driver = await this.requireDriverBinding(authUserId);
    return this.submit({ ...command, driverId: driver.id }, actor);
  }

  /* ------------------------------------------------------------------ *
   * Ho tro
   * ------------------------------------------------------------------ */

  /**
   * Ghi so DUYET vao gia thanh + so quy, qua dung cua cua T3.
   *
   * Tra `null` khi de nghi chua gan chuyen: duong tien cua T3 di qua mot CHUYEN. Truong hop do
   * duoc NOI RA bang mot ma ly do rieng thay vi im lang -- mot khoan "da duyet" ma khong ai biet
   * no chua vao so la cach mot khoan tien bien mat.
   */
  private async settle(
    claim: ExpenseClaim,
    approvedAmount: number,
    actor: string,
  ): Promise<string | null> {
    if (claim.tripId === null) {
      this.allow('expense_claim.settle', 'CLAIM_SETTLEMENT_DEFERRED_NO_TRIP', {
        claimId: claim.id,
        runId: claim.runId,
        legId: claim.legId,
      });
      return null;
    }

    const posting = await this.costing.recordTripExpense(
      {
        tripId: claim.tripId,
        categoryCode: claim.categoryCode,
        amount: approvedAmount,
        fundedBy: 'DRIVER_FUND',
        driverId: claim.driverId,
        businessDate: claim.businessDate,
        evidenceLocator: claim.evidenceLocator,
        note: claim.note,
        // TAT DINH: bam duyet hai lan khong tru tien hai lan.
        correlationKey: `claim:${claim.id}`,
      },
      actor,
    );

    const expenseId = posting.expense?.id ?? null;
    this.allow('expense_claim.settle', 'CLAIM_SETTLED', {
      claimId: claim.id,
      expenseId,
      approvedAmount,
    });
    return expenseId;
  }

  private resolveApprovedAmount(claim: ExpenseClaim, requested: number | undefined): number {
    if (requested === undefined) return claim.claimedAmount;
    const approved = this.checkMoney(requested);
    if (approved > claim.claimedAmount) {
      throw this.deny('expense_claim.review', 'CLAIM_APPROVED_AMOUNT_ABOVE_CLAIMED', {
        claimId: claim.id,
        claimedAmount: claim.claimedAmount,
        requested: approved,
      });
    }
    return approved;
  }

  private async requireDecidable(id: string, actor: string): Promise<ExpenseClaim> {
    const claim = await this.require(id);
    if (claim.status !== 'PENDING_REVIEW') {
      throw this.deny('expense_claim.review', 'CLAIM_ALREADY_DECIDED', {
        claimId: id,
        status: claim.status,
      });
    }
    if (claim.submittedBy === actor) {
      throw this.deny('expense_claim.review', 'CLAIM_REVIEWER_IS_SUBMITTER', { claimId: id });
    }
    return claim;
  }

  private async require(id: string): Promise<ExpenseClaim> {
    const claim = await this.repository.find(id);
    if (!claim) throw TransportDomainError.notFound('CLAIM_NOT_FOUND', 'Khong tim thay de nghi.');
    return claim;
  }

  private async requireDriver(driverId: string): Promise<void> {
    if (!(await this.fleet.findDriver(driverId))) {
      throw TransportDomainError.notFound('CLAIM_DRIVER_NOT_FOUND', 'Khong tim thay lai xe.');
    }
  }

  private async requireDriverBinding(authUserId: string): Promise<{ id: string }> {
    const driver = await this.core.findDriverByAuthUserId(authUserId);
    if (!driver) {
      throw TransportDomainError.denied(
        'CLAIM_SELF_NO_DRIVER_BINDING',
        'Tai khoan nay khong noi voi mot ho so lai xe nao.',
      );
    }
    return driver;
  }

  /**
   * `DA-T3-04` doc lai cho de nghi: mot khoan gan vao chuyen chi de nghi duoc boi lai xe DA TUNG
   * duoc phan cong vao chuyen do. Kiem o day, TRUOC khi ghi -- neu de toi luc duyet moi phat hien
   * thi de nghi da nam trong hang doi cua ke toan mot cach vo ich.
   */
  private async requireReferences(
    driverId: string,
    tripId: string | null,
    runId: string | null,
    legId: string | null,
  ): Promise<void> {
    if (tripId !== null) {
      if (!(await this.core.findTrip(tripId))) {
        throw TransportDomainError.notFound('CLAIM_TRIP_NOT_FOUND', 'Khong tim thay chuyen.');
      }
      if (!(await this.core.wasDriverEverAssignedToTrip(tripId, driverId))) {
        throw this.deny('expense_claim.submit', 'CLAIM_DRIVER_NOT_ASSIGNED', { tripId, driverId });
      }
    }
    if (runId !== null && !(await this.movement.findRun(runId))) {
      throw TransportDomainError.notFound('CLAIM_RUN_NOT_FOUND', 'Khong tim thay vong chay.');
    }
    if (legId !== null && !(await this.movement.findLeg(legId))) {
      throw TransportDomainError.notFound('CLAIM_LEG_NOT_FOUND', 'Khong tim thay chang.');
    }
  }

  private checkMoney(amount: number): number {
    try {
      const money = nonNegativeMoney(amount);
      if (money.amount === 0) {
        throw TransportDomainError.invalid(
          'CLAIM_AMOUNT_INVALID',
          'So tien de nghi phai lon hon 0.',
        );
      }
      return money.amount;
    } catch (error) {
      if (error instanceof MoneyError) {
        throw TransportDomainError.invalid('CLAIM_AMOUNT_INVALID', error.message);
      }
      throw error;
    }
  }

  private resolveBusinessDate(value: string | undefined): string {
    if (value === undefined) return toBusinessDate(new Date(), this.policy.timeZone);
    try {
      return assertBusinessDate(value);
    } catch (error) {
      throw TransportDomainError.invalid(
        'CLAIM_BUSINESS_DATE_INVALID',
        error instanceof Error ? error.message : 'Ngay nghiep vu khong hop le.',
      );
    }
  }

  private allow(
    point: DecisionPoint,
    reason: TransportExpenseClaimDecisionReason,
    detail: Record<string, unknown>,
  ): void {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_EXPENSE_CLAIM_DECISIONS,
      point,
      outcome: 'allowed',
      reason,
      detail,
    });
  }

  private deny(
    point: DecisionPoint,
    reason: TransportExpenseClaimDecisionReason,
    detail: Record<string, unknown>,
  ): TransportDomainError {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_EXPENSE_CLAIM_DECISIONS,
      point,
      outcome: 'denied',
      reason,
      detail,
    });
    return TransportDomainError.denied(reason, TRANSPORT_EXPENSE_CLAIM_DECISIONS.labels[reason]);
  }
}
