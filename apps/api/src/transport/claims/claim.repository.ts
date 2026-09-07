import { randomUUID } from 'node:crypto';
import type {
  ExpenseClaim,
  ExpenseClaimDecision,
  ExpenseClaimDecisionOutcome,
  ExpenseClaimStatus,
} from './claim.types.js';

export interface CreateExpenseClaimInput {
  readonly driverId: string;
  readonly categoryCode: string;
  readonly claimedAmount: number;
  readonly businessDate: string;
  readonly tripId: string | null;
  readonly runId: string | null;
  readonly legId: string | null;
  readonly note: string | null;
  readonly evidenceLocator: string | null;
  readonly submittedBy: string;
}

/**
 * MOT LAN QUYET DINH -- ghi trang thai de nghi va hang lich su TRONG MOT giao dich.
 *
 * Hai thu phai di cung nhau. Neu trang thai doi ma hang lich su khong ghi duoc, ta co mot khoan
 * "da duyet" ma khong ai biet ai duyet -- dung thu ma cong duyet sinh ra de tranh.
 */
export interface DecideExpenseClaimInput {
  readonly outcome: ExpenseClaimDecisionOutcome;
  /** Bat buoc khi `APPROVED`, phai la `null` khi `REJECTED` (cuong che boi `CHECK` o DB). */
  readonly approvedAmount: number | null;
  readonly reasonCode: string;
  readonly note: string | null;
  readonly decidedBy: string;
  readonly decidedAt: Date;
  /** Khoan chi da ghi vao gia thanh, neu lan duyet nay ghi duoc. */
  readonly settlementExpenseId: string | null;
}

export interface ExpenseClaimFilter {
  readonly status?: ExpenseClaimStatus;
  readonly driverId?: string;
}

/**
 * CONG LUU TRU cua de nghi chi.
 *
 * KHONG co `updateDecision` lan `deleteDecision`: lich su quyet dinh CHI GHI THEM, cung ly do voi
 * `TransportDriverFundEntry`. Cach chac chan nhat de khong ai ghi de la khong cung cap cai nut do.
 */
export abstract class ExpenseClaimRepository {
  abstract create(input: CreateExpenseClaimInput): Promise<ExpenseClaim>;
  abstract find(id: string): Promise<ExpenseClaim | null>;
  abstract list(filter: ExpenseClaimFilter): Promise<ExpenseClaim[]>;
  abstract listDecisions(claimId: string): Promise<ExpenseClaimDecision[]>;
  /** Ghi quyet dinh + doi trang thai de nghi trong MOT giao dich. */
  abstract decide(
    claimId: string,
    input: DecideExpenseClaimInput,
  ): Promise<{ claim: ExpenseClaim; decision: ExpenseClaimDecision }>;
  /** Gan khoan chi da ghi vao mot de nghi DA DUYET -- duong bu khi buoc ghi so thu lai. */
  abstract attachSettlement(claimId: string, expenseId: string): Promise<ExpenseClaim | null>;
}

/* ----------------------------------------------------------------------------------------- *
 * BAN TRONG BO NHO -- cuong che dung nhung bat bien ma `CHECK` cua Postgres cuong che.
 * ----------------------------------------------------------------------------------------- */

const iso = (value: Date): string => value.toISOString();

export class InMemoryExpenseClaimRepository extends ExpenseClaimRepository {
  private readonly claims = new Map<string, ExpenseClaim>();
  private readonly decisions = new Map<string, ExpenseClaimDecision[]>();

  async create(input: CreateExpenseClaimInput): Promise<ExpenseClaim> {
    const now = iso(new Date());
    const claim: ExpenseClaim = {
      id: randomUUID(),
      driverId: input.driverId,
      status: 'PENDING_REVIEW',
      categoryCode: input.categoryCode,
      claimedAmount: input.claimedAmount,
      approvedAmount: null,
      currencyCode: 'VND',
      businessDate: input.businessDate,
      note: input.note,
      evidenceLocator: input.evidenceLocator,
      tripId: input.tripId,
      runId: input.runId,
      legId: input.legId,
      submittedBy: input.submittedBy,
      submittedAt: now,
      decidedAt: null,
      settlementExpenseId: null,
      createdAt: now,
      updatedAt: now,
    };
    this.claims.set(claim.id, claim);
    this.decisions.set(claim.id, []);
    return claim;
  }

  async find(id: string): Promise<ExpenseClaim | null> {
    return this.claims.get(id) ?? null;
  }

  async list(filter: ExpenseClaimFilter): Promise<ExpenseClaim[]> {
    return [...this.claims.values()]
      .filter((claim) => (filter.status ? claim.status === filter.status : true))
      .filter((claim) => (filter.driverId ? claim.driverId === filter.driverId : true))
      .sort(
        (left, right) =>
          right.businessDate.localeCompare(left.businessDate) ||
          right.submittedAt.localeCompare(left.submittedAt),
      );
  }

  async listDecisions(claimId: string): Promise<ExpenseClaimDecision[]> {
    return [...(this.decisions.get(claimId) ?? [])].sort((a, b) => a.sequence - b.sequence);
  }

  async decide(
    claimId: string,
    input: DecideExpenseClaimInput,
  ): Promise<{ claim: ExpenseClaim; decision: ExpenseClaimDecision }> {
    const current = this.claims.get(claimId);
    if (!current) throw new Error(`khong tim thay de nghi ${claimId}`);

    const history = this.decisions.get(claimId) ?? [];
    const decision: ExpenseClaimDecision = {
      id: randomUUID(),
      claimId,
      sequence: history.length + 1,
      outcome: input.outcome,
      // Cung bat bien voi `TransportExpenseClaimDecision_amount_matches_outcome`.
      approvedAmount: input.outcome === 'APPROVED' ? input.approvedAmount : null,
      reasonCode: input.reasonCode,
      note: input.note,
      decidedBy: input.decidedBy,
      decidedAt: iso(input.decidedAt),
    };
    this.decisions.set(claimId, [...history, decision]);

    const claim: ExpenseClaim = {
      ...current,
      status: input.outcome === 'APPROVED' ? 'APPROVED' : 'REJECTED',
      approvedAmount: input.outcome === 'APPROVED' ? input.approvedAmount : null,
      decidedAt: iso(input.decidedAt),
      settlementExpenseId: input.outcome === 'APPROVED' ? input.settlementExpenseId : null,
      updatedAt: iso(input.decidedAt),
    };
    this.claims.set(claimId, claim);
    return { claim, decision };
  }

  async attachSettlement(claimId: string, expenseId: string): Promise<ExpenseClaim | null> {
    const current = this.claims.get(claimId);
    if (!current) return null;
    const claim: ExpenseClaim = {
      ...current,
      settlementExpenseId: expenseId,
      updatedAt: iso(new Date()),
    };
    this.claims.set(claimId, claim);
    return claim;
  }
}
