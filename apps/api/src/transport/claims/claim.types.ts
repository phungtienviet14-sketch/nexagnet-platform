/**
 * DE NGHI CHI cua lai xe + lich su duyet (R1-C, `D-06`).
 *
 * Tang kieu thuan: khong `@nestjs`, khong Prisma, khong I/O.
 */

export const EXPENSE_CLAIM_STATUSES = ['PENDING_REVIEW', 'APPROVED', 'REJECTED'] as const;
export type ExpenseClaimStatus = (typeof EXPENSE_CLAIM_STATUSES)[number];

export const EXPENSE_CLAIM_DECISION_OUTCOMES = ['APPROVED', 'REJECTED'] as const;
export type ExpenseClaimDecisionOutcome = (typeof EXPENSE_CLAIM_DECISION_OUTCOMES)[number];

/**
 * NHOM CHI PHI CO DUONG RIENG -- khong bao gio di qua de nghi (`D-05`, `D-07`).
 *
 * So sanh khong phan biet hoa thuong va da cat khoang trang, dung nhu `CHECK` o DB
 * (`TransportExpenseClaim_category_not_reserved`). Hai cho kiem cung mot dieu la co y: tang mien
 * tra ve mot ma NGHIEP VU doc duoc, con `CHECK` la luoi cuoi cho moi duong ghi khac.
 */
export const CLAIM_RESERVED_CATEGORY_CODES = ['FUEL', 'ETC'] as const;

export const isReservedClaimCategory = (categoryCode: string): boolean =>
  (CLAIM_RESERVED_CATEGORY_CODES as readonly string[]).includes(categoryCode.trim().toUpperCase());

export interface ExpenseClaim {
  readonly id: string;
  readonly driverId: string;
  readonly status: ExpenseClaimStatus;
  readonly categoryCode: string;
  /** SO LAI XE DE NGHI -- khong bao gio bi ghi de. */
  readonly claimedAmount: number;
  /** SO DUOC DUYET -- `null` cho toi khi co mot quyet dinh `APPROVED`. */
  readonly approvedAmount: number | null;
  readonly currencyCode: string;
  readonly businessDate: string;
  readonly note: string | null;
  readonly evidenceLocator: string | null;
  readonly tripId: string | null;
  readonly runId: string | null;
  readonly legId: string | null;
  readonly submittedBy: string;
  readonly submittedAt: string;
  readonly decidedAt: string | null;
  /** Khoan chi da ghi vao gia thanh -- `null` khi chua duyet, hoac duyet ma chua gan chuyen. */
  readonly settlementExpenseId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ExpenseClaimDecision {
  readonly id: string;
  readonly claimId: string;
  readonly sequence: number;
  readonly outcome: ExpenseClaimDecisionOutcome;
  readonly approvedAmount: number | null;
  readonly reasonCode: string;
  readonly note: string | null;
  readonly decidedBy: string;
  readonly decidedAt: string;
}

/** Mot de nghi doc kem lich su quyet dinh -- hinh dang ma be mat duyet can. */
export interface ExpenseClaimDetail {
  readonly claim: ExpenseClaim;
  readonly decisions: readonly ExpenseClaimDecision[];
}
