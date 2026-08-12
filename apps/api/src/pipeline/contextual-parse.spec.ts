import { describe, expect, it } from 'vitest';
import type { ParseResult } from '@netviet/shared';
import type { Product } from '../knowledge/domain.js';
import { validateContextualParse } from './contextual-parse.js';

const PRODUCTS: Product[] = [
  { sku: 'ELNI', name: 'ELNI', aliases: ['noi elni'], unit: 'chiếc' },
  { sku: 'ELNA', name: 'ELNA', aliases: ['noi elna'], unit: 'chiếc' },
];

function parsed(skuRaw = 'ELNI'): ParseResult {
  return {
    intent: 'dat_don',
    order: { orderType: 'TH1', items: [{ skuRaw, quantity: 5 }], noVat: false },
    confidence: { intent: 0.9 },
  };
}

describe('validateContextualParse', () => {
  it('chap nhan SKU ke thua tu quote duy nhat', () => {
    const result = validateContextualParse(parsed(), 'c them 5c nhe', PRODUCTS, {
      quotedMessage: {
        externalMessageId: 'm-1',
        text: '10 ELNI',
        sentAt: new Date('2026-08-12T02:00:00.000Z'),
      },
      recentMessages: [],
      participants: [],
    });

    expect(result.intent).toBe('dat_don');
    expect(result.order?.items[0]).toMatchObject({ skuRaw: 'ELNI', quantity: 5 });
  });

  it('fail-safe khi quote co nhieu SKU', () => {
    const result = validateContextualParse(parsed(), 'c them 5c nhe', PRODUCTS, {
      quotedMessage: {
        externalMessageId: 'm-1',
        text: '10 ELNI va 3 ELNA',
        sentAt: new Date('2026-08-12T02:00:00.000Z'),
      },
      recentMessages: [],
      participants: [],
    });

    expect(result).toEqual({ intent: 'khac', confidence: { intent: 0 } });
  });

  it('fail-safe khi parser doan SKU khong trung tham chieu', () => {
    const result = validateContextualParse(parsed('ELNA'), 'c them 5c nhe', PRODUCTS, {
      quotedMessage: {
        externalMessageId: 'm-1',
        text: '10 ELNI',
        sentAt: new Date('2026-08-12T02:00:00.000Z'),
      },
      recentMessages: [],
      participants: [],
    });

    expect(result.intent).toBe('khac');
    expect(result.order).toBeUndefined();
  });
});
