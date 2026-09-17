import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  extractStoredFuelEvidence,
  receiptMediaTypeOf,
  StoredEvidenceExtractionError,
  type ExtractionDeps,
} from '../fuel-evidence-extraction';
import type { FuelDocument, FuelDocumentDetail, FuelDocumentReview } from '../fuel-review-types';
import { TransportApiError } from '../transport-api';

/**
 * SEAM "doc anh chung tu DA LUU" — `#313`, noi vao route may chu o `#317`.
 *
 * Ba dieu duoc khoa o day:
 *   1. Cua vao la HAI `id` tren duong dan — khong than yeu cau, khong byte, khong dinh vi kho, ke ca
 *      khi doi tuong bang chung o tay client co mang them truong.
 *   2. PDF bi chan TRUOC khi goi may chu.
 *   3. Seam KHONG con tai byte ve / doi base64: route may chu lam viec do, nen anh lon khong con vuong
 *      tran than JSON cua API (va gioi han do KHONG bi nang — quyet dinh chu so huu).
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
  /** Moi doi so tung di vao lan goi `extract` — de khang dinh khong truong la nao lot ra. */
  readonly extractArgs: unknown[][];
}

const fakeDeps = (
  options: {
    readonly extract?: (entryId: string, evidenceId: string) => Promise<FuelDocumentDetail>;
    readonly reviews?: Readonly<Record<string, FuelDocumentReview>>;
  } = {},
): ExtractionDeps & Recorder => {
  const calls: string[] = [];
  const extractArgs: unknown[][] = [];
  return {
    calls,
    extractArgs,
    extractStoredEvidence: async (...args) => {
      const [entryId, evidenceId] = args;
      calls.push(`extract:${entryId}:${evidenceId}`);
      extractArgs.push(args);
      return options.extract
        ? options.extract(entryId, evidenceId)
        : { document: document(), candidates: [] };
    },
    documentReview: async (id) => {
      calls.push(`review:${id}`);
      return options.reviews?.[id] ?? reviewOf(document({ id }));
    },
  };
};

describe('extractStoredFuelEvidence — route may chu theo evidenceId', () => {
  it('goi route bang HAI id, roi doc ban soat — khong tai byte, khong base64', async () => {
    const deps = fakeDeps();

    const result = await extractStoredFuelEvidence(
      'phieu-1',
      { id: 'anh-1', contentType: 'image/jpeg' },
      deps,
    );

    expect(deps.calls).toEqual(['extract:phieu-1:anh-1', 'review:chung-tu-1']);
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

    expect(deps.extractArgs).toEqual([['phieu-1', 'anh-1']]);
    expect(JSON.stringify(deps.extractArgs)).not.toContain('media/transport-evidence');
    expect(deps.calls.join('|')).not.toContain('bi-mat');
  });

  it('PDF bi chan TRUOC khi goi may chu — khong mot lan doc nao bi ton', async () => {
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

  it('loi cua may chu (vd 404 byte khong con trong kho) di nguyen ra ngoai, khong doc ban soat', async () => {
    const missing = new TransportApiError('Byte cua bang chung khong con trong kho anh', 404);
    const deps = fakeDeps({
      extract: async () => {
        throw missing;
      },
    });

    await expect(
      extractStoredFuelEvidence('phieu-1', { id: 'anh-1', contentType: 'image/jpeg' }, deps),
    ).rejects.toBe(missing);
    expect(deps.calls).toEqual(['extract:phieu-1:anh-1']);
  });

  it('hoa don TRUNG: doc them ban soat cua chung tu GOC, noi ung vien that dang nam', async () => {
    const duplicate = document({ id: 'chung-tu-2', status: 'DUPLICATE', duplicateOfId: 'goc-1' });
    const original = reviewOf(document({ id: 'goc-1' }));
    const deps = fakeDeps({
      extract: async () => ({ document: duplicate, candidates: [] }),
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

  /**
   * Doi chieu voi CHINH route may chu: duong dan client goi phai la route `:evidenceId/extract` cua
   * `FuelEvidenceController`, va route do khong nhan than yeu cau (`@Body`). Mot lan doi ten route o
   * mot ben ma quen ben kia se do o day, khong phai o lan bam dau tien tren ban da trien khai.
   */
  it('duong dan client khop route `FuelEvidenceController.extract` va route do khong co `@Body`', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const client = readFileSync(resolve(here, '../transport-api.ts'), 'utf8');
    const controller = readFileSync(
      resolve(here, '../../../../api/src/transport/evidence/fuel-evidence.controller.ts'),
      'utf8',
    );

    expect(client).toContain('/evidence/${encodeURIComponent(evidenceId)}/extract`');
    expect(controller).toContain("@Controller('transport/fuel/entries/:id/evidence')");
    expect(controller).toContain("@Post(':evidenceId/extract')");
    const extractMethod = controller.slice(controller.indexOf("@Post(':evidenceId/extract')"));
    const start = extractMethod.indexOf('extract(');
    const signature = extractMethod.slice(start, extractMethod.indexOf('): Promise', start));
    // Doi chung duong: chu ky that su da duoc cat ra (co hai `@Param`), nen `not.toContain` co nghia.
    expect(signature).toContain("@Param('evidenceId')");
    expect(signature).not.toContain('@Body');
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
