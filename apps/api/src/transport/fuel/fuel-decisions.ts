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
   * Khoa chong ghi trung DA DUOC DUNG cho mot phieu KHAC — T4R §5.
   *
   * Danh tinh so sanh gom ca `supplierId`, `paymentMethod`, `occurredAt`, so hoa don va ghi chu.
   * `paymentMethod` doi CHINH DUONG TIEN o `TX-03`, nen mot lenh doi no khong phai lan gui lai cua
   * lenh cu — tra ve phieu cu se lang le nuot mat mot phieu that.
   */
  'FUEL_CORRELATION_KEY_REUSED',
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
  /**
   * Trang thai DOI GIUA luc doc va luc ghi — T4R §4.
   *
   * Khac hai ma tren: o do phieu DA o trang thai khoa luc nguoi dung bam. O day no con sua duoc,
   * va mot lenh duyet/khop cua nguoi khac vua ve dich truoc. Nguoi dung phai tai lai roi doc lai —
   * khong phai di dao mot phieu.
   */
  'FUEL_ENTRY_AMEND_STATE_RACE',
] as const;
export type FuelEntryAmendReason = (typeof FUEL_ENTRY_AMEND_REASONS)[number];

/* ------------------------------------------------------------------ *
 * fuel_entry.evidence_withdraw — go mot chung tu tai nham (#222 P1-C)
 * ------------------------------------------------------------------ */
export const FUEL_EVIDENCE_WITHDRAW_REASONS = [
  'FUEL_EVIDENCE_WITHDRAWN',
  /** Da go roi — hai lan bam, hoac hai tab. Khong phai loi cua ai. */
  'FUEL_EVIDENCE_ALREADY_WITHDRAWN',
  'FUEL_EVIDENCE_NOT_FOUND',
  /** `GD-10` — phieu da duoc tin, tam anh nay gio la chung tu ke toan. */
  'FUEL_EVIDENCE_ENTRY_ALREADY_TRUSTED',
  /** `GD-11` — phieu da khop, hoac ky doi soat da dong. */
  'FUEL_EVIDENCE_ENTRY_RECONCILIATION_LOCKED',
] as const;
export type FuelEvidenceWithdrawReason = (typeof FUEL_EVIDENCE_WITHDRAW_REASONS)[number];

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
  /** Hang doi soat bien mat giua luc doc va luc khoa — hiem, nhung phan biet duoc voi `FROZEN`. */
  'RECONCILIATION_NOT_FOUND',
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
   * Ban giao MOI trong chuoi ban sua doi cua ky — T4R §2.
   *
   * Phat khi ket qua kinh te (tong + so dong + BO DONG) da doi so voi ban gan nhat: lan dau (ban 1)
   * va moi lan mo lai - sua - dong lai ma so lieu that su khac. Ban moi tro nguoc ve ban truoc qua
   * `supersedesId`, nen T5 doc duoc ca lich su chinh sua.
   */
  'HANDOFF_REVISION_EMITTED',
  /**
   * Dong lai ma ket qua kinh te KHONG doi — phat lai ban gan nhat, KHONG them ban moi.
   *
   * Day la nghia dung cua "idempotent" o day. Truoc T4R ma nay duoc phat CA KHI so lieu da doi, va
   * do la khe ho khien mot lan sua khong bao gio den duoc T5.
   */
  'HANDOFF_IDEMPOTENT_REPLAY',
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

/* ------------------------------------------------------------------ *
 * fuel_station.write — tao/sua mot cay xang (Lane C / C1)
 * ------------------------------------------------------------------ */
export const FUEL_STATION_WRITE_REASONS = [
  'STATION_CREATED',
  'STATION_UPDATED',
  /** Nha cung cap tren duong dan khong ton tai. Tram khong duoc phep mo coi. */
  'STATION_SUPPLIER_NOT_FOUND',
  'STATION_NOT_FOUND',
  /** Ma DA CHUAN HOA da thuoc mot tram khac cua cung nha cung cap. */
  'STATION_CODE_TAKEN',
  /** Ten chuan hoa ra rong — mot khoa so khop rong se khop voi moi tram cung rong. */
  'STATION_NAME_INVALID',
  /** Mot nua toa do, hoac mot ban kinh khong co tam. Hai duong khac nhau, xem `fuel-errors.ts`. */
  'STATION_GEOMETRY_INVALID',
] as const;
export type FuelStationWriteReason = (typeof FUEL_STATION_WRITE_REASONS)[number];

/* ------------------------------------------------------------------ *
 * fuel_station.alias — nguoi dat/go mot bi danh
 * ------------------------------------------------------------------ */
export const FUEL_STATION_ALIAS_REASONS = [
  'ALIAS_ADDED',
  /** Dat lai DUNG bi danh da co tren DUNG tram do — tra lai hang cu, khong ghi hang thu hai. */
  'ALIAS_IDEMPOTENT_REPLAY',
  /** Bi danh da tro toi mot tram KHAC. Khong ghi de — su mo ho la thu bi danh sinh ra de xoa. */
  'ALIAS_TAKEN',
  'ALIAS_INVALID',
  'ALIAS_REMOVED',
  /** Khong co bi danh do tren tram do. Idempotent — khong nem, va khong xac nhan no ton tai o dau. */
  'ALIAS_NOT_FOUND',
] as const;
export type FuelStationAliasReason = (typeof FUEL_STATION_ALIAS_REASONS)[number];

/* ------------------------------------------------------------------ *
 * fuel_station.resolve — nhan mot cay xang tu chung tu
 * ------------------------------------------------------------------ *
 *
 * NAM ma cho NAM ket cuc cua `resolveFuelStation()`, khong gop cai nao. Nguoi truc doc trace can
 * biet ngay phai lam gi, va nam viec phai lam do khac han nhau: doc ket qua / dat bi danh phan
 * biet / sua nha cung cap tren chung tu / them tram / gan tay vi nguon qua yeu.
 */
export const FUEL_STATION_RESOLVE_REASONS = [
  'STATION_RESOLVED',
  'STATION_AMBIGUOUS',
  'STATION_SUPPLIER_MISMATCH',
  'STATION_NO_MATCH',
  'STATION_NO_INPUT',
] as const;
export type FuelStationResolveReason = (typeof FUEL_STATION_RESOLVE_REASONS)[number];

/* ------------------------------------------------------------------ *
 * fuel_supplier.profile — sieu du lieu hop dong
 * ------------------------------------------------------------------ */
export const FUEL_SUPPLIER_PROFILE_REASONS = [
  'SUPPLIER_PROFILE_UPDATED',
  'SUPPLIER_PROFILE_NOT_FOUND',
  /** Ngay bat dau sau ngay ket thuc. Kiem DANG, khong kiem chinh sach — `Q-08` chua co loi. */
  'SUPPLIER_CONTRACT_PERIOD_INVALID',
] as const;
export type FuelSupplierProfileReason = (typeof FUEL_SUPPLIER_PROFILE_REASONS)[number];

/* ------------------------------------------------------------------ *
 * fuel_document.ingest — nhap mot chung tu nguon (Lane C / C2)
 * ------------------------------------------------------------------ *
 *
 * NAM ket cuc, va ba trong so do KHONG phai loi cua ai: mot lan gui lai cung mot tep, mot hoa don
 * da vao he thong tu tep khac, va mot chung tu khong doc duoc deu la chuyen thuong ngay cua mot
 * hop thu. Gop chung thanh "that bai" se lam bang loc trace vo dung dung luc can no nhat.
 */
export const FUEL_DOCUMENT_INGEST_REASONS = [
  'DOCUMENT_PARSED',
  /** Dung DUNG mot tep da nhap (bam byte trung) — tra lai ban cu, KHONG ghi them hang nao. */
  'DOCUMENT_IDEMPOTENT_REPLAY',
  /**
   * Hoa don nay DA vao he thong tu MOT TEP KHAC.
   *
   * Khac han `DOCUMENT_IDEMPOTENT_REPLAY`: o kia la cung mot tep, o day la cung mot HOA DON den
   * bang hai tep khac nhau (ban goc va mot ban ky lai). Dau van tay byte khong bat duoc truong hop
   * nay — khoa `(MST, ky hieu, so hoa don, dong)` moi bat duoc.
   */
  'DOCUMENT_DUPLICATE_INVOICE',
  /** Chung tu khong doc duoc. Ly do cu the nam o `detail.rejectReason`. */
  'DOCUMENT_REJECTED',
] as const;
export type FuelDocumentIngestReason = (typeof FUEL_DOCUMENT_INGEST_REASONS)[number];

/* ------------------------------------------------------------------ *
 * fuel_document.supplier_link — noi chung tu voi mot nha cung cap
 * ------------------------------------------------------------------ */
export const FUEL_DOCUMENT_SUPPLIER_REASONS = [
  'SUPPLIER_LINKED',
  /** Khong nha cung cap nao trong danh muc mang ma so thue do. Chung tu VAN duoc nhap. */
  'SUPPLIER_TAX_CODE_UNKNOWN',
  /**
   * HAI nha cung cap tro len cung mot ma so thue — danh muc bi nhap trung.
   *
   * KHONG chon mot cai: `TransportFuelSupplier.taxCode` khong co rang buoc duy nhat, nen tinh
   * trang nay la co that, va chon dai se noi chung tu vao nham ho so. De trong va bao ten.
   */
  'SUPPLIER_TAX_CODE_AMBIGUOUS',
] as const;
export type FuelDocumentSupplierReason = (typeof FUEL_DOCUMENT_SUPPLIER_REASONS)[number];

export type TransportFuelDecisionReason =
  | FuelDocumentIngestReason
  | FuelDocumentSupplierReason
  | FuelEntrySubmitReason
  | FuelEntryReviewReason
  | FuelEntryAmendReason
  | FuelEvidenceWithdrawReason
  | FuelCostPostingReason
  | FuelStatementImportReason
  | FuelStatementRowReason
  | FuelMatchReason
  | FuelReconciliationTransitionReason
  | FuelDiscrepancyResolveReason
  | FuelSettlementHandoffReason
  | DriverSelfFuelScopeReason
  | FuelStationWriteReason
  | FuelStationAliasReason
  | FuelStationResolveReason
  | FuelSupplierProfileReason;

export const TRANSPORT_FUEL_DECISIONS = defineDecisionVocabulary({
  owner: 'transport-fuel',
  points: [
    'fuel_entry.submit',
    'fuel_entry.review',
    'fuel_entry.amend',
    'fuel_entry.evidence_withdraw',
    'fuel.cost_posting',
    'fuel_statement.import',
    'fuel_statement.import_row',
    'fuel.match',
    'fuel_reconciliation.transition',
    'fuel_discrepancy.resolve',
    'fuel.settlement_handoff',
    'driver.self_fuel_scope',
    'fuel_station.write',
    'fuel_station.alias',
    'fuel_station.resolve',
    'fuel_supplier.profile',
    'fuel_document.ingest',
    'fuel_document.supplier_link',
  ],
  labels: {
    FUEL_ENTRY_RECORDED: 'Đã ghi phiếu đổ dầu',
    FUEL_ENTRY_IDEMPOTENT_REPLAY: 'Nộp lặp cùng khoá chống trùng — trả lại phiếu đã ghi',
    FUEL_CORRELATION_KEY_REUSED: 'Khoá chống trùng đã dùng cho một phiếu có nội dung khác',
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
    FUEL_ENTRY_AMEND_STATE_RACE: 'Phiếu vừa được người khác duyệt hoặc khớp — tải lại rồi đọc lại',

    FUEL_EVIDENCE_WITHDRAWN: 'Đã gỡ chứng từ tải nhầm khỏi phiếu, dấu vết vẫn ở lại',
    FUEL_EVIDENCE_ALREADY_WITHDRAWN: 'Chứng từ này đã được gỡ trước đó — không còn việc gì để làm',
    FUEL_EVIDENCE_NOT_FOUND: 'Không có chứng từ đó trên phiếu này',
    FUEL_EVIDENCE_ENTRY_ALREADY_TRUSTED:
      'Phiếu đã được duyệt — chứng từ thành chứng từ kế toán, đường đúng là đảo phiếu',
    FUEL_EVIDENCE_ENTRY_RECONCILIATION_LOCKED:
      'Phiếu đã khớp hoặc kỳ đối soát đã đóng — không gỡ chứng từ được',

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
    RECONCILIATION_NOT_FOUND: 'Không tìm thấy kỳ đối soát',

    DISCREPANCY_RESOLVED: 'Đã ghi quyết định cho chênh lệch',
    DISCREPANCY_ALREADY_RESOLVED: 'Chênh lệch này đã có người quyết trước đó',
    DISCREPANCY_RECONCILIATION_FROZEN: 'Kỳ đối soát đã đóng nên không nhận quyết định mới',
    DISCREPANCY_MATCH_TARGET_REQUIRED: 'Xác nhận khớp phải chỉ rõ cặp nào',

    HANDOFF_EMITTED: 'Đã phát bàn giao công nợ nhà cung cấp cho T5',
    HANDOFF_REVISION_EMITTED: 'Kết quả kinh tế đã đổi — phát một bản sửa đổi mới của bàn giao',
    HANDOFF_IDEMPOTENT_REPLAY:
      'Kết quả kinh tế không đổi — phát lại bản gần nhất, không thêm bản mới',

    SELF_FUEL_SCOPE_GRANTED: 'Lái xe thao tác đúng phiếu của chính mình',
    SELF_FUEL_SCOPE_NO_DRIVER_BINDING: 'Tài khoản đăng nhập chưa nối với hồ sơ lái xe nào',
    SELF_FUEL_SCOPE_NOT_OWNED: 'Phiếu/chuyến này không thuộc lái xe đang đăng nhập',

    STATION_CREATED: 'Đã thêm một cây xăng vào danh mục',
    STATION_UPDATED: 'Đã sửa thông tin cây xăng',
    STATION_SUPPLIER_NOT_FOUND: 'Không có nhà cung cấp đó để gắn trạm vào',
    STATION_NOT_FOUND: 'Không tìm thấy cây xăng',
    STATION_CODE_TAKEN: 'Mã cửa hàng đã thuộc một trạm khác của cùng nhà cung cấp',
    STATION_NAME_INVALID: 'Tên trạm chuẩn hoá ra rỗng — không dùng làm khoá so khớp được',
    STATION_GEOMETRY_INVALID: 'Toạ độ thiếu một nửa, hoặc bán kính không có tâm',

    ALIAS_ADDED: 'Đã đặt một bí danh cho cây xăng',
    ALIAS_IDEMPOTENT_REPLAY: 'Bí danh này đã trỏ đúng trạm đó rồi — không ghi thêm hàng nào',
    ALIAS_TAKEN: 'Bí danh đã trỏ tới một trạm khác — hãy đặt tên cụ thể hơn',
    ALIAS_INVALID: 'Bí danh chuẩn hoá ra rỗng',
    ALIAS_REMOVED: 'Đã gỡ bí danh',
    ALIAS_NOT_FOUND: 'Không có bí danh đó trên trạm này',

    STATION_RESOLVED: 'Nhận ra đúng một cây xăng từ chứng từ',
    STATION_AMBIGUOUS: 'Nhiều trạm cùng khớp — cần một bí danh phân biệt',
    STATION_SUPPLIER_MISMATCH:
      'Khớp một trạm của nhà cung cấp khác — chứng từ ghi sai nhà cung cấp',
    STATION_NO_MATCH: 'Chứng từ có dữ kiện nhưng không trạm nào khớp',
    STATION_NO_INPUT: 'Chứng từ không nói gì về trạm — nguồn quá yếu, phải gán tay',

    SUPPLIER_PROFILE_UPDATED: 'Đã sửa siêu dữ liệu hợp đồng của nhà cung cấp',
    SUPPLIER_PROFILE_NOT_FOUND: 'Không tìm thấy nhà cung cấp',
    SUPPLIER_CONTRACT_PERIOD_INVALID: 'Ngày bắt đầu hợp đồng sau ngày kết thúc',

    DOCUMENT_PARSED: 'Đã đọc chứng từ nguồn và ghi các ứng viên',
    DOCUMENT_IDEMPOTENT_REPLAY: 'Đúng tệp này đã nhập rồi — trả lại bản cũ, không ghi thêm',
    DOCUMENT_DUPLICATE_INVOICE: 'Hoá đơn này đã vào hệ thống từ một tệp khác',
    DOCUMENT_REJECTED: 'Chứng từ không đọc được — lý do có tên ở chi tiết',

    SUPPLIER_LINKED: 'Đã nối chứng từ với nhà cung cấp theo mã số thuế',
    SUPPLIER_TAX_CODE_UNKNOWN: 'Không nhà cung cấp nào trong danh mục mang mã số thuế đó',
    SUPPLIER_TAX_CODE_AMBIGUOUS:
      'Hai nhà cung cấp trở lên cùng một mã số thuế — danh mục nhập trùng',
  } satisfies Record<TransportFuelDecisionReason, string>,
});
