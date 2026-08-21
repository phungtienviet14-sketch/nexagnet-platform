/**
 * PARSER GIA — CHI DUNG TRONG TEST/DEMO OFFLINE. Nam trong `__tests__/` co chu y: truoc
 * 18/08/2026 no la `MockParser` trong `src/pipeline/` va la MOT LUA CHON cua `PARSER_MODE`,
 * tuc production co the roi vao no — am tham, khong log loi, moi don deu duoc trich xuat
 * bang mot bo mau co dinh. Gio khong con duong nao tu cau hinh dan toi lop nay.
 */
import type {
  FieldConfidence,
  Intent,
  OrderType,
  ParsedOrder,
  ParsedOrderItem,
  ParseResult,
} from '@netviet/shared';
import type { Product } from '../../knowledge/domain.js';
import { normalize } from '../../rules/text.js';
import type { OrderParser, ParserInput } from '../order-parser.js';
import { mentionedSkus } from '../contextual-parse.js';

/**
 * Parser TAT DINH (khong dung LLM) — dung cho demo offline / khong co ANTHROPIC_API_KEY.
 * Neo theo danh muc SP: tim ten SP trong tin, lay so ngay truoc lam so luong.
 * KHONG tinh tien (nguyen tac bat bien) — chi trich xuat cau truc tho.
 */

interface ExtractedItem {
  skuRaw: string;
  quantity: number;
  explicit: boolean;
}

const PRICE_KEYWORDS = /(bao nhieu|gia bao|\bgia\b|may tien|bao gia)/;
const WARRANTY_KEYWORDS = /(bao hanh|bi loi|doi tra|khieu nai|hong hoc|loi san pham|giao sai|giao thieu|thieu hang)/;
const POLICY_KEYWORDS = /(cong no|ky gui|tra cham|tra sau|han thanh toan|no bao nhieu|thanh toan sau|chinh sach)/;
const SHIP_KEYWORDS =
  /(khi nao.*(hang|giao|toi|nhan|den)|bao gio.*(hang|giao|toi|nhan|den)|van chuyen|giao hang|may ngay.*(hang|giao|toi)|hang toi chua|hang den chua|van don|tracking)/;
const PRODUCT_QUESTION_KEYWORDS =
  /(co tot|the nao|nhu the nao|ra sao|chat luong|review|danh gia|so sanh|khac gi|dung co tot|co ben|co dep|bao lau|tu van|gioi thieu|thong so|cong suat|kich thuoc|dung duoc khong)/;
const NO_VAT_KEYWORDS = /(ko lay vat|khong lay vat|ko vat|khong vat|ko xuat vat|khong xuat vat|mien vat)/;
const WANT_VAT_KEYWORDS = /(xuat vat|co vat|lay vat|xuat hoa don|co hoa don|lay hoa don|xuat hd)/;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripMention(text: string, botName?: string): string {
  if (!botName) return text;
  const pattern = '@\\s*' + botName.trim().split(/\s+/).map(escapeRegExp).join('\\s+');
  return text.replace(new RegExp(pattern, 'ig'), ' ');
}

/** So luong = so nguyen NGAY TRUOC vi tri ten SP (khong co -> 1, explicit=false). */
function quantityBefore(normText: string, idx: number): { quantity: number; explicit: boolean } {
  const prefixNumbers = normText.slice(0, idx).match(/\d+/g);
  const lastNumber = prefixNumbers?.[prefixNumbers.length - 1];
  return {
    quantity: lastNumber !== undefined ? Number.parseInt(lastNumber, 10) : 1,
    explicit: lastNumber !== undefined,
  };
}

function extractItems(normText: string, products: Product[]): ExtractedItem[] {
  // Gom MOI (sku, ten/alias) roi khop cum DAI truoc + TIEU THU vung da khop, de tin dang
  // "combo wfx pf360" khong dem trung ca WFX lan COMBO (alias 'wfx' la substring cua 'combo wfx').
  const candidates = products
    .flatMap((p) => [p.name, ...p.aliases].map((raw) => ({ sku: p.sku, text: normalize(raw) })))
    .filter((c) => c.text.length >= 3)
    .sort((a, b) => b.text.length - a.text.length);

  const consumed: Array<[number, number]> = [];
  const usedSkus = new Set<string>();
  const matched: { skuRaw: string; idx: number }[] = [];

  for (const cand of candidates) {
    if (usedSkus.has(cand.sku)) continue;
    const idx = normText.indexOf(cand.text);
    if (idx < 0) continue;
    const end = idx + cand.text.length;
    if (consumed.some(([s, e]) => idx < e && s < end)) continue; // chong lan vung da khop -> bo
    consumed.push([idx, end]);
    usedSkus.add(cand.sku);
    matched.push({ skuRaw: cand.text, idx });
  }

  return matched
    .sort((a, b) => a.idx - b.idx) // thu tu tu nhien theo vi tri trong tin
    .map((m) => ({ skuRaw: m.skuRaw, ...quantityBefore(normText, m.idx) }));
}

function classifyIntent(normText: string, items: ExtractedItem[]): Intent {
  const hasExplicitItem = items.some((i) => i.explicit);
  // Don ro rang (co so luong + SP) thang truoc.
  if (hasExplicitItem) return 'dat_don';
  // Cac tuyen cau hoi/nghiep vu xet TRUOC nhanh "co ten SP -> dat_don"
  // de tin hoi (khong so luong) khong bi nuot thanh don.
  if (WARRANTY_KEYWORDS.test(normText)) return 'bao_hanh_khieu_nai';
  if (POLICY_KEYWORDS.test(normText)) return 'chinh_sach_cong_no';
  if (SHIP_KEYWORDS.test(normText)) return 'van_chuyen';
  if (PRICE_KEYWORDS.test(normText)) return 'hoi_gia';
  if (items.length > 0 && PRODUCT_QUESTION_KEYWORDS.test(normText)) return 'hoi_san_pham';
  if (items.length > 0) return 'dat_don';
  return 'khac';
}

export class FakeParser implements OrderParser {
  readonly name = 'mock';

  async parse(input: ParserInput): Promise<ParseResult> {
    const cleaned = inheritUnambiguousProduct(stripMention(input.text, input.botName), input);
    const normText = normalize(cleaned);
    const items = extractItems(normText, input.products);
    const intent = classifyIntent(normText, items);

    const confidence: FieldConfidence = { intent: 0.9 };

    if (intent !== 'dat_don' || items.length === 0) {
      return { intent, confidence };
    }

    const phoneMatch = normText.match(/0\d{9}/);
    const orderType: OrderType = phoneMatch ? 'TH2' : 'TH1';
    items.forEach((it, i) => {
      confidence[`items.${i}.quantity`] = it.explicit ? 0.9 : 0.5;
      confidence[`items.${i}.product`] = 0.9;
    });
    const base = {
      orderType,
      dealerNameRaw: input.dealerNameRaw,
      noVat: NO_VAT_KEYWORDS.test(normText),
      wantVat: WANT_VAT_KEYWORDS.test(normText),
      ...(phoneMatch ? { customerPhone: phoneMatch[0] } : {}),
    };

    // Khach KHONG viet so luong -> don NUA VOI, khong phai don 1 chiec (Pha 6).
    //
    // Truoc do cho nay dien `quantity: 1` cho moi dong khong co so. "gui ghe felix ve TN cho c"
    // thanh mot don 1 ghe, di het duong rules engine ma khong sinh canh bao nao, va o duoi nguong
    // tu xac nhan nen duoc GUI THANG cho khach. Nay no la `draft` va he thong se hoi lai.
    if (items.some((it) => !it.explicit)) {
      return {
        intent,
        draft: {
          ...base,
          items: items.map((it) => ({
            skuRaw: it.skuRaw,
            ...(it.explicit ? { quantity: it.quantity } : {}),
          })),
        },
        confidence,
      };
    }

    const orderItems: ParsedOrderItem[] = items.map((it) => ({
      skuRaw: it.skuRaw,
      quantity: it.quantity,
    }));
    const order: ParsedOrder = { ...base, items: orderItems };

    return { intent, order, confidence };
  }
}

/** Mock demo cung tuan thu semantics context, nhung chi ke thua khi tham chieu co dung mot SKU. */
function inheritUnambiguousProduct(currentText: string, input: ParserInput): string {
  if (mentionedSkus(currentText, input.products).size > 0 || !/\d+/.test(currentText)) {
    return currentText;
  }
  const reference = input.context?.quotedMessage ?? input.context?.recentMessages.at(-1);
  if (!reference) return currentText;
  const skus = mentionedSkus(reference.text, input.products);
  if (skus.size !== 1) return currentText;
  const sku = [...skus][0]!;
  const product = input.products.find((candidate) => candidate.sku === sku);
  return product ? `${currentText} ${product.name}` : currentText;
}
