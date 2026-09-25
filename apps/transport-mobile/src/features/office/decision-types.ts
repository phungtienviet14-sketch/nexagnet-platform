import type { BusinessDate } from './types';

/**
 * HOP DONG cua cac QUYET DINH van phong lam duoc tren dien thoai — ban sao toi thieu tu
 * `apps/api/src/transport/{claims,waiting,acceptance,document}/**`.
 */

/* --- De nghi chi lai xe (`claims/claim.types.ts`) --- */

export interface ExpenseClaim {
  readonly id: string;
  readonly driverId: string;
  readonly status: string;
  readonly categoryCode: string;
  /** SO LAI XE DE NGHI — khong bao gio bi so duyet ghi de. */
  readonly claimedAmount: number;
  readonly approvedAmount: number | null;
  readonly currencyCode: string;
  readonly businessDate: BusinessDate;
  readonly note: string | null;
  readonly tripId: string | null;
  readonly runId: string | null;
  readonly legId: string | null;
  readonly submittedAt: string;
}

export interface ExpenseClaimDecision {
  readonly id: string;
  readonly outcome: string;
  readonly approvedAmount: number | null;
  readonly reasonCode: string;
  readonly note: string | null;
  readonly decidedAt: string;
}

export interface ExpenseClaimDetail {
  readonly claim: ExpenseClaim;
  readonly decisions: readonly ExpenseClaimDecision[];
}

/* --- Phu cap cho (`waiting/allowance.types.ts`) --- */

export interface WaitingAllowance {
  readonly id: string;
  readonly driverId: string;
  readonly status: string;
  readonly currencyCode: string;
  /** Tran cua so duoc duyet — may chu tu choi `approvedAmount` lon hon. */
  readonly candidateAmount: number;
  readonly approvedAmount: number | null;
  readonly reason: string;
  readonly businessDate: BusinessDate;
}

/* --- Ket thuc don (`acceptance/**`, `document/**`) --- */

export type CloseOutOutcome = 'APPROVED' | 'NEEDS_CORRECTION' | 'REJECTED';

export interface OrderCompletionRow {
  readonly acceptanceId: string | null;
  readonly orderId: string;
  readonly orderCode: string;
  readonly orderStatus: string;
  readonly originLabel: string;
  readonly destinationLabel: string;
  readonly state: string;
  readonly businessDate: BusinessDate;
  readonly evidenceCount: number;
  readonly runCode: string | null;
}

export interface OrderCompletionDecision {
  readonly id: string;
  readonly sequence: number;
  readonly outcome: string;
  readonly externalNote: string | null;
  readonly decidedAt: string;
  readonly decidedByActor?: { readonly label: string } | null;
}

export interface OrderCompletionDetail {
  readonly acceptance: {
    readonly id: string;
    readonly state: string;
    /** Ban moi nhat — lenh ke tiep PHAI mang no lam `supersedesId`. */
    readonly latestDecisionId: string | null;
  };
  readonly decisions: readonly OrderCompletionDecision[];
}

export interface OperationalDocument {
  readonly id: string;
  readonly type: string;
  readonly basis: string;
  readonly fileId: string | null;
  readonly label: string | null;
  readonly status: string;
  readonly receivedAt: string;
}
