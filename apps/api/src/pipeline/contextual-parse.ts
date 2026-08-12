import type { ConversationContext, ParseResult } from '@netviet/shared';
import type { Product } from '../knowledge/domain.js';
import { normalize } from '../rules/text.js';

const SAFE_FALLBACK: ParseResult = { intent: 'khac', confidence: { intent: 0 } };

/**
 * Chan LLM tu doan SKU khi tin hien tai khong nhac san pham. Chi chap nhan ke thua khi
 * quote (uu tien) hoac tin lien truoc co DUNG MOT SKU va output parser trung SKU do.
 */
export function validateContextualParse(
  result: ParseResult,
  currentText: string,
  products: Product[],
  context?: ConversationContext,
): ParseResult {
  if (result.intent !== 'dat_don' || !result.order) return result;
  if (mentionedSkus(currentText, products).size > 0) return result;

  const reference = context?.quotedMessage ?? context?.recentMessages.at(-1);
  if (!reference) return SAFE_FALLBACK;
  const referencedSkus = mentionedSkus(reference.text, products);
  if (referencedSkus.size !== 1 || result.order.items.length !== 1) return SAFE_FALLBACK;

  const expected = [...referencedSkus][0]!;
  const parsedSkus = mentionedSkus(result.order.items[0]!.skuRaw, products);
  return parsedSkus.size === 1 && parsedSkus.has(expected) ? result : SAFE_FALLBACK;
}

export function mentionedSkus(text: string, products: Product[]): Set<string> {
  const normalized = ` ${normalizeForMention(text)} `;
  const result = new Set<string>();
  for (const product of products) {
    const names = [product.sku, product.name, ...product.aliases]
      .map((value) => normalizeForMention(value).trim())
      .filter(Boolean);
    if (names.some((name) => normalized.includes(` ${name} `))) result.add(product.sku);
  }
  return result;
}

function normalizeForMention(text: string): string {
  return normalize(text).replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}
