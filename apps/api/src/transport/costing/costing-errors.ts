/**
 * MA TU CHOI cua `transport-costing` — thuoc CAPABILITY nay, khong thuoc `transport-core`.
 *
 * TEP NAY KHONG IMPORT GI, va do la mot rang buoc co y. `transport.errors.ts` (dung chung cho ca
 * mien van tai) noi hai bo ma nay vao `TransportErrorReason` bang mot `import type` — tuc mot canh
 * CHI TON TAI LUC BIEN DICH, bi xoa sach khi sinh JavaScript. Nho vay:
 *
 *   · lo trinh import luc chay van di dung mot chieu `costing -> core`, khong co vong;
 *   · ma cua costing van duoc kiem chinh ta o tung loi goi (`TransportDomainError.denied('...')`
 *     go sai mot chu la khong bien dich duoc) thay vi noi long `reason` thanh `string`;
 *   · va tu vung cua costing nam trong thu muc costing, dung nguyen tac "capability giu tu ngu"
 *     ma `decision-vocabulary.spec.ts` khoa lai o phia nen tang.
 *
 * Neu tep nay import bat cu thu gi tu `../`, canh do co the tro thanh canh THAT luc chay va uu diem
 * dau tien bien mat. Dung them import vao day.
 */

/** Ly do KIEM DAU VAO / TRA VE KHONG THAY — nguoi goi dua vao cai gi sai. */
export const TRANSPORT_COSTING_VALIDATION_REASONS = [
  'FUND_ACCOUNT_NOT_FOUND',
  'FUND_ENTRY_NOT_FOUND',
  'TRIP_EXPENSE_NOT_FOUND',
  'FUND_PERIOD_NOT_FOUND',
  /** Dau vao co so tien khong hop le cho loai but toan do (vd tam ung ma so am). */
  'FUND_AMOUNT_INVALID',
  /** Ma nhom chi phi nam ngoai danh muc ma goi khach khai. */
  'EXPENSE_CATEGORY_UNKNOWN',
  /** Khoang ky sai: ngay bat dau sau ngay ket thuc. */
  'FUND_PERIOD_RANGE_INVALID',
] as const;
export type TransportCostingValidationReason =
  (typeof TRANSPORT_COSTING_VALIDATION_REASONS)[number];

/**
 * Ly do VA CHAM LUC GHI — dau vao hop le, nhung trang thai da luu khong cho ghi them.
 *
 * Tach khoi nhom kiem dau vao vi nguoi dung KHONG sua duoc dau vao de qua duoc: ho phai doc lai
 * roi quyet lai. Giao dien dung nhom nay de noi "tai lai", khong phai "sua o day".
 */
export const TRANSPORT_COSTING_CONFLICT_REASONS = [
  /**
   * Khoa CHONG GHI TRUNG da duoc dung cho mot su kien kinh te KHAC.
   *
   * Khong lang le tra ve ban cu: mot khoa trung voi NOI DUNG khac nghia la nguoi goi da tai su dung
   * khoa, va tra ve ban cu se lam mot khoan chi moi bien mat khong dau vet.
   */
  'CORRELATION_KEY_REUSED',
  /** But toan/khoan chi nay da bi dao mot lan roi — `INV-20` khong cho dao hai lan. */
  'ENTRY_ALREADY_REVERSED',
  /** Hai nguoi cung mo mot ky chong lap khoang thoi gian cho cung mot so quy. */
  'FUND_PERIOD_OVERLAP',
] as const;
export type TransportCostingConflictReason = (typeof TRANSPORT_COSTING_CONFLICT_REASONS)[number];

export type TransportCostingErrorReason =
  | TransportCostingValidationReason
  | TransportCostingConflictReason;
