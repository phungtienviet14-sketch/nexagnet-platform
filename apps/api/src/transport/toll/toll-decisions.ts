import { defineDecisionVocabulary } from '../../observability/decision-vocabulary.js';

/* ------------------------------------------------------------------ *
 * toll_import.commit -- TollService.commitImport()
 * ------------------------------------------------------------------ */
export const TOLL_IMPORT_REASONS = [
  'TOLL_IMPORT_ACCEPTED',
  /**
   * Dung bo byte do da nap roi — tra ve chinh lan nhap CU, khong tao gi.
   *
   * Day la ket qua CHO PHEP chu khong phai loi (#269 J4: *"same source re-upload => idempotent
   * outcome"*). Mot nguoi doi soat bam nhap hai lan vi trang tai cham la chuyen thuong ngay, va
   * lan thu hai khong duoc de lai mot ban sao nao.
   */
  'TOLL_IMPORT_REPLAYED',
  'TOLL_IMPORT_MAPPING_MISSING',
  'TOLL_IMPORT_MAPPING_INCOMPLETE',
  'TOLL_IMPORT_NO_ROWS',
  /** Duong `API`: khong nha cung cap nao cong bo tai lieu, nen khong adapter nao duoc dang ky. */
  'TOLL_IMPORT_API_UNAVAILABLE',
] as const;
export type TollImportReason = (typeof TOLL_IMPORT_REASONS)[number];

/* ------------------------------------------------------------------ *
 * toll_import.row -- mot dong bi tu choi luc doc
 * ------------------------------------------------------------------ */
export const TOLL_IMPORT_ROW_REASONS = [
  'TOLL_ROW_ACCEPTED',
  'TOLL_ROW_UNPARSEABLE',
  'TOLL_ROW_MISSING_AMOUNT',
  'TOLL_ROW_MISSING_DATE',
  'TOLL_ROW_DATE_INVALID',
  'TOLL_ROW_AMOUNT_INVALID',
  'TOLL_ROW_ACCOUNT_MISSING',
  'TOLL_ROW_PLATE_MISSING',
  'TOLL_ROW_KIND_UNKNOWN',
] as const;
export type TollImportRowReason = (typeof TOLL_IMPORT_ROW_REASONS)[number];

/* ------------------------------------------------------------------ *
 * toll_candidate.classify -- phan loai mot dong DA DOC DUOC
 * ------------------------------------------------------------------ */
export const TOLL_CLASSIFY_REASONS = [
  'TOLL_MATCHED',
  /** So tai khoan tren dong khong ung voi mot tai khoan giao thong nao da khai. */
  'TOLL_ACCOUNT_UNRESOLVED',
  /** Dong CO bien so nhung khong ban ghi noi nao dang hieu luc dua no ve mot xe cua B. */
  'TOLL_VEHICLE_UNRESOLVED',
  /**
   * Bien so ung voi NHIEU xe/ban ghi noi cung luc.
   *
   * Ve phap ly dieu nay khong duoc phep (ND 119 D.11 kh.3), nen khi no xay ra thi du lieu noi
   * dang hong — va cach dung la NEU RA cho nguoi xem, tuyet doi khong nhat dai lay cai dau tien.
   */
  'TOLL_VEHICLE_AMBIGUOUS',
  /**
   * Dau van trung mot dong khac. KHONG tu loai: VETC tu cong bo rang loi doc cheo lan sinh ra HAI
   * giao dich cho MOT luot xe, roi hoan mot giao dich. Gop hai dong do lai se lam dong hoan tien
   * mo coi va so du suy ra sai. Xem `transport-etc-ingestion.md` §5.1.
   */
  'TOLL_DUPLICATE_CANDIDATE',
] as const;
export type TollClassifyReason = (typeof TOLL_CLASSIFY_REASONS)[number];

/* ------------------------------------------------------------------ *
 * toll_account.link -- noi mot xe vao mot tai khoan giao thong
 * ------------------------------------------------------------------ */
export const TOLL_LINK_REASONS = [
  'TOLL_LINK_OPENED',
  'TOLL_LINK_CLOSED',
  /** ND 119 D.11 kh.3 — mot xe chi nhan chi tra tu MOT tai khoan tai mot thoi diem. */
  'TOLL_LINK_VEHICLE_ALREADY_LINKED',
  'TOLL_LINK_ACCOUNT_INACTIVE',
  'TOLL_LINK_PERIOD_INVALID',
] as const;
export type TollLinkReason = (typeof TOLL_LINK_REASONS)[number];

/* ------------------------------------------------------------------ *
 * toll_review.resolve -- mot quyet dinh cua nguoi doi soat
 * ------------------------------------------------------------------ */
export const TOLL_REVIEW_REASONS = [
  'TOLL_REVIEW_VEHICLE_RESOLVED',
  'TOLL_REVIEW_CONFIRMED',
  'TOLL_REVIEW_DUPLICATE_FLAGGED',
  /** Nguoi doi soat noi HAI DONG GIONG NHAU LA THAT — dung tinh huong doc cheo lan cua VETC. */
  'TOLL_REVIEW_DUPLICATE_CLEARED',
  'TOLL_REVIEW_REOPENED',
  'TOLL_REVIEW_CANDIDATE_REJECTED',
  'TOLL_REVIEW_VEHICLE_NOT_APPLICABLE',
] as const;
export type TollReviewReason = (typeof TOLL_REVIEW_REASONS)[number];

export type TransportTollDecisionReason =
  | TollImportReason
  | TollImportRowReason
  | TollClassifyReason
  | TollLinkReason
  | TollReviewReason;

export const TRANSPORT_TOLL_DECISIONS = defineDecisionVocabulary({
  owner: 'transport-toll',
  points: [
    'toll_import.commit',
    'toll_import.row',
    'toll_candidate.classify',
    'toll_account.link',
    'toll_review.resolve',
  ],
  labels: {
    TOLL_IMPORT_ACCEPTED: 'Da nap mot nguon du lieu ETC',
    TOLL_IMPORT_REPLAYED: 'Dung tep da nap — tra ve lan nhap cu, khong tao ban thu hai',
    TOLL_IMPORT_MAPPING_MISSING: 'Goi khach chua khai bo cot cho nha cung cap nay',
    TOLL_IMPORT_MAPPING_INCOMPLETE: 'Tep thieu cot bat buoc theo bo cot da khai',
    TOLL_IMPORT_NO_ROWS: 'Tep khong co dong du lieu nao',
    TOLL_IMPORT_API_UNAVAILABLE: 'Khong nha cung cap nao cong bo API — khong adapter nao dang ky',
    TOLL_ROW_ACCEPTED: 'Doc duoc dong',
    TOLL_ROW_UNPARSEABLE: 'Dong khong doc duoc',
    TOLL_ROW_MISSING_AMOUNT: 'Dong thieu so tien',
    TOLL_ROW_MISSING_DATE: 'Dong thieu ngay',
    TOLL_ROW_DATE_INVALID: 'Ngay tren dong khong doc duoc',
    TOLL_ROW_AMOUNT_INVALID: 'So tien tren dong khong doc duoc',
    TOLL_ROW_ACCOUNT_MISSING: 'Dong khong co so tai khoan giao thong',
    TOLL_ROW_PLATE_MISSING: 'Luot qua tram khong co bien so',
    TOLL_ROW_KIND_UNKNOWN: 'Loai giao dich khong nhan ra',
    TOLL_MATCHED: 'Dong da noi duoc ve tai khoan va (neu co bien so) ve xe',
    TOLL_ACCOUNT_UNRESOLVED: 'Chua khai tai khoan giao thong nay',
    TOLL_VEHICLE_UNRESOLVED: 'Bien so chua noi ve xe nao cua doi xe',
    TOLL_VEHICLE_AMBIGUOUS: 'Bien so ung voi nhieu xe cung luc — du lieu noi dang hong',
    TOLL_DUPLICATE_CANDIDATE: 'Trung dau van voi mot dong khac — can nguoi xem',
    TOLL_LINK_OPENED: 'Da mo ban ghi noi xe voi tai khoan giao thong',
    TOLL_LINK_CLOSED: 'Da dong ban ghi noi',
    TOLL_LINK_VEHICLE_ALREADY_LINKED: 'Xe dang noi voi mot tai khoan giao thong khac',
    TOLL_LINK_ACCOUNT_INACTIVE: 'Tai khoan giao thong khong con hieu luc',
    TOLL_LINK_PERIOD_INVALID: 'Khoang hieu luc khong hop le',
    TOLL_REVIEW_VEHICLE_RESOLVED: 'Nguoi doi soat da chon xe cho dong nay',
    TOLL_REVIEW_CONFIRMED: 'Nguoi doi soat da xac nhan dong nay la dung du kien nha cung cap',
    TOLL_REVIEW_DUPLICATE_FLAGGED: 'Nguoi doi soat danh dau dong nay trung mot dong khac',
    TOLL_REVIEW_DUPLICATE_CLEARED: 'Nguoi doi soat khang dinh hai dong giong nhau la hai su kien that',
    TOLL_REVIEW_REOPENED: 'Mo lai mot dong da xac nhan',
    TOLL_REVIEW_CANDIDATE_REJECTED: 'Dong bi tu choi luc doc thi khong doi soat duoc',
    TOLL_REVIEW_VEHICLE_NOT_APPLICABLE: 'Dong nay khong gan xe (nap tien / phi tai khoan)',
  } satisfies Record<TransportTollDecisionReason, string>,
});
