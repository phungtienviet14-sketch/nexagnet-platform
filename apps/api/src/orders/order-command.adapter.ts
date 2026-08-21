import { Injectable } from '@nestjs/common';
import type { OrderView, ParsedOrderItem } from '@netviet/shared';
import type { OrderCommandPort, OrderScope } from '../advisor/order-tools.js';
import { OrderAmendmentService } from './order-amendment.service.js';
import { OrdersRepository } from './orders.repository.js';
import { OrdersService } from './orders.service.js';

/**
 * Hien thuc `OrderCommandPort` — noi cong cu GHI cua agent voi kho don.
 *
 * TRACH NHIEM DUY NHAT VA QUAN TRONG NHAT cua lop nay la LOC THEO PHAM VI. `recent()` la cua vao
 * duy nhat ma `order-tools.ts` dung de tim don, nen bo loc o day chinh la thu chan mot LLM bi
 * chen prompt qua tin Zalo dong vao don cua nguoi khac. Khong duoc noi long no de "tien" hon.
 */
@Injectable()
export class OrderCommandAdapter implements OrderCommandPort {
  constructor(
    private readonly repo: OrdersRepository,
    private readonly orders: OrdersService,
    private readonly amendment: OrderAmendmentService,
  ) {}

  async recent(scope: OrderScope, limit: number): Promise<OrderView[]> {
    // Khong co uid nguoi gui thi KHONG tra ve gi: loc theo mot minh chatId nghia la moi thanh vien
    // trong nhom deu cham duoc don cua nhau.
    if (!scope.senderExternalId) return [];
    const all = await this.repo.list();
    return all
      .filter(
        (order) =>
          order.chatId === scope.chatId &&
          order.senderExternalId === scope.senderExternalId &&
          order.intent === 'dat_don',
      )
      .slice(0, limit);
  }

  async cancel(orderId: string, reason: string): Promise<OrderView> {
    return this.orders.cancelOrder(orderId, reason);
  }

  async replaceItems(
    orderId: string,
    items: readonly ParsedOrderItem[],
    reason: string,
  ): Promise<{ readonly cancelled: OrderView; readonly replacement: OrderView }> {
    return this.amendment.replaceItems(orderId, items, reason);
  }
}
