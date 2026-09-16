import { describe, expect, it } from 'vitest';
import type {
  FuelCandidate,
  FuelCandidateFindingDetail,
  FuelDocument,
  FuelDocumentReview,
} from '../../fuel-review-types';
import {
  CANDIDATE_ONLY_NOTICE,
  toDocumentQueueRows,
  toExtractionReviewModel,
  type DeclaredFuelFacts,
} from '../fuel-extraction';

/**
 * MO HINH SOAT UNG VIEN MAY DOC — `#313`.
 *
 * Man hinh nay khong co mot nut nao "ap dung so may doc vao phieu". Bo test khoa phan con lai: muc
 * tin tung o, o yeu do MAY CHU chi ra, phat hien co ma, va doi chieu tung truong voi to khai — ke
 * ca so hoa don (phan chi-doc cua `G4`).
 */

const doc = (overrides: Partial<FuelDocument> = {}): FuelDocument => ({
  id: 'chung-tu-1',
  kind: 'RECEIPT_IMAGE',
  sourceRef: 'fuel-evidence:anh-1',
  contentDigest: 'b'.repeat(64),
  byteSize: 42_000,
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

const candidate = (overrides: Partial<FuelCandidate> = {}): FuelCandidate => ({
  id: 'ung-vien-1',
  documentId: 'chung-tu-1',
  lineNumber: 1,
  sellerTaxCode: '0100100100',
  invoiceSymbol: '1C26TAA',
  invoiceNo: '0001234',
  invoiceTemplate: null,
  sellerName: 'Cửa hàng xăng dầu số 12',
  stationLabelRaw: 'CHXD số 12',
  stationId: 'tram-12',
  stationMatch: 'RESOLVED',
  issuedDate: '2026-09-15',
  issuedTimeRaw: '07:30',
  litersUnits: 62_500,
  unitPriceUnits: 23_000_000,
  amount: 1_437_500,
  currencyCode: 'VND',
  itemName: 'Dầu DO 0,05S',
  unitRaw: 'Lít',
  plateHintRaw: '29C-123.45',
  plateHintSource: 'BUYER_NAME',
  odometerHintKm: null,
  confidence: {
    invoiceNo: 980,
    invoiceSymbol: 970,
    sellerTaxCode: 990,
    issuedAt: 960,
    'line.1.litersMilli': 950,
    'line.1.unitPriceMilli': 899,
    'line.1.amountVnd': 940,
  },
  createdAt: '2026-09-16T01:00:00.000Z',
  ...overrides,
});

const review = (
  findings: readonly FuelCandidateFindingDetail[] = [],
  overrides: Partial<FuelCandidate> = {},
  document: FuelDocument = doc(),
): FuelDocumentReview => ({
  document,
  candidates: [
    {
      candidate: candidate(overrides),
      assessment: { outcome: findings.length === 0 ? 'NO_FINDINGS' : 'HAS_FINDINGS', findings },
    },
  ],
});

const DECLARED: DeclaredFuelFacts = {
  litersUnits: 62_500,
  amount: 1_437_500,
  invoiceNo: '1234',
  businessDate: '2026-09-15',
  odometerKm: 120_450,
  vehiclePlate: '29C12345',
};

describe('toExtractionReviewModel', () => {
  it('luon noi day chi la de xuat — ke ca khi khong co diem lech nao', () => {
    const model = toExtractionReviewModel({ review: review(), originalReview: null }, DECLARED);

    expect(model.notice).toBe(CANDIDATE_ONLY_NOTICE);
    expect(model.notice).toContain('không sửa phiếu');
    expect(model.notice).toContain('không tạo công nợ');
    expect(model.attentionCount).toBe(0);
    expect(model.headline).toContain('vẫn chỉ là đề xuất');
  });

  it('muc tin tung o hien bang phan tram, va O YEU do may chu chi ra duoc danh dau', () => {
    const model = toExtractionReviewModel(
      {
        review: review([
          {
            finding: 'FIELD_CONFIDENCE_BELOW_FLOOR',
            detail: { fields: 'line.1.unitPriceMilli', floor: 900 },
          },
        ]),
        originalReview: null,
      },
      DECLARED,
    );

    const [card] = model.cards;
    const unitPrice = card?.fields.find((field) => field.key === 'unitPrice');
    // 899/1000 hien "89%", KHONG lam tron len "90%": mot o duoi san 900 ma hien dung con so cua san
    // se doc nhu da dat.
    expect(unitPrice).toMatchObject({ confidenceLabel: '89%', isWeak: true });
    expect(card?.fields.find((field) => field.key === 'liters')).toMatchObject({
      confidenceLabel: '95%',
      isWeak: false,
    });
    expect(card?.findings).toEqual([
      {
        finding: 'FIELD_CONFIDENCE_BELOW_FLOOR',
        label: 'Máy đọc không chắc ở một số ô',
        detailLabel: 'Ô cần nhìn lại: Đơn giá',
      },
    ]);
  });

  it('hoa don dien tu (muc tin null) KHONG bi hien la 0% hay 100%', () => {
    const model = toExtractionReviewModel(
      { review: review([], { confidence: null }), originalReview: null },
      DECLARED,
    );

    for (const field of model.cards[0]?.fields ?? []) {
      expect(field.confidenceLabel).toBeNull();
      expect(field.isWeak).toBe(false);
    }
  });

  it('phat hien so hoc mang so lieu da do de nguoi soat khong phai tinh lai', () => {
    const model = toExtractionReviewModel(
      {
        review: review([
          {
            finding: 'ARITHMETIC_MISMATCH',
            detail: { expectedVnd: 1_437_500, actualVnd: 1_473_500, deltaVnd: 36_000 },
          },
        ]),
        originalReview: null,
      },
      DECLARED,
    );

    expect(model.cards[0]?.findings[0]?.detailLabel).toMatch(/^Tính ra .+, hoá đơn ghi .+$/);
    expect(model.attentionCount).toBe(1);
  });

  it('doi chieu to khai: khop / lech / to khai chua ghi, kem so hoa don sau khi bo so 0 dau', () => {
    const model = toExtractionReviewModel(
      {
        review: review([], { litersUnits: 60_000, amount: 1_437_500, invoiceNo: '0001234' }),
        originalReview: null,
      },
      DECLARED,
    );

    const verdicts = Object.fromEntries(
      (model.cards[0]?.comparisons ?? []).map((row) => [row.key, row.verdict]),
    );
    expect(verdicts).toEqual({
      liters: 'DIFFERENT',
      amount: 'MATCH',
      invoiceNo: 'MATCH',
      date: 'MATCH',
      plate: 'MATCH',
    });
    expect(model.attentionCount).toBe(1);
  });

  it('so hoa don khac nhau hay to khai chua ghi deu duoc noi ra, khong ap nguoc vao phieu', () => {
    const different = toExtractionReviewModel(
      { review: review([], { invoiceNo: '0009999' }), originalReview: null },
      DECLARED,
    );
    const missing = toExtractionReviewModel(
      { review: review(), originalReview: null },
      { ...DECLARED, invoiceNo: null },
    );

    expect(different.cards[0]?.comparisons.find((row) => row.key === 'invoiceNo')).toMatchObject({
      verdict: 'DIFFERENT',
      declaredLabel: '1234',
      receiptLabel: '1C26TAA 0009999',
    });
    expect(missing.cards[0]?.comparisons.find((row) => row.key === 'invoiceNo')?.verdict).toBe(
      'NOT_ON_DECLARATION',
    );
  });

  it('khong co to khai (hang soat chung tu) thi khong co dong doi chieu nao', () => {
    const model = toExtractionReviewModel({ review: review(), originalReview: null }, null);

    expect(model.cards[0]?.comparisons).toEqual([]);
  });

  it('tram doc duoc chi la ung vien: nhan + ket cuc nhan dang', () => {
    const model = toExtractionReviewModel(
      {
        review: review([{ finding: 'STATION_UNRESOLVED', detail: { stationMatch: 'AMBIGUOUS' } }], {
          stationMatch: 'AMBIGUOUS',
          stationId: null,
        }),
        originalReview: null,
      },
      DECLARED,
    );

    expect(model.cards[0]).toMatchObject({
      stationLabel: 'CHXD số 12',
      stationMatchLabel: 'Nhiều cây xăng có thể khớp — người soát chọn',
    });
  });

  it('chung tu BI TU CHOI: noi ly do, khong the ung vien', () => {
    const rejected = doc({
      status: 'REJECTED',
      rejectReason: 'EXTRACTION_UNAVAILABLE',
      candidateCount: 0,
    });

    const model = toExtractionReviewModel(
      { review: { document: rejected, candidates: [] }, originalReview: null },
      DECLARED,
    );

    expect(model.rejectLabel).toBe('Bộ đọc ảnh đang không dùng được — thử lại sau');
    expect(model.cards).toEqual([]);
    expect(model.attentionCount).toBe(1);
  });

  it('hoa don TRUNG: the ung vien la cua chung tu GOC, kem mot cau noi ro', () => {
    const duplicate = doc({ id: 'chung-tu-2', status: 'DUPLICATE', duplicateOfId: 'goc-1' });
    const original = review([], {}, doc({ id: 'goc-1' }));

    const model = toExtractionReviewModel(
      { review: { document: duplicate, candidates: [] }, originalReview: original },
      DECLARED,
    );

    expect(model.duplicateNote).not.toBeNull();
    expect(model.cards).toHaveLength(1);
    expect(model.documentId).toBe('chung-tu-2');
  });
});

describe('toDocumentQueueRows', () => {
  it('nguon la anh da luu thi khong in id ky thuat ra man hinh', () => {
    const [row] = toDocumentQueueRows([doc()]);

    expect(row).toMatchObject({
      id: 'chung-tu-1',
      kindLabel: 'Ảnh phiếu đổ',
      sourceLabel: 'Ảnh chứng từ đã lưu của một phiếu',
      statusLabel: 'Máy đã đọc',
      candidateCountLabel: '1',
      rejectLabel: null,
    });
    expect(JSON.stringify(row)).not.toContain('fuel-evidence:');
  });

  it('chung tu XML giu ten tep nguoi nhap, va ly do tu choi co nhan', () => {
    const [row] = toDocumentQueueRows([
      doc({
        kind: 'EINVOICE_XML',
        sourceRef: 'hoa-don-thang-9.xml',
        status: 'REJECTED',
        rejectReason: 'MALFORMED_XML',
        candidateCount: 0,
      }),
    ]);

    expect(row).toMatchObject({
      kindLabel: 'Hoá đơn điện tử',
      sourceLabel: 'hoa-don-thang-9.xml',
      rejectLabel: 'Tệp hoá đơn điện tử bị hỏng',
    });
  });
});
