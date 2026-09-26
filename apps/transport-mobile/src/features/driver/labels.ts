import type { Tone } from '../../ui/Surface';
import type {
  DriverFundEntryKind,
  FundBalanceStance,
  FuelPaymentMethod,
  FuelReconciliationStatus,
  FuelVerificationStatus,
  OperationalDocumentType,
  PayslipComponentSource,
  PayslipKind,
  PayslipStatus,
  ReceiptHandoverState,
  RunLegPhase,
  TripStatus,
  WaitingReason,
} from './types';

/**
 * NHAN NGHIEP VU cua man lai xe — chep NGUYEN CHU tu web (`driver-field.ts`, `customer-view.ts`,
 * `fuel-declaration.ts`), vi moi cau o day la mot QUY TAC chu khong phai van phong: "Công ty đang nợ
 * lái xe" doc nguoc thanh "lái xe đang nợ" la doi soat sai ca ky.
 *
 * Tep nay chi import KIEU (`import type`) — test Node nap duoc ma khong keo React Native vao.
 */

export const PHASE_LABEL: Readonly<Record<RunLegPhase, string>> = {
  PLANNED: 'Chưa bắt đầu',
  AT_PICKUP: 'Đang ở điểm lấy hàng',
  LOADING: 'Đang xếp hàng',
  IN_TRANSIT: 'Đang trên đường',
  ARRIVED: 'Đã đến nơi giao',
  DELIVERED: 'Đã giao xong',
};

/** Tong mau cua giai doan — CHI de nhin; khong quyet dinh nao doc gia tri nay. */
export const PHASE_TONE: Readonly<Record<RunLegPhase, Tone>> = {
  PLANNED: 'neutral',
  AT_PICKUP: 'brand',
  LOADING: 'brand',
  IN_TRANSIT: 'pending',
  ARRIVED: 'brand',
  DELIVERED: 'live',
};

export const DOCUMENT_LABEL: Readonly<Record<OperationalDocumentType, string>> = {
  GATE_PASS: 'Giấy vào cổng',
  LOADING_SLIP: 'Phiếu xếp hàng',
  WEIGH_TICKET: 'Phiếu cân',
  DELIVERY_RECEIPT: 'Biên nhận giao hàng',
  OTHER: 'Chứng từ khác',
};

export const HANDOVER_LABEL: Readonly<Record<ReceiptHandoverState, string>> = {
  WITH_DRIVER: 'Biên nhận đang ở chỗ bạn',
  RETURNED_TO_OFFICE: 'Văn phòng đã nhận biên nhận',
  SUBMITTED_FOR_CONFIRMATION: 'Văn phòng đã gửi đi xác nhận',
};

/** Ly do cho — su that VAN HANH, khong phai muc gia (`waiting.types.ts`). */
export const WAITING_REASON_LABEL: Readonly<Record<WaitingReason, string>> = {
  RECEIVER_NOT_READY: 'Người nhận chưa sẵn sàng',
  NO_UNLOADING_DOCK: 'Không còn cửa hạ hàng trống',
  QUEUE_AHEAD: 'Có xe khác đang xếp hàng trước',
  DOCUMENT_ISSUE: 'Chứng từ chưa khớp',
  OTHER: 'Lý do khác',
};

export const WAITING_REASONS: readonly WaitingReason[] = [
  'RECEIVER_NOT_READY',
  'NO_UNLOADING_DOCK',
  'QUEUE_AHEAD',
  'DOCUMENT_ISSUE',
  'OTHER',
];

export const TRIP_STATUS_LABEL: Readonly<Record<TripStatus, string>> = {
  PLANNED: 'Đã lên kế hoạch',
  IN_TRANSIT: 'Đang chạy',
  DELIVERED: 'Đã giao',
  RECONCILED: 'Đã đối soát',
  CANCELLED: 'Đã huỷ',
};

/* --- Nhien lieu --- */

export const FUEL_VERIFICATION_LABEL: Readonly<Record<FuelVerificationStatus, string>> = {
  DECLARED: 'Mới khai',
  VERIFIED: 'Đã xác thực',
  REJECTED: 'Bị từ chối',
};

export const FUEL_VERIFICATION_TONE: Readonly<Record<FuelVerificationStatus, Tone>> = {
  DECLARED: 'pending',
  VERIFIED: 'live',
  REJECTED: 'danger',
};

export const FUEL_RECONCILIATION_LABEL: Readonly<Record<FuelReconciliationStatus, string>> = {
  UNMATCHED: 'Chưa khớp',
  MATCHED: 'Đã khớp',
  MISMATCHED: 'Lệch',
  SETTLED: 'Đã quyết toán',
  IGNORED: 'Đã bỏ qua',
};

export const FUEL_RECONCILIATION_TONE: Readonly<Record<FuelReconciliationStatus, Tone>> = {
  UNMATCHED: 'neutral',
  MATCHED: 'live',
  MISMATCHED: 'caution',
  SETTLED: 'live',
  IGNORED: 'neutral',
};

export const FUEL_PAYMENT_METHOD_LABEL: Readonly<Record<FuelPaymentMethod, string>> = {
  DRIVER_CASH: 'Lái xe trả tiền mặt',
  SUPPLIER_ACCOUNT: 'Ghi nợ cây xăng',
};

/** Cau duoi o "Thanh toán" — noi tien DI DAU (web `DRIVER_PAYMENT_METHOD_HINT`, nguyen chu). */
export const DRIVER_PAYMENT_METHOD_HINT: Readonly<Record<FuelPaymentMethod, string>> = {
  DRIVER_CASH:
    'Bạn tự trả tiền mặt: khi kế toán duyệt, khoản này trừ vào quỹ lái xe của bạn để công ty ' +
    'hoàn lại — không ghi nợ cây xăng.',
  SUPPLIER_ACCOUNT:
    'Cây xăng ghi nợ công ty: khoản này vào công nợ cây xăng sau khi đối chiếu bảng kê, không ' +
    'đụng tới quỹ của bạn.',
};

const FUEL_REVIEW_REASON_LABEL: Readonly<Record<string, string>> = {
  ODOMETER_NOT_ADVANCED: 'Số km chưa tăng so với lần đổ trước',
  NO_PREVIOUS_ODOMETER: 'Chưa có lần đổ trước để tính tiêu hao',
  CONSUMPTION_ABOVE_NORM: 'Tiêu hao vượt định mức — chỉ để soát xét',
};

export function fuelReviewReasonLabel(reason: string): string {
  return FUEL_REVIEW_REASON_LABEL[reason] ?? reason;
}

/** Cau canh o anh phieu — noi ro anh di dau (web `EVIDENCE_UPLOAD_HINT`). */
export const EVIDENCE_UPLOAD_HINT =
  'Chụp rõ phiếu, đủ số lít và số tiền. Ảnh gắn vào đúng phiếu này và kế toán xem được khi đối soát.';

/* --- Quy, quyet toan, phieu luong --- */

export const FUND_ENTRY_KIND_LABEL: Readonly<Record<DriverFundEntryKind, string>> = {
  ADVANCE: 'Tạm ứng',
  RETURN: 'Hoàn quỹ',
  TRIP_EXPENSE: 'Chi phí chuyến',
  ADJUSTMENT: 'Điều chỉnh',
  REVERSAL: 'Đảo bút toán',
  REIMBURSEMENT: 'Trả lại hoàn ứng',
  RUN_EXPENSE: 'Chi phí vòng xe',
};

/** Ba cau nay la cach DUY NHAT dung de doc chieu cua so du — khong bao gio doc tu dau cua so. */
export const FUND_BALANCE_STANCE_LABEL: Readonly<Record<FundBalanceStance, string>> = {
  DRIVER_HOLDS_COMPANY_CASH: 'Lái xe đang giữ tiền của công ty',
  SETTLED: 'Đã cân bằng',
  COMPANY_OWES_DRIVER: 'Công ty đang nợ lái xe',
};

export const FUND_BALANCE_STANCE_TONE: Readonly<Record<FundBalanceStance, Tone>> = {
  DRIVER_HOLDS_COMPANY_CASH: 'caution',
  SETTLED: 'live',
  COMPANY_OWES_DRIVER: 'pending',
};

export const PAYSLIP_STATUS_LABEL: Readonly<Record<PayslipStatus, string>> = {
  APPROVED: 'Đã duyệt',
  PAID: 'Đã trả',
  REVERSED: 'Đã bị đảo',
};

export const PAYSLIP_STATUS_TONE: Readonly<Record<PayslipStatus, Tone>> = {
  APPROVED: 'pending',
  PAID: 'live',
  REVERSED: 'neutral',
};

export const PAYSLIP_KIND_LABEL: Readonly<Record<PayslipKind, string>> = {
  ORIGINAL: 'Phiếu gốc',
  SUPPLEMENTAL: 'Phiếu bổ sung',
  REVERSAL: 'Phiếu đảo',
};

export const PAYSLIP_COMPONENT_SOURCE_LABEL: Readonly<Record<PayslipComponentSource, string>> = {
  BASE_SALARY: 'Lương cơ bản',
  PER_TRIP: 'Theo chuyến',
  PER_KM: 'Theo km',
  FUEL_SAVING_BONUS: 'Thưởng tiết kiệm nhiên liệu',
  MANUAL_BONUS: 'Thưởng nhập tay',
  MANUAL_DEDUCTION: 'Khoản trừ nhập tay',
};

export const REVERSED_PAYSLIP_NOTE =
  'Phiếu này đã bị đảo và được thay bằng một phiếu khác. Cả hai đều hiện ở đây để đọc được toàn ' +
  'bộ chuỗi sửa.';

export const REIMBURSEMENT_NOTE =
  'Hoàn ứng là tiền bạn đã bỏ túi cho chuyến, công ty trả lại — không phải lương.';

/** `FUEL` la ma HE THONG; moi nhom khac la chuoi khach dat san bang tieng Viet. */
export function expenseCategoryLabel(code: string): string {
  return code === 'FUEL' ? 'Nhiên liệu' : code;
}

/* --- Cau nghiep vu giu nguyen chu --- */

export const FIELD_TRUTH_NOTE =
  'Mốc lái xe bấm là bằng chứng hiện trường — không tự đổi tiến độ chặng. Văn phòng tiến từng ' +
  'chặng; vòng chạy do hệ thống tự đóng.';

export const ASSIGNED_NOTE =
  'Văn phòng đã giao việc này cho bạn — không cần bấm Nhận chuyến để nhận lại.';

export const SITE_INTAKE_HINT =
  'Tới nơi lấy hàng rồi bấm nút dưới — ứng dụng nhận ra địa điểm từ vị trí của bạn.';

export const WAITING_START_TRUTH =
  'Giờ bắt đầu chờ là lúc máy chủ nhận lệnh, không phải lúc bạn bấm.';

export const WAITING_OFFLINE_WARNING =
  'Giờ bắt đầu chờ tính theo lúc máy chủ nhận — gửi càng sớm càng đúng.';

export const WAITING_BLOCKED_BY_ARRIVAL =
  'Đang chờ gửi mốc Đã đến nơi — gửi xong mới bắt đầu chờ được.';

export const RECEIPT_HANDOVER_NOTE = 'Biên nhận giấy có chữ ký người nhận';

export const NO_RUN_EXPENSE_PATH =
  'Chi phí dọc đường theo vòng chạy chưa có trên hệ thống — tạm thời báo văn phòng (#383)';

export const EXPENSE_FROM_OWN_FUND =
  'Khoản chi này trừ vào quỹ tạm ứng của chính bạn, trên chuyến bạn được phân công.';
