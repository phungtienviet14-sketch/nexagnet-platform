import { describe, expect, it } from 'vitest';
import {
  intentResultSchema,
  parsedOrderItemSchema,
  parsedOrderSchema,
  parseResultSchema,
} from '../order.js';

describe('intentResultSchema', () => {
  it('chap nhan intent hop le kem do tin cay', () => {
    const parsed = intentResultSchema.parse({ intent: 'dat_don', confidence: 0.9 });
    expect(parsed.intent).toBe('dat_don');
  });

  it('tu choi intent ngoai 7 loai', () => {
    const result = intentResultSchema.safeParse({ intent: 'mua_ban', confidence: 0.5 });
    expect(result.success).toBe(false);
  });

  it('tu choi confidence ngoai [0,1]', () => {
    expect(intentResultSchema.safeParse({ intent: 'khac', confidence: 1.5 }).success).toBe(false);
  });
});

describe('parsedOrderItemSchema', () => {
  it('chap nhan mat hang hop le', () => {
    const parsed = parsedOrderItemSchema.parse({ skuRaw: 'ghe felix', quantity: 10, unitPriceRaw: 1150000 });
    expect(parsed.quantity).toBe(10);
  });

  it('tu choi so luong 0 hoac am', () => {
    expect(parsedOrderItemSchema.safeParse({ skuRaw: 'ghe felix', quantity: 0 }).success).toBe(false);
    expect(parsedOrderItemSchema.safeParse({ skuRaw: 'ghe felix', quantity: -3 }).success).toBe(false);
  });

  it('tu choi ten SP rong', () => {
    expect(parsedOrderItemSchema.safeParse({ skuRaw: '', quantity: 2 }).success).toBe(false);
  });
});

describe('parsedOrderSchema', () => {
  it('chap nhan don TH1 toi thieu va mac dinh noVat=false', () => {
    const parsed = parsedOrderSchema.parse({
      orderType: 'TH1',
      dealerNameRaw: 'Meta HN',
      items: [{ skuRaw: 'ghe felix', quantity: 10 }],
    });
    expect(parsed.orderType).toBe('TH1');
    expect(parsed.noVat).toBe(false);
  });

  it('chap nhan don TH2 co thong tin khach le', () => {
    const parsed = parsedOrderSchema.parse({
      orderType: 'TH2',
      items: [{ skuRaw: 'ghe felix', quantity: 10 }],
      customerName: 'Chi Lan',
      customerPhone: '0912xxxxxx',
      customerAddress: 'Thai Nguyen',
      codCollect: true,
    });
    expect(parsed.customerName).toBe('Chi Lan');
    expect(parsed.codCollect).toBe(true);
  });

  it('tu choi don khong co mat hang nao', () => {
    expect(parsedOrderSchema.safeParse({ orderType: 'TH1', items: [] }).success).toBe(false);
  });
});

describe('parseResultSchema', () => {
  it('intent dat_don kem order va field confidence', () => {
    const parsed = parseResultSchema.parse({
      intent: 'dat_don',
      order: { orderType: 'TH1', items: [{ skuRaw: 'ghe felix', quantity: 10 }] },
      confidence: { 'items.0.quantity': 0.95 },
    });
    expect(parsed.order?.items).toHaveLength(1);
    expect(parsed.confidence['items.0.quantity']).toBe(0.95);
  });

  it('intent khac khong bat buoc co order, confidence mac dinh rong', () => {
    const parsed = parseResultSchema.parse({ intent: 'khac' });
    expect(parsed.order).toBeUndefined();
    expect(parsed.confidence).toEqual({});
  });
});
