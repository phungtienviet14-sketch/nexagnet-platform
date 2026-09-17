import {
  FUEL_RECEIPT_MEDIA_TYPES,
  type FuelDocumentDetail,
  type FuelDocumentReview,
  type FuelReceiptMediaType,
} from './fuel-review-types';
import { transportApi } from './transport-api';

/**
 * DOC MOT ANH CHUNG TU DA LUU — seam phia client (`#313`, noi vao route may chu o `#317`).
 *
 * ================================================================================================
 * CUA VAO LA `evidenceId`, VA BYTE KHONG DI QUA TRINH DUYET
 * ================================================================================================
 *
 * `POST /transport/fuel/entries/:id/evidence/:evidenceId/extract` (`#308`) nhan DUNG hai `id` tren
 * duong dan va KHONG co than yeu cau. May chu tu tra `evidenceId` ra byte trong kho, doi chieu tam
 * anh voi DUNG phieu, roi dua vao bo doc — `sourceRef` do may chu dat (`fuel-evidence:<id>`), khong
 * con la mot chuoi client khai.
 *
 * Ban `#313` truoc day tai byte ve roi gui lai duoi dang base64 trong than JSON, va vuong tran than
 * JSON 100 kb cua API: anh chup that tu dien thoai ra `413`. Duong nay khong con than yeu cau nao de
 * vuong, nen `#317` KHONG nang gioi han JSON toan cuc (quyet dinh chu so huu) ma bo han duong do.
 *
 * Moi tam anh duoc goi bang `{ id, contentType }` DUNG HAI TRUONG — mot DTO co them truong gi di nua
 * (ke ca mot `locator` sot lai) cung khong co duong nao di vao URL.
 */

/**
 * Tien to `sourceRef` ma MAY CHU dat cho chung tu doc tu mot anh da luu (`fuel-evidence:<id>`).
 * Man hinh chi DOC no de goi ten nguon; client khong con tu dat chuoi nay.
 */
export const FUEL_EVIDENCE_SOURCE_PREFIX = 'fuel-evidence:';

export type StoredEvidenceExtractionFailure = 'UNSUPPORTED_MEDIA_TYPE';

export class StoredEvidenceExtractionError extends Error {
  readonly kind: StoredEvidenceExtractionFailure;

  constructor(kind: StoredEvidenceExtractionFailure, message: string) {
    super(message);
    this.name = 'StoredEvidenceExtractionError';
    this.kind = kind;
  }
}

/** Chi `id` + loai noi dung — dung hai thu man hinh duoc phep biet ve mot tam anh. */
export interface StoredEvidenceRef {
  readonly id: string;
  readonly contentType: string | null;
}

export interface StoredEvidenceExtraction {
  readonly review: FuelDocumentReview;
  /** Chung tu GOC khi hoa don nay da vao he thong tu mot tep khac (`DUPLICATE`). */
  readonly originalReview: FuelDocumentReview | null;
}

export interface ExtractionDeps {
  readonly extractStoredEvidence: (
    entryId: string,
    evidenceId: string,
  ) => Promise<FuelDocumentDetail>;
  readonly documentReview: (id: string) => Promise<FuelDocumentReview>;
}

const DEFAULT_DEPS: ExtractionDeps = {
  extractStoredEvidence: (entryId, evidenceId) =>
    transportApi.fuel.extractStoredEvidence(entryId, evidenceId),
  documentReview: (id) => transportApi.fuel.documentReview(id),
};

/** `image/JPEG; charset=binary` -> `image/jpeg`. Loai khong doc duoc -> `null`. */
export const receiptMediaTypeOf = (
  contentType: string | null | undefined,
): FuelReceiptMediaType | null => {
  const normalized = (contentType ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  return (FUEL_RECEIPT_MEDIA_TYPES as readonly string[]).includes(normalized)
    ? (normalized as FuelReceiptMediaType)
    : null;
};

export const UNSUPPORTED_EVIDENCE_MESSAGE =
  'Chỉ đọc được ảnh JPEG, PNG hoặc WebP. Chứng từ PDF cần kế toán xem trực tiếp.';

export async function extractStoredFuelEvidence(
  entryId: string,
  evidence: StoredEvidenceRef,
  deps: ExtractionDeps = DEFAULT_DEPS,
): Promise<StoredEvidenceExtraction> {
  // Chan TRUOC khi goi: mot PDF gui sang bo doc chi de bi tu choi la mot lan doc ton tien that.
  if (receiptMediaTypeOf(evidence.contentType) === null) {
    throw new StoredEvidenceExtractionError('UNSUPPORTED_MEDIA_TYPE', UNSUPPORTED_EVIDENCE_MESSAGE);
  }

  // CHI hai `id` di ra ngoai — xem khoi chu thich dau tep.
  const detail = await deps.extractStoredEvidence(entryId, evidence.id);

  const review = await deps.documentReview(detail.document.id);
  const originalReview =
    detail.document.status === 'DUPLICATE' && detail.document.duplicateOfId !== null
      ? await deps.documentReview(detail.document.duplicateOfId)
      : null;
  return { review, originalReview };
}
