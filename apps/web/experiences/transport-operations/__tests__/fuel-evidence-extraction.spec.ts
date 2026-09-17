import { describe, expect, it } from 'vitest';
import {
  extractStoredFuelEvidence,
  fuelEvidenceSourceRef,
  receiptMediaTypeOf,
  StoredEvidenceExtractionError,
  type ExtractionDeps,
} from '../fuel-evidence-extraction';
import type {
  FuelDocument,
  FuelDocumentDetail,
  FuelDocumentReview,
  IngestFuelReceiptImageInput,
} from '../fuel-review-types';
import { TransportApiError } from '../transport-api';

/**
 * SEAM "doc anh chung tu DA LUU" — `#313`.
 *
 * Ba dieu duoc khoa o day:
 *   1. Cua vao la `evidenceId` — dinh vi kho KHONG bao gio di vao than yeu cau, ke ca khi doi tuong
 *      bang chung o tay client co mang no (DTO chi tiet phieu tren `main` hom nay van mang).
 *   2. PDF khong bi tai ve roi moi bi tu choi: chan TRUOC khi tai.
 *   3. `413` cua may chu (tran than JSON 100 kb do duoc tren `main`) thanh mot ket cuc CO TEN,
 *      khong phai "he thong loi".
 */

const document = (overrides: Partial<FuelDocument> = {}): FuelDocument => ({
  id: 'chung-tu-1',
  kind: 'RECEIPT_IMAGE',
  sourceRef: 'fuel-evidence:anh-1',
  contentDigest: 'a'.repeat(64),
  byteSize: 1_234,
  sellerTaxCodeRaw: '0100100100',
  supplierId: 'cay-xang-1',
  status: 'PARSED',
  rejectReason: null,
  duplicateOfId: null,
  candidateCount: 1,
  receivedAt: '2026-09-16T01:00:00.000Z',
  receivedBy: 'ke-toan',
  ...overrides,
});

const reviewOf = (doc: FuelDocument): FuelDocumentReview => ({ document: doc, candidates: [] });

interface Recorder {
  readonly calls: string[];
  readonly ingested: IngestFuelReceiptImageInput[];
}

const fakeDeps = (
  options: {
    readonly blobType?: string;
    readonly ingest?: (input: IngestFuelReceiptImageInput) => Promise<FuelDocumentDetail>;
    readonly reviews?: Readonly<Record<string, FuelDocumentReview>>;
  } = {},
): ExtractionDeps & Recorder => {
  const calls: string[] = [];
  const ingested: IngestFuelReceiptImageInput[] = [];
  return {
    calls,
    ingested,
    evidenceBytes: async (entryId, evidenceId) => {
      calls.push(`bytes:${entryId}:${evidenceId}`);
      return new Blob([new Uint8Array([0xff, 0xd8, 0xff])], {
        type: options.blobType ?? 'image/jpeg',
      });
    },
    toBase64: async () => {
      calls.push('base64');
      return '/9j/';
    },
    ingestReceiptImage: async (input) => {
      calls.push('ingest');
      ingested.push(input);
      return options.ingest ? options.ingest(input) : { document: document(), candidates: [] };
    },
    documentReview: async (id) => {
      calls.push(`review:${id}`);
      return options.reviews?.[id] ?? reviewOf(document({ id }));
    },
  };
};

describe('extractStoredFuelEvidence', () => {
  it('tai byte BANG evidenceId, gui anh voi sourceRef mo, roi doc ban soat', async () => {
    const deps = fakeDeps();

    const result = await extractStoredFuelEvidence(
      'phieu-1',
      { id: 'anh-1', contentType: 'image/jpeg' },
      deps,
    );

    expect(deps.calls).toEqual(['bytes:phieu-1:anh-1', 'base64', 'ingest', 'review:chung-tu-1']);
    expect(deps.ingested).toEqual([
      { sourceRef: 'fuel-evidence:anh-1', mediaType: 'image/jpeg', contentBase64: '/9j/' },
    ]);
    expect(result.review.document.id).toBe('chung-tu-1');
    expect(result.originalReview).toBeNull();
  });

  it('KHONG chuyen dinh vi kho di dau ca, ke ca khi doi tuong bang chung o client mang no', async () => {
    const deps = fakeDeps();
    const leakyEvidence = {
      id: 'anh-1',
      contentType: 'image/jpeg',
      locator: 'media/transport-evidence/2026/09/bi-mat.jpg',
    };

    await extractStoredFuelEvidence('phieu-1', leakyEvidence, deps);

    const [sent] = deps.ingested;
    expect(Object.keys(sent ?? {}).sort()).toEqual(['contentBase64', 'mediaType', 'sourceRef']);
    expect(JSON.stringify(deps.ingested)).not.toContain('media/transport-evidence');
    expect(deps.calls.join('|')).not.toContain('bi-mat');
  });

  it('PDF bi chan TRUOC khi tai ve — khong mot byte nao di qua mang', async () => {
    const deps = fakeDeps();

    const attempt = extractStoredFuelEvidence(
      'phieu-1',
      { id: 'pdf-1', contentType: 'application/pdf' },
      deps,
    );

    await expect(attempt).rejects.toBeInstanceOf(StoredEvidenceExtractionError);
    await expect(attempt).rejects.toMatchObject({ kind: 'UNSUPPORTED_MEDIA_TYPE' });
    expect(deps.calls).toEqual([]);
  });

  it('loai noi dung may chu tra ve thang loai da khai (anh luu la PNG)', async () => {
    const deps = fakeDeps({ blobType: 'image/png' });

    await extractStoredFuelEvidence('phieu-1', { id: 'anh-1', contentType: 'image/jpeg' }, deps);

    expect(deps.ingested[0]?.mediaType).toBe('image/png');
  });

  it('413 cua may chu -> TRANSPORT_BODY_LIMIT co ten, khong doc ban soat', async () => {
    const deps = fakeDeps({
      ingest: async () => {
        throw new TransportApiError('Không đọc được phản hồi của hệ thống. Hãy thử lại.', 413);
      },
    });

    const attempt = extractStoredFuelEvidence(
      'phieu-1',
      { id: 'anh-1', contentType: 'image/jpeg' },
      deps,
    );

    await expect(attempt).rejects.toMatchObject({ kind: 'TRANSPORT_BODY_LIMIT' });
    expect(deps.calls).not.toContain('review:chung-tu-1');
  });

  it('loi khac (vd 403) di nguyen ra ngoai, khong bi doi ten', async () => {
    const denied = new TransportApiError('Ban khong co quyen thuc hien thao tac nay', 403);
    const deps = fakeDeps({
      ingest: async () => {
        throw denied;
      },
    });

    await expect(
      extractStoredFuelEvidence('phieu-1', { id: 'anh-1', contentType: 'image/jpeg' }, deps),
    ).rejects.toBe(denied);
  });

  it('hoa don TRUNG: doc them ban soat cua chung tu GOC, noi ung vien that dang nam', async () => {
    const duplicate = document({ id: 'chung-tu-2', status: 'DUPLICATE', duplicateOfId: 'goc-1' });
    const original = reviewOf(document({ id: 'goc-1' }));
    const deps = fakeDeps({
      ingest: async () => ({ document: duplicate, candidates: [] }),
      reviews: { 'chung-tu-2': reviewOf(duplicate), 'goc-1': original },
    });

    const result = await extractStoredFuelEvidence(
      'phieu-1',
      { id: 'anh-1', contentType: 'image/jpeg' },
      deps,
    );

    expect(result.review.document.status).toBe('DUPLICATE');
    expect(result.originalReview).toBe(original);
  });
});

describe('receiptMediaTypeOf', () => {
  it.each([
    ['image/jpeg', 'image/jpeg'],
    ['IMAGE/PNG', 'image/png'],
    ['image/webp; charset=binary', 'image/webp'],
    ['application/pdf', null],
    ['image/svg+xml', null],
    [null, null],
    ['', null],
  ])('%s -> %s', (input, expected) => {
    expect(receiptMediaTypeOf(input)).toBe(expected);
  });
});

describe('fuelEvidenceSourceRef', () => {
  it('chi mang id cua anh, khong mang dinh vi kho', () => {
    expect(fuelEvidenceSourceRef('anh-1')).toBe('fuel-evidence:anh-1');
  });
});
