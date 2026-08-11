import type { GlossaryView, KnowledgeSummary, OrderView, PolicyType } from '@netviet/shared';

/**
 * Suy ra "AI ĐÃ DÙNG GÌ" tu kho tri thuc cho 1 tin — de panel Kho tri thuc/Luat da ap
 * hien ro AGENT lam gi voi du lieu, khong chi la bang tra cuu tinh.
 * Suy tu order (parsed/priced/chatId/rawText) + KnowledgeSummary da fetch.
 */

/** Chuan hoa tieng Viet (bo dau, thuong hoa) de so tu-khoa. */
export function normalizeVi(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd');
}

export interface UsedSku {
  skuRaw: string;
  sku: string;
  name: string;
  unitPrice: number;
  quantity: number;
}

export interface UsedGroup {
  groupName: string;
  dealerName: string | null;
  tierLabel: string;
  policy: PolicyType | null;
}

export interface KnowledgeUsage {
  /** Viet tat trong tin da co trong glossary (AI/Router giai ma). */
  glossary: GlossaryView[];
  /** SKU AI boc tach + rules khop gia. */
  skus: UsedSku[];
  usedSkus: Set<string>;
  /** Nhom -> dai ly dung de suy cap gia + chinh sach. */
  group?: UsedGroup;
}

const EMPTY: KnowledgeUsage = { glossary: [], skus: [], usedSkus: new Set() };

export function deriveKnowledgeUsage(
  order: OrderView | undefined,
  kb: KnowledgeSummary | undefined,
): KnowledgeUsage {
  if (!order || !kb) return EMPTY;

  const tokens = new Set(normalizeVi(order.rawText).split(/[^a-z0-9]+/).filter(Boolean));
  const glossary = kb.glossary.filter((g) => tokens.has(normalizeVi(g.term)));

  const skus: UsedSku[] = (order.priced?.lines ?? [])
    .filter((l) => l.matched && l.sku)
    .map((l) => ({
      skuRaw: l.skuRaw,
      sku: l.sku as string,
      name: l.productName ?? l.skuRaw,
      unitPrice: l.unitPrice,
      quantity: l.quantity,
    }));

  const g = kb.groups.find((x) => x.chatId === order.chatId);
  const group: UsedGroup | undefined = g
    ? {
        groupName: g.groupName,
        dealerName: g.dealerName,
        tierLabel: g.dealerTier === 'ctv' ? 'CTV' : 'Đại lý',
        policy: g.policy,
      }
    : undefined;

  return { glossary, skus, usedSkus: new Set(skus.map((s) => s.sku)), group };
}
