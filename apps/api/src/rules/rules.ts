import type { DealerTier, OrderStatus, ParsedOrder, PricedLine, PricedOrder } from '@ultty/shared';
import type { Dealer, PriceRow, Product } from '../knowledge/domain.js';
import type { RulesConfig } from './config.js';
import { formatVnd, normalize } from './text.js';

/**
 * Rules engine TAT DINH (tang 4). LLM khong tinh tien — moi so lieu tinh o day
 * tu nguon su that. Ham thuan (pure) de test de dang.
 */

export interface PriceContext {
  dealer: Dealer | null;
  branch: string | null;
  products: Product[];
  prices: PriceRow[];
  cfg: RulesConfig;
  now?: Date;
}

/** Map ten/viet tat SP ve SKU chuan (so khop khong dau). */
export function matchProduct(skuRaw: string, products: Product[]): Product | null {
  const q = normalize(skuRaw);
  if (!q) return null;
  for (const product of products) {
    const candidates = [product.name, ...product.aliases].map(normalize);
    if (candidates.some((c) => c.length >= 3 && q.includes(c))) return product;
  }
  return null;
}

function priceFor(sku: string, tier: DealerTier, prices: PriceRow[]): number | null {
  const row = prices.find((p) => p.sku === sku);
  return row ? row.prices[tier] : null;
}

function isNoiThanh(region: string, cfg: RulesConfig): boolean {
  const r = normalize(region);
  return cfg.noiThanhKeywords.some((k) => r === k || r.includes(k));
}

/** Don >= nguong so luong -> mien ship; 1 SP -> cuoc theo khu vuc. */
export function computeShipping(totalQuantity: number, region: string, cfg: RulesConfig): number {
  if (totalQuantity >= cfg.freeShipMinQuantity) return 0;
  return isNoiThanh(region, cfg) ? cfg.shipFeeNoiThanh : cfg.shipFeeTinh;
}

const POLICY_LABELS: Record<NonNullable<PricedOrder['policy']>, string> = {
  cong_no_30: 'Công nợ 30 ngày',
  cong_no_45: 'Công nợ 45 ngày',
  ky_gui: 'Ký gửi',
  thanh_toan_ngay: 'Thanh toán ngay',
  cod: 'COD (thu hộ)',
};

function buildConfirmation(p: Omit<PricedOrder, 'confirmationText'>, now: Date): string {
  const dateStamp = `${now.getDate()}.${now.getMonth() + 1}`;
  const header = [p.branch, dateStamp, p.dealerName].filter((x): x is string => Boolean(x)).join('_');
  const lines: string[] = [header || 'Đơn hàng', '━━━━━━━━━━━━'];
  lines.push(p.orderType === 'TH2' ? 'Đơn giao khách (TH2)' : 'Đơn giao đại lý (TH1)');
  if (p.orderType === 'TH2') {
    const cust = [p.customerName, p.customerPhone].filter(Boolean).join(' — ');
    if (cust) lines.push(`Khách: ${cust}`);
    if (p.customerAddress) lines.push(`Địa chỉ: ${p.customerAddress}`);
  }
  for (const l of p.lines) {
    const name = l.productName ?? l.skuRaw;
    lines.push(`• ${l.quantity} x ${name} — ${formatVnd(l.unitPrice)}/SP = ${formatVnd(l.lineTotal)}`);
  }
  lines.push(`Tiền hàng: ${formatVnd(p.itemsSubtotal)}`);
  lines.push(`Phí ship: ${p.shippingFee === 0 ? 'Miễn phí' : formatVnd(p.shippingFee)}`);
  if (p.vat) lines.push(`VAT: ${formatVnd(p.vatAmount)}`);
  if (p.codCollect) lines.push(`Thu hộ COD: ${formatVnd(p.codFee)}`);
  lines.push('━━━━━━━━━━━━');
  lines.push(`TỔNG: ${formatVnd(p.grandTotal)}`);
  if (p.policy) lines.push(`Chính sách: ${POLICY_LABELS[p.policy]}`);
  return lines.join('\n');
}

export function priceOrder(parsed: ParsedOrder, ctx: PriceContext): PricedOrder {
  const now = ctx.now ?? new Date();

  const lines: PricedLine[] = parsed.items.map((item) => {
    const product = matchProduct(item.skuRaw, ctx.products);
    const unitPrice =
      product && ctx.dealer ? (priceFor(product.sku, ctx.dealer.tier, ctx.prices) ?? 0) : 0;
    return {
      skuRaw: item.skuRaw,
      sku: product?.sku ?? null,
      productName: product?.name ?? null,
      quantity: item.quantity,
      unitPrice,
      lineTotal: unitPrice * item.quantity,
      matched: Boolean(product) && unitPrice > 0,
    };
  });

  const itemsSubtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  const totalQuantity = lines.reduce((sum, l) => sum + l.quantity, 0);
  const region = parsed.customerAddress ?? ctx.branch ?? '';
  const shippingFee = computeShipping(totalQuantity, region, ctx.cfg);
  const codCollect = parsed.orderType === 'TH2' && parsed.codCollect === true;
  const codFee = codCollect ? ctx.cfg.codFee : 0;
  // Nghiep vu: MAC DINH KHONG VAT (VAT tuy truong hop). Chi ap VAT khi khach ghi ro
  // "xuat VAT" (wantVat) va khong ghi "ko VAT" (noVat).
  const vat = parsed.wantVat === true && parsed.noVat !== true;
  const vatAmount = vat ? Math.round(itemsSubtotal * ctx.cfg.vatRate) : 0;
  const grandTotal = itemsSubtotal + shippingFee + vatAmount + codFee;

  const warnings: string[] = [];
  for (const l of lines) {
    if (!l.matched) warnings.push(`Chưa map được sản phẩm: "${l.skuRaw}"`);
  }
  if (!ctx.dealer) warnings.push('Chưa xác định đại lý từ nhóm Zalo');
  // totalRaw <= 0 = parser dien mac dinh (khong phai khach ghi) -> bo qua doi chieu.
  if (parsed.totalRaw != null && parsed.totalRaw > 0 && itemsSubtotal > 0) {
    const diffRatio = Math.abs(itemsSubtotal - parsed.totalRaw) / Math.max(parsed.totalRaw, 1);
    if (diffRatio > ctx.cfg.totalMismatchTolerance) {
      warnings.push(
        `Tổng lệch: khách ghi ${formatVnd(parsed.totalRaw)} vs hệ thống ${formatVnd(itemsSubtotal)}`,
      );
    }
  }

  const base: Omit<PricedOrder, 'confirmationText'> = {
    orderType: parsed.orderType,
    dealerName: ctx.dealer?.name ?? parsed.dealerNameRaw ?? null,
    branch: ctx.branch ?? parsed.branch ?? null,
    lines,
    itemsSubtotal,
    shippingFee,
    policy: ctx.dealer?.defaultPolicy ?? null,
    codCollect,
    codFee,
    vat,
    vatAmount,
    grandTotal,
    customerName: parsed.customerName,
    customerPhone: parsed.customerPhone,
    customerAddress: parsed.customerAddress,
    warnings,
  };

  return { ...base, confirmationText: buildConfirmation(base, now) };
}

export function routeStatus(priced: PricedOrder): OrderStatus {
  return priced.warnings.length > 0 ? 'needs_edit' : 'pending_review';
}
