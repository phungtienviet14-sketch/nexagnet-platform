import { PATH_METADATA } from '@nestjs/common/constants.js';
import { describe, expect, it } from 'vitest';
import type { ErpOrder, ErpProduct } from '@netviet/shared';
import { ErpController } from './erp.controller.js';
import type { ErpPort } from './erp.port.js';

const products: ErpProduct[] = [
  { sku: 'SP-1', name: 'San pham 1', unit: 'cai', price: 1_000, stock: 5, sold: 0 },
];
const orders: ErpOrder[] = [];

const port = {
  listProducts: () => products,
  listOrders: () => orders,
} as unknown as ErpPort;

/** Duong dan khai bao tren controller — Nest luu duoi dang metadata, doc thang cho chac. */
const paths = Reflect.getMetadata(PATH_METADATA, ErpController) as string | string[];

describe('ErpController (cong doc trang thai ERP)', () => {
  it('duong dan chinh la /erp — nen tang khong dat ten route theo nha cung cap (G1-12)', () => {
    expect(paths).toContain('erp');
  });

  /**
   * Caddy (`@api ... /kiotviet*`) va proxy cua ban demo van liet ke duong cu. Doi ten ma bo luon
   * bi danh la lam 404 cac duong do ma khong ai thay cho toi luc deploy.
   */
  it('van phuc vu bi danh /kiotviet de khong pha thu dang tro vao duong cu', () => {
    expect(paths).toContain('kiotviet');
  });

  it('doc danh muc va don qua ErpPort, khong tu biet nha cung cap nao', () => {
    const controller = new ErpController(port);

    expect(controller.products()).toBe(products);
    expect(controller.orders()).toBe(orders);
  });
});
