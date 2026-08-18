import type { OrderStatus, ParsedOrder, PricedLine, PricedOrder } from '@netviet/shared';
import type { Dealer, DealerPriceOverride, PriceRow, Product } from '../knowledge/domain.js';
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
  /** Deal rieng theo dealer+sku (override gia si). */
  priceOverrides: DealerPriceOverride[];
  cfg: RulesConfig;
  now?: Date;
}

/**
 * Map ten/viet tat SP ve SKU chuan (so khop khong dau).
 *
 * Lay khop DAI NHAT, khong phai khop dau tien. Alias cua mot SP co the la CHUOI CON cua SP khac
 * ("wfx" nam trong "combo wfx"), nen duyet theo thu tu danh muc roi tra ve ngay se chon SP NGAN
 * hon — sai SKU, sai gia, ma dong don van `matched=true` khong sinh warning nao, tuc auto-confirm
 * gui thang gia sai cho khach. `mock-parser.ts` da uu tien cum dai truoc vi dung ly do nay; day la
 * cong CUOI truoc khi ra tien nen phai giu cung bat bien.
 */
export function matchProduct(skuRaw: string, products: Product[]): Product | null {
  const q = normalize(skuRaw);
  if (!q) return null;
  let best: { product: Product; length: number } | null = null;
  for (const product of products) {
    for (const candidate of [product.name, ...product.aliases]) {
      const normalized = normalize(candidate);
      if (normalized.length < 3 || !q.includes(normalized)) continue;
      // Bang do dai thi giu SP dung truoc trong danh muc: thu tu on dinh, khong doi theo runtime.
      if (!best || normalized.length > best.length) best = { product, length: normalized.length };
    }
  }
  return best?.product ?? null;
}

/**
 * Gia si dai ly/CTV tra cho 1 SKU = deal rieng cua dai ly (neu co) > gia si chung (wholesale).
 * Gia si chung nhu nhau moi dai ly/CTV (khao sat: "bang gia chung" + deal rieng); biet duoc
 * ke ca chua map dai ly.
 */
function priceFor(
  sku: string,
  dealerId: string | null,
  quantity: number,
  prices: PriceRow[],
  overrides: DealerPriceOverride[],
): number | null {
  if (dealerId) {
    // Deal rieng co the kem NGUONG SO LUONG ("lay 5 cai moi duoc 1.150k" — anh chup 25/07/2026).
    // Chua dat nguong thi KHONG duoc huong deal: quay ve bang gia chung, khong bao gia thap hon
    // muc dai ly that su duoc huong.
    const override = overrides.find((o) => o.dealerId === dealerId && o.sku === sku);
    if (override && quantity >= (override.minQuantity ?? 1)) return override.price;
  }
  const row = prices.find((p) => p.sku === sku);
  return row ? row.wholesale : null;
}

/**
 * API legacy giữ để không phá call-site trong một lần nâng cấp. Các cột cước cũ chỉ là dữ liệu
 * tạm, không phải production truth; GĐ1 phải fail closed cho tới khi tenant có bảng vùng/cước
 * chính thức và một adapter/rule version đã được duyệt.
 */
export function computeShipping(_totalQuantity: number, _region: string, _cfg: RulesConfig): never {
  throw new Error('Thiếu cấu hình nghiệp vụ vận chuyển chính thức');
}

// Nhan chinh sach — thuat ngu that tu PO/quy trinh khach (cong no tinh tu NGAY NHAN HANG;
// ky gui = doi soat cuoi thang roi thanh toan; CTV = thanh toan 100% khi giao).
const POLICY_LABELS: Record<NonNullable<PricedOrder['policy']>, string> = {
  cong_no_30: 'Công nợ 30 ngày (từ ngày nhận hàng)',
  cong_no_45: 'Công nợ 45 ngày (từ ngày nhận hàng)',
  ky_gui: 'Ký gửi (chốt số cuối tháng)',
  thanh_toan_ngay: 'Thanh toán ngay (100% khi giao)',
  cod: 'COD (thu hộ khi giao)',
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
  if (p.orderType === 'TH2') lines.push('Phí ship/COD: Chưa cấu hình — Sale sẽ xác nhận');
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
    // Gia si biet duoc ke ca chua map dai ly (bang gia chung); Giam sat van leo thang neu dai ly la.
    const unitPrice = product
      ? (priceFor(
          product.sku,
          ctx.dealer?.id ?? null,
          item.quantity,
          ctx.prices,
          ctx.priceOverrides,
        ) ?? 0)
      : 0;
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
  // GĐ1 không có bảng vùng/cước/COD chính thức. Giữ field số = 0 để tương thích persistence,
  // nhưng KHÔNG diễn giải là miễn phí và luôn cảnh báo TH2 để chặn auto-confirm.
  const shippingFee = 0;
  const codCollect = parsed.orderType === 'TH2' && parsed.codCollect === true;
  const codFee = 0;
  // VAT đang thiếu quyết định tenant. Không mặc định có/không VAT; yêu cầu VAT sẽ chuyển Sale.
  const vat = false;
  const vatAmount = 0;
  const grandTotal = itemsSubtotal + shippingFee + vatAmount + codFee;

  const warnings: string[] = [];
  for (const l of lines) {
    if (!l.matched) warnings.push(`Chưa map được sản phẩm: "${l.skuRaw}"`);
  }
  if (!ctx.dealer) warnings.push('Chưa xác định đại lý từ nhóm Zalo');
  if (parsed.orderType === 'TH2') {
    warnings.push('Thiếu cấu hình: phí ship/COD và bảng vùng chính thức');
  }
  if (parsed.wantVat === true && parsed.noVat !== true) {
    warnings.push('Thiếu cấu hình: chính sách VAT chưa được duyệt');
  }
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
