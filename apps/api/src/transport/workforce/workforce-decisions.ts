import { defineDecisionVocabulary } from '../../observability/decision-vocabulary.js';

/**
 * TU VUNG QUYET DINH cua `transport-workforce`.
 *
 * KHONG MOT CON SO TIEN NAO di vao `detail` cua cac diem duoi day, va khong mot ten nguoi nao.
 * Issue #88 ghi ro "do not place sensitive payroll/document payloads in telemetry", va luong la
 * loai du lieu ma mot dong log lot ra ngoai la mot su co nhan su, khong phai mot su co ky thuat.
 * Cai duoc phat ra la SO LUONG va MA LY DO — du de tra loi "vi sao lan chay nay ra it phieu hon
 * lan truoc", khong du de biet ai duoc bao nhieu.
 */

export const PAYROLL_RUN_REASONS = [
  'PAYROLL_RUN_COMPLETED',
  'PAYROLL_PERIOD_CLOSED',
  'PAYROLL_PERIOD_UNKNOWN',
  /**
   * Mot dau vao vang mat — `FUEL_SAVING_UNAVAILABLE` hoac `DRIVER_FUND_UNAVAILABLE`.
   *
   * `degraded`, khong `denied`: lan chay VAN ra phieu, nhung mot thanh phan khong tinh duoc. Ghi
   * ten no de khong ai doc "thuong tiet kiem dau = 0" thanh "lai xe khong tiet kiem duoc lit nao".
   */
  'PAYROLL_INPUT_UNAVAILABLE',
] as const;
export type PayrollRunReason = (typeof PAYROLL_RUN_REASONS)[number];

export const PAYSLIP_TRANSITION_REASONS = [
  'PAYSLIP_APPROVED',
  'PAYSLIP_PAID',
  'PAYSLIP_REVERSED',
  'PAYSLIP_TRANSITION_NOT_PERMITTED',
  'PAYSLIP_ALREADY_IN_STATE',
] as const;
export type PayslipTransitionReason = (typeof PAYSLIP_TRANSITION_REASONS)[number];

export const PAYSLIP_CORRECTION_REASONS = [
  'PAYSLIP_SUPPLEMENT_ISSUED',
  'PAYSLIP_REVERSAL_ISSUED',
  /** Ban goc chua chot (`DRAFT`) — sua thang, khong can phieu bu. */
  'PAYSLIP_NOT_CORRECTABLE',
  'PAYSLIP_ALREADY_REVERSED',
] as const;
export type PayslipCorrectionReason = (typeof PAYSLIP_CORRECTION_REASONS)[number];

/**
 * `GD-12` co MOT diem quyet dinh RIENG, va do khong phai trang tri.
 *
 * Mot bat bien "khong bao gio xay ra" ma khong co dau vet nao thi khong chung minh duoc la no dang
 * duoc giu. Diem nay phat ra MOI lan mot phieu duoc tinh, noi ro: da nhin thay so du quy, va da
 * KHONG bien no thanh khoan tru nao. Do la bang chung doc duoc cho acceptance 11 — o runtime, chu
 * khong chi trong mot bai test.
 */
export const PAYROLL_FUND_DISCLOSURE_REASONS = [
  'DRIVER_FUND_SHOWN_WITHOUT_DEDUCTION',
  'DRIVER_FUND_NOT_AVAILABLE',
] as const;
export type PayrollFundDisclosureReason = (typeof PAYROLL_FUND_DISCLOSURE_REASONS)[number];

export type TransportWorkforceDecisionReason =
  | PayrollRunReason
  | PayslipTransitionReason
  | PayslipCorrectionReason
  | PayrollFundDisclosureReason;

export const TRANSPORT_WORKFORCE_DECISIONS = defineDecisionVocabulary({
  owner: 'transport-workforce',
  points: [
    'payroll.run',
    'payslip.transition',
    'payslip.correction',
    'payroll.driver_fund_disclosure',
  ],
  labels: {
    PAYROLL_RUN_COMPLETED: 'Đã chạy lương và sinh phiếu nháp cho kỳ',
    PAYROLL_PERIOD_CLOSED: 'Kỳ lương đã đóng nên không chạy thêm được',
    PAYROLL_PERIOD_UNKNOWN: 'Không tìm thấy kỳ lương',
    PAYROLL_INPUT_UNAVAILABLE: 'Một đầu vào vắng mặt — thành phần tương ứng không được tính',

    PAYSLIP_APPROVED: 'Đã duyệt phiếu lương; từ đây nội dung bất biến',
    PAYSLIP_PAID: 'Đã ghi nhận chi trả phiếu lương',
    PAYSLIP_REVERSED: 'Đã đảo phiếu lương bằng một phiếu đảo',
    PAYSLIP_TRANSITION_NOT_PERMITTED: 'Máy trạng thái phiếu lương không có cạnh này',
    PAYSLIP_ALREADY_IN_STATE: 'Phiếu lương đã ở đúng trạng thái đó rồi',

    PAYSLIP_SUPPLEMENT_ISSUED: 'Đã phát phiếu bổ sung trỏ về bản gốc',
    PAYSLIP_REVERSAL_ISSUED: 'Đã phát phiếu đảo trỏ về bản gốc',
    PAYSLIP_NOT_CORRECTABLE: 'Bản gốc chưa chốt hoặc đã đảo — không phát phiếu bù được',
    PAYSLIP_ALREADY_REVERSED: 'Bản gốc này đã có một phiếu đảo',

    DRIVER_FUND_SHOWN_WITHOUT_DEDUCTION:
      'Số dư quỹ hiển thị trên phiếu như thông tin — không sinh khoản trừ nào (GD-12)',
    DRIVER_FUND_NOT_AVAILABLE: 'Không đọc được số dư quỹ vì transport-costing đang tắt',
  } satisfies Record<TransportWorkforceDecisionReason, string>,
});
