import { describe, expect, it } from 'vitest';
import type { PricePeriodPrice } from './settings';
import { formatVnd, skusMissingWholesale, toPriceValue, updatePriceCell } from './price-rows';

const rows: PricePeriodPrice[] = [
  {
    sku: 'FELIX',
    wholesale: 1_250_000,
    minRetailPrice: 1_750_000,
    retailPrice: 2_000_000,
    listPrice: 2_500_000,
  },
  {
    sku: 'ELNA',
    wholesale: 450_000,
    minRetailPrice: 750_000,
    retailPrice: 850_000,
    listPrice: 1_250_000,
  },
];

describe('toPriceValue', () => {
  it('o trong la CHUA co gia (null), khong phai 0', () => {
    // Bat bien quan trong nhat: 0 lam don tinh ra 0 dong ma van "hop le".
    expect(toPriceValue('')).toBeNull();
    expect(toPriceValue('   ')).toBeNull();
  });

  it('go nham ky tu khong phai so -> null, khong lang le thanh 0', () => {
    expect(toPriceValue('abc')).toBeNull();
    expect(toPriceValue('1.2.3')).toBeNull();
  });

  it('so hop le duoc giu nguyen', () => {
    expect(toPriceValue('1250000')).toBe(1_250_000);
    expect(toPriceValue(' 450000 ')).toBe(450_000);
  });
});

describe('updatePriceCell', () => {
  it('sua dung mot o; dong khac giu nguyen tham chieu (khong sua tai cho)', () => {
    const next = updatePriceCell(rows, 0, 'retailPrice', '2100000');

    expect(next[0]!.retailPrice).toBe(2_100_000);
    expect(next[0]!.wholesale).toBe(1_250_000);
    expect(next[1]).toBe(rows[1]);
    expect(rows[0]!.retailPrice).toBe(2_000_000);
  });

  it('xoa trang o gia khong bat buoc -> null (SKU nay khong co muc gia do)', () => {
    expect(updatePriceCell(rows, 1, 'listPrice', '')[1]!.listPrice).toBeNull();
  });

  it('xoa trang don gia CTV -> 0 de con go tiep, va bi bat lai o skusMissingWholesale', () => {
    const next = updatePriceCell(rows, 1, 'wholesale', '');

    expect(next[1]!.wholesale).toBe(0);
    expect(skusMissingWholesale(next)).toEqual(['ELNA']);
  });
});

describe('skusMissingWholesale', () => {
  it('bang du gia -> khong thieu SKU nao', () => {
    expect(skusMissingWholesale(rows)).toEqual([]);
  });

  it('gia 0 hoac am deu tinh la THIEU, khong duoc coi la da nhap', () => {
    const broken: PricePeriodPrice[] = [
      { sku: 'A', wholesale: 0 },
      { sku: 'B', wholesale: -1 },
      { sku: 'C', wholesale: Number.NaN },
      { sku: 'D', wholesale: 10_000 },
    ];

    expect(skusMissingWholesale(broken)).toEqual(['A', 'B', 'C']);
  });
});

describe('formatVnd', () => {
  it('chua co gia thi hien gach ngang chu KHONG hien 0 đ', () => {
    expect(formatVnd(null)).toBe('—');
    expect(formatVnd(undefined)).toBe('—');
  });

  it('co gia thi nhom hang nghin theo kieu Viet Nam', () => {
    expect(formatVnd(1_250_000)).toContain('1.250.000');
    expect(formatVnd(1_250_000)).toContain('đ');
  });
});
