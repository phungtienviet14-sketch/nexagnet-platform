import type { DealerTier, PolicyType } from '@ultty/shared';

/**
 * Mo hinh nguon su that (tang 6). Trong demo la du lieu GIA LAP seed san (seed.ts),
 * boc sau interface Repository de sau thay Prisma/Postgres o GD1.
 */

export interface Product {
  sku: string;
  name: string;
  /** Ten thuong goi/viet tat dai ly hay dung (vd "felix", "ghe felix") */
  aliases: string[];
  unit: string;
}

export interface PriceRow {
  sku: string;
  prices: Record<DealerTier, number>;
}

export interface Dealer {
  id: string;
  name: string;
  aliases: string[];
  tier: DealerTier;
  defaultPolicy: PolicyType;
}

export interface GroupMap {
  /** external_id nhom Zalo (vd zgr-...) */
  chatId: string;
  dealerId: string;
  branch: string;
  /** Ten hien thi nhom (UI feed + bo chon nhom khi demo) */
  name: string;
}

export interface GlossaryEntry {
  term: string;
  meaning: string;
}

export interface KnowledgeSnapshot {
  products: Product[];
  prices: PriceRow[];
  dealers: Dealer[];
  groups: GroupMap[];
  glossary: GlossaryEntry[];
}
