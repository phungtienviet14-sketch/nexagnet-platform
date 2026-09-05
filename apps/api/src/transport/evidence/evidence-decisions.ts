import { defineDecisionVocabulary } from '../../observability/decision-vocabulary.js';
import type { EvidenceRejection } from './evidence-policy.js';

/**
 * Tu vung quyet dinh cua BANG CHUNG van tai — `#169`.
 *
 * Rieng mot bo thay vi muon `fuel-decisions.ts`: bang chung khong thuoc rieng nhien lieu. Hom nay no
 * gan vao phieu dau, ngay mai gan vao khoan chi cua chuyen (#168 B3), va sau nua co the la giay to
 * xe cua `TX-06`. Nhet vao tu vung cua `TX-04` se lam moi lan mo rong keo theo mot tu vung sai ten.
 */

/* ------------------------------------------------------------------ *
 * evidence.upload — mot lan tai byte len
 * ------------------------------------------------------------------ */
export const EVIDENCE_UPLOAD_REASONS = [
  'EVIDENCE_STORED',
  /**
   * Kho anh dang TAT (`MEDIA_STORE=none`, mac dinh demo/CI).
   *
   * FAIL-CLOSED, khong phai bo qua im lang. `NoopMediaStore.put()` khong nem gi ca, nen neu cu chay
   * tiep thi nguoi dung thay "tai len xong", mot dong bang chung duoc ghi vao Postgres, va anh KHONG
   * TON TAI o dau ca — lo ra dung luc ke toan mo no ra de doi chieu, co the la vai tuan sau.
   * Cung ly le voi `MEDIA_STORE=s3` fail-fast luc boot trong `media.provider.ts`.
   */
  'EVIDENCE_STORE_DISABLED',
  'EVIDENCE_CONTENT_TYPE_NOT_ALLOWED',
  'EVIDENCE_EMPTY',
  'EVIDENCE_TOO_LARGE',
] as const;
export type EvidenceUploadReason = (typeof EVIDENCE_UPLOAD_REASONS)[number];

/* ------------------------------------------------------------------ *
 * evidence.read — mot lan xem lai bang chung
 * ------------------------------------------------------------------ */
export const EVIDENCE_READ_REASONS = [
  'EVIDENCE_SERVED',
  /** Dong bang chung khong thuoc ve chung tu nghiep vu tren duong dan. */
  'EVIDENCE_NOT_ON_RECORD',
  /**
   * Dinh vi khong tro vao khu cua bang chung van tai — xem `isTransportEvidenceLocator`.
   *
   * Day KHONG phai "khong tim thay": no la mot lan tu choi CO CHU DICH, va gop chung se lam mat dau
   * vet cua dung thu dang muon phat hien.
   */
  'EVIDENCE_LOCATOR_OUT_OF_SCOPE',
  /**
   * Co dong bang chung trong Postgres nhung KHONG co byte trong kho.
   *
   * Mot trang thai NGHIEP VU doc duoc, khong phai mot loi ha tang do ra ngoai: kho bi doi, object bi
   * xoa theo vong doi, hoac hang bang chung duoc gieo trong mot moi truong khac. Man hinh noi
   * "khong con anh" chu khong bay mot ngoai le cua SDK luu tru.
   */
  'EVIDENCE_OBJECT_MISSING',
] as const;
export type EvidenceReadReason = (typeof EVIDENCE_READ_REASONS)[number];

export type TransportEvidenceDecisionReason = EvidenceUploadReason | EvidenceReadReason;

/**
 * Ma tu choi cua chinh sach (`EvidenceRejection`) la TAP CON cua ma quyet dinh tai len.
 *
 * Khang dinh o TANG KIEU: neu ai do them mot duong tu choi vao `evidence-policy.ts` ma quen khai o
 * day, `tsc` do — chu khong phai mot lan `telemetry.decision()` nem luc chay.
 */
const _rejectionsAreUploadReasons = [
  'EVIDENCE_CONTENT_TYPE_NOT_ALLOWED',
  'EVIDENCE_EMPTY',
  'EVIDENCE_TOO_LARGE',
] as const satisfies readonly EvidenceUploadReason[] & readonly EvidenceRejection[];
void _rejectionsAreUploadReasons;

export const TRANSPORT_EVIDENCE_DECISIONS = defineDecisionVocabulary({
  owner: 'transport-core',
  points: ['evidence.upload', 'evidence.read'],
  labels: {
    EVIDENCE_STORED: 'Đã lưu bằng chứng và gắn vào chứng từ nghiệp vụ',
    EVIDENCE_STORE_DISABLED: 'Kho ảnh đang tắt — từ chối thay vì nhận rồi vứt',
    EVIDENCE_CONTENT_TYPE_NOT_ALLOWED: 'Loại tệp không nằm trong danh sách cho phép',
    EVIDENCE_EMPTY: 'Tệp rỗng — không có gì để lưu',
    EVIDENCE_TOO_LARGE: 'Tệp vượt giới hạn dung lượng',

    EVIDENCE_SERVED: 'Đã trả bằng chứng cho người có quyền xem',
    EVIDENCE_NOT_ON_RECORD: 'Bằng chứng không thuộc chứng từ nghiệp vụ này',
    EVIDENCE_LOCATOR_OUT_OF_SCOPE: 'Định vị trỏ ra ngoài khu bằng chứng vận tải — từ chối đọc',
    EVIDENCE_OBJECT_MISSING: 'Có dòng bằng chứng nhưng không còn tệp trong kho',
  } satisfies Record<TransportEvidenceDecisionReason, string>,
});
