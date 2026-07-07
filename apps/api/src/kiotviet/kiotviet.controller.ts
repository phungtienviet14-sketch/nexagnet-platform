import { Controller, Get } from '@nestjs/common';
import type { KiotVietOrder, KiotVietProduct } from '@ultty/shared';
import { KiotVietAdapter } from './kiotviet.adapter.js';

/** Cong xem trang thai KiotViet (mock) cho tab "KiotViet" tren app. */
@Controller('kiotviet')
export class KiotVietController {
  constructor(private readonly kiotViet: KiotVietAdapter) {}

  @Get('products')
  products(): KiotVietProduct[] {
    return this.kiotViet.listProducts();
  }

  @Get('orders')
  orders(): KiotVietOrder[] {
    return this.kiotViet.listOrders();
  }
}
