/**
 * LY DO TU CHOI cua nap du lieu ETC — tang KIEM DAU VAO va tang VA CHAM.
 *
 * Tach khoi `toll-decisions.ts` theo dung khuon cua `fuel-errors.ts`: tep nay tra loi "nguoi goi
 * dua vao cai gi sai / DB tu choi cai gi", con tep kia tra loi "he thong da quyet dinh gi va vi
 * sao". Tron lai thi bang loc trace se day nhung dong "thieu cot bat buoc" — khong phai mot quyet
 * dinh nghiep vu nao ca.
 */
export const TOLL_ERROR_REASONS = [
  /* ----------------------------- Nguon nap ----------------------------- */
  'TOLL_IMPORT_EMPTY',
  'TOLL_IMPORT_TOO_LARGE',
  'TOLL_IMPORT_FORMAT_UNSUPPORTED',
  'TOLL_IMPORT_NOT_FOUND',
  /**
   * Goi khach CHUA khai bo cot cua nha cung cap nay.
   *
   * Day la ma mang nghia `BLOCKED_SAMPLE_REQUIRED` cua #269, va no CO Y la mot ma rieng chu khong
   * phai `TOLL_IMPORT_FORMAT_UNSUPPORTED`: mot ben noi "chua ai dua ta xem tep that cua nha cung
   * cap nay", ben kia noi "tep nay hong". Gop lai se lam nguoi van hanh di sua tep, trong khi thu
   * phai lam la di xin mot ban mau roi khai bo cot.
   *
   * Ma nay RIENG CHO TUNG NHA CUNG CAP — VETC co the con khoa trong khi ePass da mo.
   */
  'TOLL_PROVIDER_MAPPING_NOT_CONFIGURED',
  /** Hang tieu de cua tep thieu cot ma goi khach da khai la bat buoc. */
  'TOLL_IMPORT_MAPPING_INVALID',

  /* ------------------------------ Duong API ----------------------------- */
  /**
   * KHONG mot nha cung cap nao cong bo tai lieu API (do 08/09/2026 — xem
   * `docs/kien-truc/transport-etc-ingestion.md` §3).
   *
   * Duong `API` van con trong `TollSourceKind` va cong adapter van con — cai khong co la mot HIEN
   * THUC dang ky luc chay. Nen lenh nhap qua duong nay THAT BAI DONG voi dung ma nay, chu khong
   * tra ve mot ket qua rong trong im lang.
   */
  'TOLL_API_NOT_PUBLICLY_PROVEN',

  /* --------------------------- Tai khoan / xe --------------------------- */
  'TOLL_ACCOUNT_NOT_FOUND',
  'TOLL_ACCOUNT_NO_TAKEN',
  'TOLL_ACCOUNT_INACTIVE',
  'TOLL_VEHICLE_NOT_FOUND',
  'TOLL_LINK_NOT_FOUND',
  /**
   * ND 119/2024/ND-CP Dieu 11 khoan 3: *"moi phuong tien tham gia giao thong chi duoc nhan chi
   * tra tu MOT tai khoan giao thong"*.
   *
   * Nen hai ban ghi noi DANG HIEU LUC cho cung mot xe la mot vi pham PHAP LY, khong phai mot lua
   * chon thiet ke. Xe doi tai khoan = DONG ban ghi cu roi MO ban ghi moi.
   */
  'TOLL_VEHICLE_ALREADY_LINKED',
  'TOLL_LINK_PERIOD_INVALID',
  'TOLL_LINK_ALREADY_CLOSED',

  /* ------------------------------ Doi soat ------------------------------ */
  'TOLL_CANDIDATE_NOT_FOUND',
  /** Dong bi tu choi luc doc thi khong co gi de doi soat — sua bo cot roi nhap lai. */
  'TOLL_CANDIDATE_REJECTED',
  'TOLL_CANDIDATE_PROVIDER_MISMATCH',
  /** Chi mot dong CO bien so moi gan duoc xe. Nap tien / phi tai khoan thi khong. */
  'TOLL_CANDIDATE_VEHICLE_NOT_APPLICABLE',
  'TOLL_DUPLICATE_TARGET_INVALID',
] as const;
export type TollErrorReason = (typeof TOLL_ERROR_REASONS)[number];
