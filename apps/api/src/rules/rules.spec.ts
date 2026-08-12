import { describe, expect, it } from 'vitest';
import type { ParsedOrder } from '@netviet/shared';
import type { Dealer, PriceRow, Product } from '../knowledge/domain.js';
import { DEFAULT_RULES_CONFIG } from './config.js';
import { computeShipping, matchProduct, priceOrder, routeStatus } from './rules.js';

const products: Product[] = [
  { sku: 'GHE-FELIX', name: 'Ghế Felix', aliases: ['felix', 'ghe felix'], unit: 'cai' },
  { sku: 'NOI-CHIEN', name: 'Nồi chiên không dầu', aliases: ['noi chien', 'ncked'], unit: 'cai' },
];
const prices: PriceRow[] = [
  { sku: 'GHE-FELIX', wholesale: 1_150_000 },
  { sku: 'NOI-CHIEN', wholesale: 2_000_000 },
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
  return { dealer, branch: 'HN', products, prices, priceOverrides: [], cfg, now, ...over };
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

describe('bon nghiep vu BLOCKED khong the bi "cau hinh" bang rule-config', () => {
  const parsed = {
    orderType: 'TH2',
    items: [{ skuRaw: 'ghe felix', quantity: 1 }],
    codCollect: true,
    wantVat: true,
  } as unknown as ParsedOrder;

  it('mac dinh KHONG mang so tien phong doan', () => {
    expect(DEFAULT_RULES_CONFIG.shipFeeNoiThanh).toBeNull();
    expect(DEFAULT_RULES_CONFIG.shipFeeTinh).toBeNull();
    expect(DEFAULT_RULES_CONFIG.codFee).toBeNull();
    expect(DEFAULT_RULES_CONFIG.vatRate).toBeNull();
    expect(DEFAULT_RULES_CONFIG.freeShipMinQuantity).toBeNull();
  });

  it('ban rule-config CU con so ship/COD/VAT van khong lam doi mot dong tien nao', () => {
    // Mo phong ban ghi RuleConfigVersion cu trong Postgres (truoc khi cac truong thanh nullable).
    const legacy = {
      ...DEFAULT_RULES_CONFIG,
      freeShipMinQuantity: 2,
      shipFeeNoiThanh: 30_000,
      shipFeeTinh: 40_000,
      vatRate: 0.1,
      codFee: 20_000,
    };

    const withBlank = priceOrder(parsed, ctx());
    const withLegacyNumbers = priceOrder(parsed, ctx({ cfg: legacy }));

    expect(withLegacyNumbers.shippingFee).toBe(0);
    expect(withLegacyNumbers.codFee).toBe(0);
    expect(withLegacyNumbers.vatAmount).toBe(0);
    expect(withLegacyNumbers.vat).toBe(false);
    expect(withLegacyNumbers.grandTotal).toBe(withBlank.grandTotal);
    // Va van chuyen Sale chu khong tu gui.
    expect(routeStatus(withLegacyNumbers)).toBe('needs_edit');
  });
});

describe('computeShipping', () => {
  it('fail closed vì GĐ1 chưa có bảng vùng/cước chính thức', () => {
    expect(() => computeShipping(10, 'Thai Nguyen', cfg)).toThrow(/thiếu cấu hình.*vận chuyển/i);
    expect(() => computeShipping(1, 'HN', cfg)).toThrow(/thiếu cấu hình.*vận chuyển/i);
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

  it('MAC DINH khong VAT khi khach khong ghi "xuat VAT"', () => {
    const priced = priceOrder({ ...parsed, noVat: false }, ctx());
    expect(priced.vat).toBe(false);
    expect(priced.vatAmount).toBe(0);
    expect(priced.grandTotal).toBe(11_500_000);
  });

  it('KHONG tinh VAT khi khach yeu cau vi policy dang blocked', () => {
    const priced = priceOrder({ ...parsed, noVat: false, wantVat: true }, ctx());
    expect(priced.vatAmount).toBe(0);
    expect(priced.grandTotal).toBe(11_500_000);
    expect(priced.warnings.join(' ')).toMatch(/thiếu cấu hình.*VAT/i);
  });

  it('ap gia SI ke ca CHUA map dai ly (bang gia chung), van canh bao dai ly la', () => {
    const priced = priceOrder(parsed, ctx({ dealer: null }));
    expect(priced.lines[0]!.unitPrice).toBe(1_150_000);
    expect(priced.lines[0]!.lineTotal).toBe(11_500_000);
    expect(priced.warnings.join(' ')).toMatch(/đại lý|dai ly/i);
  });

  it('deal RIENG cua dai ly override gia si chung', () => {
    const priced = priceOrder(
      parsed,
      ctx({ priceOverrides: [{ dealerId: 'd1', sku: 'GHE-FELIX', price: 1_000_000 }] }),
    );
    expect(priced.lines[0]!.unitPrice).toBe(1_000_000);
    expect(priced.lines[0]!.lineTotal).toBe(10_000_000);
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

  it('khong dung bang cuoc tam; danh dau thieu cau hinh va khong cong vao tong', () => {
    const priced = priceOrder(parsed, ctx());
    expect(priced.shippingFee).toBe(0);
    expect(priced.codFee).toBe(0);
    expect(priced.grandTotal).toBe(1_150_000);
    expect(priced.warnings.join(' ')).toMatch(/thiếu cấu hình.*ship.*COD/i);
    expect(priced.confirmationText).toContain('Chị Lan');
    expect(priced.confirmationText).not.toContain('Phí ship: 30.000đ');
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
