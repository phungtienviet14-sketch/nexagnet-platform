import { Injectable, Logger } from '@nestjs/common';
import type { KiotVietOrder, KiotVietProduct, PricedOrder } from '@ultty/shared';
import { KnowledgeService } from '../knowledge/knowledge.service.js';

/**
 * Tang 5 — tich hop KiotViet. KiotViet CHUA co API (khao sat) nen GD1 dung MOCK:
 * gia lap danh muc + ton kho + tao don, tra ve ma don. GD2 thay bang
 * KiotVietApiAdapter (goi API that hoac xuat Excel import) ma khong dung service.
 */
export abstract class KiotVietAdapter {
  abstract pushOrder(order: PricedOrder): Promise<{ code: string }>;
  /** Danh muc SP + ton kho hien tai (cho tab KiotViet tren app). */
  abstract listProducts(): KiotVietProduct[];
  /** Cac don da day len KiotViet (moi nhat truoc). */
  abstract listOrders(): KiotVietOrder[];
}

const INITIAL_STOCK = 100; // ton kho gia lap ban dau moi SKU (mock)
const PUSH_DELAY_MS = 250; // gia lap do tre goi API KiotViet

@Injectable()
export class KiotVietMockAdapter extends KiotVietAdapter {
  readonly name = 'mock';
  private readonly logger = new Logger('KiotVietMock');
  private counter = 1000;
  private readonly orders: KiotVietOrder[] = [];
  private readonly products = new Map<string, KiotVietProduct>();

  constructor(private readonly knowledge: KnowledgeService) {
    super();
    // Danh muc + ton kho gia lap dung theo nguon su that (KiotViet = source of truth kho).
    const priceOf = new Map(knowledge.prices().map((p) => [p.sku, p.prices.dai_ly]));
    for (const p of knowledge.products()) {
      this.products.set(p.sku, {
        sku: p.sku,
        name: p.name,
        unit: p.unit,
        price: priceOf.get(p.sku) ?? 0,
        stock: INITIAL_STOCK,
      });
    }
  }

  async pushOrder(order: PricedOrder): Promise<{ code: string }> {
    await new Promise((resolve) => setTimeout(resolve, PUSH_DELAY_MS));
    this.counter += 1;
    const code = `KV-${this.counter}`;

    // Gia lap xuat kho: tru ton cho cac dong da map SKU (immutable — thay object moi).
    for (const line of order.lines) {
      if (!line.sku) continue;
      const cur = this.products.get(line.sku);
      if (cur) this.products.set(line.sku, { ...cur, stock: cur.stock - line.quantity });
    }

    this.orders.unshift({
      code,
      dealerName: order.dealerName,
      branch: order.branch,
      itemsSubtotal: order.itemsSubtotal,
      grandTotal: order.grandTotal,
      lineCount: order.lines.length,
      createdAt: new Date().toISOString(),
    });
    this.logger.log(`[MOCK KiotViet] tao don ${code}: ${order.dealerName} · ${order.grandTotal}d`);
    return { code };
  }

  listProducts(): KiotVietProduct[] {
    return [...this.products.values()];
  }

  listOrders(): KiotVietOrder[] {
    return this.orders;
  }
}
