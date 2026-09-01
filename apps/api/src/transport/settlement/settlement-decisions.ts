import { defineDecisionVocabulary } from '../../observability/decision-vocabulary.js';

/**
 * TU VUNG QUYET DINH cua `transport-settlement`.
 *
 * Bo RIENG, khong nhet vao `TRANSPORT_DECISIONS` hay `TRANSPORT_COSTING_DECISIONS`: mot khach van
 * tai co the bat `transport-core` ma khong bat `transport-settlement`. Tron chung se lam bang loc
 * trace cua khach do hua co mot diem "cong no khach hang" khong bao gio phat.
 *
 * Moi CONG o day co N duong tu choi thi mang N ma. Gop lai thanh mot `false` se lam nguoi truc
 * phai mo source doc lai N dieu kien roi doan xem cai nao da dong — trong luc ho dang phai tra loi
 * "vi sao khoan cong no nay khong ghi duoc".
 */

/* ------------------------------------------------------------------ *
 * settlement.recognise — ghi nhan mot nghia vu tien tu mot su kien nghiep vu
 * ------------------------------------------------------------------ */
export const SETTLEMENT_RECOGNISE_REASONS = [
  'SETTLEMENT_RECOGNISED',
  /**
   * Khoa chong ghi trung khop DUNG mot su kien da ghi — tra lai ban cu, KHONG ghi them.
   *
   * Tach khoi `SETTLEMENT_RECOGNISED` co chu y: hai ma nay noi hai chuyen khac nhau ve the gioi.
   * Gop lai thi khong ai dem duoc so lan mot duong goi that su ghi trung — tuc khong ai biet duong
   * tich hop cua ho co van de hay khong.
   */
  'SETTLEMENT_IDEMPOTENT_REPLAY',
  /** Cung khoa, KHAC noi dung — loi ben goi, khong phai mot lan chay lai. */
  'SETTLEMENT_FINGERPRINT_CONFLICT',
  'SETTLEMENT_PERIOD_FROZEN',
  'SETTLEMENT_TRIP_NOT_RECONCILED',
  'SETTLEMENT_TRIP_REVENUE_MISSING',
  'SETTLEMENT_FLOW_SHAPE_MISMATCH',
] as const;
export type SettlementRecogniseReason = (typeof SETTLEMENT_RECOGNISE_REASONS)[number];

/* ------------------------------------------------------------------ *
 * settlement.correct — sua = ghi them (INV-20 doc sang TX-05)
 * ------------------------------------------------------------------ */
export const SETTLEMENT_CORRECT_REASONS = [
  'ADJUSTMENT_POSTED',
  'REVERSAL_POSTED',
  /** So tien mong muon trung so da ghi — khong sinh ban dieu chinh 0 dong. */
  'CORRECTION_NO_CHANGE',
  'CORRECTION_TARGET_ALREADY_REVERSED',
  'CORRECTION_TARGET_NOT_ORIGINAL',
  'CORRECTION_PERIOD_FROZEN',
] as const;
export type SettlementCorrectReason = (typeof SETTLEMENT_CORRECT_REASONS)[number];

/* ------------------------------------------------------------------ *
 * settlement.allocate — phan bo mot lan thu/tra vao chung tu
 * ------------------------------------------------------------------ */
export const SETTLEMENT_ALLOCATE_REASONS = [
  'ALLOCATION_POSTED',
  'ALLOCATION_IDEMPOTENT_REPLAY',
  'ALLOCATION_EXCEEDS_OUTSTANDING',
  'ALLOCATION_PERIOD_FROZEN',
] as const;
export type SettlementAllocateReason = (typeof SETTLEMENT_ALLOCATE_REASONS)[number];

/* ------------------------------------------------------------------ *
 * commission.select — chon luat hoa hong (Issue #87: nhap nhang FAIL CLOSED)
 * ------------------------------------------------------------------ */
export const COMMISSION_SELECT_REASONS = [
  'COMMISSION_RULE_SELECTED',
  /**
   * Hai luat cung bac — cong dong, khong chon bua.
   *
   * Day la ma dang gia nhat trong ca bo: no la thu duy nhat phan biet "khong co luat" voi "co qua
   * nhieu luat", va hai tinh huong do can hai hanh dong sua khac han nhau.
   */
  'COMMISSION_RULE_AMBIGUOUS',
  'COMMISSION_RULE_NONE_APPLICABLE',
  'COMMISSION_ALREADY_CALCULATED',
  'COMMISSION_TRIP_NOT_PARTNER_REFERRED',
] as const;
export type CommissionSelectReason = (typeof COMMISSION_SELECT_REASONS)[number];

/* ------------------------------------------------------------------ *
 * settlement.credit_check — canh bao cong no khach (KHONG bao gio chan)
 * ------------------------------------------------------------------ */
export const SETTLEMENT_CREDIT_CHECK_REASONS = [
  'CREDIT_CLEAR',
  'CREDIT_OVERDUE_PRESENT',
  'CREDIT_LIMIT_EXCEEDED',
  /** Khach chua khai dieu khoan/han muc — khac han "khong no dong nao". */
  'CREDIT_TERMS_NOT_CONFIGURED',
] as const;
export type SettlementCreditCheckReason = (typeof SETTLEMENT_CREDIT_CHECK_REASONS)[number];

/* ------------------------------------------------------------------ *
 * settlement_period.transition
 * ------------------------------------------------------------------ */
export const SETTLEMENT_PERIOD_TRANSITION_REASONS = [
  'PERIOD_OPENED',
  'PERIOD_CLOSING_STARTED',
  'PERIOD_CLOSED',
  'PERIOD_REOPENED',
  'PERIOD_TRANSITION_NOT_PERMITTED',
  'PERIOD_ALREADY_IN_STATE',
  'PERIOD_OVERLAP',
] as const;
export type SettlementPeriodTransitionReason = (typeof SETTLEMENT_PERIOD_TRANSITION_REASONS)[number];

export type TransportSettlementDecisionReason =
  | SettlementRecogniseReason
  | SettlementCorrectReason
  | SettlementAllocateReason
  | CommissionSelectReason
  | SettlementCreditCheckReason
  | SettlementPeriodTransitionReason;

export const TRANSPORT_SETTLEMENT_DECISIONS = defineDecisionVocabulary({
  owner: 'transport-settlement',
  points: [
    'settlement.recognise',
    'settlement.correct',
    'settlement.allocate',
    'commission.select',
    'settlement.credit_check',
    'settlement_period.transition',
  ],
  labels: {
    SETTLEMENT_RECOGNISED: 'Đã ghi nhận nghĩa vụ tiền',
    SETTLEMENT_IDEMPOTENT_REPLAY: 'Ghi lặp cùng khoá chống trùng — trả lại chứng từ đã ghi',
    SETTLEMENT_FINGERPRINT_CONFLICT: 'Cùng khoá nhưng khác nội dung — lỗi bên gọi',
    SETTLEMENT_PERIOD_FROZEN: 'Kỳ quyết toán đã đóng hoặc đang chốt',
    SETTLEMENT_TRIP_NOT_RECONCILED: 'Chuyến chưa đối soát nên chưa ghi nhận doanh thu',
    SETTLEMENT_TRIP_REVENUE_MISSING: 'Chuyến chưa nhập giá cước',
    SETTLEMENT_FLOW_SHAPE_MISMATCH: 'Chiều hoặc loại đối tác không khớp dòng tiền',

    ADJUSTMENT_POSTED: 'Đã ghi bản điều chỉnh, bản gốc giữ nguyên',
    REVERSAL_POSTED: 'Đã ghi bản đảo, bản gốc giữ nguyên',
    CORRECTION_NO_CHANGE: 'Số tiền không đổi nên không sinh bản điều chỉnh',
    CORRECTION_TARGET_ALREADY_REVERSED: 'Bản gốc đã bị đảo trước đó',
    CORRECTION_TARGET_NOT_ORIGINAL: 'Chỉ bản gốc mới là đích của một bản sửa',
    CORRECTION_PERIOD_FROZEN: 'Kỳ quyết toán đã đóng nên không ghi bản sửa vào kỳ đó',

    ALLOCATION_POSTED: 'Đã ghi phân bổ thanh toán',
    ALLOCATION_IDEMPOTENT_REPLAY: 'Ghi lặp cùng khoá chống trùng — trả lại phân bổ đã ghi',
    ALLOCATION_EXCEEDS_OUTSTANDING: 'Phân bổ vượt số dư còn lại của chứng từ',
    ALLOCATION_PERIOD_FROZEN: 'Kỳ quyết toán đã đóng nên không ghi phân bổ vào kỳ đó',

    COMMISSION_RULE_SELECTED: 'Đã chọn được đúng một bản luật hoa hồng',
    COMMISSION_RULE_AMBIGUOUS: 'Hai luật cùng bậc cùng áp được — đóng cổng, không chọn bừa',
    COMMISSION_RULE_NONE_APPLICABLE: 'Không luật nào áp được cho chuyến này',
    COMMISSION_ALREADY_CALCULATED: 'Chuyến này đã tính hoa hồng rồi',
    COMMISSION_TRIP_NOT_PARTNER_REFERRED: 'Chuyến này không phải chuyến đối tác mang đơn',

    CREDIT_CLEAR: 'Không có cảnh báo công nợ',
    CREDIT_OVERDUE_PRESENT: 'Khách có chứng từ quá hạn — cảnh báo, không chặn',
    CREDIT_LIMIT_EXCEEDED: 'Dư nợ vượt hạn mức — cảnh báo, không chặn',
    CREDIT_TERMS_NOT_CONFIGURED: 'Khách chưa khai điều khoản/hạn mức',

    PERIOD_OPENED: 'Đã mở kỳ quyết toán',
    PERIOD_CLOSING_STARTED: 'Bắt đầu chốt kỳ — kỳ đóng băng từ đây',
    PERIOD_CLOSED: 'Đã đóng kỳ quyết toán',
    PERIOD_REOPENED: 'Đã mở lại kỳ đã đóng (thao tác có quyền riêng, có dấu vết)',
    PERIOD_TRANSITION_NOT_PERMITTED: 'Máy trạng thái kỳ quyết toán không có cạnh này',
    PERIOD_ALREADY_IN_STATE: 'Kỳ quyết toán đã ở đúng trạng thái đó rồi',
    PERIOD_OVERLAP: 'Kỳ mới chồng lấp một kỳ đã có trong cùng dòng tiền',
  } satisfies Record<TransportSettlementDecisionReason, string>,
});
