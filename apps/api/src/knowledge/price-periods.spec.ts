import { describe, expect, it } from 'vitest';
import { currentPriceMonth, selectCurrentPrices } from './price-periods.js';
import type { PriceRow } from './domain.js';

describe('price period freshness', () => {
  const now = new Date('2026-08-12T05:00:00.000Z');
  const rows: PriceRow[] = [
    { sku: 'A', wholesale: 100, validMonth: '2026-07', periodStatus: 'active' },
    { sku: 'A', wholesale: 110, validMonth: '2026-08', periodStatus: 'draft' },
    { sku: 'A', wholesale: 120, validMonth: '2026-08', periodStatus: 'active' },
  ];

  it('builds the exact YYYY-MM lookup key', () => {
    expect(currentPriceMonth(now)).toBe('2026-08');
  });

  it('uses only the active exact-month period and never falls back', () => {
    expect(selectCurrentPrices(rows, now)).toEqual([rows[2]]);
    expect(selectCurrentPrices(rows.slice(0, 1), now)).toEqual([]);
    expect(selectCurrentPrices(rows.slice(1, 2), now)).toEqual([]);
  });
});
