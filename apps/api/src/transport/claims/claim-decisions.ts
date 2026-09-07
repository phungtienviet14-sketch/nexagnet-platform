import { defineDecisionVocabulary } from '../../observability/decision-vocabulary.js';

/**
 * TU VUNG QUYET DINH cua DE NGHI CHI (R1-C, `D-06`).
 *
 * Thuoc `transport-costing`, khong `transport-core`: mot de nghi chi chi co nghia khi khach da bat
 * so quy lai xe. Nhet vao bo tu vung cua core se hua voi khach chi bat core mot diem quyet dinh
 * khong bao gio phat.
 */

/* ------------------------------------------------------------------ *
 * expense_claim.submit -- ExpenseClaimService.submit()
 * ------------------------------------------------------------------ */
export const EXPENSE_CLAIM_SUBMIT_REASONS = [
  'CLAIM_SUBMITTED',
  /**
   * `D-05` / `D-07` -- nhien lieu va ETC co duong rieng. De chung vao day se tao NGUON SU THAT
   * THU HAI cho cung mot khoan tien, va hai so se lech nhau ma khong co gi bao.
   */
  'CLAIM_CATEGORY_ROUTED_ELSEWHERE',
  /** Khong tham chieu nao thi khong ai tra loi duoc "khoan nay phat sinh o dau". */
  'CLAIM_REFERENCE_REQUIRED',
  /**
   * `DA-T3-04` doc lai cho de nghi: chi lai xe DA TUNG duoc phan cong vao chuyen do moi de nghi
   * duoc tren chuyen do. Khong co cong nay thi mot lan go nham `tripId` de khoan chi cua nguoi nay
   * vao gia thanh chuyen cua nguoi khac.
   */
  'CLAIM_DRIVER_NOT_ASSIGNED',
] as const;
export type ExpenseClaimSubmitReason = (typeof EXPENSE_CLAIM_SUBMIT_REASONS)[number];

/* ------------------------------------------------------------------ *
 * expense_claim.review -- ExpenseClaimService.approve() / reject()
 * ------------------------------------------------------------------ */
export const EXPENSE_CLAIM_REVIEW_REASONS = [
  'CLAIM_APPROVED',
  'CLAIM_REJECTED',
  /** Da co quyet dinh roi: doi y la mot duong khac (dao khoan chi), khong phai duyet lai. */
  'CLAIM_ALREADY_DECIDED',
  /** Duyet nhieu hon so de nghi la tu tao ra tien. */
  'CLAIM_APPROVED_AMOUNT_ABOVE_CLAIMED',
  /**
   * Nguoi duyet KHONG duoc la nguoi de nghi. Day dung la thu ma kiem soat noi bo sinh ra de chan --
   * cung ly le da ghi cho `transport.payslip.approve` o `transport-actions.ts`.
   */
  'CLAIM_REVIEWER_IS_SUBMITTER',
] as const;
export type ExpenseClaimReviewReason = (typeof EXPENSE_CLAIM_REVIEW_REASONS)[number];

/* ------------------------------------------------------------------ *
 * expense_claim.settle -- ghi so duyet vao gia thanh + so quy
 * ------------------------------------------------------------------ */
export const EXPENSE_CLAIM_SETTLE_REASONS = [
  'CLAIM_SETTLED',
  /**
   * Duyet roi nhung CHUA vao gia thanh duoc: duong tien cua T3 di qua mot CHUYEN, va de nghi nay
   * chi gan vao vong chay/chang. Noi thang ra thay vi im lang -- mot khoan "da duyet" ma khong ai
   * biet no chua vao so la cach mot khoan tien bien mat.
   */
  'CLAIM_SETTLEMENT_DEFERRED_NO_TRIP',
  /** Ghi lai lan hai tren cung mot de nghi: tra lai khoan da ghi, khong ghi them. */
  'CLAIM_SETTLEMENT_IDEMPOTENT_REPLAY',
] as const;
export type ExpenseClaimSettleReason = (typeof EXPENSE_CLAIM_SETTLE_REASONS)[number];

export type TransportExpenseClaimDecisionReason =
  | ExpenseClaimSubmitReason
  | ExpenseClaimReviewReason
  | ExpenseClaimSettleReason;

export const TRANSPORT_EXPENSE_CLAIM_DECISIONS = defineDecisionVocabulary({
  owner: 'transport-costing',
  points: ['expense_claim.submit', 'expense_claim.review', 'expense_claim.settle'],
  labels: {
    CLAIM_SUBMITTED: 'Da nhan de nghi chi cua lai xe',
    CLAIM_CATEGORY_ROUTED_ELSEWHERE: 'Nhom chi phi nay co duong rieng, khong di qua de nghi',
    CLAIM_REFERENCE_REQUIRED: 'De nghi phai gan vao mot chuyen, vong chay hoac chang',
    CLAIM_DRIVER_NOT_ASSIGNED: 'Lai xe chua bao gio duoc phan cong vao chuyen nay',
    CLAIM_APPROVED: 'Da duyet de nghi chi',
    CLAIM_REJECTED: 'Da tu choi de nghi chi',
    CLAIM_ALREADY_DECIDED: 'De nghi da co quyet dinh, khong duyet lai',
    CLAIM_APPROVED_AMOUNT_ABOVE_CLAIMED: 'So duyet vuot so lai xe de nghi',
    CLAIM_REVIEWER_IS_SUBMITTER: 'Nguoi duyet khong duoc la nguoi de nghi',
    CLAIM_SETTLED: 'Da ghi so duyet vao gia thanh va so quy',
    CLAIM_SETTLEMENT_DEFERRED_NO_TRIP: 'Da duyet nhung chua vao gia thanh: de nghi chua gan chuyen',
    CLAIM_SETTLEMENT_IDEMPOTENT_REPLAY: 'De nghi nay da ghi vao gia thanh tu truoc',
  } satisfies Record<TransportExpenseClaimDecisionReason, string>,
});
