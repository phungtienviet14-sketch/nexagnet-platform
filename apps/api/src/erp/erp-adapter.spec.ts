import { describe, expect, it } from 'vitest';
import type { PricedOrder } from '@netviet/shared';
import type { KnowledgeService } from '../knowledge/knowledge.service.js';
import { createErpAdapter } from './erp-adapter.js';
import { KiotVietMockAdapter } from './kiotviet.mock.adapter.js';
import { NoopErpAdapter } from './noop-erp.adapter.js';

/**
 * Nhan KHONG duoc biet ten nha cung cap ERP nao (G1-12). Viec chon hien thuc la mot bang tra cuu
 * thuan tuy o day — tach khoi Nest provider dung khuon `media-policy.ts` / `media.provider.ts`,
 * nen kiem duoc ma khong dung den DI, bien moi truong hay file goi khach.
 */

const knowledge = {
  products: () => [{ sku: 'SP-1', name: 'San pham 1', unit: 'cai', aliases: [] }],
  prices: () => [{ sku: 'SP-1', wholesale: 1_000 }],
} as unknown as KnowledgeService;

const pricedOrder = {
  dealerName: 'Dai ly mau',
  branch: 'HN',
  itemsSubtotal: 1_000,
  grandTotal: 1_000,
  lines: [{ sku: 'SP-1', quantity: 1 }],
} as unknown as PricedOrder;

describe('createErpAdapter (chon hien thuc ERP theo goi khach)', () => {
  it('kiotviet_mock -> hien thuc gia lap cua nha cung cap do', () => {
    expect(createErpAdapter('kiotviet_mock', { knowledge })).toBeInstanceOf(KiotVietMockAdapter);
  });

  it('none -> NoopErpAdapter: danh muc va don deu rong, khong nem khi CHI doc', () => {
    const erp = createErpAdapter('none', { knowledge });

    expect(erp).toBeInstanceOf(NoopErpAdapter);
    expect(erp.listProducts()).toEqual([]);
    expect(erp.listOrders()).toEqual([]);
  });

  /**
   * Fail-closed giong `computeShipping()`: khach chua noi he thong ERP nao thi mot loi goi day don
   * PHAI vo ra tieng, khong duoc tra ve ma don gia roi de Sale tuong don da len ERP.
   */
  it('none -> pushOrder NEM, khong am tham tra ve ma don gia', async () => {
    const erp = createErpAdapter('none', { knowledge });

    await expect(erp.pushOrder(pricedOrder)).rejects.toThrow(/chua cau hinh he thong ERP/i);
  });

  it('mac dinh (goi khach khong khai bao) -> none, khong doan nha cung cap', () => {
    expect(createErpAdapter(undefined, { knowledge })).toBeInstanceOf(NoopErpAdapter);
  });
});
