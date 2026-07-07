import { describe, expect, it } from 'vitest';
import type { ParsedOrder } from '@ultty/shared';
import type { Dealer, PriceRow, Product } from '../knowledge/domain.js';
import { DEFAULT_RULES_CONFIG } from './config.js';
import { computeShipping, matchProduct, priceOrder, routeStatus } from './rules.js';

const products: Product[] = [
  { sku: 'GHE-FELIX', name: 'Ghế Felix', aliases: ['felix', 'ghe felix'], unit: 'cai' },
  { sku: 'NOI-CHIEN', name: 'Nồi chiên không dầu', aliases: ['noi chien', 'ncked'], unit: 'cai' },
];
const prices: PriceRow[] = [
  { sku: 'GHE-FELIX', prices: { dai_ly: 1_150_000, ctv: 1_250_000 } },
  { sku: 'NOI-CHIEN', prices: { dai_ly: 2_000_000, ctv: 2_200_000 } },
];
const dealer: Dealer = {
  id: 'd1',
  name: 'Meta HN',
  aliases: ['meta hn', 'meta'],
  tier: 'dai_ly',
  defaultPolicy: 'cong_no_30',
};
const cfg = DEFAULT_RULES_CONFIG;
const now = new Date('2026-07-07T00:00:00Z');

function ctx(over: Partial<Parameters<typeof priceOrder>[1]> = {}) {
  return { dealer, branch: 'HN', products, prices, cfg, now, ...over };
}

describe('matchProduct', () => {
  it('map ten viet tat ve SKU chuan', () => {
    expect(matchProduct('ghe felix', products)?.sku).toBe('GHE-FELIX');
    expect(matchProduct('noi chien', products)?.sku).toBe('NOI-CHIEN');
  });
  it('tra null khi khong khop danh muc', () => {
    expect(matchProduct('ban an go', products)).toBeNull();
  });
});

describe('computeShipping', () => {
  it('mien phi khi tong so luong >= 2', () => {
    expect(computeShipping(10, 'Thai Nguyen', cfg)).toBe(0);
  });
  it('1 SP giao tinh -> cuoc Viettel', () => {
    expect(computeShipping(1, 'Thai Nguyen', cfg)).toBe(cfg.shipFeeTinh);
  });
  it('1 SP giao noi thanh HN -> cuoc Grab', () => {
    expect(computeShipping(1, 'HN', cfg)).toBe(cfg.shipFeeNoiThanh);
  });
});

describe('priceOrder — TH1', () => {
  const parsed: ParsedOrder = {
    orderType: 'TH1',
    dealerNameRaw: 'Meta HN',
    branch: 'HN',
    items: [{ skuRaw: 'ghe felix', quantity: 10 }],
    noVat: true,
  };

  it('ap gia theo cap dai ly, mien ship, khong VAT', () => {
    const priced = priceOrder(parsed, ctx());
    expect(priced.lines[0]!.sku).toBe('GHE-FELIX');
    expect(priced.lines[0]!.unitPrice).toBe(1_150_000);
    expect(priced.lines[0]!.lineTotal).toBe(11_500_000);
    expect(priced.itemsSubtotal).toBe(11_500_000);
    expect(priced.shippingFee).toBe(0);
    expect(priced.vatAmount).toBe(0);
    expect(priced.policy).toBe('cong_no_30');
    expect(priced.grandTotal).toBe(11_500_000);
    expect(priced.warnings).toHaveLength(0);
  });

  it('dung format xac nhan co ten SP, dai ly, tong tien', () => {
    const priced = priceOrder(parsed, ctx());
    expect(priced.confirmationText).toContain('Meta HN');
    expect(priced.confirmationText).toContain('Ghế Felix');
    expect(priced.confirmationText).toContain('11.500.000đ');
  });

  it('tinh VAT khi khong co co "khong VAT"', () => {
    const priced = priceOrder({ ...parsed, noVat: false }, ctx());
    expect(priced.vatAmount).toBe(1_150_000);
    expect(priced.grandTotal).toBe(12_650_000);
  });
});

describe('priceOrder — validation', () => {
  it('canh bao khi SKU khong map duoc', () => {
    const priced = priceOrder(
      { orderType: 'TH1', items: [{ skuRaw: 'ban an go', quantity: 2 }], noVat: true },
      ctx(),
    );
    expect(priced.lines[0]!.matched).toBe(false);
    expect(priced.warnings.join(' ')).toMatch(/ban an go/i);
  });

  it('canh bao khi tong khach ghi lech tong he thong', () => {
    const priced = priceOrder(
      {
        orderType: 'TH1',
        items: [{ skuRaw: 'ghe felix', quantity: 10 }],
        totalRaw: 9_000_000,
        noVat: true,
      },
      ctx(),
    );
    expect(priced.warnings.join(' ')).toMatch(/lệch|lech/i);
  });

  it('bo qua doi chieu khi totalRaw=0 (parser dien mac dinh, khong phai khach ghi)', () => {
    const priced = priceOrder(
      {
        orderType: 'TH1',
        items: [{ skuRaw: 'ghe felix', quantity: 10 }],
        totalRaw: 0,
        noVat: true,
      },
      ctx(),
    );
    expect(priced.warnings).toHaveLength(0);
  });

  it('khong canh bao khi tong khop trong sai so', () => {
    const priced = priceOrder(
      {
        orderType: 'TH1',
        items: [{ skuRaw: 'ghe felix', quantity: 10 }],
        totalRaw: 11_500_000,
        noVat: true,
      },
      ctx(),
    );
    expect(priced.warnings).toHaveLength(0);
  });
});

describe('priceOrder — TH2 COD', () => {
  const parsed: ParsedOrder = {
    orderType: 'TH2',
    items: [{ skuRaw: 'ghe felix', quantity: 1 }],
    customerName: 'Chị Lan',
    customerPhone: '0912000111',
    customerAddress: 'Thai Nguyen',
    codCollect: true,
    noVat: true,
  };

  it('1 SP giao tinh co cuoc + phi COD, format co ten khach', () => {
    const priced = priceOrder(parsed, ctx());
    expect(priced.shippingFee).toBe(cfg.shipFeeTinh);
    expect(priced.codFee).toBe(cfg.codFee);
    expect(priced.grandTotal).toBe(1_150_000 + cfg.shipFeeTinh + cfg.codFee);
    expect(priced.confirmationText).toContain('Chị Lan');
  });
});

describe('routeStatus', () => {
  it('co canh bao -> needs_edit', () => {
    const priced = priceOrder(
      { orderType: 'TH1', items: [{ skuRaw: 'ban an', quantity: 1 }], noVat: true },
      ctx(),
    );
    expect(routeStatus(priced)).toBe('needs_edit');
  });
  it('sach -> pending_review', () => {
    const priced = priceOrder(
      { orderType: 'TH1', items: [{ skuRaw: 'ghe felix', quantity: 10 }], noVat: true },
      ctx(),
    );
    expect(routeStatus(priced)).toBe('pending_review');
  });
});
