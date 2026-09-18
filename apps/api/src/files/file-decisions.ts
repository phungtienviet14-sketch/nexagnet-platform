import { defineDecisionVocabulary } from '../observability/decision-vocabulary.js';
import type { FileRejection } from './file-policy.js';

/**
 * TU VUNG QUYET DINH cua nen tang tep — `#287` P7.
 *
 * ============================================================================================
 * MOT BO RIENG, thuoc `foundation`
 * ============================================================================================
 *
 * `.claude/rules/ecc/common/code-review.md`: tu vung quyet dinh thuoc ve CAPABILITY so huu, va
 * `observability/decision-vocabulary.ts` *"khong duoc nhac mot thuat ngu nghiep vu nao"*. Nen tang
 * tep khong phai mot capability bat/tat duoc — moi khach deu co tep — nen `owner` la `foundation`,
 * cung ly le voi `ObservabilityModule` va `SourceRegistryModule`.
 *
 * KHONG mot ma nao o day nhac ten mot mien. `FILE_LINK_OWNER_UNKNOWN` chu khong
 * `FILE_NOT_A_TRANSPORT_DOCUMENT`: mien nao gan thi mien do co tu vung cua chinh no.
 *
 * ============================================================================================
 * KHONG MOT MA NAO MANG MOT DINH VI
 * ============================================================================================
 *
 * `#287` P7: *"Never log raw bytes, credentials, signed URLs, private storage paths"*. Nen `detail`
 * cua moi lan goi `telemetry.decision()` trong mien nay chi duoc mang `fileId`, kich thuoc, loai
 * tep va ten trang thai — KHONG `storageKey`. `file-public-surface.spec.ts` quet ma nguon de giu.
 */

/* ------------------------------------------------------------------ *
 * file.stage — mot lan dat byte vao kho
 * ------------------------------------------------------------------ */
export const FILE_STAGE_REASONS = [
  'FILE_STAGED',
  /**
   * Kho dang TAT (`MEDIA_STORE=none`, mac dinh demo/CI) — FAIL-CLOSED, khong bo qua im lang.
   *
   * Cung ly le voi `EVIDENCE_STORE_DISABLED`: neu cu chay tiep thi nguoi dung thay "tai len xong",
   * mot hang metadata duoc ghi, va BYTE KHONG TON TAI o dau ca — lo ra dung luc ke toan mo tep do
   * de doi chieu, co the vai tuan sau.
   */
  'FILE_STORE_DISABLED',
  'FILE_EMPTY',
  'FILE_TOO_LARGE',
  'FILE_MIME_NOT_ALLOWED',
  /** Byte dau tep khong khop loai nguoi gui khai — `#287` P5. */
  'FILE_CONTENT_MISMATCH',
  /** Tep thuc thi / kho nen / tai lieu trinh duyet chay duoc. Chan truoc ca danh sach trang. */
  'FILE_ACTIVE_CONTENT_REJECTED',
] as const;
export type FileStageReason = (typeof FILE_STAGE_REASONS)[number];

/**
 * Khang dinh o TANG KIEU: them mot duong tu choi vao `file-policy.ts` ma quen khai o day thi `tsc`
 * do — khong phai mot lan `telemetry.decision()` nem luc chay.
 */
const _rejectionsAreStageReasons = [
  'FILE_EMPTY',
  'FILE_TOO_LARGE',
  'FILE_MIME_NOT_ALLOWED',
  'FILE_CONTENT_MISMATCH',
  'FILE_ACTIVE_CONTENT_REJECTED',
] as const satisfies readonly FileStageReason[] & readonly FileRejection[];
void _rejectionsAreStageReasons;

/* ------------------------------------------------------------------ *
 * file.activate — tep tro thanh bang chung dung nghia
 * ------------------------------------------------------------------ */
export const FILE_ACTIVATE_REASONS = [
  'FILE_ACTIVATED',
  /** Quet dat o muc BAT BUOC va tep chua qua may quet nao — `#287` P5, fail-closed. */
  'FILE_SCAN_REQUIRED',
  'FILE_SCAN_INFECTED',
  'FILE_SCAN_FAILED',
  /** Tep khong o `STAGED` — mot tep da rut/da cach ly khong "kich hoat lai" duoc. */
  'FILE_NOT_STAGED',
] as const;
export type FileActivateReason = (typeof FILE_ACTIVATE_REASONS)[number];

/* ------------------------------------------------------------------ *
 * file.link — gan tep vao mot doi tuong nghiep vu
 * ------------------------------------------------------------------ */
export const FILE_LINK_REASONS = [
  'FILE_LINKED',
  /** Tep khong ton tai HOAC khong thuoc pham vi nguoi goi — MOT ma cho ca hai, chong do dem. */
  'FILE_NOT_AVAILABLE_TO_CALLER',
  'FILE_NOT_ACTIVE',
  /** Khong mien nao dang ky ten so huu do — fail closed, `#287` P6. */
  'FILE_LINK_OWNER_UNKNOWN',
  /** Mien tu choi cho gan vao doi tuong do. */
  'FILE_LINK_DENIED_BY_DOMAIN',
  /** Da co dung lien ket do dang hieu luc — lam lai mot lan gan la khong doi gi. */
  'FILE_LINK_ALREADY_ACTIVE',
] as const;
export type FileLinkReason = (typeof FILE_LINK_REASONS)[number];

/* ------------------------------------------------------------------ *
 * file.read — mot lan doc/xem lai
 * ------------------------------------------------------------------ */
export const FILE_READ_REASONS = [
  'FILE_SERVED',
  'FILE_NOT_AVAILABLE_TO_CALLER',
  'FILE_NOT_ACTIVE',
  /** Co hang metadata nhung khong con byte trong kho — mot trang thai NGHIEP VU doc duoc. */
  'FILE_OBJECT_MISSING',
  /** `storageKey` khong tro vao khu cua nen tang tep. Mot lan tu choi CO CHU DICH. */
  'FILE_KEY_OUT_OF_SCOPE',
] as const;
export type FileReadReason = (typeof FILE_READ_REASONS)[number];

/* ------------------------------------------------------------------ *
 * file.withdraw — rut mot tep khoi ho so
 * ------------------------------------------------------------------ */
export const FILE_WITHDRAW_REASONS = [
  'FILE_WITHDRAWN',
  'FILE_NOT_AVAILABLE_TO_CALLER',
  /** Mot mien da chot bang chung: khong AI rut duoc nua — `#287` P3 bat bien 6. */
  'FILE_WITHDRAWAL_LOCKED_BY_DOMAIN',
  'FILE_WITHDRAW_DENIED_BY_DOMAIN',
  'FILE_LINK_OWNER_UNKNOWN',
  /** Tep da o trang thai cuoi — rut lai la khong doi gi. */
  'FILE_ALREADY_INACTIVE',
] as const;
export type FileWithdrawReason = (typeof FILE_WITHDRAW_REASONS)[number];

/* ------------------------------------------------------------------ *
 * file.purge — don BYTE, mot buoc RIENG va lam lai duoc (`#287` P3/P8)
 * ------------------------------------------------------------------ */
export const FILE_PURGE_REASONS = [
  'FILE_PURGED',
  /** Lam lai mot lan don da xong: khong doi gi, va khong phai loi — `#287` P12 bai 8. */
  'FILE_PURGE_ALREADY_DONE',
  /** Tep chua duoc rut khoi nghiep vu — khong duoc don byte cua mot bang chung dang hieu luc. */
  'FILE_PURGE_STILL_IN_BUSINESS_USE',
  /** Chua toi han giu — `#287` P8. */
  'FILE_PURGE_BLOCKED_BY_RETENTION',
  /** Dang giu theo lenh phap ly — chan VO THOI HAN. */
  'FILE_PURGE_BLOCKED_BY_LEGAL_HOLD',
  /**
   * Kho khong don duoc byte (`MEDIA_STORE=none`, hoac kho khong hien thuc `remove`).
   *
   * Mot ma RIENG chu khong mot loi: tep DA bien mat khoi ho so dung nhu nguoi dung yeu cau, chi con
   * lai mot object khong ai tro toi — va nguoi van hanh phai thay duoc dong nay de don tay.
   */
  'FILE_PURGE_UNSUPPORTED',
  /** Lenh don byte da chay va HONG. Lam lai duoc — `#287` P3 bat bien 5. */
  'FILE_PURGE_FAILED',
] as const;
export type FilePurgeReason = (typeof FILE_PURGE_REASONS)[number];

/* ------------------------------------------------------------------ *
 * file.quarantine — ket qua may quet (`#287` P5)
 * ------------------------------------------------------------------ */
export const FILE_QUARANTINE_REASONS = ['FILE_QUARANTINED', 'FILE_SCAN_CLEAN'] as const;
export type FileQuarantineReason = (typeof FILE_QUARANTINE_REASONS)[number];

/* ------------------------------------------------------------------ *
 * file.orphan — phep do mo coi, CHAY THU (`#287` P8)
 * ------------------------------------------------------------------ */
export const FILE_ORPHAN_REASONS = [
  /** Co hang metadata, khong con byte. */
  'FILE_ORPHAN_METADATA_WITHOUT_BLOB',
  /** Da quet xong va khong thay gi le loi. */
  'FILE_ORPHAN_NONE',
  /** Kho khong tra loi duoc `stat()` — phep do KHONG ket luan duoc, va phai noi ra. */
  'FILE_ORPHAN_SCAN_UNSUPPORTED',
] as const;
export type FileOrphanReason = (typeof FILE_ORPHAN_REASONS)[number];

export type FileDecisionReason =
  | FileStageReason
  | FileActivateReason
  | FileLinkReason
  | FileReadReason
  | FileWithdrawReason
  | FilePurgeReason
  | FileQuarantineReason
  | FileOrphanReason;

export const FILE_DECISIONS = defineDecisionVocabulary({
  owner: 'foundation',
  points: [
    'file.stage',
    'file.activate',
    'file.link',
    'file.read',
    'file.withdraw',
    'file.purge',
    'file.quarantine',
    'file.orphan',
  ],
  labels: {
    FILE_STAGED: 'Đã nhận tệp vào kho, chờ kích hoạt',
    FILE_STORE_DISABLED: 'Kho tệp đang tắt — từ chối thay vì nhận rồi vứt',
    FILE_EMPTY: 'Tệp rỗng — không có gì để lưu',
    FILE_TOO_LARGE: 'Tệp vượt giới hạn dung lượng của mục đích này',
    FILE_MIME_NOT_ALLOWED: 'Loại tệp không nằm trong danh sách cho phép của mục đích này',
    FILE_CONTENT_MISMATCH: 'Nội dung tệp không khớp loại người gửi khai',
    FILE_ACTIVE_CONTENT_REJECTED: 'Tệp chứa nội dung chạy được — từ chối',

    FILE_ACTIVATED: 'Tệp đã thành bằng chứng đúng nghĩa',
    FILE_SCAN_REQUIRED: 'Cấu hình bắt buộc quét nhưng tệp chưa qua máy quét nào',
    FILE_SCAN_INFECTED: 'Máy quét kết luận tệp nhiễm — chuyển cách ly',
    FILE_SCAN_FAILED: 'Máy quét không kết luận được — chuyển cách ly, không cho qua',
    FILE_NOT_STAGED: 'Tệp không ở trạng thái chờ kích hoạt',

    FILE_LINKED: 'Đã gắn tệp vào một đối tượng nghiệp vụ',
    FILE_NOT_AVAILABLE_TO_CALLER: 'Mã tệp không tồn tại hoặc không thuộc phạm vi người gọi',
    FILE_NOT_ACTIVE: 'Tệp đã bị rút hoặc đang bị cách ly',
    FILE_LINK_OWNER_UNKNOWN: 'Không miền nào nhận trả lời quyền cho loại đối tượng đó — từ chối',
    FILE_LINK_DENIED_BY_DOMAIN: 'Miền nghiệp vụ từ chối cho gắn tệp vào đối tượng đó',
    FILE_LINK_ALREADY_ACTIVE: 'Liên kết đó đã tồn tại và đang hiệu lực',

    FILE_SERVED: 'Đã trả tệp cho người có quyền xem',
    FILE_OBJECT_MISSING: 'Có dòng metadata nhưng không còn byte trong kho',
    FILE_KEY_OUT_OF_SCOPE: 'Khóa lưu trữ trỏ ra ngoài khu của nền tảng tệp — từ chối đọc',

    FILE_WITHDRAWN: 'Đã rút tệp khỏi hồ sơ; lịch sử ở lại',
    FILE_WITHDRAWAL_LOCKED_BY_DOMAIN: 'Miền đã chốt bằng chứng — không ai rút được nữa',
    FILE_WITHDRAW_DENIED_BY_DOMAIN: 'Miền nghiệp vụ từ chối lần rút này',
    FILE_ALREADY_INACTIVE: 'Tệp đã ở trạng thái cuối — rút lại không đổi gì',

    FILE_PURGED: 'Đã dọn byte khỏi kho sau khi tệp được rút',
    FILE_PURGE_ALREADY_DONE: 'Byte đã được dọn từ trước — làm lại không đổi gì',
    FILE_PURGE_STILL_IN_BUSINESS_USE: 'Tệp vẫn đang là bằng chứng hiệu lực — chưa được dọn byte',
    FILE_PURGE_BLOCKED_BY_RETENTION: 'Chưa tới hạn lưu trữ — chặn dọn byte',
    FILE_PURGE_BLOCKED_BY_LEGAL_HOLD: 'Đang giữ theo lệnh pháp lý — chặn dọn byte',
    FILE_PURGE_UNSUPPORTED: 'Đã rút khỏi hồ sơ nhưng kho không dọn được byte — cần một lần dọn tay',
    FILE_PURGE_FAILED: 'Lệnh dọn byte hỏng — trạng thái logic giữ nguyên, làm lại được',

    FILE_QUARANTINED: 'Tệp bị chuyển cách ly',
    FILE_SCAN_CLEAN: 'Máy quét kết luận tệp sạch',

    FILE_ORPHAN_METADATA_WITHOUT_BLOB: 'Có dòng metadata nhưng không còn byte trong kho',
    FILE_ORPHAN_NONE: 'Quét xong, không thấy bản ghi mồ côi nào',
    FILE_ORPHAN_SCAN_UNSUPPORTED: 'Kho không trả lời được — phép đo mồ côi không kết luận được',
  } satisfies Record<FileDecisionReason, string>,
});
