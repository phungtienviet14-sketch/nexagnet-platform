import type { FieldConfidence, Intent, ParsedOrder, ParsedOrderItem, ParseResult } from '@ultty/shared';
import type { Product } from '../knowledge/domain.js';
import { normalize } from '../rules/text.js';
import type { OrderParser, ParserInput } from './order-parser.js';

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
const WARRANTY_KEYWORDS = /(bao hanh|bi loi|doi tra|khieu nai|hong hoc|loi san pham)/;
const NO_VAT_KEYWORDS = /(ko lay vat|khong lay vat|ko vat|khong vat|ko xuat vat|khong xuat vat|mien vat)/;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripMention(text: string, botName?: string): string {
  if (!botName) return text;
  const pattern = '@\\s*' + botName.trim().split(/\s+/).map(escapeRegExp).join('\\s+');
  return text.replace(new RegExp(pattern, 'ig'), ' ');
}

function extractItems(normText: string, products: Product[]): ExtractedItem[] {
  const items: ExtractedItem[] = [];
  const usedSkus = new Set<string>();

  for (const product of products) {
    const candidates = [product.name, ...product.aliases]
      .map(normalize)
      .filter((c) => c.length >= 3)
      .sort((a, b) => b.length - a.length);

    for (const candidate of candidates) {
      const idx = normText.indexOf(candidate);
      if (idx < 0 || usedSkus.has(product.sku)) continue;

      const prefixNumbers = normText.slice(0, idx).match(/\d+/g);
      const lastNumber = prefixNumbers?.[prefixNumbers.length - 1];
      const explicit = lastNumber !== undefined;
      const quantity = lastNumber !== undefined ? Number.parseInt(lastNumber, 10) : 1;

      items.push({ skuRaw: candidate, quantity, explicit });
      usedSkus.add(product.sku);
      break;
    }
  }
  return items;
}

function classifyIntent(normText: string, items: ExtractedItem[]): Intent {
  const hasExplicitItem = items.some((i) => i.explicit);
  if (hasExplicitItem) return 'dat_don';
  if (PRICE_KEYWORDS.test(normText)) return 'hoi_gia';
  if (WARRANTY_KEYWORDS.test(normText)) return 'bao_hanh_khieu_nai';
  if (items.length > 0) return 'dat_don';
  return 'khac';
}

export class MockParser implements OrderParser {
  readonly name = 'mock';

  async parse(input: ParserInput): Promise<ParseResult> {
    const cleaned = stripMention(input.text, input.botName);
    const normText = normalize(cleaned);
    const items = extractItems(normText, input.products);
    const intent = classifyIntent(normText, items);

    const confidence: FieldConfidence = { intent: 0.9 };

    if (intent !== 'dat_don' || items.length === 0) {
      return { intent, confidence };
    }

    const phoneMatch = normText.match(/0\d{9}/);
    const orderType = phoneMatch ? 'TH2' : 'TH1';
    const orderItems: ParsedOrderItem[] = items.map((it) => ({
      skuRaw: it.skuRaw,
      quantity: it.quantity,
    }));
    items.forEach((it, i) => {
      confidence[`items.${i}.quantity`] = it.explicit ? 0.9 : 0.5;
      confidence[`items.${i}.product`] = 0.9;
    });

    const order: ParsedOrder = {
      orderType,
      dealerNameRaw: input.dealerNameRaw,
      items: orderItems,
      noVat: NO_VAT_KEYWORDS.test(normText),
      ...(phoneMatch ? { customerPhone: phoneMatch[0] } : {}),
    };

    return { intent, order, confidence };
  }
}
