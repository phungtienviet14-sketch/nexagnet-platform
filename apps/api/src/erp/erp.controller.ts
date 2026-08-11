import { Controller, Get } from '@nestjs/common';
import type { ErpOrder, ErpProduct } from '@netviet/shared';
import { ErpPort } from './erp.port.js';

/**
 * Cong DOC trang thai ERP cho tab "KiotViet" tren app.
 * Duong dan giu nguyen `/kiotviet` (app web + hop dong route dang dung) du cong da trung tinh —
 * doi duong dan la viec cua Dot B4 khi co khach thu hai dung ERP khac.
 */
@Controller('kiotviet')
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
