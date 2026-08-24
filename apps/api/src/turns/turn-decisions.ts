import { defineDecisionVocabulary } from '../observability/decision-vocabulary.js';

/**
 * TU VUNG QUYET DINH CUA MOT LUOT — thuoc `turn-processing`, dung cho MOI khach.
 *
 * Sau tep nay khong co mot chu nao ve don, gia hay ERP: mot to ho tro khong ban gi van di qua
 * dung nhung diem quyet dinh nay. Tu vung cua ban hang nam o `orders/sales-order-decisions.ts`.
 */

/* ------------------------------------------------------------------ *
 * message.intake — PipelineService.intake()
 * ------------------------------------------------------------------ */
export const INTAKE_REASONS = [
  /** Nguoi van hanh CHU DONG loai thanh vien nay (khac han "chua cau hinh"). */
  'PARTICIPANT_IGNORED',
  /** Da co dong trong DB — mot worker khac dang giu quyen xu ly. Cong idempotency. */
  'DUPLICATE_MESSAGE',
  /** Nhom chua nam trong danh sach duoc phep: tin DA LUU day du, chi noi dung bi chan khoi LLM. */
  'GROUP_NOT_MAPPED',
  /** UID chua doi soat voi stable identity -> fail closed sang manual_review. */
  'IDENTITY_NOT_RECONCILED',
  'ACCEPTED',
] as const;
export type IntakeReason = (typeof INTAKE_REASONS)[number];

/* ------------------------------------------------------------------ *
 * conversation.resolve — PipelineService.runPipelineTurn()
 *
 * BON LAN DOC TRANG THAI truoc khi parse (lich su nhom, ban nhap, dang cho tra loi, viec vua
 * chot) quyet dinh mot tin "20" nghia la gi. Truoc 24/08/2026 khong lan nao de lai dau vet, nen
 * dung cho sinh ra loi khach bao ngay 21/08 lai la cho khong nhin thay duoc.
 * ------------------------------------------------------------------ */
export const CONVERSATION_REASONS = [
  /** Kenh khong cap khoa mach, hoac dang `rerun` — khong doc mach, co y. */
  'NO_THREAD_KEY',
  /** Mach sach: khong ban nhap, khong cho tra loi, khong viec vua chot. */
  'NEW_TURN',
  /** Co ban nhap dang do -> tin nay duoc GOP vao do. */
  'CONTINUES_DRAFT',
  /** He thong vua hoi va dang cho -> tin nay la CAU TRA LOI, ke thua ngu canh co co so. */
  'ANSWERS_QUESTION',
  /** Co viec vua chot VA tin nay la lenh sua -> vao cua so sua. */
  'AMENDS_CLOSED_ORDER',
  /** Co viec vua chot nhung tin khong phai lenh sua -> chi dung lam ngu canh. */
  'AFTER_CLOSED_ORDER',
] as const;
export type ConversationReason = (typeof CONVERSATION_REASONS)[number];

/* ------------------------------------------------------------------ *
 * advice.auto_reply — PipelineService.evaluateAutoReplyAdvice()
 *
 * Nam dieu kien noi tiep nhau. Truoc 21/08/2026 chung gop thanh mot `boolean`, nen khi khach hoi
 * mot loat ma bot im lang thi khong ai chi ra duoc dieu kien nao da chan.
 * ------------------------------------------------------------------ */
export const AUTO_REPLY_REASONS = [
  'MANUAL_REVIEW',
  'KILL_SWITCH_OFF',
  /** Y dinh co duong rieng (vd dat_don): du du kien thi GUI XAC NHAN, thieu thi HOI LAI. */
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
  /** Kenh khong cap uid nguoi gui -> khong chung minh duoc viec do thuoc ve ho. */
  'SENDER_NOT_IDENTIFIED',
  /** Khong cau hinh cong GHI (mac dinh cua test/CI): agent chi con quyen doc. */
  'WRITE_PORT_ABSENT',
  'GRANTED',
] as const;
export type ToolAuthReason = (typeof TOOL_AUTH_REASONS)[number];

/* ------------------------------------------------------------------ *
 * advisor.compose — co goi LLM soan cau tra loi khong?
 *
 * `COMPOSER_DISABLED` la ma quan trong nhat trong ca tep. Su co 19/08 -> 21/08/2026:
 * `ADVICE_COMPOSER` rong tren stack suot HAI NGAY, tuc agent CHUA TUNG goi LLM, nhung ben ngoai
 * chi thay "AI tra loi y het nhau". Khong co dau vet nao noi dieu do.
 * ------------------------------------------------------------------ */
export const COMPOSE_REASONS = [
  'COMPOSER_DISABLED',
  /** Duong tat dinh DA DU du kien: van ban do la chung tu, khong de LLM viet lai. */
  'DETERMINISTIC_PATH_SUFFICIENT',
  /** LLM tra null (tat, hong, het vong tool, hoac lo con so tien khong co trong ket qua cong cu). */
  'LLM_RETURNED_NOTHING',
  'COMPOSED',
] as const;
export type ComposeReason = (typeof COMPOSE_REASONS)[number];

/* ------------------------------------------------------------------ *
 * supervisor.risk — vai Giam sat
 * ------------------------------------------------------------------ */
export const SUPERVISOR_REASONS = [
  'COUNTERPARTY_NOT_IDENTIFIED',
  'HARSH_COMPLAINT',
  'LOW_CONFIDENCE',
  'NO_RISK',
] as const;
export type SupervisorReason = (typeof SUPERVISOR_REASONS)[number];

export type TurnDecisionReason =
  | IntakeReason
  | ConversationReason
  | AutoReplyReason
  | ToolAuthReason
  | ComposeReason
  | SupervisorReason;

export const TURN_DECISIONS = defineDecisionVocabulary({
  owner: 'turn-processing',
  points: [
    'message.intake',
    'conversation.resolve',
    'advice.auto_reply',
    'agent.tool_authorization',
    'advisor.compose',
    'supervisor.risk',
  ],
  labels: {
    PARTICIPANT_IGNORED: 'Thành viên bị loại chủ động',
    DUPLICATE_MESSAGE: 'Tin trùng — worker khác đã nhận',
    GROUP_NOT_MAPPED: 'Nhóm chưa nằm trong danh sách được phép',
    IDENTITY_NOT_RECONCILED: 'UID chưa đối soát danh tính',
    ACCEPTED: 'Nhận xử lý',

    NO_THREAD_KEY: 'Không có khoá mạch hội thoại (hoặc đang chạy lại)',
    NEW_TURN: 'Lượt mới — mạch sạch',
    CONTINUES_DRAFT: 'Gộp tiếp vào bản nháp đang dở',
    ANSWERS_QUESTION: 'Là câu trả lời cho câu hệ thống vừa hỏi',
    AMENDS_CLOSED_ORDER: 'Lệnh sửa việc vừa chốt',
    AFTER_CLOSED_ORDER: 'Sau việc vừa chốt — chỉ dùng làm ngữ cảnh',

    MANUAL_REVIEW: 'Thành viên thuộc diện người thật duyệt tay',
    KILL_SWITCH_OFF: 'AUTO_SEND đang tắt',
    ORDER_INTENT_HAS_OWN_PATH: 'Ý định này đi đường xác nhận riêng',
    STATUS_NOT_PENDING_REVIEW: 'Trạng thái không ở diện chờ duyệt',
    NO_OUTBOUND_CONTENT: 'Không có nội dung để gửi',
    SUPERVISOR_FLAGGED_RISK: 'Giám sát đánh dấu rủi ro',
    AGENT_REQUESTED_HANDOFF: 'Agent tự xin chuyển người thật',
    ALLOWED: 'Cho phép',

    SENDER_NOT_IDENTIFIED: 'Kênh không cấp UID người gửi',
    WRITE_PORT_ABSENT: 'Không cấu hình cổng ghi cho agent',
    GRANTED: 'Đã cấp quyền',

    COMPOSER_DISABLED: 'ADVICE_COMPOSER đang tắt — CHƯA TỪNG gọi LLM',
    DETERMINISTIC_PATH_SUFFICIENT: 'Đường tất định đã đủ',
    LLM_RETURNED_NOTHING: 'LLM không trả về nội dung dùng được',
    COMPOSED: 'Agent đã soạn câu trả lời',

    COUNTERPARTY_NOT_IDENTIFIED: 'Chưa xác định được người đối diện',
    HARSH_COMPLAINT: 'Dấu hiệu khiếu nại gắt',
    LOW_CONFIDENCE: 'Độ tin cậy phân loại thấp',
    NO_RISK: 'Không có dấu hiệu rủi ro',
  } satisfies Record<TurnDecisionReason, string>,
});
