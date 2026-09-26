import { reasonText } from '../../i18n/reasons';

/**
 * MA LY DO cua cac QUYET DINH van phong -> cau tieng Viet CO DAU.
 *
 * Bo sung cho `i18n/reasons.ts` (bang cua lai xe, khong sua o day). Ma nao da biet thi dich; ma la
 * roi ve `message` cua may chu qua `reasonText` — khong bao gio nuot mat ly do.
 *
 * Tach bach quyen (maker-checker): chi noi DUNG dieu may chu cuong che. De nghi chi co
 * `CLAIM_REVIEWER_IS_SUBMITTER`; phu cap cho co `WAITING_ALLOWANCE_SELF_DEALING`. Phieu dau va phieu
 * luong KHONG co mot cong nao nhu vay o may chu — man hinh khong duoc noi la co.
 */
const OFFICE_REASON_TEXT: Readonly<Record<string, string>> = {
  // De nghi chi
  CLAIM_ALREADY_DECIDED: 'Đề nghị này đã được quyết trước đó — không cần quyết lại.',
  CLAIM_REVIEWER_IS_SUBMITTER:
    'Người nhập đề nghị không được tự duyệt đề nghị đó — cần một người khác (kế toán hoặc giám đốc) duyệt.',
  CLAIM_APPROVED_AMOUNT_ABOVE_CLAIMED: 'Số duyệt không được lớn hơn số lái xe đề nghị.',
  CLAIM_NOT_FOUND: 'Không tìm thấy đề nghị này — có thể đã bị xoá.',
  EXPENSE_PERIOD_FROZEN: 'Kỳ quỹ của ngày này đã chốt — không ghi thêm được.',
  EXPENSE_TRIP_RECONCILED: 'Chuyến của khoản này đã đối soát xong — không ghi thêm chi phí được.',
  EXPENSE_TRIP_CANCELLED: 'Chuyến của khoản này đã bị huỷ.',
  // Phu cap cho
  WAITING_ALLOWANCE_ALREADY_DECIDED: 'Khoản phụ cấp này đã được quyết trước đó.',
  WAITING_ALLOWANCE_ALREADY_APPROVED: 'Khoản phụ cấp này đã được duyệt trước đó.',
  WAITING_ALLOWANCE_SELF_DEALING:
    'Tài khoản của bạn gắn với chính lái xe nhận khoản này — cần người khác quyết.',
  WAITING_ALLOWANCE_ABOVE_CANDIDATE: 'Số duyệt không được lớn hơn số đề nghị.',
  WAITING_ALLOWANCE_NOT_FOUND: 'Không tìm thấy khoản phụ cấp này.',
  WAITING_ALLOWANCE_DECISION_KEY_REUSED:
    'Mã chống ghi trùng đã dùng cho một quyết định khác (lỗi ứng dụng — mở lại để tạo lệnh mới).',
  WAITING_ALLOWANCE_DECISION_OUTCOME_MISMATCH:
    'Lệnh gửi lại khác lệnh đã ghi (duyệt/từ chối) — máy chủ giữ lệnh đầu. Mở lại để xem.',
  WAITING_ALLOWANCE_DECISION_AMOUNT_MISMATCH:
    'Lệnh gửi lại có số tiền khác lệnh đã ghi — máy chủ giữ lệnh đầu. Mở lại để xem.',
  // Phan cong lai xe
  RUN_ASSIGNMENT_RUN_TERMINAL: 'Vòng chạy đã kết thúc — không phân công được nữa.',
  RUN_DRIVER_NOT_FOUND: 'Không tìm thấy lái xe này trong danh mục.',
  RUN_NOT_FOUND: 'Không tìm thấy vòng chạy.',
  // Ket thuc don
  ACCEPTANCE_ALREADY_IN_OUTCOME: 'Đơn đã ở đúng kết quả này — không cần ghi lại.',
  ACCEPTANCE_SUPERSEDES_STALE:
    'Có người vừa quyết đơn này trước bạn. Đã tải lại — xem lịch sử rồi quyết lại nếu cần.',
  ACCEPTANCE_SUPERSEDES_REQUIRED: 'Đơn đã có quyết định trước — cần tải lại trước khi quyết tiếp.',
  ACCEPTANCE_ORDER_NOT_FULFILLED: 'Đơn chưa giao xong — chưa kết thúc được.',
  ACCEPTANCE_ORDER_CANCELLED: 'Đơn đã bị huỷ.',
  ACCEPTANCE_EVIDENCE_REQUIRED: 'Cần chọn ít nhất một chứng từ làm căn cứ.',
  ACCEPTANCE_EXTERNAL_BASIS_NOTE_REQUIRED:
    'Không chọn chứng từ số thì phải ghi rõ bên nhận đã xác nhận gì.',
  ACCEPTANCE_EVIDENCE_NOT_FOR_ORDER: 'Chứng từ được chọn không thuộc đơn này.',
  // Phieu dau
  FUEL_ENTRY_REVIEW_TRANSITION_NOT_PERMITTED:
    'Phiếu không còn ở trạng thái cho thao tác này — có thể đã được người khác xử lý.',
  FUEL_ENTRY_NOT_FOUND: 'Không tìm thấy phiếu đổ dầu này.',
  // Luong
  PAYSLIP_NOT_DRAFT: 'Phiếu lương đã được duyệt trước đó.',
  // Thu tien khach
  CUSTOMER_PAYMENT_SOURCE_FINGERPRINT_CONFLICT:
    'Phiếu này đã được gửi với nội dung khác. Kiểm tra sổ thu — khoản trước có thể đã được ghi. Muốn ghi khoản mới thì bấm "Phiếu mới".',
  CUSTOMER_AR_CUSTOMER_NOT_FOUND: 'Không tìm thấy khách hàng này.',
  // Quy lai xe
  CORRELATION_KEY_REUSED:
    'Phiếu này đã được gửi với nội dung khác. Mở phiếu mới nếu muốn ghi một khoản khác.',
  FUND_ENTRY_PERIOD_FROZEN: 'Kỳ quỹ của ngày này đã chốt — chọn ngày trong kỳ đang mở.',
  DRIVER_NOT_FOUND: 'Không tìm thấy lái xe này.',
  // Viec tai xe nhan truc tiep (#398) — chu cho VAN PHONG (dich rieng voi chu cua lai xe).
  SITE_INTAKE_NOT_FOUND: 'Không tìm thấy việc tài xế nhận này — có thể đã bị hủy.',
  SITE_INTAKE_DESTINATION_NOT_FOUND: 'Địa điểm giao này không còn hoạt động — chọn nơi khác.',
  SITE_INTAKE_DESTINATION_UNVERIFIED:
    'Kết quả tìm không khớp kết quả của máy chủ — tìm lại rồi chọn.',
  SITE_INTAKE_DESTINATION_SEARCH_UNAVAILABLE:
    'Tìm địa điểm đang tắt — chọn trong danh sách địa điểm đã biết.',
  SITE_INTAKE_COMMERCIAL_CLOSED: 'Việc này đã có đơn hoặc đã hủy — không bổ sung được nữa.',
  SITE_INTAKE_NOT_READY: 'Việc này vẫn chưa đủ điều kiện tạo đơn — xem phần còn thiếu.',
  SITE_INTAKE_LEG_NOT_ADOPTABLE: 'Chặng vừa đổi trạng thái — tải lại rồi thử lại.',
  SITE_INTAKE_ORDER_NOT_FOUND: 'Không tìm thấy đơn được chọn.',
  SITE_INTAKE_ORDER_NOT_OPEN: 'Đơn được chọn không còn mở.',
  SITE_INTAKE_ORDER_BOUND_TO_OTHER_INTAKE: 'Đơn này đã gắn với một việc tài xế nhận khác.',
  SITE_INTAKE_BOUND_TO_OTHER_ORDER: 'Việc này đã gắn với một đơn khác — không gắn lại được.',
  SITE_INTAKE_BINDING_DENIED:
    'Không gắn được đơn này vào việc tài xế nhận (đơn đã có kế hoạch chạy hoặc chặng không nhận được).',
  SITE_INTAKE_ORDER_ORIGIN_MISMATCH:
    'Đơn này lấy hàng ở nơi khác với nơi tài xế nhận chuyến — chọn đơn khác.',
  SITE_INTAKE_EXCEPTION_ALREADY_RECORDED: 'Việc này đã được báo bất thường trước đó.',
  SITE_INTAKE_EXCEPTION_REASON_REQUIRED: 'Cần ghi lý do trước khi báo bất thường hoặc hủy.',
  SITE_INTAKE_ORDER_SOURCE_NOT_FOUND: 'Đơn này không tạo từ xác nhận của tài xế.',
};

/** Cau cho nguoi dung tu `reason` + `message` cua may chu. */
export function officeReasonText(
  reason: string | null | undefined,
  fallback?: string | null,
): string {
  if (reason && OFFICE_REASON_TEXT[reason]) return OFFICE_REASON_TEXT[reason];
  return reasonText(reason, fallback);
}
