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
  /** Mo ta ngan cho agent Tu van san pham (RAG). */
  description?: string;
}

/**
 * Bang gia thang 7.2026 (4 muc). Dai ly/CTV TRA gia si = `wholesale` (cot "Don gia CTV").
 * Cac muc con lai la tham chieu bao gia (dai ly ban ra cho khach le).
 */
export interface PriceRow {
  sku: string;
  /** Don gia CTV — gia SI dai ly/CTV tra (dung tinh don). */
  wholesale: number;
  /** Gia niem yet. */
  listPrice?: number;
  /** Gia ban le de xuat. */
  retailPrice?: number;
  /** Gia ban le TOI THIEU — san dai ly/CTV duoc ban ra. */
  minRetailPrice?: number;
}

/**
 * Deal RIENG cho dai ly lay so luong lon: override gia si theo dealer + sku
 * (khao sat: "mot so dai ly lay SL nhieu se co deal rieng"). Rong neu chua co so lieu.
 */
export interface DealerPriceOverride {
  dealerId: string;
  sku: string;
  price: number;
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
  /** Deal rieng theo dealer+sku (override wholesale). Rong khi chua co so lieu. */
  priceOverrides: DealerPriceOverride[];
  dealers: Dealer[];
  groups: GroupMap[];
  glossary: GlossaryEntry[];
}
