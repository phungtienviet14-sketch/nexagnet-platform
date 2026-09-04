/**
 * Ly do TU CHOI cua `transport-workforce`.
 *
 * TEP NAY KHONG IMPORT GI — cung quy uoc voi `fuel-errors.ts` va `asset-compliance-errors.ts`.
 */

export const TRANSPORT_WORKFORCE_VALIDATION_REASONS = [
  'PAYROLL_PERIOD_NOT_FOUND',
  'PAYROLL_RUN_NOT_FOUND',
  'PAYSLIP_NOT_FOUND',
  'PAYROLL_DRIVER_NOT_FOUND',
  /** Ky luong dao nguoc: `startDate` sau `endDate`, hoac mot trong hai khong phai ngay co that. */
  'PAYROLL_PERIOD_RANGE_INVALID',
  /** Ky da dong — khong chay luong moi tren no. */
  'PAYROLL_PERIOD_CLOSED',
  /** Phieu khong con o `DRAFT` nen khong duyet/sua truc tiep duoc (`INV-20`). */
  'PAYSLIP_NOT_DRAFT',
  /** Phieu chua duyet nen chua chi tra duoc. */
  'PAYSLIP_NOT_APPROVED',
  /** Phieu goc phai DA CHOT thi moi sua bang phieu bo sung / phieu dao. */
  'PAYSLIP_NOT_CORRECTABLE',
  /**
   * Khoan thu cong mang chieu TRU nhung khong co nguoi ky.
   *
   * `GD-12` cho phep MOT duong duy nhat de mot khoan tru xuat hien, va duong do di qua mot con
   * nguoi. Mot khoan tru khong ten nguoi ky la mot khau tru tu dong doi ten.
   */
  'PAYSLIP_MANUAL_COMPONENT_UNSIGNED',
  /** So tien cua mot thanh phan phai duong; chieu nam o `kind`, khong o dau cua so. */
  'PAYSLIP_COMPONENT_AMOUNT_INVALID',
] as const;
export type TransportWorkforceValidationReason =
  (typeof TRANSPORT_WORKFORCE_VALIDATION_REASONS)[number];

export const TRANSPORT_WORKFORCE_CONFLICT_REASONS = [
  /** Ky luong chong lap mot ky da co — EXCLUDE constraint tu choi ban thu hai. */
  'PAYROLL_PERIOD_OVERLAPS',
  /** Mot phieu goc da ton tai cho cap (lan chay, lai xe). */
  'PAYSLIP_ALREADY_EXISTS_FOR_RUN',
  /** Ban goc nay da co mot phieu dao. */
  'PAYSLIP_ALREADY_REVERSED',
] as const;
export type TransportWorkforceConflictReason =
  (typeof TRANSPORT_WORKFORCE_CONFLICT_REASONS)[number];

export type TransportWorkforceErrorReason =
  TransportWorkforceValidationReason | TransportWorkforceConflictReason;
