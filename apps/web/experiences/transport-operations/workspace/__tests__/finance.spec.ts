import { describe, expect, it } from 'vitest';
import { TRANSPORT_SECTIONS } from '../../navigation';
import type { FinanceSummaryView } from '../../transport-types';
import { toFinance } from '../finance';

const view = (over: Partial<FinanceSummaryView> = {}): FinanceSummaryView => ({
  generatedFor: '2026-09-08',
  buckets: {
    flows: {
      CUSTOMER_FREIGHT: 120_000_000,
      FUEL_SUPPLIER: 30_000_000,
      CARRIER_SERVICE: 18_000_000,
      PARTNER_COMMISSION: 4_000_000,
    },
    driverReimbursementOutstanding: 2_500_000,
    driverSettlementRemaining: 47_000_000,
  },
  directMargin: {
    revenueAmount: 500_000_000,
    deductionAmount: 380_000_000,
    marginAmount: 120_000_000,
    marginBasisPoints: 2400,
    tripCount: 42,
    skippedTripCount: 0,
    fixedCostsIncluded: false,
    disclosure: 'Chưa gồm chi phí cố định',
  },
  receivable: { outstandingTotal: 120_000_000, overdueTotal: 15_000_000 },
  currency: { codes: ['VND'], isSingle: true },
  unavailableSources: [],
  ...over,
});

describe('sau dong tien — giu rieng, khong mot tong nao', () => {
  it('dung sau dong, moi dong mot con so', () => {
    const model = toFinance(view());

    expect(model.rows.map((row) => row.key)).toEqual([
      'CUSTOMER_FREIGHT',
      'FUEL_SUPPLIER',
      'CARRIER_SERVICE',
      'PARTNER_COMMISSION',
      'driver-reimbursement',
      'driver-wage-remaining',
    ]);
  });

  /**
   * `INV-23`: cong sau con so lai cho ra mot con so khong ai no ai ca. Bai nay do neu ai do them
   * mot dong "tong cong no" vao mo hinh doc.
   */
  it('khong co dong nao la tong cua cac dong khac', () => {
    const model = toFinance(view());
    const tong = 120_000_000 + 30_000_000 + 18_000_000 + 4_000_000 + 2_500_000 + 47_000_000;

    for (const row of model.rows) {
      expect(row.value.replace(/\D/g, '')).not.toBe(String(tong));
    }
    expect(model.rows).toHaveLength(6);
  });

  it('cong no khach la PHAI THU, ba dong con lai la PHAI TRA', () => {
    const model = toFinance(view());
    const direction = Object.fromEntries(model.rows.map((row) => [row.key, row.direction]));

    expect(direction.CUSTOMER_FREIGHT).toBe('RECEIVABLE');
    expect(direction.FUEL_SUPPLIER).toBe('PAYABLE');
    expect(direction.CARRIER_SERVICE).toBe('PAYABLE');
    expect(direction.PARTNER_COMMISSION).toBe('PAYABLE');
  });

  /**
   * `TX-07b` ton tai de mot lan chi hoan ung khong trong nhu mot lan tra luong. Hai dong phai co
   * hai nhan khac nhau va hai duong dan khac nhau.
   */
  it('hoan ung va luong chua rut la hai dong, hai duong dan khac nhau', () => {
    const model = toFinance(view());
    const reimbursement = model.rows.find((row) => row.key === 'driver-reimbursement');
    const wage = model.rows.find((row) => row.key === 'driver-wage-remaining');

    expect(reimbursement?.section).toBe('driver-fund');
    expect(wage?.section).toBe('driver-settlement');
    expect(reimbursement?.label).not.toEqual(wage?.label);
  });

  it('moi dong dan ve mot muc CO THAT trong danh muc dieu huong', () => {
    const known = TRANSPORT_SECTIONS.map((section) => section.id);
    for (const row of toFinance(view()).rows) {
      if (row.section === null) continue;
      expect(known, row.key).toContain(row.section);
    }
  });
});

describe('bien truc tiep — KHONG PHAI lai rong', () => {
  it('cau cong bo cua may chu di cung con so, khong bi thay bang chu cua man hinh', () => {
    const model = toFinance(view());

    expect(model.margin.disclosure).toBe('Chưa gồm chi phí cố định');
  });

  it('man hinh khong bao gio goi con so nay la lai rong', () => {
    const model = toFinance(view());
    const text = JSON.stringify(model).toLowerCase();

    expect(text).not.toContain('lãi ròng');
    expect(text).not.toContain('lợi nhuận ròng');
    expect(text).not.toContain('net profit');
  });

  /** `2400` diem co ban = 24%. Hien thi thang se ra "2400%". */
  it('ty le doc theo diem co ban, khong phai phan tram tho', () => {
    const model = toFinance(view());

    expect(model.margin.ratio).not.toContain('2400');
    expect(model.margin.ratio).toContain('24');
  });

  it('chuyen chua co gia cuoc duoc noi ra, khong bi coi la 0', () => {
    const model = toFinance(
      view({
        directMargin: { ...view().directMargin, tripCount: 40, skippedTripCount: 2 },
      }),
    );

    expect(model.margin.coverage).toContain('2');
    expect(model.margin.coverage).toContain('chưa có giá cước');
  });
});

describe('nhieu ma tien — tu choi im lang', () => {
  it('mot ma tien thi khong canh bao', () => {
    expect(toFinance(view()).currencyWarning).toBeNull();
  });

  it('hai ma tien thi noi ro cac tong khong cong thang duoc', () => {
    const model = toFinance(view({ currency: { codes: ['USD', 'VND'], isSingle: false } }));

    expect(model.currencyWarning).not.toBeNull();
    expect(model.currencyWarning).toContain('USD');
    expect(model.currencyWarning).toContain('VND');
  });
});

describe('nguon bi tat', () => {
  it('noi ra muc nao thieu vi khach chua bat nghiep vu', () => {
    const model = toFinance(view({ unavailableSources: ['DRIVER_SETTLEMENT'] }));

    expect(model.disabledSourceNotes).toHaveLength(1);
    expect(model.disabledSourceNotes[0]).toContain('Quyết toán lái xe');
  });
});

describe('tat dinh', () => {
  it('hai lan doc cung du lieu cho ra cung ket qua', () => {
    const source = view();
    expect(toFinance(source)).toEqual(toFinance(source));
  });
});
