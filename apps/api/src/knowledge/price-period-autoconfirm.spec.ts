import { describe, expect, it } from 'vitest';
import type { OrderView, ParsedOrder } from '@netviet/shared';
import { shouldAutoConfirmOrder } from '../pipeline/order-auto-confirmation.js';
import { DEFAULT_RULES_CONFIG } from '../rules/config.js';
import { priceOrder } from '../rules/rules.js';
import type { Dealer, KnowledgeSnapshot, Product } from './domain.js';
import { selectCurrentSnapshotPrices } from './price-periods.js';

/**
 * Bang chung dau-cuoi cho cai gia nhat cua GD1: khong co bang gia cua THANG HIEN TAI thi
 * KHONG don nao duoc tu xac nhan — va khoanh khac no dao chieu la luc kich hoat ky moi,
 * chu khong phai luc sua code.
 *
 * Day dung la trang thai that ngay 12/08/2026: seed la ky 2026-07, thang hien tai 2026-08.
 */
const PRODUCTS: Product[] = [
  { sku: 'ELNI', name: 'Quat tich dien ELNI', aliases: ['elni'], unit: 'chiec' },
];
const DEALER: Dealer = {
  id: 'd1',
  name: 'Meta HN',
  aliases: ['meta hn'],
  tier: 'dai_ly',
  defaultPolicy: 'cong_no_30',
};
const PARSED = {
  orderType: 'TH1',
  items: [{ skuRaw: 'elni', quantity: 10 }],
} as unknown as ParsedOrder;

function snapshotFor(validMonth: string): Pick<KnowledgeSnapshot, 'pricePeriod' | 'prices'> {
  return {
    pricePeriod: { validMonth, status: 'active' },
    prices: [{ sku: 'ELNI', wholesale: 2_150_000 }],
  } as unknown as Pick<KnowledgeSnapshot, 'pricePeriod' | 'prices'>;
}

function autoConfirmable(validMonth: string, now: Date): boolean {
  const prices = selectCurrentSnapshotPrices(snapshotFor(validMonth), now);
  const priced = priceOrder(PARSED, {
    dealer: DEALER,
    branch: 'HN',
    products: PRODUCTS,
    prices,
    priceOverrides: [],
    cfg: DEFAULT_RULES_CONFIG,
    now,
  });
  const view = { intent: 'dat_don', dealerName: DEALER.name, priced } as unknown as OrderView;
  return shouldAutoConfirmOrder(view, {
    policy: { enabled: true, maxAutoConfirmQuantity: 50 },
    killSwitchEnabled: true,
    manualReview: false,
  });
}

describe('ky gia hien hanh quyet dinh don co tu xac nhan duoc hay khong', () => {
  const august = new Date('2026-08-12T03:00:00.000Z');

  it('ky gia cua thang TRUOC -> khong co gia -> don 10 SP van phai chuyen Sale', () => {
    expect(autoConfirmable('2026-07', august)).toBe(false);
  });

  it('kich hoat ky cua DUNG thang hien tai -> chinh don do tu xac nhan duoc', () => {
    expect(autoConfirmable('2026-08', august)).toBe(true);
  });

  it('sang thang moi ma chua tao ky moi thi tu dong dung lai, khong tu keo gia thang cu', () => {
    const september = new Date('2026-09-01T00:30:00.000Z');
    expect(autoConfirmable('2026-08', september)).toBe(false);
  });
});
