/**
 * Ly do TU CHOI cua xuong song danh tinh — tang kiem dau vao, khong phai quyet dinh nghiep vu.
 *
 * Cung khuon voi `costing-errors.ts` / `fuel-errors.ts`: tu vung thuoc ve cho so huu no, va
 * `transport.errors.ts` chi GOP lai de mot lop loi dung chung con noi duoc kieu.
 */
export const TRANSPORT_COUNTERPARTY_ERROR_REASONS = [
  'COUNTERPARTY_NOT_FOUND',
  /**
   * Ma so thue da thuoc ve mot phap nhan khac.
   *
   * Tach khoi `COUNTERPARTY_NOT_FOUND` va khoi mot loi unique tho cua Postgres vi day la thu
   * nguoi nhap lieu SUA DUOC: gan nhu luon la mot lan nhap trung, va cau tra loi dung la "mo
   * phap nhan da co roi lien ket vao do", khong phai "tao mot cai nua".
   */
  'COUNTERPARTY_TAX_CODE_TAKEN',
  /** `#267` H1 — khong tim thay dia diem van hanh. */
  'COUNTERPARTY_SITE_NOT_FOUND',
  /**
   * Hai kho cua CUNG mot phap nhan trung ten.
   *
   * Tach khoi mot loi unique tho cua Postgres vi day la thu nguoi nhap lieu SUA DUOC ngay, va cau
   * tra loi dung la "mo kho da co roi sua no", khong phai "tao mot cai nua" — cung ly le voi
   * `COUNTERPARTY_TAX_CODE_TAKEN` ngay tren.
   */
  'COUNTERPARTY_SITE_NAME_TAKEN',
] as const;
export type TransportCounterpartyErrorReason =
  (typeof TRANSPORT_COUNTERPARTY_ERROR_REASONS)[number];
