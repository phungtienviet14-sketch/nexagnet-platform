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
  /** `#398`: XE cua lai xe dang co mot vong chay chua ket thuc (vd van phong vua lap, chua ai cam). */
  'SITE_INTAKE_VEHICLE_BUSY',
  'SITE_INTAKE_LOCATION_UNUSABLE',
  'SITE_INTAKE_SITE_NOT_A_CANDIDATE',
  'SITE_INTAKE_OBSERVATION_NOT_FOUND',
  'SITE_INTAKE_OBSERVATION_NOT_OWNED',
  'SITE_INTAKE_OBSERVATION_ALREADY_USED',
  'SITE_INTAKE_CREATE_IN_FLIGHT',
  /* --- `#398` phan thuong mai --- */
  /** Khong co lan nhan viec nao mang ma do — hoac no khong phai cua lai xe dang goi. Mot ma cho ca hai. */
  'SITE_INTAKE_NOT_FOUND',
  /** Dia diem giao da biet khong con dang hoat dong / khong co that. */
  'SITE_INTAKE_DESTINATION_NOT_FOUND',
  /** Ket qua tim dia diem gui len khong khop ket qua tim cua chinh may chu. */
  'SITE_INTAKE_DESTINATION_UNVERIFIED',
  /** Tim dia diem dang tat/ban — khong doi chieu duoc ket qua gui len. */
  'SITE_INTAKE_DESTINATION_SEARCH_UNAVAILABLE',
  /** Phan thuong mai da xong (da co don / da huy) — diem giao khong doi duoc nua. */
  'SITE_INTAKE_COMMERCIAL_CLOSED',
  /** Van phong bam "tao don" ma lan nhan viec van chua du dieu kien. */
  'SITE_INTAKE_NOT_READY',
  /** Chang vua doi trang thai giua luc doc va luc ghi — tai lai roi thu lai. */
  'SITE_INTAKE_LEG_NOT_ADOPTABLE',
  'SITE_INTAKE_ORDER_NOT_FOUND',
  'SITE_INTAKE_ORDER_NOT_OPEN',
  'SITE_INTAKE_ORDER_BOUND_TO_OTHER_INTAKE',
  'SITE_INTAKE_BOUND_TO_OTHER_ORDER',
  'SITE_INTAKE_BINDING_DENIED',
  /** Don co san lay hang o NOI KHAC voi dia diem lai xe da nhan viec — khong gan duoc. */
  'SITE_INTAKE_ORDER_ORIGIN_MISMATCH',
  'SITE_INTAKE_EXCEPTION_ALREADY_RECORDED',
  /** Bao bat thuong / huy ma ly do trang (sau khi cat khoang trang). */
  'SITE_INTAKE_EXCEPTION_REASON_REQUIRED',
  /** Don nguon cua mot don khong phai la mot lan tai xe nhan truc tiep. */
  'SITE_INTAKE_ORDER_SOURCE_NOT_FOUND',
] as const;
export type TransportSiteIntakeErrorReason = (typeof TRANSPORT_SITE_INTAKE_ERROR_REASONS)[number];
