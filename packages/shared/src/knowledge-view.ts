import type { DealerTier, PolicyType } from './order-view.js';

/**
 * DTO cong khai KHO TRI THUC (tang 6) cho cot "Nguon su that" tren console demo.
 * Read-only, pham vi demo — CHI lo SKU/gia/glossary/map nhom->dai ly de chung minh
 * AI bi rang buoc trong tu dien dong. TUYET DOI khong lo du lieu ca nhan khach
 * (SDT/dia chi) — nguon su that ve san pham, khong phai ve khach.
 */

export interface KnowledgeProductView {
  sku: string;
  name: string;
  unit: string;
  /** Gia SI dai ly/CTV tra (Don gia CTV — dung tinh don). */
  wholesale: number;
  /** Gia ban le de xuat (tham chieu bao gia); co the thieu voi mot so SKU phu. */
  retailPrice?: number;
  description?: string;
}

export interface GlossaryView {
  term: string;
  meaning: string;
}

export interface GroupMapView {
  chatId: string;
  groupName: string;
  dealerName: string | null;
  dealerTier: DealerTier | null;
  policy: PolicyType | null;
  branch: string;
}

export interface KnowledgeSummary {
  products: KnowledgeProductView[];
  glossary: GlossaryView[];
  groups: GroupMapView[];
  productCount: number;
  glossaryCount: number;
  groupCount: number;
}
