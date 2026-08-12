import { describe, expect, it } from 'vitest';
import type { PricedLine, PricedOrder } from '@netviet/shared';
import { KnowledgeService } from '../knowledge/knowledge.service.js';
import { KiotVietMockAdapter } from './kiotviet.mock.adapter.js';

function line(sku: string | null, quantity: number): PricedLine {
  return {
    skuRaw: sku ?? 'la',
    sku,
    productName: sku,
    quantity,
    unitPrice: 1000,
    lineTotal: 1000 * quantity,
    matched: sku != null,
  };
}

function order(lines: PricedLine[]): PricedOrder {
  const itemsSubtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  return {
    orderType: 'TH1',
    dealerName: 'Meta HN',
    branch: 'HN',
    lines,
    itemsSubtotal,
    shippingFee: 0,
    policy: 'cong_no_30',
    codCollect: false,
    codFee: 0,
    vat: false,
    vatAmount: 0,
    grandTotal: itemsSubtotal,
    warnings: [],
    confirmationText: 'x',
  };
}

describe('KiotVietMockAdapter (trang thai cho tab KiotViet)', () => {
  it('seed danh muc tu nguon su that, ton kho ban dau > 0', () => {
    const knowledge = new KnowledgeService(undefined, new Date('2026-07-15T00:00:00.000Z'));
    const kv = new KiotVietMockAdapter(knowledge);
    const products = kv.listProducts();

    expect(products).toHaveLength(knowledge.products().length);
    expect(products.every((p) => p.stock === 100)).toBe(true);
    expect(products.every((p) => p.sold === 0)).toBe(true);
    expect(products.every((p) => p.price > 0)).toBe(true);
    expect(kv.listOrders()).toHaveLength(0);
  });

  it('day don -> tao ma KV-, luu vao danh sach, tru ton kho dung SKU', async () => {
    const knowledge = new KnowledgeService(undefined, new Date('2026-07-15T00:00:00.000Z'));
    const kv = new KiotVietMockAdapter(knowledge);
    const sku = knowledge.products()[0]!.sku;

    const res = await kv.pushOrder(order([line(sku, 10)]));

    expect(res.code).toMatch(/^KV-/);
    expect(kv.listOrders()).toHaveLength(1);
    expect(kv.listOrders()[0]!.code).toBe(res.code);
    const p = kv.listProducts().find((x) => x.sku === sku)!;
    expect(p.stock).toBe(90);
    expect(p.sold).toBe(10);
  });

  it('nhieu don -> moi nhat dung dau danh sach, ma don tang dan', async () => {
    const knowledge = new KnowledgeService(undefined, new Date('2026-07-15T00:00:00.000Z'));
    const kv = new KiotVietMockAdapter(knowledge);
    const sku = knowledge.products()[0]!.sku;

    const first = await kv.pushOrder(order([line(sku, 1)]));
    const second = await kv.pushOrder(order([line(sku, 1)]));

    expect(kv.listOrders()[0]!.code).toBe(second.code); // moi nhat truoc
    expect(kv.listOrders()[1]!.code).toBe(first.code);
    expect(kv.listProducts().find((p) => p.sku === sku)!.stock).toBe(98);
  });

  it('day don vuot ton -> ton kho chan san 0, khong am (M2)', async () => {
    const knowledge = new KnowledgeService(undefined, new Date('2026-07-15T00:00:00.000Z'));
    const kv = new KiotVietMockAdapter(knowledge);
    const sku = knowledge.products()[0]!.sku;

    await kv.pushOrder(order([line(sku, 250)])); // vuot ton ban dau (100)

    expect(kv.listProducts().find((p) => p.sku === sku)!.stock).toBe(0);
  });

  it('dong khong map SKU (sku=null) -> khong tru ton, khong loi', async () => {
    const knowledge = new KnowledgeService(undefined, new Date('2026-07-15T00:00:00.000Z'));
    const kv = new KiotVietMockAdapter(knowledge);
    const before = kv.listProducts().map((p) => p.stock);

    await kv.pushOrder(order([line(null, 5)]));

    expect(kv.listProducts().map((p) => p.stock)).toEqual(before);
    expect(kv.listOrders()).toHaveLength(1);
  });
});
