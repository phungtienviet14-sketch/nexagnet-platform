import { readFileAsBase64 } from './file-base64';
import {
  FUEL_RECEIPT_MEDIA_TYPES,
  type FuelDocumentDetail,
  type FuelDocumentReview,
  type FuelReceiptMediaType,
  type IngestFuelReceiptImageInput,
} from './fuel-review-types';
import { TransportApiError, transportApi } from './transport-api';

/**
 * DOC MOT ANH CHUNG TU DA LUU — seam phia client cua `#313`.
 *
 * ================================================================================================
 * CUA VAO LA `evidenceId`, KHONG BAO GIO LA DINH VI KHO
 * ================================================================================================
 *
 * Byte duoc tai ve qua route CO XAC THUC `GET .../entries/:id/evidence/:evidenceId`, roi gui vao
 * `POST /transport/fuel/documents/image` — hai duong da co tren `main`. Than yeu cau chi mang
 * `sourceRef = fuel-evidence:<evidenceId>`, `mediaType` va byte; khong mot truong nao cua doi tuong
 * bang chung duoc chuyen tiep nguyen khoi, nen mot `locator` con sot trong DTO (chi tiet phieu tren
 * `main` van tra no) khong co duong nao di ra.
 *
 * ================================================================================================
 * GIOI HAN DA DO — VA VI SAO NO CO TEN RIENG
 * ================================================================================================
 *
 * API tao app bang `NestFactory.create()` mac dinh, tuc than JSON toi da 100 kb (do: 99 kb -> 201,
 * 150 kb -> 413). Anh chup that tu dien thoai lon hon the rat nhieu, nen tren `main` duong nay chi
 * doc duoc anh nho; anh lon ra `413`. `TRANSPORT_BODY_LIMIT` bien no thanh mot cau noi dung su that
 * thay vi "khong doc duoc phan hoi". Duong doc anh DA LUU khong qua than yeu cau thuoc PR #308; khi
 * no vao `main`, chi can doi phan than cua ham nay.
 *
 * `sourceRef` o duong nay la do CLIENT khai: ke toan co quyen nhap chung tu von da gui duoc bat ky
 * anh nao voi bat ky `sourceRef` nao, nen seam nay khong mo rong quyen — nhung no cung khong phai
 * mot rang buoc phia may chu giua chung tu va tam anh.
 */

export const FUEL_EVIDENCE_SOURCE_PREFIX = 'fuel-evidence:';

export const fuelEvidenceSourceRef = (evidenceId: string): string =>
  `${FUEL_EVIDENCE_SOURCE_PREFIX}${evidenceId}`;

export type StoredEvidenceExtractionFailure = 'UNSUPPORTED_MEDIA_TYPE' | 'TRANSPORT_BODY_LIMIT';

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
  readonly evidenceBytes: (entryId: string, evidenceId: string) => Promise<Blob>;
  readonly toBase64: (blob: Blob) => Promise<string>;
  readonly ingestReceiptImage: (input: IngestFuelReceiptImageInput) => Promise<FuelDocumentDetail>;
  readonly documentReview: (id: string) => Promise<FuelDocumentReview>;
}

const DEFAULT_DEPS: ExtractionDeps = {
  evidenceBytes: (entryId, evidenceId) => transportApi.fuel.evidenceBytes(entryId, evidenceId),
  toBase64: readFileAsBase64,
  ingestReceiptImage: (input) => transportApi.fuel.ingestReceiptImage(input),
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

export const TRANSPORT_BODY_LIMIT_MESSAGE =
  'Ảnh này lớn hơn giới hạn gửi đọc của máy chủ hiện tại nên chưa đọc được. Ảnh gốc vẫn còn nguyên — hãy đối chiếu trực tiếp trên ảnh.';

export async function extractStoredFuelEvidence(
  entryId: string,
  evidence: StoredEvidenceRef,
  deps: ExtractionDeps = DEFAULT_DEPS,
): Promise<StoredEvidenceExtraction> {
  // Chan TRUOC khi tai: mot PDF vai megabyte tai ve chi de bi tu choi la phi bang thong cua nguoi
  // dung va phi mot lan tai vao route doc byte.
  const declared = receiptMediaTypeOf(evidence.contentType);
  if (declared === null) {
    throw new StoredEvidenceExtractionError('UNSUPPORTED_MEDIA_TYPE', UNSUPPORTED_EVIDENCE_MESSAGE);
  }

  const blob = await deps.evidenceBytes(entryId, evidence.id);
  // Loai may chu PHUC VU thang loai da khai. Bo doc phia may chu van so byte dau tep.
  const mediaType = receiptMediaTypeOf(blob.type) ?? declared;
  const contentBase64 = await deps.toBase64(blob);

  let detail: FuelDocumentDetail;
  try {
    detail = await deps.ingestReceiptImage({
      sourceRef: fuelEvidenceSourceRef(evidence.id),
      mediaType,
      contentBase64,
    });
  } catch (error) {
    if (error instanceof TransportApiError && error.status === 413) {
      throw new StoredEvidenceExtractionError('TRANSPORT_BODY_LIMIT', TRANSPORT_BODY_LIMIT_MESSAGE);
    }
    throw error;
  }

  const review = await deps.documentReview(detail.document.id);
  const originalReview =
    detail.document.status === 'DUPLICATE' && detail.document.duplicateOfId !== null
      ? await deps.documentReview(detail.document.duplicateOfId)
      : null;
  return { review, originalReview };
}
