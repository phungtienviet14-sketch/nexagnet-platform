import type { DealerTier, PolicyType } from '@netviet/shared';

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
  /** Mo ta ngan cho agent Tu van san pham (RAG). */
  description?: string;
}

/**
 * Bang gia thang 7.2026 (4 muc). Dai ly/CTV TRA gia si = `wholesale` (cot "Don gia CTV").
 * Cac muc con lai la tham chieu bao gia (dai ly ban ra cho khach le).
 */
export const PRICE_FIELDS = ['wholesale', 'minRetailPrice', 'retailPrice', 'listPrice'] as const;
export type PriceField = (typeof PRICE_FIELDS)[number];
export type PricePeriodStatus = 'draft' | 'active' | 'archived';
export const TEST_ONLY_PRICE_PERIOD_SOURCE = 'test_only';

export interface RetailAdviceStrategy {
  priceField: PriceField;
  qualifier: string;
}

export interface PriceRow {
  id?: string;
  periodId?: string;
  sku: string;
  /** Don gia CTV — gia SI dai ly/CTV tra (dung tinh don). */
  wholesale: number;
  /** Gia niem yet. */
  listPrice?: number;
  /** Gia ban le de xuat. */
  retailPrice?: number;
  /** Gia ban le TOI THIEU — san dai ly/CTV duoc ban ra. */
  minRetailPrice?: number;
  /** Ky gia cua row. Runtime chi duoc dung active + dung YYYY-MM hien tai. */
  validMonth?: string | null;
  periodStatus?: PricePeriodStatus;
}

/**
 * Deal RIENG cho dai ly lay so luong lon: override gia si theo dealer + sku
 * (khao sat: "mot so dai ly lay SL nhieu se co deal rieng"). Rong neu chua co so lieu.
 */
export interface DealerPriceOverride {
  dealerId: string;
  sku: string;
  price: number;
  /**
   * So luong TOI THIEU de deal co hieu luc. Rong = ap cho moi so luong.
   *
   * Co that trong hoi thoai khach (anh chup 25/07/2026): "Lay SL 5 cai gia co tot hon k e" ->
   * "Da c lay sl 5c. E xin gia 1150k a". Bo qua nguong nay thi don 1 cai cung duoc gia 1.150k,
   * tuc bao sai tien theo chieu nguoc lai.
   */
  minQuantity?: number;
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
  /** Ky gia seed/active dang duoc nap. Null = chua co bang gia hop le. */
  pricePeriod: { validMonth: string | null; status: PricePeriodStatus; source?: string | null } | null;
  products: Product[];
  prices: PriceRow[];
  /** Deal rieng theo dealer+sku (override wholesale). Rong khi chua co so lieu. */
  priceOverrides: DealerPriceOverride[];
  dealers: Dealer[];
  groups: GroupMap[];
  glossary: GlossaryEntry[];
}
