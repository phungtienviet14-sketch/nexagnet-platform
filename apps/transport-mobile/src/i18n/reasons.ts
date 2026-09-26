/**
 * MA LY DO CUA MAY CHU -> cau tieng Viet CO DAU cho nguoi dung.
 *
 * May chu tra `reason` la mot ma dong (`transport-action.guard.ts`), va `message` la tieng Viet
 * KHONG dau danh cho nhat ky. Web hien `message` tran — lai xe doc "Khong tim thay vong chay". O
 * day ma nao da biet thi dich; ma la thi roi ve `message` cua may chu (khong bao gio nuot mat).
 */
const REASON_TEXT: Record<string, string> = {
  // Moc hien truong
  CHECKPOINT_ALREADY_RECORDED: 'Mốc này đã được ghi trên hệ thống — không cần gửi lại.',
  CHECKPOINT_PREDECESSOR_MISSING: 'Chưa ghi mốc đứng trước nên chưa ghi được mốc này.',
  CHECKPOINT_LOCATION_REQUIRED: 'Mốc này bắt buộc kèm vị trí.',
  CHECKPOINT_LEG_TERMINAL: 'Chặng này đã kết thúc — không ghi thêm mốc được.',
  CHECKPOINT_RUN_TERMINAL: 'Vòng chạy đã kết thúc — không ghi thêm mốc được.',
  CHECKPOINT_CARGO_ON_EMPTY_LEG: 'Chặng chạy rỗng không có mốc lấy/giao hàng.',
  CHECKPOINT_DRIVER_NOT_ASSIGNED: 'Bạn không còn được phân công vòng chạy này.',
  CHECKPOINT_DRIVER_BINDING_MISSING: 'Tài khoản chưa được gắn với hồ sơ lái xe — báo văn phòng.',
  CHECKPOINT_OBSERVATION_ALREADY_USED: 'Bản định vị này đã dùng cho một mốc khác.',
  CHECKPOINT_OBSERVATION_NOT_FOR_RUN: 'Bản định vị thuộc vòng chạy khác.',
  // Phien bam vi tri
  DRIVER_HAS_ANOTHER_OPEN_SESSION: 'Đang có một phiên bám vị trí của việc khác.',
  RUN_NOT_ACTIVE: 'Vòng chạy không còn mở.',
  SESSION_SUBJECT_ENDED: 'Vòng chạy đã kết thúc — các điểm vị trí còn chờ không gửi được nữa.',
  DEVICE_REVOKED: 'Máy này đã bị văn phòng thu hồi quyền gửi vị trí.',
  DEVICE_BOUND_TO_ANOTHER_DRIVER: 'Máy này đang gắn với một lái xe khác.',
  COORDINATE_REJECTED: 'Toạ độ không hợp lệ.',
  OBSERVATION_EVENT_ID_REUSED:
    'Mã sự kiện bị dùng lại cho nội dung khác (lỗi ứng dụng — báo văn phòng).',
  // Cho nguoi nhan
  WAITING_ALREADY_OPEN: 'Đang có một phiên chờ mở cho chặng này.',
  WAITING_DELIVERY_ALREADY_ACCEPTED: 'Khách đã nhận hàng — không bắt đầu chờ được nữa.',
  WAITING_ARRIVAL_NOT_FOUND: 'Chưa có mốc "Đã đến nơi" để bắt đầu chờ.',
  WAITING_LEG_TERMINAL: 'Chặng đã kết thúc.',
  // Chung tu
  DOCUMENT_FILE_NOT_ACTIVE: 'Tệp đang được kiểm tra trên máy chủ — sẽ tự gửi lại.',
  DOCUMENT_FILE_ONCE: 'Tệp này đã gắn cho một chứng từ khác.',
  FILE_CONTENT_MISMATCH: 'Nội dung tệp không đúng loại khai báo.',
  EVIDENCE_TOO_LARGE: 'Ảnh quá lớn (tối đa 15 MB).',
  EVIDENCE_CONTENT_TYPE_NOT_ALLOWED: 'Chỉ nhận ảnh JPEG/PNG/WebP hoặc PDF.',
  // Nhien lieu
  FUEL_CORRELATION_KEY_REUSED: 'Phiếu này đã gửi với nội dung khác (lỗi ứng dụng — báo văn phòng).',
  FUEL_ENTRY_DRIVER_NOT_ASSIGNED_TO_RUN: 'Bạn không được phân công vòng chạy của phiếu này.',
  FUEL_ENTRY_RUN_NOT_FOUND: 'Không tìm thấy vòng chạy của phiếu.',
  FUEL_ENTRY_CONTEXT_REQUIRED: 'Phiếu cần gắn với việc được điều.',
  FUEL_ENTRY_REVIEW_TRANSITION_NOT_PERMITTED: 'Phiếu đang ở trạng thái không cho thao tác này.',
  // Nhan chuyen tai dia diem (#267/#398) — chu cho LAI XE: khong "đơn", "vòng chạy", "chặng".
  SITE_INTAKE_DRIVER_BINDING_MISSING: 'Tài khoản chưa được gắn với hồ sơ lái xe — báo văn phòng.',
  SITE_INTAKE_NO_ASSIGNED_VEHICLE: 'Bạn chưa được giao xe nào — báo điều độ để nhận xe trước.',
  SITE_INTAKE_SITE_NOT_FOUND: 'Không còn tìm thấy địa điểm này — tìm lại địa điểm rồi chọn.',
  SITE_INTAKE_SITE_INACTIVE: 'Địa điểm này đã ngừng hoạt động — báo văn phòng.',
  SITE_INTAKE_OPEN_RUN_EXISTS: 'Bạn đang có chuyến chưa xong — ghi nhận vào chuyến đó ở màn Việc.',
  SITE_INTAKE_VEHICLE_BUSY:
    'Xe của bạn đang có một chuyến chưa kết thúc — xem ở màn Việc hoặc báo văn phòng.',
  SITE_INTAKE_LOCATION_UNUSABLE:
    'Vị trí lúc bấm đã cũ hoặc chưa đủ chính xác để nhận ra địa điểm — tìm lại địa điểm rồi bấm lại.',
  SITE_INTAKE_SITE_NOT_A_CANDIDATE:
    'Địa điểm này không còn nằm quanh vị trí của bạn — tìm lại địa điểm rồi chọn.',
  SITE_INTAKE_OBSERVATION_NOT_FOUND: 'Bản định vị không dùng được — tìm lại địa điểm.',
  SITE_INTAKE_OBSERVATION_NOT_OWNED: 'Bản định vị không dùng được — tìm lại địa điểm.',
  SITE_INTAKE_OBSERVATION_ALREADY_USED: 'Bản định vị đã được dùng — tìm lại địa điểm.',
  SITE_INTAKE_CREATE_IN_FLIGHT:
    'Lần bấm trước đang được xử lý — bấm thử lại sau một lát, sẽ không tạo chuyến thứ hai.',
  SITE_INTAKE_NOT_FOUND: 'Không tìm thấy chuyến này — về màn Việc để xem lại.',
  SITE_INTAKE_DESTINATION_NOT_FOUND: 'Điểm giao này không còn trong danh sách — chọn nơi khác.',
  SITE_INTAKE_DESTINATION_UNVERIFIED: 'Kết quả tìm không còn khớp — tìm lại rồi chọn.',
  SITE_INTAKE_DESTINATION_SEARCH_UNAVAILABLE:
    'Tìm theo tên đang tắt — chọn trong danh sách địa điểm đã biết.',
  SITE_INTAKE_COMMERCIAL_CLOSED:
    'Chuyến này văn phòng đã chốt xong — không đổi điểm giao được nữa.',
  // Chung
  SELF_SCOPE_NO_DRIVER_BINDING: 'Tài khoản chưa được gắn với hồ sơ lái xe — báo văn phòng.',
  NOT_MOUNTED: 'Nghiệp vụ này chưa được bật cho doanh nghiệp.',
  OUTBOX_PAYLOAD_INVALID: 'Việc lưu trên máy bị hỏng dạng.',
  OUTBOX_ATTACHMENT_MISSING: 'Tệp đính kèm không còn trên máy.',
  WAITING_FOR_EARLIER_ACTION: 'Đợi việc bấm trước của cùng chuyến gửi xong — giữ đúng thứ tự.',
  UNAUTHENTICATED: 'Phiên đăng nhập hết hạn — đăng nhập lại để gửi tiếp.',
  PASSWORD_CHANGE_REQUIRED:
    'Tài khoản cần đổi mật khẩu trước — đổi mật khẩu rồi đăng nhập lại, việc trên máy sẽ tự gửi tiếp.',
};

export function reasonText(reason: string | null | undefined, fallback?: string | null): string {
  if (reason && REASON_TEXT[reason]) return REASON_TEXT[reason];
  if (fallback) return fallback;
  if (reason && /^[A-Z0-9_]+$/.test(reason)) return `Máy chủ từ chối (${reason}).`;
  return reason ?? 'Không rõ lý do.';
}

/** Nhung ma nghia la "da co roi" — hien nhe nhang, khong phai mot that bai. */
export function isAlreadyDone(reason: string | null | undefined): boolean {
  return (
    reason === 'CHECKPOINT_ALREADY_RECORDED' ||
    reason === 'WAITING_ALREADY_OPEN' ||
    reason === 'WAITING_DELIVERY_ALREADY_ACCEPTED'
  );
}
