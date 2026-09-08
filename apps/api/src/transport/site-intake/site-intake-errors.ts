/**
 * Ly do TU CHOI cua nhan viec tai dia diem A — tang kiem dau vao, khong phai quyet dinh nghiep vu.
 *
 * Cung khuon voi `counterparty-errors.ts` / `checkpoint`: tu vung thuoc ve cho so huu no, va
 * `transport.errors.ts` chi GOP lai de mot lop loi dung chung con noi duoc kieu.
 *
 * Danh sach nay trung ten voi phan lon `SITE_INTAKE_CONFIRM_REASONS`, va do KHONG phai trung lap:
 * mot ben la ma di vao NHAT KY QUYET DINH (nguoi doc trace can), mot ben la ma di ra HTTP (nguoi
 * dung API can). Chung tinh co giong nhau vi moi duong tu choi o day deu la mot cau tra loi cho ca
 * hai nguoi doc — nhung hai bo van tach, y nhu moi capability van tai khac.
 */
export const TRANSPORT_SITE_INTAKE_ERROR_REASONS = [
  'SITE_INTAKE_DRIVER_BINDING_MISSING',
  'SITE_INTAKE_NO_ASSIGNED_VEHICLE',
  'SITE_INTAKE_SITE_NOT_FOUND',
  'SITE_INTAKE_SITE_INACTIVE',
  'SITE_INTAKE_OPEN_RUN_EXISTS',
  'SITE_INTAKE_LOCATION_UNUSABLE',
  'SITE_INTAKE_SITE_NOT_A_CANDIDATE',
  'SITE_INTAKE_OBSERVATION_NOT_FOUND',
  'SITE_INTAKE_OBSERVATION_NOT_OWNED',
  'SITE_INTAKE_OBSERVATION_ALREADY_USED',
  'SITE_INTAKE_CREATE_IN_FLIGHT',
] as const;
export type TransportSiteIntakeErrorReason = (typeof TRANSPORT_SITE_INTAKE_ERROR_REASONS)[number];
