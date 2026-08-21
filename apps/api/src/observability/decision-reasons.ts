/**
 * TU VUNG QUYET DINH NGHIEP VU — thu Nexagnet phai TU SO HUU.
 *
 * OpenTelemetry biet "ham nay mat 25 ms". Khong framework nao biet duoc
 * "khong gui vi QUANTITY_ABOVE_THRESHOLD". Do la khoang trong ma file nay lap.
 *
 * VI SAO PHAI CO KIEU, khong phai chuoi tu do:
 * Truoc file nay, `shouldAutoConfirmOrder()` co BAY duong tra ve `false` khac nhau — policy tat,
 * kill switch tat, manual review, sai intent, chua co gia, thieu ten dai ly, vuot nguong — va ca
 * bay deu bien thanh dung mot chu `false`. Nguoi debug nhin vao log chi thay "khong gui", roi phai
 * mo source doc lai bay dieu kien de doan. Chuoi tu do khong sua duoc viec nay: hai lap trinh vien
 * se viet hai cau khac nhau cho cung mot ly do, va khong ai loc duoc theo no.
 *
 * QUY UOC: moi ma la mot DANH TU chi TRANG THAI da khien quyet dinh ra nhu vay, KHONG phai mot
 * cau mo ta. `GROUP_NOT_MAPPED` chu khong phai `Khong tim thay nhom trong nguon su that`.
 * Nhan tieng Viet cho con nguoi doc nam o `DECISION_REASON_LABELS`.
 */

/** Cac diem quyet dinh CO THAT trong source (docs/kien-truc/observability-review.md §10). */
export const DECISION_POINTS = [
  'message.intake',
  'order.auto_confirm',
  'advice.auto_reply',
  'supervisor.risk',
  'agent.tool_authorization',
  'advisor.compose',
  'order.amend_window',
] as const;
export type DecisionPoint = (typeof DECISION_POINTS)[number];

/**
 * Ket qua mot quyet dinh. Co y chi ba gia tri:
 * - `allowed`  — cong mo, viec di tiep;
 * - `denied`   — cong dong CO CHU Y (mot lua chon dung, khong phai loi);
 * - `degraded` — di tiep nhung o duong du phong (vd LLM hong -> ban mau tat dinh).
 *
 * `degraded` tach khoi `allowed` vi no la thu duy nhat tra loi duoc cau
 * "he thong van chay, nhung no co dang chay dung khong?".
 */
export type DecisionOutcome = 'allowed' | 'denied' | 'degraded';

/* ------------------------------------------------------------------ *
 * message.intake — PipelineService.intake()
 * ------------------------------------------------------------------ */
export const INTAKE_REASONS = [
  /** Nguoi van hanh CHU DONG loai thanh vien nay (khac han "chua cau hinh"). */
  'PARTICIPANT_IGNORED',
  /** Da co dong trong DB — mot worker khac dang giu quyen xu ly. Cong idempotency. */
  'DUPLICATE_MESSAGE',
  /** Nhom chua map dai ly: tin DA LUU day du, chi noi dung bi chan khoi LLM. */
  'GROUP_NOT_MAPPED',
  /** UID chua doi soat voi stable identity -> fail closed sang manual_review. */
  'IDENTITY_NOT_RECONCILED',
  'ACCEPTED',
] as const;
export type IntakeReason = (typeof INTAKE_REASONS)[number];

/* ------------------------------------------------------------------ *
 * order.auto_confirm — shouldAutoConfirmOrder()
 * Bay nhanh `false` truoc day gio thanh bay ma phan biet duoc.
 * ------------------------------------------------------------------ */
export const AUTO_CONFIRM_REASONS = [
  'POLICY_DISABLED',
  /** AUTO_SEND=off — kill switch VAN HANH, khong phai policy tenant. */
  'KILL_SWITCH_OFF',
  'MANUAL_REVIEW',
  'NOT_ORDER_INTENT',
  'ORDER_NOT_PRICED',
  'DEALER_UNKNOWN',
  'PRICING_WARNINGS',
  'NO_ORDER_LINES',
  'LINE_NOT_FULLY_PRICED',
  /** Vuot `orderAutomation.maxAutoConfirmQuantity` cua tenant. */
  'QUANTITY_ABOVE_THRESHOLD',
  'ALLOWED',
] as const;
export type AutoConfirmReason = (typeof AUTO_CONFIRM_REASONS)[number];

/* ------------------------------------------------------------------ *
 * advice.auto_reply — PipelineService.shouldAutoReplyAdvice()
 *
 * Nam dieu kien noi tiep nhau. Truoc 21/08/2026 chung gop thanh mot `boolean`, nen khi khach
 * hoi mot loat ma bot im lang thi khong ai chi ra duoc dieu kien nao da chan.
 * ------------------------------------------------------------------ */
export const AUTO_REPLY_REASONS = [
  'MANUAL_REVIEW',
  'KILL_SWITCH_OFF',
  /** `dat_don` di duong rieng: du du kien thi GUI XAC NHAN, thieu thi HOI LAI. */
  'ORDER_INTENT_HAS_OWN_PATH',
  'STATUS_NOT_PENDING_REVIEW',
  /** Vai da soan xong nhung khong co payload de gui. */
  'NO_OUTBOUND_CONTENT',
  'SUPERVISOR_FLAGGED_RISK',
  /** Chinh LLM xin chuyen nguoi that — chot chan cuoi, ton trong no. */
  'AGENT_REQUESTED_HANDOFF',
  'ALLOWED',
] as const;
export type AutoReplyReason = (typeof AUTO_REPLY_REASONS)[number];

/* ------------------------------------------------------------------ *
 * agent.tool_authorization — AgentOrchestrator.composeReply()
 * ------------------------------------------------------------------ */
export const TOOL_AUTH_REASONS = [
  /** Kenh khong cap uid nguoi gui -> khong chung minh duoc don thuoc ve ho. */
  'SENDER_NOT_IDENTIFIED',
  /** Khong cau hinh cong GHI (mac dinh cua test/CI): agent chi con quyen doc. */
  'WRITE_PORT_ABSENT',
  'GRANTED',
] as const;
export type ToolAuthReason = (typeof TOOL_AUTH_REASONS)[number];

/* ------------------------------------------------------------------ *
 * advisor.compose — co goi LLM soan cau tra loi khong?
 *
 * `COMPOSER_DISABLED` la ma quan trong nhat trong ca file. Su co 19/08 -> 21/08/2026:
 * `ADVICE_COMPOSER` rong tren stack suot HAI NGAY, tuc agent CHUA TUNG goi LLM, nhung ben ngoai
 * chi thay "AI tra loi y het nhau". Khong co dau vet nao noi dieu do.
 * ------------------------------------------------------------------ */
export const COMPOSE_REASONS = [
  'COMPOSER_DISABLED',
  /** Don DA DU du kien: van ban xac nhan la chung tu, khong de LLM viet lai. */
  'DETERMINISTIC_PATH_SUFFICIENT',
  /** LLM tra null (tat, hong, het vong tool, hoac lo con so tien khong co trong ket qua cong cu). */
  'LLM_RETURNED_NOTHING',
  'COMPOSED',
] as const;
export type ComposeReason = (typeof COMPOSE_REASONS)[number];

/** Hop cua moi ma — dung cho chu ky chung cua `recordDecision()`. */
export type DecisionReason =
  | IntakeReason
  | AutoConfirmReason
  | AutoReplyReason
  | ToolAuthReason
  | ComposeReason;

/**
 * Nhan tieng Viet cho nguoi doc (console Sale, runbook).
 *
 * CO Y de rieng khoi ma: ma la thu MAY loc, nhan la thu NGUOI doc. Gop hai thu lam mot se dan toi
 * doi nhan cung la doi khoa loc — dung cai bay ma `reasons: string[]` cua `assessRisk()` dang mac.
 */
export const DECISION_REASON_LABELS: Record<DecisionReason, string> = {
  PARTICIPANT_IGNORED: 'Thành viên bị loại chủ động',
  DUPLICATE_MESSAGE: 'Tin trùng — worker khác đã nhận',
  GROUP_NOT_MAPPED: 'Nhóm chưa map đại lý',
  IDENTITY_NOT_RECONCILED: 'UID chưa đối soát danh tính',
  ACCEPTED: 'Nhận xử lý',

  POLICY_DISABLED: 'Policy tenant tắt tự xác nhận',
  KILL_SWITCH_OFF: 'AUTO_SEND đang tắt',
  MANUAL_REVIEW: 'Thành viên thuộc diện Sale duyệt tay',
  NOT_ORDER_INTENT: 'Không phải ý định đặt đơn',
  ORDER_NOT_PRICED: 'Đơn chưa tính được giá',
  DEALER_UNKNOWN: 'Chưa xác định đại lý',
  PRICING_WARNINGS: 'Đơn có cảnh báo khi tính giá',
  NO_ORDER_LINES: 'Đơn không có dòng hàng nào',
  LINE_NOT_FULLY_PRICED: 'Có dòng hàng chưa khớp SKU hoặc chưa có giá',
  QUANTITY_ABOVE_THRESHOLD: 'Tổng số lượng vượt ngưỡng tenant',

  ORDER_INTENT_HAS_OWN_PATH: 'Đặt đơn đi đường xác nhận riêng',
  STATUS_NOT_PENDING_REVIEW: 'Trạng thái đơn không ở diện chờ duyệt',
  NO_OUTBOUND_CONTENT: 'Không có nội dung để gửi',
  SUPERVISOR_FLAGGED_RISK: 'Giám sát đánh dấu rủi ro',
  AGENT_REQUESTED_HANDOFF: 'Agent tự xin chuyển người thật',

  SENDER_NOT_IDENTIFIED: 'Kênh không cấp UID người gửi',
  WRITE_PORT_ABSENT: 'Không cấu hình cổng ghi cho agent',
  GRANTED: 'Đã cấp quyền',

  COMPOSER_DISABLED: 'ADVICE_COMPOSER đang tắt — CHƯA TỪNG gọi LLM',
  DETERMINISTIC_PATH_SUFFICIENT: 'Đường tất định đã đủ',
  LLM_RETURNED_NOTHING: 'LLM không trả về nội dung dùng được',
  COMPOSED: 'Agent đã soạn câu trả lời',

  ALLOWED: 'Cho phép',
};

/** Nhan cho ma bat ky; ma la khong biet thi tra chinh no thay vi nem loi (fail-open). */
export function decisionReasonLabel(reason: string): string {
  return DECISION_REASON_LABELS[reason as DecisionReason] ?? reason;
}
