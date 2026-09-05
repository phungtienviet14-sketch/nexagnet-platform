import { describe, expect, it } from 'vitest';
import type {
  ApByCounterpartyRow,
  ArAgingReport,
  DirectMargin,
  DirectMarginRollup,
  PartnerPosition,
  SettlementDocument,
  SettlementDocumentChain,
} from '../../transport-types';
import {
  batchTripIds,
  DOCUMENT_CHAIN_NOTE,
  NET_DISPLAY_DISCLOSURE,
  ROLLUP_BATCH_LIMIT,
  toApFlow,
  toArAging,
  toDirectMargin,
  toDirectMarginRollup,
  toDocumentChain,
  toPartnerPosition,
  toSettlementDirectory,
  UNEXPECTED_INTERNAL_COST_NOTE,
} from '../settlement';
import { customer, partner } from './fixtures';

/**
 * `TX-05` o tang khung nhin. Bo test nay khong kiem "co hien khong" — no kiem nhung dieu ma neu sai
 * se lam ke toan doc ra mot con so KHAC voi so cua may chu.
 */

const directory = toSettlementDirectory({
  customers: [customer({ id: 'cus-1', name: 'Công ty TNHH Bảo An' })],
  partners: [partner({ id: 'par-1', name: 'Nhà xe Hưng Thịnh', roles: ['CARRIER'] })],
});

const report = (over: Partial<ArAgingReport> = {}): ArAgingReport => ({
  asOf: '2026-09-30',
  rows: [
    {
      documentId: 'doc-1',
      counterpartyId: 'cus-1',
      businessDate: '2026-09-01',
      dueDate: '2026-09-15',
      outstandingAmount: 11_500_000,
      daysOverdue: 15,
      bucket: 'D1_30',
      currencyCode: 'VND',
    },
  ],
  totalsByBucket: { CURRENT: 0, D1_30: 11_500_000, D31_60: 0, D60_PLUS: 0 },
  outstandingTotal: 11_500_000,
  overdueTotal: 11_500_000,
  ...over,
});

describe('tuoi no phai thu', () => {
  it('doi counterpartyId thanh TEN khach, khong dan uuid len bang', () => {
    const model = toArAging(report(), directory);
    expect(model.rows[0]?.counterpartyLabel).toBe('Công ty TNHH Bảo An');
    expect(model.rows[0]?.counterpartyLabel).not.toContain('cus-1');
  });

  it('doi tac khong co trong danh ba thi NOI RA, khong bay id ra man hinh', () => {
    const base = report().rows[0];
    if (base === undefined) throw new Error('fixture thieu dong');
    const model = toArAging(
      report({ rows: [{ ...base, counterpartyId: 'khong-co-trong-danh-ba' }] }),
      directory,
    );
    expect(model.rows[0]?.counterpartyLabel).toBe('Khách hàng chưa đọc được tên');
    expect(model.rows[0]?.counterpartyLabel).not.toContain('khong-co-trong-danh-ba');
  });

  it('bon nhom tuoi no LUON du bon dong, ke ca nhom bang 0', () => {
    expect(toArAging(report(), directory).buckets).toHaveLength(4);
  });

  it('bang rong noi ro moc `asOf`, khong noi chung chung "khong co du lieu"', () => {
    const model = toArAging(report({ rows: [], outstandingTotal: 0, overdueTotal: 0 }), directory);
    expect(model.headline).toContain('30/09/2026');
  });

  it('chua doc duoc thi KHONG hien so 0 — thieu khac han bang khong', () => {
    const model = toArAging(null, directory);
    expect(model.outstandingLabel).toBe('—');
    expect(model.overdueLabel).toBe('—');
  });
});

describe('cong no phai tra — nam dong giu RIENG', () => {
  const rows: readonly ApByCounterpartyRow[] = [
    {
      counterpartyId: 'par-1',
      flow: 'CARRIER_SERVICE',
      documentCount: 2,
      outstandingAmount: 6_000_000,
      currencyCode: 'VND',
    },
  ];

  it('tong chi cong TRONG MOT dong', () => {
    expect(toApFlow('CARRIER_SERVICE', rows, directory).totalLabel).toContain('6.000.000');
  });

  it('moi dong mang nhan rieng cua no', () => {
    expect(toApFlow('CARRIER_SERVICE', rows, directory).flowLabel).toBe('Nhà xe');
    expect(toApFlow('FUEL_SUPPLIER', [], directory).flowLabel).toBe('Cây xăng');
  });

  it('dong rong duoc danh dau, khong lan voi dong chua doc duoc', () => {
    expect(toApFlow('FUEL_SUPPLIER', [], directory).isEmpty).toBe(true);
    expect(toApFlow('FUEL_SUPPLIER', null, directory).isEmpty).toBe(true);
  });
});

describe('vi the doi tac — hai chieu, khong bu tru', () => {
  const position: PartnerPosition = {
    partnerId: 'par-1',
    receivableAmount: 3_000_000,
    carrierPayableAmount: 5_000_000,
    commissionPayableAmount: 1_000_000,
    netDisplay: -3_000_000,
    currencyCode: 'VND',
  };

  it('BA con so goc luon di kem so rong', () => {
    const model = toPartnerPosition(position, directory);
    expect(model?.receivableLabel).toContain('3.000.000');
    expect(model?.carrierPayableLabel).toContain('5.000.000');
    expect(model?.commissionPayableLabel).toContain('1.000.000');
  });

  it('cau "chi de xem" di kem so rong va KHONG duoc bo', () => {
    expect(toPartnerPosition(position, directory)?.netDisclosure).toBe(NET_DISPLAY_DISCLOSURE);
    expect(NET_DISPLAY_DISCLOSURE).toContain('không bù trừ');
  });
});

describe('bien truc tiep', () => {
  const margin = (over: Partial<DirectMargin> = {}): DirectMargin => ({
    tripId: 'trip-1',
    tripKind: 'OWN_DIRECT',
    revenueAmount: 10_000_000,
    directCostAmount: 6_000_000,
    carrierPayableAmount: 0,
    commissionAmount: 0,
    deductionAmount: 6_000_000,
    marginAmount: 4_000_000,
    marginBasisPoints: 4000,
    currencyCode: 'VND',
    fixedCostsIncluded: false,
    disclosure: 'Chưa gồm chi phí cố định',
    unexpectedInternalCost: false,
    ...over,
  });

  it('cau "chua gom chi phi co dinh" LUON di kem con so', () => {
    expect(toDirectMargin(margin())?.disclosure).toBe('Chưa gồm chi phí cố định');
  });

  it('may chu quen gui cau do thi van co mot cau — khong de trong', () => {
    expect(toDirectMargin(margin({ disclosure: '' }))?.disclosure).toBe('Chưa gồm chi phí cố định');
  });

  it('CHUA NHAP gia cuoc khac han bien bang 0', () => {
    const model = toDirectMargin(margin({ revenueAmount: null, marginAmount: null }));
    expect(model?.isRevenueMissing).toBe(true);
    expect(model?.marginLabel).toBe('—');
  });

  it('ty suat doc tu DIEM CO BAN: 4000 = 40,00%', () => {
    expect(toDirectMargin(margin())?.marginRateLabel).toBe('40,00%');
  });

  it('MAU THUAN du lieu duoc noi ra, khong lang le cong vao', () => {
    const model = toDirectMargin(margin({ unexpectedInternalCost: true }));
    expect(model?.inconsistencyNote).toBe(UNEXPECTED_INTERNAL_COST_NOTE);
  });
});

describe('cong don bien truc tiep', () => {
  const rollup = (over: Partial<DirectMarginRollup> = {}): DirectMarginRollup => ({
    revenueAmount: 100_000_000,
    deductionAmount: 60_000_000,
    marginAmount: 40_000_000,
    marginBasisPoints: 4000,
    tripCount: 20,
    skippedTripCount: 0,
    fixedCostsIncluded: false,
    disclosure: 'Chưa gồm chi phí cố định',
    ...over,
  });

  it('so chuyen BI BO QUA phai duoc noi ra', () => {
    const model = toDirectMarginRollup(rollup({ skippedTripCount: 5 }));
    expect(model?.coverageNote).toContain('5');
    expect(model?.coverageNote).toContain('chưa nhập giá cước');
  });

  it('khong bo qua chuyen nao thi cau ngan gon, khong doa nguoi doc', () => {
    expect(toDirectMarginRollup(rollup())?.coverageNote).not.toContain('chưa nhập');
  });

  it('chia lo theo tran 200 chuyen cua may chu', () => {
    const ids = Array.from({ length: 450 }, (_, index) => `trip-${index}`);
    const batches = batchTripIds(ids);
    expect(batches).toHaveLength(3);
    expect(batches[0]).toHaveLength(ROLLUP_BATCH_LIMIT);
    expect(batches[2]).toHaveLength(50);
    expect(batches.flat()).toEqual(ids);
  });

  it('danh sach rong khong sinh mot lo rong', () => {
    expect(batchTripIds([])).toHaveLength(0);
  });
});

describe('chuoi chung tu', () => {
  const document = (over: Partial<SettlementDocument> = {}): SettlementDocument => ({
    id: 'doc-1',
    direction: 'RECEIVABLE',
    flow: 'CUSTOMER_FREIGHT',
    counterpartyKind: 'CUSTOMER',
    counterpartyId: 'cus-1',
    kind: 'ORIGINAL',
    status: 'OPEN',
    signedAmount: 11_500_000,
    currencyCode: 'VND',
    businessDate: '2026-09-01',
    dueDate: '2026-09-15',
    tripId: 'trip-1',
    invoiceRef: 'HD-001',
    note: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    ...over,
  });

  const chain: SettlementDocumentChain = {
    original: document(),
    corrections: [document({ id: 'doc-2', kind: 'ADJUSTMENT', signedAmount: -1_500_000 })],
    allocations: [
      {
        id: 'alloc-1',
        documentId: 'doc-1',
        amount: 5_000_000,
        businessDate: '2026-09-20',
        method: 'BANK_TRANSFER',
        note: null,
        createdAt: '2026-09-20T00:00:00.000Z',
      },
    ],
    grossAmount: 10_000_000,
    outstandingAmount: 5_000_000,
  };

  it('ban goc va cac ban sua nam TRONG MOT bang, theo thu tu', () => {
    const model = toDocumentChain(chain, directory);
    expect(model?.documents.map((row) => row.kindLabel)).toEqual(['Chứng từ gốc', 'Điều chỉnh']);
  });

  it('so du doc tren CA CHUOI — va man hinh noi ra dieu do', () => {
    const model = toDocumentChain(chain, directory);
    expect(model?.outstandingLabel).toContain('5.000.000');
    expect(model?.note).toBe(DOCUMENT_CHAIN_NOTE);
  });

  it('khong tim thay chuoi thi tra null, khong dung mot bang rong', () => {
    expect(toDocumentChain(null, directory)).toBeNull();
  });
});
