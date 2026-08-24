import type { PolicyType, PricedOrder, SenderType, SupervisorSummary } from '@netviet/shared';
import type { PriceRow, Product, RetailAdviceStrategy } from '../knowledge/domain.js';
import { formatVnd, normalize } from '../rules/text.js';
import { tenantKnowledgePersona } from '@netviet/tenant';
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

/**
 * Cac SP duoc nhac trong tin (so khop ten/alias khong dau).
 *
 * Khop cum DAI truoc roi TIEU THU vung da khop — cung thuat toan `mock-parser.ts` dung. Khong lam
 * vay thi "combo wfx" tra ve CA `COMBO-WFX-PF360` lan `WFX` (alias "wfx" la chuoi con), tuc bao
 * gia hai dong cho mot san pham khach hoi. Van tra nhieu SP khi tin nhac nhieu SP o cac vung KHAC
 * nhau ("2 quat cr022 + 1 may bat muoi").
 */
function productsInText(normText: string, products: Product[]): Product[] {
  const candidates = products
    .flatMap((product) =>
      [product.name, ...product.aliases].map((raw) => ({ product, text: normalize(raw) })),
    )
    .filter((candidate) => candidate.text.length >= 3)
    .sort((a, b) => b.text.length - a.text.length);

  const consumed: Array<[number, number]> = [];
  const matched: { product: Product; index: number }[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate.product.sku)) continue;
    const index = normText.indexOf(candidate.text);
    if (index < 0) continue;
    const end = index + candidate.text.length;
    if (consumed.some(([start, stop]) => index < stop && start < end)) continue;
    consumed.push([index, end]);
    seen.add(candidate.product.sku);
    matched.push({ product: candidate.product, index });
  }
  // Thu tu tu nhien theo vi tri trong tin — bao gia doc theo dung thu tu khach viet.
  return matched.sort((a, b) => a.index - b.index).map((entry) => entry.product);
}

/**
 * Tu van SP: lay mo ta tu kho tri thuc (RAG tat dinh).
 * SP chua co description thi dung cau thay the cua GOI KHACH — khong hardcode ten khach.
 * Cau do thuoc `knowledge` (kho tri thuc), khong thuoc duong xu ly luot.
 */
export function describeProducts(
  normText: string,
  products: Product[],
  fallbackDescription: string = tenantKnowledgePersona().productFallbackDescription,
): { name: string; description: string }[] {
  return productsInText(normText, products).map((p) => ({
    name: p.name,
    description: p.description ?? fallbackDescription,
  }));
}

/**
 * Bao gia: TRA CUU bang gia chung (khong hoi LLM).
 *
 * Truong gia phu thuoc NGUOI HOI, quyet dinh nghiep vu 18/08/2026:
 *  - dai ly / CTV  -> `wholesale` (Don gia CTV) — ho hoi gia HO nhap, khong phai gia ban le.
 *  - con lai       -> truong cau hinh cua tenant (`retailAdvice.priceField`) + cau qualifier.
 *
 * Truoc do luon tra `minRetailPrice` cho MOI nguoi trong khi nhan AgentTrace ghi "bao gia theo cap
 * dai ly" — Sale doc nhan tuong he thong da phan cap, con dai ly nhan mot con so cao hon 44% so
 * voi gia ho thuc su mua.
 */
export function buildQuoteLines(
  normText: string,
  products: Product[],
  prices: PriceRow[],
  strategy: RetailAdviceStrategy,
  senderType: SenderType = 'unknown',
): { name: string; unitPrice: number }[] {
  const priceField = quotePriceField(strategy, senderType);
  return productsInText(normText, products)
    .map((p) => {
      const row = prices.find((r) => r.sku === p.sku);
      const unitPrice = row?.[priceField];
      return typeof unitPrice === 'number' && unitPrice > 0 ? { name: p.name, unitPrice } : null;
    })
    .filter((x): x is { name: string; unitPrice: number } => x !== null);
}

/** Dai ly/CTV mua theo gia si; moi cap khac dung truong gia le cau hinh theo tenant. */
export function quotePriceField(
  strategy: RetailAdviceStrategy,
  senderType: SenderType,
): RetailAdviceStrategy['priceField'] {
  return senderType === 'dai_ly' || senderType === 'ctv' ? 'wholesale' : strategy.priceField;
}

/**
 * Cau chu di kem bao gia. Gia si la gia GIAO DICH THAT cua dai ly nen khong duoc dan cau qualifier
 * "day chi la gia tham khao" cua gia le vao — noi vay la noi sai ve chinh con so vua bao.
 */
export function quoteQualifier(strategy: RetailAdviceStrategy, senderType: SenderType): string {
  return senderType === 'dai_ly' || senderType === 'ctv'
    ? 'Đây là đơn giá CTV (giá sỉ) áp dụng cho đại lý/CTV theo bảng giá hiện hành.'
    : strategy.qualifier;
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
  if (priced.warnings.some((warning) => /VAT/i.test(warning))) notes.push('VAT: Chưa cấu hình');
  if (priced.orderType === 'TH2') notes.push('Phí ship/COD: Chưa cấu hình');
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
