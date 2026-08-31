import { defineDecisionVocabulary } from '../../observability/decision-vocabulary.js';

/**
 * TU VUNG QUYET DINH cua `transport-costing`.
 *
 * Bo RIENG, khong nhet them vao `TRANSPORT_DECISIONS` cua `transport-core`: mot khach van tai co
 * the bat `transport-core` ma KHONG bat `transport-costing` (T1 §10.1 dat costing phu thuoc core,
 * khong nguoc lai). Neu tron chung, bang loc trace cua khach do se hua co mot diem "so quy lai xe"
 * khong bao gio phat — dung kieu hong ma `decision-vocabulary.spec.ts` sinh ra de chan.
 *
 * Moi CONG o day co N duong tu choi thi mang N ma. Gop lai thanh mot `false` se lam nguoi truc
 * phai mo source doc lai N dieu kien roi doan xem cai nao da dong — trong luc ho dang phai tra loi
 * "vi sao khoan chi nay khong ghi duoc".
 */

/* ------------------------------------------------------------------ *
 * trip_expense.record — CostingService.recordTripExpense()
 * ------------------------------------------------------------------ */
export const TRIP_EXPENSE_RECORD_REASONS = [
  'EXPENSE_RECORDED',
  /**
   * Khoa chong ghi trung khop DUNG mot su kien da ghi — tra lai ban cu, KHONG ghi them.
   *
   * Tach khoi `EXPENSE_RECORDED` co chu y: hai ma nay noi hai chuyen khac nhau ve the gioi. Gop
   * lai thi khong ai dem duoc so lan mot client that su ghi trung — tuc khong ai biet duong mang
   * cua ho co van de hay khong.
   */
  'EXPENSE_IDEMPOTENT_REPLAY',
  /** `GD-01` — chuyen da doi soat thi khoa khoi moi khoan chi moi. */
  'EXPENSE_TRIP_RECONCILED',
  /** Chuyen da huy (`GD-02`): duong dung la dao khoan da ghi, khong phai ghi them khoan moi. */
  'EXPENSE_TRIP_CANCELLED',
  /** `INV-04` — chuyen thue xe ngoai khong duoc mang chi phi van hanh noi bo tu quy lai xe. */
  'EXPENSE_TRIP_OUTSOURCED',
  /** `INV-22` — ngay nghiep vu roi vao mot ky da dong hoac dang chot. */
  'EXPENSE_PERIOD_FROZEN',
  /**
   * `DA-T3-04` — khoan chi tu quy chi gan duoc cho lai xe DA TUNG duoc phan cong vao chuyen do.
   *
   * Khong co cong nay thi mot lan go nham `driverId` se tru tien quy cua mot lai xe khong lien
   * quan gi den chuyen — va vi so cai la append-only, duong sua duy nhat la mot but toan dao.
   */
  'EXPENSE_DRIVER_NOT_ASSIGNED',
] as const;
export type TripExpenseRecordReason = (typeof TRIP_EXPENSE_RECORD_REASONS)[number];

/* ------------------------------------------------------------------ *
 * driver_fund.post_entry — tam ung / hoan tra / dieu chinh
 * ------------------------------------------------------------------ */
export const DRIVER_FUND_POST_REASONS = [
  'FUND_ENTRY_POSTED',
  'FUND_ENTRY_IDEMPOTENT_REPLAY',
  'FUND_ENTRY_PERIOD_FROZEN',
] as const;
export type DriverFundPostReason = (typeof DRIVER_FUND_POST_REASONS)[number];

/* ------------------------------------------------------------------ *
 * costing.reversal — `INV-20`: sua = dao + ghi moi, khong bao gio UPDATE/DELETE
 * ------------------------------------------------------------------ */
export const COSTING_REVERSAL_REASONS = [
  'REVERSAL_POSTED',
  'REVERSAL_ALREADY_REVERSED',
  /** Dao mot but toan dao la vong lap khong co diem dung; duong dung la mot but toan dieu chinh. */
  'REVERSAL_OF_REVERSAL_DENIED',
  'REVERSAL_PERIOD_FROZEN',
] as const;
export type CostingReversalReason = (typeof COSTING_REVERSAL_REASONS)[number];

/* ------------------------------------------------------------------ *
 * fund_period.transition — T1 §7.3
 * ------------------------------------------------------------------ */
export const FUND_PERIOD_TRANSITION_REASONS = [
  'PERIOD_OPENED',
  /** `OPEN -> CLOSING`: ky DONG BANG ngay tu day, truoc khi mot con so nao duoc chup. */
  'PERIOD_CLOSING_STARTED',
  'PERIOD_CLOSED',
  'PERIOD_REOPENED',
  'PERIOD_TRANSITION_NOT_PERMITTED',
  'PERIOD_ALREADY_IN_STATE',
] as const;
export type FundPeriodTransitionReason = (typeof FUND_PERIOD_TRANSITION_REASONS)[number];

/* ------------------------------------------------------------------ *
 * driver.self_fund_scope — CONG cua be mat lai xe cho so quy
 * ------------------------------------------------------------------ */
export const DRIVER_SELF_FUND_SCOPE_REASONS = [
  'SELF_FUND_SCOPE_GRANTED',
  'SELF_FUND_SCOPE_NO_DRIVER_BINDING',
] as const;
export type DriverSelfFundScopeReason = (typeof DRIVER_SELF_FUND_SCOPE_REASONS)[number];

export type TransportCostingDecisionReason =
  | TripExpenseRecordReason
  | DriverFundPostReason
  | CostingReversalReason
  | FundPeriodTransitionReason
  | DriverSelfFundScopeReason;

export const TRANSPORT_COSTING_DECISIONS = defineDecisionVocabulary({
  owner: 'transport-costing',
  points: [
    'trip_expense.record',
    'driver_fund.post_entry',
    'costing.reversal',
    'fund_period.transition',
    'driver.self_fund_scope',
  ],
  labels: {
    EXPENSE_RECORDED: 'Đã ghi khoản chi cho chuyến',
    EXPENSE_IDEMPOTENT_REPLAY: 'Ghi lặp cùng khoá chống trùng — trả lại bản đã ghi',
    EXPENSE_TRIP_RECONCILED: 'Chuyến đã đối soát nên khoá khỏi khoản chi mới',
    EXPENSE_TRIP_CANCELLED: 'Chuyến đã huỷ — đường đúng là đảo khoản đã ghi',
    EXPENSE_TRIP_OUTSOURCED: 'Chuyến thuê xe ngoài không nhận chi phí từ quỹ lái xe',
    EXPENSE_PERIOD_FROZEN: 'Ngày nghiệp vụ rơi vào kỳ quỹ đã đóng hoặc đang chốt',
    EXPENSE_DRIVER_NOT_ASSIGNED: 'Lái xe chưa từng được phân công vào chuyến này',

    FUND_ENTRY_POSTED: 'Đã ghi bút toán sổ quỹ lái xe',
    FUND_ENTRY_IDEMPOTENT_REPLAY: 'Ghi lặp cùng khoá chống trùng — trả lại bút toán đã ghi',
    FUND_ENTRY_PERIOD_FROZEN: 'Ngày nghiệp vụ rơi vào kỳ quỹ đã đóng hoặc đang chốt',

    REVERSAL_POSTED: 'Đã ghi bút toán đảo, bản gốc giữ nguyên',
    REVERSAL_ALREADY_REVERSED: 'Bản ghi này đã được đảo trước đó',
    REVERSAL_OF_REVERSAL_DENIED: 'Không đảo một bút toán đảo — dùng bút toán điều chỉnh',
    REVERSAL_PERIOD_FROZEN: 'Kỳ quỹ đã đóng nên không ghi bút toán đảo vào kỳ đó',

    PERIOD_OPENED: 'Đã mở kỳ quỹ',
    PERIOD_CLOSING_STARTED: 'Bắt đầu chốt kỳ — kỳ đóng băng từ đây',
    PERIOD_CLOSED: 'Đã đóng kỳ và chụp ảnh số dư',
    PERIOD_REOPENED: 'Đã mở lại kỳ đã đóng (thao tác có quyền riêng, có dấu vết)',
    PERIOD_TRANSITION_NOT_PERMITTED: 'Máy trạng thái kỳ quỹ không có cạnh này',
    PERIOD_ALREADY_IN_STATE: 'Kỳ quỹ đã ở đúng trạng thái đó rồi',

    SELF_FUND_SCOPE_GRANTED: 'Lái xe xem đúng sổ quỹ của chính mình',
    SELF_FUND_SCOPE_NO_DRIVER_BINDING: 'Tài khoản đăng nhập chưa nối với hồ sơ lái xe nào',
  } satisfies Record<TransportCostingDecisionReason, string>,
});
