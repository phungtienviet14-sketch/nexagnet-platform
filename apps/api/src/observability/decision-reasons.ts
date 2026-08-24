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
  'order.manual_approve',
  'order.manual_reject',
  'order.sales_handoff',
  /*
   * BA DIEM THEM 24/08/2026 sau audit "Quan sat & dieu phoi": ba mien nghiep vu nay truoc do co
   * DUNG 0 loi goi telemetry, va ca ba deu nam trong danh sach cau hoi ma nguoi debug hay hoi
   * nhat. Chung khong phai "trace them cho day" — moi diem tra loi mot cau da tung phai mo
   * source moi tra loi duoc:
   *
   *   · conversation.resolve -> "'20' o day nghia la gi" (loi khach bao 21/08/2026);
   *   · rules.price          -> "vi sao ra con so do" (rules la tang TAT DINH ma ca kien truc
   *                             dua vao, va la tang duy nhat khong quan sat duoc);
   *   · channel.send         -> "Zalo tra ve ma gi" (truoc day chi biet thanh/bai tong the).
   */
  'conversation.resolve',
  'rules.price',
  'channel.send',
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

/* ------------------------------------------------------------------ *
 * order.manual_approve / order.manual_reject / order.sales_handoff
 * — BA CONG NGUOI BAM NUT (OrdersService.approve/reject/completeSalesHandoff).
 *
 * SU CO 22/08/2026 sinh ra ba diem nay. Trace `b44d631c` ket thuc bang
 * `advice.auto_reply -> denied KILL_SWITCH_OFF`; 3,8 giay sau mot cau tra loi VAN ra nhom that,
 * va grep toan bo cua so log do khong ra MOT DONG NAO. Doc trace luot do se ket luan "he thong
 * khong gui gi" — SAI. Duong tu dong (`pipeline`) da co day du quyet dinh co ma; duong NGUOI BAM
 * NUT thi khong co gi ca, ke ca audit.
 *
 * Ba cong tach rieng chu khong gop thanh mot `order.manual_action`: chung la ba cau hoi khac
 * nhau ("gui cai gi?", "co huy duoc khong?", "da nhap ERP chua?") va gop lai thi bo ma ly do se
 * thanh mot tui hon tap khong loc duoc.
 * ------------------------------------------------------------------ */

/**
 * `approve()` DINH TUYEN THEO NOI DUNG dang co — ma ghi lai CHINH cai da quyet dinh duong di,
 * vi day la cho tung sai: truoc 21/08 moi tin tu van deu roi vao nhanh xac nhan roi nem 422.
 */
export const MANUAL_APPROVE_REASONS = [
  /** Don da o `sent`/`synced`: bam lai khong gui lai. Khong phai loi, la chong bam hai lan. */
  'ALREADY_SENT',
  /** Co `priced` -> gui BAN XAC NHAN (chung tu). Uu tien hon ban tu van neu co ca hai. */
  'ROUTED_TO_CONFIRMATION',
  /** Khong co `priced` nhung co `trace.outbound` -> gui BAN TU VAN. */
  'ROUTED_TO_ADVICE',
  /** Khong co ca hai -> 422. Nut hien ra ma khong co gi de gui la mot loi cau hinh console. */
  'NOTHING_TO_SEND',
  /** Cong da mo, nhung lan gui THAT BAI. Tach khoi `denied`: hai thu can hai hanh dong sua khac. */
  'SEND_FAILED',
] as const;
export type ManualApproveReason = (typeof MANUAL_APPROVE_REASONS)[number];

export const MANUAL_REJECT_REASONS = [
  'ALREADY_REJECTED',
  /** Don da gui/da dong bo: `reject` khong phai duong huy — do la `huy_don` (amend window). */
  'STATUS_NOT_REJECTABLE',
  'REJECTED',
] as const;
export type ManualRejectReason = (typeof MANUAL_REJECT_REASONS)[number];

export const SALES_HANDOFF_REASONS = [
  /** Chua co viec nhap ERP nao dang cho — don chua gui, hoac khong phai don. */
  'NO_PENDING_HANDOFF',
  'HANDOFF_ALREADY_COMPLETED',
  /** Sale xac nhan DA GO VAO ERP. Day cung la moc khoa cua bat bien chong lech ERP (§8.3). */
  'HANDOFF_COMPLETED',
] as const;
export type SalesHandoffReason = (typeof SALES_HANDOFF_REASONS)[number];

/* ------------------------------------------------------------------ *
 * conversation.resolve — PipelineService.runPipelineTurn()
 *
 * BON LAN DOC TRANG THAI truoc khi parse (lich su nhom, don nhap, dang cho tra loi, don vua
 * chot) quyet dinh mot tin "20" nghia la gi. Truoc 24/08/2026 khong lan nao de lai dau vet, nen
 * dung cho sinh ra loi khach bao ngay 21/08 ("cho a lay 5 cai") lai la cho khong nhin thay duoc.
 *
 * Ma o day tra loi DUNG mot cau: he thong da hieu tin nay THUOC VE dau.
 * ------------------------------------------------------------------ */
export const CONVERSATION_REASONS = [
  /** Kenh khong cap khoa mach, hoac dang `rerun` — khong doc mach, co y. */
  'NO_THREAD_KEY',
  /** Mach sach: khong don nhap, khong cho tra loi, khong don vua chot. */
  'NEW_TURN',
  /** Co don nhap dang do -> tin nay duoc GOP vao don do. */
  'CONTINUES_DRAFT',
  /** He thong vua hoi va dang cho -> tin nay la CAU TRA LOI, ke thua ngu canh co co so. */
  'ANSWERS_QUESTION',
  /** Co don vua chot VA tin nay la lenh sua -> vao cua so sua don. */
  'AMENDS_CLOSED_ORDER',
  /** Co don vua chot nhung tin khong phai lenh sua -> chi dung lam ngu canh. */
  'AFTER_CLOSED_ORDER',
] as const;
export type ConversationReason = (typeof CONVERSATION_REASONS)[number];

/* ------------------------------------------------------------------ *
 * rules.price — priceOrder() qua classifyPricing()
 *
 * `PricedOrder.warnings` la `string[]` TU DO: nam dieu kien khac nhau deu thanh cau tieng Viet,
 * nen khong loc duoc, khong dem duoc, va hai nguoi viet hai cau cho cung mot chuyen. Ma o day
 * KHONG thay the canh bao (canh bao van la thu Sale doc tren console) — no la lop thu hai, danh
 * cho may.
 * ------------------------------------------------------------------ */
export const PRICING_REASONS = [
  /** Tinh xong, khong canh bao nao. */
  'PRICED_CLEAN',
  /** It nhat mot dong khong map duoc SKU hoac khong co gia. */
  'SKU_UNRESOLVED',
  /**
   * Nhom chua map dai ly nen khong biet ap bang gia/chinh sach nao.
   * DUNG LAI ma cua `order.auto_confirm` co chu y: cung mot trang thai the gioi, mot ma. Hai ma
   * cho cung mot chuyen se lam nguoi loc phai nho ca hai.
   */
  'DEALER_UNKNOWN',
  /** TH2 (giao thang khach) ma chua co bang vung/cuoc/COD chinh thuc. */
  'SHIPPING_TABLE_MISSING',
  /** Khach xin VAT nhung chinh sach VAT cua tenant chua duoc duyet. */
  'VAT_POLICY_MISSING',
  /** Tong khach ghi lech tong he thong qua `totalMismatchTolerance`. */
  'TOTAL_MISMATCH',
] as const;
export type PricingReason = (typeof PRICING_REASONS)[number];

/* ------------------------------------------------------------------ *
 * channel.send — OutboundChannelRouter
 *
 * CHOT CHAN duy nhat cua moi duong gui ra. Truoc day buoc `outbound.send_confirmation` chi do
 * duoc thanh/bai TONG THE: mot lan gui hong vi Zalo tra 429 va mot lan hong vi chua dang nhap
 * trong giong het nhau tren trace, ma hai chuyen do can hai hanh dong sua khac han.
 * ------------------------------------------------------------------ */
export const CHANNEL_SEND_REASONS = [
  'SENT',
  /** Ben goi khong noi gui kenh nao — tu choi doan, khong gui bua. */
  'REPLY_CHANNEL_MISSING',
  /** Kenh khong ho tro loai noi dung (vd anh tren kenh chi co text). */
  'CAPABILITY_UNSUPPORTED',
  /** Adapter nem loi — chi tiet nam o `detail.errorName`, khong o van ban tin. */
  'ADAPTER_FAILED',
] as const;
export type ChannelSendReason = (typeof CHANNEL_SEND_REASONS)[number];

/** Hop cua moi ma — dung cho chu ky chung cua `recordDecision()`. */
export type DecisionReason =
  | IntakeReason
  | AutoConfirmReason
  | AutoReplyReason
  | ToolAuthReason
  | ComposeReason
  | ManualApproveReason
  | ManualRejectReason
  | SalesHandoffReason
  | ConversationReason
  | PricingReason
  | ChannelSendReason;

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

  ALREADY_SENT: 'Đơn đã gửi rồi — bấm lại không gửi thêm',
  ROUTED_TO_CONFIRMATION: 'Định tuyến sang bản xác nhận (đơn đã có giá)',
  ROUTED_TO_ADVICE: 'Định tuyến sang bản tư vấn đã soạn',
  NOTHING_TO_SEND: 'Không có bản xác nhận hay bản tư vấn nào để gửi',
  SEND_FAILED: 'Người duyệt đã cho phép nhưng lần gửi thất bại',

  ALREADY_REJECTED: 'Đơn đã bị từ chối trước đó',
  STATUS_NOT_REJECTABLE: 'Trạng thái đơn không cho phép từ chối',
  REJECTED: 'Người vận hành từ chối đơn',

  NO_PENDING_HANDOFF: 'Không có việc nhập ERP nào đang chờ',
  HANDOFF_ALREADY_COMPLETED: 'Việc nhập ERP đã hoàn tất trước đó',
  HANDOFF_COMPLETED: 'Sale xác nhận đã nhập ERP',

  NO_THREAD_KEY: 'Không có khoá mạch hội thoại (hoặc đang chạy lại)',
  NEW_TURN: 'Lượt mới — mạch sạch',
  CONTINUES_DRAFT: 'Gộp tiếp vào đơn nháp đang dở',
  ANSWERS_QUESTION: 'Là câu trả lời cho câu hệ thống vừa hỏi',
  AMENDS_CLOSED_ORDER: 'Lệnh sửa đơn vừa chốt',
  AFTER_CLOSED_ORDER: 'Sau đơn vừa chốt — chỉ dùng làm ngữ cảnh',

  PRICED_CLEAN: 'Tính giá xong, không cảnh báo',
  SKU_UNRESOLVED: 'Có dòng hàng chưa map được SKU hoặc chưa có giá',
  SHIPPING_TABLE_MISSING: 'TH2 nhưng chưa có bảng vùng/cước/COD chính thức',
  VAT_POLICY_MISSING: 'Khách xin VAT nhưng chính sách VAT chưa được duyệt',
  TOTAL_MISMATCH: 'Tổng khách ghi lệch tổng hệ thống quá ngưỡng',

  SENT: 'Đã gửi ra kênh',
  REPLY_CHANNEL_MISSING: 'Thiếu replyChannel — từ chối đoán kênh gửi',
  CAPABILITY_UNSUPPORTED: 'Kênh không hỗ trợ loại nội dung này',
  ADAPTER_FAILED: 'Adapter kênh trả về lỗi',

  ALLOWED: 'Cho phép',
};

/** Nhan cho ma bat ky; ma la khong biet thi tra chinh no thay vi nem loi (fail-open). */
export function decisionReasonLabel(reason: string): string {
  return DECISION_REASON_LABELS[reason as DecisionReason] ?? reason;
}
