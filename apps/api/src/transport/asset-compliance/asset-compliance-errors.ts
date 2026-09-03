/**
 * Ly do TU CHOI cua `transport-asset-compliance` — tang KIEM DAU VAO va tang VA CHAM LUC GHI.
 *
 * TEP NAY KHONG IMPORT GI. Cung quy uoc voi `fuel-errors.ts`/`settlement-errors.ts`: no la la cua
 * do thi phu thuoc, nen `transport.errors.ts` gop duoc no vao union chung ma khong tao vong.
 */

export const TRANSPORT_ASSET_COMPLIANCE_VALIDATION_REASONS = [
  'MAINTENANCE_PLAN_NOT_FOUND',
  'MAINTENANCE_WORK_ORDER_NOT_FOUND',
  'COMPLIANCE_DOCUMENT_NOT_FOUND',
  /** Xe tren lich bao duong / lenh sua khong ton tai o `transport-core`. */
  'MAINTENANCE_VEHICLE_NOT_FOUND',
  /**
   * Chu the cua giay to khong ton tai.
   *
   * `subjectId` la khoa DA DICH (xe hoac lai xe tuy `subjectKind`), nen Postgres khong co khoa
   * ngoai nao giu ho. Cong nay la cho DUY NHAT su ton tai do duoc kiem — va vi the no khong duoc
   * bo qua o bat ky duong ghi nao.
   */
  'COMPLIANCE_SUBJECT_NOT_FOUND',
  /** `COMPANY` khong duoc co chu the con; `VEHICLE`/`DRIVER` bat buoc phai co. */
  'COMPLIANCE_SUBJECT_SHAPE_INVALID',
  /** Chu ky khong khop `triggerKind` — vd lich `ODOMETER` khong co `intervalKm`. */
  'MAINTENANCE_INTERVAL_MISMATCH',
  /** `validFrom` sau `validTo`, hoac mot trong hai khong phai ngay co that. */
  'COMPLIANCE_VALIDITY_RANGE_INVALID',
  /** Odo luc dong lenh nho hon luc mo — mot con so nhap sai, khong phai mot xe chay lui. */
  'MAINTENANCE_ODO_REGRESSION',
  /** Lenh sua khong con o `OPEN` nen khong dong/huy duoc nua. */
  'MAINTENANCE_WORK_ORDER_NOT_OPEN',
] as const;
export type TransportAssetComplianceValidationReason =
  (typeof TRANSPORT_ASSET_COMPLIANCE_VALIDATION_REASONS)[number];

export const TRANSPORT_ASSET_COMPLIANCE_CONFLICT_REASONS = [
  /**
   * Da co mot lenh sua DANG MO cho chinh ke hoach do.
   *
   * Kiem o service dung voi MOT nguoi ghi; unique mot phan
   * `TransportMaintenanceWorkOrder_one_open_per_plan` moi dung voi HAI nguoi bam cung luc. Ma nay
   * la ban dich cua unique do sang ngon ngu cua mien.
   */
  'MAINTENANCE_WORK_ORDER_ALREADY_OPEN',
] as const;
export type TransportAssetComplianceConflictReason =
  (typeof TRANSPORT_ASSET_COMPLIANCE_CONFLICT_REASONS)[number];

export type TransportAssetComplianceErrorReason =
  TransportAssetComplianceValidationReason | TransportAssetComplianceConflictReason;
