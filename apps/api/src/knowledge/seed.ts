import { loadTenantConfig, loadTenantKnowledge } from '@netviet/tenant';
import type { KnowledgeSnapshot } from './domain.js';

/**
 * HAT GIONG nguon su that — doc tu GOI KHACH `tenants/<slug>/data/knowledge.json`.
 *
 * Truoc Dot B1 toan bo danh muc + bang gia + dai ly + glossary cua U Ultty nam THANG trong file
 * nay, nghia la them khach thu hai la phai sua nhan he thong. Nay nhan trung tinh: file chi con
 * cho nap, con so lieu thuoc ve goi khach (chon bang TENANT/TENANT_DIR — xem tenants/README.md).
 *
 * Day la HAT GIONG chu khong phai nguon su that luc chay: voi PERSISTENCE=prisma, sau lan seed
 * dau tien thi Postgres moi la nguon su that (sua qua /admin hoac MCP tool).
 *
 * Goi khach thieu/sai schema -> nem ngay luc nap module (fail fast), khong chay tiep voi
 * danh muc rong roi de parser doan bua.
 */

/**
 * KHACH KHONG BAT `knowledge` van phai boot duoc.
 *
 * Module nay duoc NAP cho MOI khach, khong phai chi khach co tri thuc: `app-composition.ts` import
 * tinh `KnowledgeService`/`ContentModule`, va mot `import` cua ESM chay ca do thi module bat ke
 * capability nao dang bat. Truoc ban sua nay, dong khoi tao ben duoi goi thang `loadTenantKnowledge()`,
 * va ham do NEM khi khach khong khai `knowledge` — nghia la mot khach khong tri thuc chet ngay luc
 * boot, truoc khi bat ky cong composition nao kip chay.
 *
 * Khong ai gap loi nay vi ba goi khach dang co deu bat `knowledge`. Khach van tai dau tien la
 * khach dau tien khong bat, va `app.module.transport-core.boot.spec.ts` da lam no do.
 *
 * Ban sua giu NGUYEN hanh vi cho khach CO `knowledge`: van goi va van nem neu goi hong. Cho duy
 * nhat doi la truong hop truoc day LUON nem — va o do, mot ban rong la dung, vi khong provider nao
 * cua `knowledge` co mat trong composition de doc no.
 */
const EMPTY_SNAPSHOT: KnowledgeSnapshot = {
  pricePeriod: null,
  products: [],
  prices: [],
  priceOverrides: [],
  dealers: [],
  groups: [],
  glossary: [],
};

export const SEED: KnowledgeSnapshot = loadTenantConfig().capabilities.includes('knowledge')
  ? loadTenantKnowledge()
  : EMPTY_SNAPSHOT;
