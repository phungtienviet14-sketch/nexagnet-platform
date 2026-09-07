import { defineDecisionVocabulary } from '../../observability/decision-vocabulary.js';
import type { CashoutDeniedReason, CashoutReversalDeniedReason } from './cashout-allocation.js';

/**
 * TU VUNG QUYET DINH cua `TX-07b`.
 *
 * KHONG MOT CON SO TIEN NAO di vao `detail`, va khong mot ten nguoi nao — cung ky luat voi
 * `workforce-decisions.ts`. Tien luong va tien hoan ung la loai du lieu ma mot dong log lot ra
 * ngoai la mot su co nhan su. Cai duoc phat ra la MA LY DO va SO LUONG dong.
 */

/* ------------------------------------------------------------------ *
 * driver_settlement.cashout_post — ghi mot lan chi
 * ------------------------------------------------------------------ */
export const CASHOUT_POST_REASONS = [
  'CASHOUT_POSTED',
  /** Gui lai cung khoa, cung noi dung — tra ban cu, khong ghi them mot dong tien nao. */
  'CASHOUT_IDEMPOTENT_REPLAY',
  'CASHOUT_DRIVER_UNKNOWN',
  /** Khach tat `transport-costing`: khong doc duoc so quy nen khong chi hoan ung duoc. */
  'CASHOUT_FUND_UNAVAILABLE',
] as const;
export type CashoutPostReason =
  (typeof CASHOUT_POST_REASONS)[number] | CashoutDeniedReason | 'CASHOUT_ALLOWED';

/* ------------------------------------------------------------------ *
 * driver_settlement.cashout_reverse — dao mot lan chi
 * ------------------------------------------------------------------ */
export const CASHOUT_REVERSE_REASONS = ['CASHOUT_REVERSED', 'CASHOUT_UNKNOWN'] as const;
export type CashoutReverseReason =
  (typeof CASHOUT_REVERSE_REASONS)[number] | CashoutReversalDeniedReason;

/* ------------------------------------------------------------------ *
 * driver_settlement.reimbursement_post — chan SO QUY cua mot lan chi
 * ------------------------------------------------------------------ *
 *
 * MOT DIEM QUYET DINH RIENG, va do khong phai trang tri. Day la cho duy nhat trong ca tranche
 * viet vao so cai cua mot capability khac, nen no phai de lai mot dong doc duoc: mot lan chi hoan
 * ung DA dua so du quy ve, tuc cong ty se khong tra lan thu hai.
 */
export const REIMBURSEMENT_POST_REASONS = [
  'REIMBURSEMENT_FUND_ENTRY_POSTED',
  /** Da co but toan mang dung khoa nay — mot lan gui lai khong sinh them tien. */
  'REIMBURSEMENT_FUND_ENTRY_REUSED',
  'REIMBURSEMENT_FUND_ENTRY_REVERSED',
] as const;
export type ReimbursementPostReason = (typeof REIMBURSEMENT_POST_REASONS)[number];

/* ------------------------------------------------------------------ *
 * driver_settlement.wage_window — canh bao cua so quyet toan (`F-08`)
 * ------------------------------------------------------------------ */
export const WAGE_WINDOW_REASONS = [
  /**
   * Mot ky luong da qua cua so ma tien chua ra khoi cong ty.
   *
   * `degraded`, KHONG `denied`: khong cong nao dong, khong ai bi chan. Bo luat Lao dong 2019
   * D.97 k.4 dat tran 30 ngay, va chu so huu noi ro cong ty khong co tinh giu luong — nen dong nay
   * NEU RA mot su that de nguoi doc quyet dinh, khong ket luan ai sai.
   */
  'WAGE_CREDIT_UNSETTLED_BEYOND_WINDOW',
  'WAGE_CREDITS_WITHIN_WINDOW',
] as const;
export type WageWindowReason = (typeof WAGE_WINDOW_REASONS)[number];

/* ------------------------------------------------------------------ *
 * driver_settlement.self_statement — be mat lai xe
 * ------------------------------------------------------------------ */
export const SELF_STATEMENT_REASONS = [
  'SELF_SETTLEMENT_SERVED',
  /** Tai khoan dang nhap chua noi voi ho so lai xe nao — mot trang thai THAT, khong phai loi. */
  'SELF_DRIVER_PROFILE_MISSING',
] as const;
export type SelfStatementReason = (typeof SELF_STATEMENT_REASONS)[number];

export type TransportDriverSettlementDecisionReason =
  | CashoutPostReason
  | CashoutReverseReason
  | ReimbursementPostReason
  | WageWindowReason
  | SelfStatementReason;

export const TRANSPORT_DRIVER_SETTLEMENT_DECISIONS = defineDecisionVocabulary({
  owner: 'transport-workforce',
  points: [
    'driver_settlement.cashout_post',
    'driver_settlement.cashout_reverse',
    'driver_settlement.reimbursement_post',
    'driver_settlement.wage_window',
    'driver_settlement.self_statement',
  ],
  labels: {
    CASHOUT_POSTED: 'Đã ghi một lần chi tiền cho lái xe',
    CASHOUT_IDEMPOTENT_REPLAY: 'Cùng khoá chống ghi trùng — trả lại lần chi đã ghi',
    CASHOUT_DRIVER_UNKNOWN: 'Không tìm thấy lái xe trong đội xe',
    CASHOUT_FUND_UNAVAILABLE: 'Không đọc được sổ quỹ nên không chi hoàn ứng được',
    CASHOUT_ALLOWED: 'Lần chi hợp lệ với số dư hiện tại',
    CASHOUT_NO_ALLOCATIONS: 'Lần chi không có dòng nào',
    CASHOUT_AMOUNT_INVALID: 'Số tiền của một dòng phải là số nguyên dương',
    CASHOUT_ALLOCATION_SHAPE_INVALID: 'Dòng lương phải có phiếu lương, dòng hoàn ứng thì không',
    CASHOUT_PAYSLIP_NOT_CREDITED: 'Phiếu lương này không còn khoản nào để rút',
    CASHOUT_PAYSLIP_DUPLICATED: 'Cùng một phiếu lương xuất hiện hai lần trong một lần chi',
    CASHOUT_PAYSLIP_OVER_ALLOCATED: 'Rút quá số còn lại của phiếu lương đó',
    CASHOUT_WAGE_EXCEEDS_REMAINING: 'Tổng rút vượt số lương lái xe còn lại',
    CASHOUT_REIMBURSEMENT_DUPLICATED: 'Một lần chi chỉ mang được một dòng hoàn ứng',
    CASHOUT_REIMBURSEMENT_EXCEEDS_OUTSTANDING: 'Hoàn ứng vượt số công ty đang còn nợ lái xe',
    CASHOUT_CURRENCY_MISMATCH: 'Đơn vị tiền của lần chi khác đơn vị của sổ',

    CASHOUT_REVERSED: 'Đã đảo một lần chi, giữ lại dấu vết',
    CASHOUT_UNKNOWN: 'Không tìm thấy lần chi cần đảo',
    CASHOUT_ALREADY_REVERSED: 'Lần chi này đã có một phiếu đảo',
    CASHOUT_IS_A_REVERSAL: 'Không đảo một phiếu đảo',

    REIMBURSEMENT_FUND_ENTRY_POSTED: 'Đã ghi bút toán quỹ đưa số dư âm về sau khi hoàn ứng',
    REIMBURSEMENT_FUND_ENTRY_REUSED:
      'Bút toán hoàn ứng của khoá này đã có — dùng lại, không ghi thêm',
    REIMBURSEMENT_FUND_ENTRY_REVERSED: 'Đã đảo bút toán hoàn ứng cùng với lần chi',

    WAGE_CREDIT_UNSETTLED_BEYOND_WINDOW: 'Có kỳ lương đã qua cửa sổ quyết toán mà tiền chưa chi',
    WAGE_CREDITS_WITHIN_WINDOW: 'Mọi kỳ lương còn dư đều trong cửa sổ quyết toán',

    SELF_SETTLEMENT_SERVED: 'Đã trả bảng quyết toán của chính lái xe đang đăng nhập',
    SELF_DRIVER_PROFILE_MISSING: 'Tài khoản này chưa được nối với một hồ sơ lái xe',
  } satisfies Record<TransportDriverSettlementDecisionReason, string>,
});
