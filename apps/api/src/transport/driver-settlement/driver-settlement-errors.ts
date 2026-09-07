/**
 * Ly do TU CHOI cua `TX-07b`.
 *
 * TEP NAY KHONG IMPORT GI — cung quy uoc voi `workforce-errors.ts` va `fuel-errors.ts`.
 */

export const TRANSPORT_DRIVER_SETTLEMENT_VALIDATION_REASONS = [
  'CASHOUT_NOT_FOUND',
  'CASHOUT_DRIVER_NOT_FOUND',
  /** Ngay chi tien sai dang hoac khong co that. */
  'CASHOUT_BUSINESS_DATE_INVALID',
  /** Hinh thuc chi rong — mot o trong khong noi duoc tien da di duong nao. */
  'CASHOUT_METHOD_BLANK',
  /** Ly do dao rong. Mot lan dao khong ly do la thu nguoi doi soat can doc nhat ma khong co. */
  'CASHOUT_REVERSAL_REASON_BLANK',
  /**
   * So quy vang mat — khach tat `transport-costing`.
   *
   * Chi chan DUONG HOAN UNG. Rut luong van chay: no khong doc mot dong nao cua so quy.
   */
  'CASHOUT_FUND_UNAVAILABLE',
  /** Tai khoan dang nhap chua duoc noi voi mot ho so lai xe nao (`#168 B8`). */
  'CASHOUT_SELF_DRIVER_NOT_LINKED',
] as const;
export type TransportDriverSettlementValidationReason =
  (typeof TRANSPORT_DRIVER_SETTLEMENT_VALIDATION_REASONS)[number];

export const TRANSPORT_DRIVER_SETTLEMENT_CONFLICT_REASONS = [
  /**
   * Cung khoa chong ghi trung nhung noi dung KHAC — loi ben goi, phai nem.
   *
   * Tra ve ban cu se lam ben goi tin rang con so MOI cua ho da duoc ghi. Cung bai hoc T4R §5, va o
   * day no dat hon: mot lan chi la tien mat da roi khoi cong ty.
   */
  'CASHOUT_REPLAY_CONTENT_MISMATCH',
  /** Ban goc nay da co mot phieu dao — `reversesId` la `@unique`. */
  'CASHOUT_ALREADY_REVERSED',
] as const;
export type TransportDriverSettlementConflictReason =
  (typeof TRANSPORT_DRIVER_SETTLEMENT_CONFLICT_REASONS)[number];

export type TransportDriverSettlementErrorReason =
  TransportDriverSettlementValidationReason | TransportDriverSettlementConflictReason;
