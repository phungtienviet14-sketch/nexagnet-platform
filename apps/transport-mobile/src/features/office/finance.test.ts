import { describe, expect, it } from 'vitest';
import { ApiError } from '../../api/errors';
import {
  coverageSentence,
  currencyWarning,
  financeSourceNotes,
  isQuietReadFailure,
  marginView,
  moneyRows,
} from './finance';
import type { FinanceSummaryView } from './types';

const view: FinanceSummaryView = {
  generatedFor: '2026-09-25',
  buckets: {
    flows: {
      CUSTOMER_FREIGHT: 120_000_000,
      FUEL_SUPPLIER: 30_000_000,
      CARRIER_SERVICE: 0,
      PARTNER_COMMISSION: 2_500_000,
    },
    driverReimbursementOutstanding: 1_200_000,
    driverSettlementRemaining: 8_000_000,
  },
  directMargin: {
    revenueAmount: 100_000_000,
    deductionAmount: 60_000_000,
    marginAmount: 40_000_000,
    marginBasisPoints: 4000,
    tripCount: 44,
    skippedTripCount: 0,
    fixedCostsIncluded: false,
    disclosure: 'Chưa gồm chi phí cố định',
  },
  receivable: { outstandingTotal: 120_000_000, overdueTotal: 15_000_000 },
  currency: { codes: ['VND'], isSingle: true },
  unavailableSources: [],
};

describe('moneyRows', () => {
  it('sau dong rieng, dung nhan web, khong dong nao la tong', () => {
    const rows = moneyRows(view);
    expect(rows).toHaveLength(6);
    expect(rows.map((row) => row.label)).toEqual([
      'Khách hàng còn nợ',
      'Còn nợ cây xăng',
      'Còn nợ nhà xe',
      'Hoa hồng phải trả đối tác',
      'Công ty còn nợ lái xe (hoàn ứng)',
      'Lương đã ghi nhận, lái xe chưa rút',
    ]);
    expect(rows.some((row) => /tổng/i.test(row.label))).toBe(false);
    // 161.700.000 la tong cua sau dong — khong duoc xuat hien o bat ky dau
    expect(rows.some((row) => row.value.includes('161.700.000'))).toBe(false);
  });

  it('chi cong no khach la phai thu', () => {
    const rows = moneyRows(view);
    expect(rows.filter((row) => row.direction === 'RECEIVABLE').map((row) => row.key)).toEqual([
      'CUSTOMER_FREIGHT',
    ]);
  });
});

describe('marginView', () => {
  it('giu nguyen van disclosure, ti le tu diem co ban, khong goi la lai rong', () => {
    const margin = marginView(view.directMargin);
    expect(margin.title).toBe('Biên trực tiếp');
    expect(margin.disclosure).toBe('Chưa gồm chi phí cố định');
    expect(margin.ratio).toBe('40%');
    expect(JSON.stringify(margin)).not.toMatch(/lãi ròng|lợi nhuận ròng/i);
  });

  it('cau co so noi du hai nguon khi may chu gui basis', () => {
    expect(
      coverageSentence({
        ...view.directMargin,
        basis: { legacyTrips: { counted: 44, skipped: 2 }, runFirstOrders: { counted: 1 } },
      }),
    ).toBe(
      'Tính trên 44 chuyến cũ và 1 đơn theo vòng xe. 2 chuyến cũ chưa có giá cước nên không được tính.',
    );
    expect(coverageSentence(view.directMargin)).toBe('Tính trên 44 chuyến.');
  });

  it('ti le null hien gach', () => {
    expect(marginView({ ...view.directMargin, marginBasisPoints: null }).ratio).toBe('—');
  });
});

describe('canh bao', () => {
  it('nhieu ma tien thi canh bao', () => {
    expect(currencyWarning(view)).toBeNull();
    expect(currencyWarning({ currency: { codes: ['VND', 'USD'], isSingle: false } })).toContain(
      'VND, USD',
    );
  });

  it('nguon tai chinh tat noi ro', () => {
    expect(financeSourceNotes(['DRIVER_SETTLEMENT'])[0]).toContain('Quyết toán lái xe');
  });

  it('404 khong reason / 403 la im lang; loi mang thi khong', () => {
    expect(isQuietReadFailure(new ApiError('NOT_MOUNTED', 'x', 404))).toBe(true);
    expect(isQuietReadFailure(new ApiError('FORBIDDEN', 'x', 403))).toBe(true);
    expect(isQuietReadFailure(new ApiError('NETWORK', 'x', null))).toBe(false);
  });
});
