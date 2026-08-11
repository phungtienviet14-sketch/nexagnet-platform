import type { PolicyType, PricedOrder, SupervisorSummary } from '@netviet/shared';
import type { PriceRow, Product } from '../knowledge/domain.js';
import { formatVnd, normalize } from '../rules/text.js';
import { tenantPersona } from '../tenant/tenant.config.js';
import type { AgentsConfig } from './agents.config.js';

/**
 * Logic tat dinh (pure) cho tang agent. KHONG dung LLM. KHONG tinh tien:
 * moi con so tien deu doc lai tu PricedOrder (rules engine) — chi format/danh gia.
 */

// Thuat ngu that tu PO/quy trinh khach (cong no tinh tu ngay nhan hang; ky gui chot cuoi thang).
export const POLICY_LABELS: Record<PolicyType, string> = {
  cong_no_30: 'Công nợ 30 ngày (từ ngày nhận hàng)',
  cong_no_45: 'Công nợ 45 ngày (từ ngày nhận hàng)',
  ky_gui: 'Ký gửi (chốt số cuối tháng)',
  thanh_toan_ngay: 'Thanh toán ngay (100% khi giao)',
  cod: 'COD (thu hộ khi giao)',
};

/** Cac SP duoc nhac trong tin (so khop ten/alias khong dau). */
function productsInText(normText: string, products: Product[]): Product[] {
  const found: Product[] = [];
  for (const product of products) {
    const candidates = [product.name, ...product.aliases]
      .map(normalize)
      .filter((c) => c.length >= 3);
    if (candidates.some((c) => normText.includes(c))) found.push(product);
  }
  return found;
}

/**
 * Tu van SP: lay mo ta tu kho tri thuc (RAG tat dinh).
 * SP chua co description thi dung cau thay the cua GOI KHACH — khong hardcode ten khach.
 */
export function describeProducts(
  normText: string,
  products: Product[],
  fallbackDescription: string = tenantPersona().productFallbackDescription,
): { name: string; description: string }[] {
  return productsInText(normText, products).map((p) => ({
    name: p.name,
    description: p.description ?? fallbackDescription,
  }));
}

/** Bao gia: TRA CUU gia si (Don gia CTV) tu bang gia chung (khong hoi LLM). */
export function buildQuoteLines(
  normText: string,
  products: Product[],
  prices: PriceRow[],
): { name: string; unitPrice: number }[] {
  return productsInText(normText, products)
    .map((p) => {
      const row = prices.find((r) => r.sku === p.sku);
      return row ? { name: p.name, unitPrice: row.wholesale } : null;
    })
    .filter((x): x is { name: string; unitPrice: number } => x !== null);
}

/** Hau mai: phan nhanh bao hanh theo tu khoa (khong tu phan dinh loi). */
export function classifyWarranty(
  normText: string,
  cfg: AgentsConfig,
): { branchLabel: string; note: string } {
  if (cfg.warrantyWrongMissing.test(normText)) {
    return { branchLabel: 'Giao sai/thiếu', note: 'Xác minh vận đơn & ảnh, bù/đổi theo quy trình.' };
  }
  if (cfg.warrantyIn7.test(normText)) {
    return { branchLabel: 'Trong 7 ngày', note: '1 đổi 1 nếu lỗi nhà sản xuất; xin ảnh/clip lỗi.' };
  }
  return { branchLabel: 'Ngoài 7 ngày', note: 'Bảo hành theo chính sách hãng; chuyển kỹ thuật đánh giá.' };
}

/** Chinh sach & tai chinh: CHI format lai field tu PricedOrder (cam phep tinh). */
export function annotatePolicy(priced: PricedOrder): string[] {
  const notes: string[] = [];
  if (priced.policy) notes.push(POLICY_LABELS[priced.policy]);
  notes.push(priced.vat ? `VAT 10%: ${formatVnd(priced.vatAmount)}` : 'Không xuất VAT');
  if (priced.codCollect) notes.push(`Thu hộ COD: ${formatVnd(priced.codFee)}`);
  notes.push(priced.shippingFee === 0 ? 'Miễn phí ship (đơn ≥2 SP)' : `Phí ship: ${formatVnd(priced.shippingFee)}`);
  return notes;
}

/** Giam sat: danh gia rui ro tat dinh. Doc priced.grandTotal (khong tinh lai). */
export function assessRisk(
  priced: PricedOrder | null,
  intentConfidence: number,
  senderKnown: boolean,
  normText: string,
  cfg: AgentsConfig,
): SupervisorSummary {
  const reasons: string[] = [];
  let escalate = false;
  let watch = false;

  if (!senderKnown) {
    reasons.push('Chưa xác định đại lý từ nhóm — cần người thật xác minh');
    escalate = true;
  }
  if (cfg.harshComplaint.test(normText)) {
    reasons.push('Dấu hiệu khiếu nại gắt — chuyển người thật');
    escalate = true;
  }
  if (priced) {
    if (priced.grandTotal >= cfg.largeOrderTotal) {
      reasons.push(`Đơn lớn bất thường (${formatVnd(priced.grandTotal)})`);
      escalate = true;
    }
    const qty = priced.lines.reduce((sum, l) => sum + l.quantity, 0);
    if (qty >= cfg.largeOrderQuantity) {
      reasons.push(`Số lượng lớn (${qty})`);
      watch = true;
    }
    if (priced.warnings.length > 0) {
      reasons.push('Đơn có cảnh báo cần kiểm tra');
      watch = true;
    }
  }
  if (intentConfidence < cfg.lowConfidence) {
    reasons.push('Độ tin cậy phân loại thấp');
    watch = true;
  }

  const riskLevel: SupervisorSummary['riskLevel'] = escalate ? 'escalate' : watch ? 'watch' : 'none';
  return { riskLevel, escalate, reasons };
}
