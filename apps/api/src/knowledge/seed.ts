import { loadTenantKnowledge } from '../tenant/tenant.config.js';
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
export const SEED: KnowledgeSnapshot = loadTenantKnowledge();
