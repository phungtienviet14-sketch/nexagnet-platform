import { Injectable } from '@nestjs/common';
import type { ErpOrder, ErpProduct, PricedOrder } from '@netviet/shared';
import { ErpPort } from './erp.port.js';

/**
 * Hien thuc `ErpPort` cho tenant CHUA noi he thong ERP nao — mac dinh cua nen tang (G1-12).
 *
 * Doc thi tra rong (tab ERP tren app hien "chua co du lieu", khong vo giao dien). Nhung GHI thi
 * NEM: mot he thong tra ve ma don gia se lam Sale tin don da nam trong ERP va bo qua buoc nhap
 * tay — dung kieu hong am tham ma GD1 fail-closed o khap noi de tranh (`computeShipping()` cung
 * nem vi ly do nay). GD1 khong goi `pushOrder` o bat ky luong nao, nen duong nem nay la luoi an
 * toan cho tuong lai chu khong phai duong chay hom nay.
 */
@Injectable()
export class NoopErpAdapter extends ErpPort {
  async pushOrder(_order: PricedOrder): Promise<{ code: string }> {
    throw new Error(
      'Goi khach chua cau hinh he thong ERP (erp.adapter=none) — khong the day don len ERP. ' +
        'Khai bao `erp.adapter` trong tenants/<slug>/tenant.json neu khach da san sang tich hop.',
    );
  }

  listProducts(): ErpProduct[] {
    return [];
  }

  listOrders(): ErpOrder[] {
    return [];
  }
}
