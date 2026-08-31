import { defineDecisionVocabulary } from '../../observability/decision-vocabulary.js';

/**
 * TU VUNG QUYET DINH cua `transport-fuel`.
 *
 * Bo RIENG, khong nhet vao `TRANSPORT_COSTING_DECISIONS`: mot khach van tai co the bat costing ma
 * KHONG bat fuel (T1 §10.1 dat fuel phu thuoc costing, khong nguoc lai). Neu tron chung, bang loc
 * trace cua khach do se hua co mot diem "so khop bang ke" khong bao gio phat — dung kieu hong ma
 * `decision-vocabulary.spec.ts` sinh ra de chan.
 *
 * MOI CONG o day co N duong tu choi thi mang N ma. Rieng voi T4, quy tac do khong phai mot so
 * thich ky luat: mot ky doi soat co SAU ket cuc khac nhau, va nguoi truc dang tra loi cau "vi sao
 * dong nay khong khop" can biet ngay do la *khong co ung vien*, *nhieu ung vien*, *lech qua dung
 * sai* hay *bi `INV-26` chan* — bon viec phai lam khac han nhau.
 */

/* ------------------------------------------------------------------ *
 * fuel_entry.submit — lai xe nop phieu do dau
 * ------------------------------------------------------------------ */
export const FUEL_ENTRY_SUBMIT_REASONS = [
  'FUEL_ENTRY_RECORDED',
  /** Khoa chong ghi trung khop DUNG mot phieu da ghi — tra lai ban cu, KHONG ghi them. */
  'FUEL_ENTRY_IDEMPOTENT_REPLAY',
  /**
   * `INV-04` — chuyen thue xe ngoai KHONG duoc co mot phieu dau nao.
   *
   * Manh hon cong tuong ung cua T3 (`DA-T3-03` van cho khoan `COMPANY_DIRECT` tren chuyen thue
   * ngoai): T1 viet ro "chuyen loai thue xe ngoai khong duoc co `FuelEntry` HAY `DriverFundEntry`
   * nao". Dau cua xe nha xe la chi phi cua nha xe, va no da nam trong gia thue.
   */
  'FUEL_ENTRY_TRIP_OUTSOURCED',
  /** `GD-01` — chuyen da doi soat thi khoa khoi moi chung tu chi phi moi. */
  'FUEL_ENTRY_TRIP_RECONCILED',
  /** Chuyen da huy (`GD-02`): duong dung la dao phieu da ghi, khong phai ghi phieu moi. */
  'FUEL_ENTRY_TRIP_CANCELLED',
  /** Lai xe chua tung duoc phan cong vao chuyen do — cung ly le voi `DA-T3-04` cua T3. */
  'FUEL_ENTRY_DRIVER_NOT_ASSIGNED',
  /** Xe tren phieu chua tung duoc phan cong vao chuyen do. */
  'FUEL_ENTRY_VEHICLE_NOT_ASSIGNED',
] as const;
export type FuelEntrySubmitReason = (typeof FUEL_ENTRY_SUBMIT_REASONS)[number];

/* ------------------------------------------------------------------ *
 * fuel_entry.review — ke toan duyet / tra lai (truc 1)
 * ------------------------------------------------------------------ */
export const FUEL_ENTRY_REVIEW_REASONS = [
  'FUEL_ENTRY_VERIFIED',
  'FUEL_ENTRY_REJECTED',
  'FUEL_ENTRY_REVIEW_REOPENED',
  'FUEL_ENTRY_REVIEW_TRANSITION_NOT_PERMITTED',
  'FUEL_ENTRY_REVIEW_ALREADY_IN_STATE',
] as const;
export type FuelEntryReviewReason = (typeof FUEL_ENTRY_REVIEW_REASONS)[number];

/* ------------------------------------------------------------------ *
 * fuel_entry.amend — `GD-10`
 * ------------------------------------------------------------------ */
export const FUEL_ENTRY_AMEND_REASONS = [
  'FUEL_ENTRY_AMENDED',
  'FUEL_ENTRY_AMEND_ALREADY_TRUSTED',
  'FUEL_ENTRY_AMEND_RECONCILIATION_LOCKED',
] as const;
export type FuelEntryAmendReason = (typeof FUEL_ENTRY_AMEND_REASONS)[number];

/* ------------------------------------------------------------------ *
 * fuel.cost_posting — cau sang `TX-03`
 * ------------------------------------------------------------------ */
export const FUEL_COST_POSTING_REASONS = [
  'FUEL_COST_POSTED',
  /**
   * Phieu nay DA co chan gia thanh. Tra lai ban cu, khong ghi them.
   *
   * Day la ma chung minh "chi phi dau vao gia thanh chuyen DUNG MOT LAN": neu no phat o lan duyet
   * thu hai ma so khoan chi van la mot, thi cong idempotent dang lam dung viec cua no.
   */
  'FUEL_COST_ALREADY_POSTED',
] as const;
export type FuelCostPostingReason = (typeof FUEL_COST_POSTING_REASONS)[number];

/* ------------------------------------------------------------------ *
 * fuel_statement.import — nhap ca file
 * ------------------------------------------------------------------ */
export const FUEL_STATEMENT_IMPORT_REASONS = [
  'STATEMENT_IMPORTED',
  /** Da co bang ke cho dung `(cay xang, ky)` nay — khong ghi de. */
  'STATEMENT_PERIOD_TAKEN',
  'STATEMENT_EMPTY',
  'STATEMENT_MAPPING_INVALID',
] as const;
export type FuelStatementImportReason = (typeof FUEL_STATEMENT_IMPORT_REASONS)[number];

/* ------------------------------------------------------------------ *
 * fuel_statement.import_row — KET QUA THEO TUNG DONG
 * ------------------------------------------------------------------ */
export const FUEL_STATEMENT_ROW_REASONS = [
  'ROW_ACCEPTED',
  'ROW_MISSING_REQUIRED_FIELD',
  'ROW_MALFORMED_DATE',
  'ROW_MALFORMED_AMOUNT',
  'ROW_MALFORMED_LITERS',
  /** Bien so khong khop xe nao — he thong KHONG tu tao xe tu mot file nhap. */
  'ROW_UNKNOWN_VEHICLE',
  'ROW_DUPLICATE',
] as const;
export type FuelStatementRowReason = (typeof FUEL_STATEMENT_ROW_REASONS)[number];

/* ------------------------------------------------------------------ *
 * fuel.match — SAU ket cuc, khong mot `boolean`
 * ------------------------------------------------------------------ */
export const FUEL_MATCH_REASONS = [
  /** Trung tuyet doi ca tien lan ngay. */
  'MATCH_EXACT',
  /** Lech nhung trong dung sai cua goi khach (`GD-08`). */
  'MATCH_WITHIN_TOLERANCE',
  /** `GD-09` — nhieu ung vien, KHONG tu chon cap nao. */
  'MATCH_AMBIGUOUS_CANDIDATES',
  /** `FUEL-RECON-002` — dong bang ke khong co phieu tuong ung. */
  'MATCH_STATEMENT_LINE_ONLY',
  /** Phieu khong thay tren bang ke ky nay. */
  'MATCH_FUEL_ENTRY_ONLY',
  /** Co ung vien duy nhat nhung lech vuot dung sai. */
  'MATCH_OUT_OF_TOLERANCE',
  /** `INV-26` — ung vien duy nhat la phieu de ra tu chinh bang ke nay. */
  'MATCH_SELF_SOURCED_BLOCKED',
] as const;
export type FuelMatchReason = (typeof FUEL_MATCH_REASONS)[number];

/* ------------------------------------------------------------------ *
 * fuel_reconciliation.transition — T1 §7.5
 * ------------------------------------------------------------------ */
export const FUEL_RECONCILIATION_TRANSITION_REASONS = [
  'RECONCILIATION_OPENED',
  'RECONCILIATION_MATCHING_RUN',
  'RECONCILIATION_RESOLVED',
  'RECONCILIATION_CLOSED',
  'RECONCILIATION_REOPENED',
  /** `FUEL-RECON-004` — con it nhat mot chenh lech chua ai quyet. */
  'RECONCILIATION_HAS_PENDING_DISCREPANCY',
  'RECONCILIATION_TRANSITION_NOT_PERMITTED',
  'RECONCILIATION_ALREADY_IN_STATE',
  /** Ky da dong — moi duong ghi vao no bi chan (`GD-11`). */
  'RECONCILIATION_FROZEN',
] as const;
export type FuelReconciliationTransitionReason =
  (typeof FUEL_RECONCILIATION_TRANSITION_REASONS)[number];

/* ------------------------------------------------------------------ *
 * fuel_discrepancy.resolve
 * ------------------------------------------------------------------ */
export const FUEL_DISCREPANCY_RESOLVE_REASONS = [
  'DISCREPANCY_RESOLVED',
  'DISCREPANCY_ALREADY_RESOLVED',
  'DISCREPANCY_RECONCILIATION_FROZEN',
  /** `GD-09` — quyet "khop di" ma khong noi khop voi cai nao thi he thong lai phai doan. */
  'DISCREPANCY_MATCH_TARGET_REQUIRED',
] as const;
export type FuelDiscrepancyResolveReason = (typeof FUEL_DISCREPANCY_RESOLVE_REASONS)[number];

/* ------------------------------------------------------------------ *
 * fuel.settlement_handoff — cau sang T5
 * ------------------------------------------------------------------ */
export const FUEL_SETTLEMENT_HANDOFF_REASONS = [
  'HANDOFF_EMITTED',
  /**
   * Dong lai mot ky da tung dong, va KET QUA KINH TE KHONG DOI — phat lai chinh ban cu.
   *
   * "Khong doi" o day co nghia hep va do duoc: cung `acceptedAmount`, cung `acceptedLineCount`. Ai
   * bam nut va bam luc nao thi khong tinh — neu tinh, moi lan bam se de ra mot ban moi va tinh
   * idempotent bien thanh mot bo dem so lan bam.
   */
  'HANDOFF_IDEMPOTENT_REPLAY',
  /**
   * Dong lai sau khi ai do MO LAI VA SUA, va con so da khac — mot ban sua doi moi (Issue #103 §2).
   *
   * Ma RIENG chu khong dung lai `HANDOFF_EMITTED`: hai su kien nay doi hai viec khac nhau o phia
   * T5. Mot ban dau tien la mot cong no moi; mot ban sua doi la mot cong no DA TON TAI can duoc
   * dieu chinh. Gop chung lai thi nguoi truc doc trace khong phan biet duoc, va T5 se hoac tao hai
   * cong no hoac bo qua lan sua.
   */
  'HANDOFF_REVISED',
] as const;
export type FuelSettlementHandoffReason = (typeof FUEL_SETTLEMENT_HANDOFF_REASONS)[number];

/* ------------------------------------------------------------------ *
 * driver.self_fuel_scope — CONG cua be mat lai xe
 * ------------------------------------------------------------------ */
export const DRIVER_SELF_FUEL_SCOPE_REASONS = [
  'SELF_FUEL_SCOPE_GRANTED',
  'SELF_FUEL_SCOPE_NO_DRIVER_BINDING',
  /** Lai xe hoi mot phieu/chuyen khong phai cua ho. Xem `DRIVER-VIEW-002`. */
  'SELF_FUEL_SCOPE_NOT_OWNED',
] as const;
export type DriverSelfFuelScopeReason = (typeof DRIVER_SELF_FUEL_SCOPE_REASONS)[number];

export type TransportFuelDecisionReason =
  | FuelEntrySubmitReason
  | FuelEntryReviewReason
  | FuelEntryAmendReason
  | FuelCostPostingReason
  | FuelStatementImportReason
  | FuelStatementRowReason
  | FuelMatchReason
  | FuelReconciliationTransitionReason
  | FuelDiscrepancyResolveReason
  | FuelSettlementHandoffReason
  | DriverSelfFuelScopeReason;

export const TRANSPORT_FUEL_DECISIONS = defineDecisionVocabulary({
  owner: 'transport-fuel',
  points: [
    'fuel_entry.submit',
    'fuel_entry.review',
    'fuel_entry.amend',
    'fuel.cost_posting',
    'fuel_statement.import',
    'fuel_statement.import_row',
    'fuel.match',
    'fuel_reconciliation.transition',
    'fuel_discrepancy.resolve',
    'fuel.settlement_handoff',
    'driver.self_fuel_scope',
  ],
  labels: {
    FUEL_ENTRY_RECORDED: 'Đã ghi phiếu đổ dầu',
    FUEL_ENTRY_IDEMPOTENT_REPLAY: 'Nộp lặp cùng khoá chống trùng — trả lại phiếu đã ghi',
    FUEL_ENTRY_TRIP_OUTSOURCED: 'Chuyến thuê xe ngoài không nhận phiếu đổ dầu nội bộ',
    FUEL_ENTRY_TRIP_RECONCILED: 'Chuyến đã đối soát nên khoá khỏi chứng từ chi phí mới',
    FUEL_ENTRY_TRIP_CANCELLED: 'Chuyến đã huỷ — đường đúng là đảo phiếu đã ghi',
    FUEL_ENTRY_DRIVER_NOT_ASSIGNED: 'Lái xe chưa từng được phân công vào chuyến này',
    FUEL_ENTRY_VEHICLE_NOT_ASSIGNED: 'Xe chưa từng được phân công vào chuyến này',

    FUEL_ENTRY_VERIFIED: 'Kế toán đã duyệt phiếu',
    FUEL_ENTRY_REJECTED: 'Kế toán trả lại phiếu kèm lý do',
    FUEL_ENTRY_REVIEW_REOPENED: 'Phiếu bị trả lại được nộp lại để duyệt',
    FUEL_ENTRY_REVIEW_TRANSITION_NOT_PERMITTED: 'Máy trạng thái duyệt phiếu không có cạnh này',
    FUEL_ENTRY_REVIEW_ALREADY_IN_STATE: 'Phiếu đã ở đúng trạng thái duyệt đó rồi',

    FUEL_ENTRY_AMENDED: 'Đã sửa phiếu khi còn ở trạng thái sửa được',
    FUEL_ENTRY_AMEND_ALREADY_TRUSTED: 'Phiếu đã được duyệt — đường đúng là đảo phiếu',
    FUEL_ENTRY_AMEND_RECONCILIATION_LOCKED: 'Phiếu đã khớp hoặc kỳ đối soát đã đóng',

    FUEL_COST_POSTED: 'Chi phí dầu đã vào giá thành chuyến',
    FUEL_COST_ALREADY_POSTED: 'Phiếu này đã có chân giá thành — không ghi thêm lần hai',

    STATEMENT_IMPORTED: 'Đã nhập bảng kê cây xăng',
    STATEMENT_PERIOD_TAKEN: 'Đã có bảng kê cho đúng cây xăng và kỳ này',
    STATEMENT_EMPTY: 'File đọc được nhưng không có dòng dữ liệu nào',
    STATEMENT_MAPPING_INVALID: 'Ánh xạ cột của gói khách không khớp tiêu đề của file',

    ROW_ACCEPTED: 'Dòng bảng kê hợp lệ',
    ROW_MISSING_REQUIRED_FIELD: 'Dòng thiếu trường bắt buộc',
    ROW_MALFORMED_DATE: 'Ngày trên dòng không đọc được',
    ROW_MALFORMED_AMOUNT: 'Số tiền trên dòng không đọc được',
    ROW_MALFORMED_LITERS: 'Số lít trên dòng không đọc được',
    ROW_UNKNOWN_VEHICLE: 'Biển số không khớp xe nào đang có',
    ROW_DUPLICATE: 'Dòng trùng nguyên vẹn một dòng khác trong cùng file',

    MATCH_EXACT: 'Khớp tuyệt đối cả tiền lẫn ngày',
    MATCH_WITHIN_TOLERANCE: 'Khớp trong dung sai của gói khách',
    MATCH_AMBIGUOUS_CANDIDATES: 'Nhiều ứng viên — không tự chọn cặp nào, chuyển người quyết',
    MATCH_STATEMENT_LINE_ONLY: 'Dòng bảng kê không có phiếu lái xe tương ứng',
    MATCH_FUEL_ENTRY_ONLY: 'Phiếu lái xe không thấy trên bảng kê kỳ này',
    MATCH_OUT_OF_TOLERANCE: 'Có ứng viên duy nhất nhưng lệch vượt dung sai',
    MATCH_SELF_SOURCED_BLOCKED: 'Ứng viên là phiếu đẻ ra từ chính bảng kê này (INV-26)',

    RECONCILIATION_OPENED: 'Đã mở kỳ đối soát cho bảng kê',
    RECONCILIATION_MATCHING_RUN: 'Đã chạy so khớp tất định',
    RECONCILIATION_RESOLVED: 'Mọi chênh lệch đã có người quyết',
    RECONCILIATION_CLOSED: 'Đã đóng đối soát và phát bàn giao công nợ',
    RECONCILIATION_REOPENED: 'Đã mở lại kỳ đã đóng (quyền riêng, có dấu vết)',
    RECONCILIATION_HAS_PENDING_DISCREPANCY: 'Còn chênh lệch chưa quyết nên chưa đóng được',
    RECONCILIATION_TRANSITION_NOT_PERMITTED: 'Máy trạng thái đối soát không có cạnh này',
    RECONCILIATION_ALREADY_IN_STATE: 'Kỳ đối soát đã ở đúng trạng thái đó rồi',
    RECONCILIATION_FROZEN: 'Kỳ đối soát đã đóng — không nhận thay đổi',

    DISCREPANCY_RESOLVED: 'Đã ghi quyết định cho chênh lệch',
    DISCREPANCY_ALREADY_RESOLVED: 'Chênh lệch này đã có người quyết trước đó',
    DISCREPANCY_RECONCILIATION_FROZEN: 'Kỳ đối soát đã đóng nên không nhận quyết định mới',
    DISCREPANCY_MATCH_TARGET_REQUIRED: 'Xác nhận khớp phải chỉ rõ cặp nào',

    HANDOFF_EMITTED: 'Đã phát bàn giao công nợ nhà cung cấp cho T5',
    HANDOFF_IDEMPOTENT_REPLAY: 'Kết quả không đổi — phát lại đúng bản bàn giao cũ',
    HANDOFF_REVISED: 'Mở lại rồi sửa nên kết quả khác — phát một bản sửa đổi mới',

    SELF_FUEL_SCOPE_GRANTED: 'Lái xe thao tác đúng phiếu của chính mình',
    SELF_FUEL_SCOPE_NO_DRIVER_BINDING: 'Tài khoản đăng nhập chưa nối với hồ sơ lái xe nào',
    SELF_FUEL_SCOPE_NOT_OWNED: 'Phiếu/chuyến này không thuộc lái xe đang đăng nhập',
  } satisfies Record<TransportFuelDecisionReason, string>,
});
