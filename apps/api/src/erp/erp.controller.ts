import { Controller, Get } from '@nestjs/common';
import type { ErpOrder, ErpProduct } from '@netviet/shared';
import { ErpPort } from './erp.port.js';

/**
 * Cong DOC trang thai ERP cho tab ERP tren app.
 *
 * Duong dan chinh la `/erp` (G1-12) — nen tang dung chung khong duoc dat ten route theo mot nha
 * cung cap. `/kiotviet` giu lai lam BI DANH de khong pha thu gi con tro vao duong cu (Caddy
 * `@api` va proxy cua ban demo deu dang liet ke duong nay); bo han la viec cua mot dot don dep
 * rieng, sau khi da xac nhan khong con ai goi.
 */
@Controller(['erp', 'kiotviet'])
export class ErpController {
  constructor(private readonly erp: ErpPort) {}

  @Get('products')
  products(): ErpProduct[] {
    return this.erp.listProducts();
  }

  @Get('orders')
  orders(): ErpOrder[] {
    return this.erp.listOrders();
  }
}
