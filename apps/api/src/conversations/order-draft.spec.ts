import { describe, expect, it } from 'vitest';
import type { ParseResult } from '@netviet/shared';
import type { Product } from '../knowledge/domain.js';
import {
  analyzeDraft,
  draftFromParse,
  draftHasContent,
  emptyDraft,
  mergeDraft,
  toParsedOrder,
} from './order-draft.js';

const PRODUCTS: Product[] = [
  { sku: 'V08', name: 'Máy hút bụi Ultty V08', aliases: ['v08', 'may hut bui v08'], unit: 'Chiếc' },
  { sku: 'FELIX', name: 'Ghế Felix', aliases: ['ghe felix', 'felix'], unit: 'Chiếc' },
];

const ctx = { products: PRODUCTS, dealerKnown: true };

describe('draftFromParse', () => {
  it('doc don day du tu truong order', () => {
    const parsed: ParseResult = {
      intent: 'dat_don',
      order: { orderType: 'TH1', items: [{ skuRaw: 'ghe felix', quantity: 10 }], noVat: true },
      confidence: { intent: 0.9 },
    };

    expect(draftFromParse(parsed).items).toEqual([{ skuRaw: 'ghe felix', quantity: 10 }]);
  });

  it('doc don nua voi tu truong draft khi thieu so luong', () => {
    const parsed: ParseResult = {
      intent: 'dat_don',
      draft: { items: [{ skuRaw: 'ghe felix' }] },
      confidence: { intent: 0.6 },
    };

    expect(draftFromParse(parsed).items).toEqual([{ skuRaw: 'ghe felix' }]);
  });
});

describe('mergeDraft', () => {
  it('cau tra loi chi co so luong dien vao dong dang thieu', () => {
    const previous = { items: [{ skuRaw: 'ghe felix' }] };
    const incoming = { items: [{ quantity: 20 }] };

    expect(mergeDraft({ previous, incoming }).items).toEqual([{ skuRaw: 'ghe felix', quantity: 20 }]);
  });

  it('khong doan khi co HAI dong dang thieu so luong', () => {
    const previous = { items: [{ skuRaw: 'ghe felix' }, { skuRaw: 'v08' }] };
    const incoming = { items: [{ quantity: 20 }] };

    // Dien bua vao mot trong hai la gui cho khach mot xac nhan sai ma khong sinh canh bao nao.
    expect(mergeDraft({ previous, incoming }).items).toHaveLength(3);
  });

  it('tin sau ghi de tin truoc tren cung mot san pham', () => {
    const previous = { items: [{ skuRaw: 'ghe felix', quantity: 10 }] };
    const incoming = { items: [{ skuRaw: 'ghe felix', quantity: 12 }] };

    expect(mergeDraft({ previous, incoming }).items).toEqual([{ skuRaw: 'ghe felix', quantity: 12 }]);
  });

  it('tin sau im lang KHONG xoa thong tin cu', () => {
    const previous = { items: [{ skuRaw: 'ghe felix', quantity: 10 }], noVat: true };
    const incoming = { items: [] };

    expect(mergeDraft({ previous, incoming })).toMatchObject({ noVat: true });
  });
});

describe('analyzeDraft', () => {
  it('thieu so luong -> hoi duoc khach', () => {
    const gaps = analyzeDraft({ items: [{ skuRaw: 'ghe felix' }] }, ctx);

    expect(gaps.askable).toEqual(['quantity']);
    expect(gaps.complete).toBe(false);
  });

  it('ten san pham khong khop danh muc -> hoi lai san pham', () => {
    const gaps = analyzeDraft({ items: [{ skuRaw: 'ghe abc', quantity: 2 }] }, ctx);

    expect(gaps.askable).toEqual(['product']);
  });

  it('nhom chua map dai ly la viec cua Sale, khong hoi khach', () => {
    const gaps = analyzeDraft({ items: [{ skuRaw: 'ghe felix', quantity: 2 }] }, {
      ...ctx,
      dealerKnown: false,
    });

    expect(gaps.askable).toEqual([]);
    expect(gaps.blocking).toContain('unmapped_dealer');
  });

  it('TH2 thieu nguoi nhan -> hoi khach, nhung cuoc/COD van chan', () => {
    const gaps = analyzeDraft(
      { orderType: 'TH2', items: [{ skuRaw: 'ghe felix', quantity: 2 }] },
      ctx,
    );

    expect(gaps.askable).toEqual(['recipient']);
    expect(gaps.blocking).toContain('shipping_cod_pricing');
  });

  it('don du -> complete', () => {
    const gaps = analyzeDraft({ items: [{ skuRaw: 'ghe felix', quantity: 2 }] }, ctx);

    expect(gaps).toMatchObject({ askable: [], complete: true });
  });
});

describe('toParsedOrder', () => {
  it('tra null khi con thieu — khong dien so luong mac dinh', () => {
    expect(toParsedOrder({ items: [{ skuRaw: 'ghe felix' }] }, ctx)).toBeNull();
  });

  it('dung ParsedOrder day du khi don da du', () => {
    const order = toParsedOrder({ items: [{ skuRaw: 'ghe felix', quantity: 20 }] }, ctx);

    expect(order).toEqual({
      orderType: 'TH1',
      items: [{ skuRaw: 'ghe felix', quantity: 20 }],
      noVat: false,
    });
  });
});

describe('draftHasContent', () => {
  it('don nhap rong thi khong tao mach', () => {
    expect(draftHasContent(emptyDraft())).toBe(false);
  });
});
