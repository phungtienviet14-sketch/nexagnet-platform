/**
 * MA TU CHOI DAU VAO cua de nghi chi.
 *
 * Tach khoi `claim-decisions.ts` theo dung quy uoc: tep kia tra loi "he thong QUYET DINH gi va vi
 * sao", tep nay tra loi "nguoi goi da gui cai gi sai".
 */
export const TRANSPORT_EXPENSE_CLAIM_ERROR_REASONS = [
  'CLAIM_NOT_FOUND',
  'CLAIM_DRIVER_NOT_FOUND',
  'CLAIM_TRIP_NOT_FOUND',
  'CLAIM_RUN_NOT_FOUND',
  'CLAIM_LEG_NOT_FOUND',
  'CLAIM_AMOUNT_INVALID',
  'CLAIM_BUSINESS_DATE_INVALID',
  /** Nhom chi phi khong co trong danh muc cua goi khach. */
  'CLAIM_CATEGORY_UNKNOWN',
  /** Danh tinh lai xe den tu PHIEN, khong tu than yeu cau -- phien khong noi voi ho so lai xe nao. */
  'CLAIM_SELF_NO_DRIVER_BINDING',
] as const;
export type TransportExpenseClaimErrorReason =
  (typeof TRANSPORT_EXPENSE_CLAIM_ERROR_REASONS)[number];
