import { defineDecisionVocabulary } from '../observability/decision-vocabulary.js';

/**
 * TU VUNG QUYET DINH CUA BAN HANG — thuoc `sales-order`.
 *
 * Nam o day chu khong o `observability/` co chu y: don, bang gia, cua so sua don va viec ban giao
 * ERP la thuat ngu CUA MIEN NAY. Mot khach khong ban hang khong bao gio phat ra mot ma nao trong
 * tep nay, va mot capability ke toan tuong lai se dat tu vung cua no canh day — khong phai chen
 * vao mot enum toan cuc.
 */

/* ------------------------------------------------------------------ *
 * order.auto_confirm — evaluateAutoConfirm()
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
 * order.manual_approve / order.manual_reject / order.sales_handoff
 * — BA CONG NGUOI BAM NUT (OrdersService.approve/reject/completeSalesHandoff).
 *
 * SU CO 22/08/2026 sinh ra ba diem nay. Trace `b44d631c` ket thuc bang
 * `advice.auto_reply -> denied KILL_SWITCH_OFF`; 3,8 giay sau mot cau tra loi VAN ra nhom that,
 * va grep toan bo cua so log do khong ra MOT DONG NAO. Doc trace luot do se ket luan "he thong
 * khong gui gi" — SAI. Duong tu dong da co day du quyet dinh co ma; duong NGUOI BAM NUT thi
 * khong co gi ca, ke ca audit.
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
  /** Sale xac nhan DA GO VAO ERP. Day cung la moc khoa cua bat bien chong lech ERP. */
  'HANDOFF_COMPLETED',
] as const;
export type SalesHandoffReason = (typeof SALES_HANDOFF_REASONS)[number];

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
 * order.amend_window — canAmendOrder(), tai `cancelOrder()` va `replaceItems()`
 *
 * Day la cong DUY NHAT tu choi mot yeu cau HUY/SUA cua chinh khach hang, va loi tu choi di toi
 * tan tay khach duoi dang mot cau tieng Viet. Khong ghi lai thi doc trace se ket luan "he thong
 * khong lam gi" — dung nhan sai cua su co 22/08/2026, lan nay o duong khach xin doi don.
 *
 * BON ma tu choi chu khong phai mot `AMEND_BLOCKED`: bon trang thai the gioi nay doi bon hanh
 * dong sua khac han nhau (sua goi khach / khong lam gi / doi soat ERP / nho Sale go tay), va mot
 * ma gop se buoc nguoi loc phai mo source doc lai bon dieu kien roi doan. Cung ly do da tach
 * `evaluateAutoConfirm()` ra khoi mot ham `boolean`.
 * ------------------------------------------------------------------ */
export const AMEND_WINDOW_REASONS = [
  'AMEND_ALLOWED',
  /** `khong_phai_don` — tin nay chua bao gio la mot don. */
  'AMEND_NOT_AN_ORDER',
  /** `da_tu_choi` — don da huy truoc do; huy lan hai khong phai mot loi. */
  'AMEND_ALREADY_REJECTED',
  /** `da_dong_bo_erp` — don da sang he thong ban hang. */
  'AMEND_SYNCED_TO_ERP',
  /** `da_nhap_erp` — Sale DA go tay vao ERP: diem KHONG QUAY LAI cua GĐ1. */
  'AMEND_HANDED_TO_ERP',
] as const;
export type AmendWindowReason = (typeof AMEND_WINDOW_REASONS)[number];

export type SalesOrderDecisionReason =
  | AutoConfirmReason
  | ManualApproveReason
  | ManualRejectReason
  | SalesHandoffReason
  | PricingReason
  | AmendWindowReason;

export const SALES_ORDER_DECISIONS = defineDecisionVocabulary({
  owner: 'sales-order',
  points: [
    'order.auto_confirm',
    'order.amend_window',
    'order.manual_approve',
    'order.manual_reject',
    'order.sales_handoff',
    'rules.price',
  ],
  labels: {
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
    ALLOWED: 'Cho phép',

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

    PRICED_CLEAN: 'Tính giá xong, không cảnh báo',
    SKU_UNRESOLVED: 'Có dòng hàng chưa map được SKU hoặc chưa có giá',
    SHIPPING_TABLE_MISSING: 'TH2 nhưng chưa có bảng vùng/cước/COD chính thức',
    VAT_POLICY_MISSING: 'Khách xin VAT nhưng chính sách VAT chưa được duyệt',
    TOTAL_MISMATCH: 'Tổng khách ghi lệch tổng hệ thống quá ngưỡng',

    AMEND_ALLOWED: 'Còn trong cửa sổ sửa đơn',
    AMEND_NOT_AN_ORDER: 'Tin này không phải một đơn hàng',
    AMEND_ALREADY_REJECTED: 'Đơn đã bị huỷ trước đó',
    AMEND_SYNCED_TO_ERP: 'Đơn đã đồng bộ sang hệ thống bán hàng',
    AMEND_HANDED_TO_ERP: 'Sale đã nhập đơn vào hệ thống bán hàng'
  } satisfies Record<SalesOrderDecisionReason, string>,
});
