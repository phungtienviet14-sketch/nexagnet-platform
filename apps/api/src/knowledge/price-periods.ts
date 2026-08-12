import type { KnowledgeSnapshot, PriceRow } from './domain.js';

/** Khoa ky gia chuan. UTC giup worker/container o mui gio khac nhau van cho cung ket qua. */
export function currentPriceMonth(now?: Date): string {
  if (!now && process.env.NODE_ENV === 'test' && process.env.PRICE_CURRENT_MONTH) {
    return process.env.PRICE_CURRENT_MONTH;
  }
  return (now ?? new Date()).toISOString().slice(0, 7);
}

/** Fail closed: chi exact month + active; khong bao gio fallback ky truoc hay draft. */
export function selectCurrentPrices(rows: readonly PriceRow[], now?: Date): PriceRow[] {
  const month = currentPriceMonth(now);
  return rows.filter((row) => row.validMonth === month && row.periodStatus === 'active');
}

/**
 * Tenant seed keeps the period at snapshot level to avoid duplicating validMonth into every
 * row. Runtime rows are always annotated before lookup, then fail-closed to current active month.
 */
export function selectCurrentSnapshotPrices(
  snapshot: Pick<KnowledgeSnapshot, 'pricePeriod' | 'prices'>,
  now?: Date,
): PriceRow[] {
  if (!snapshot.pricePeriod?.validMonth || snapshot.pricePeriod.status !== 'active') return [];
  return selectCurrentPrices(
    snapshot.prices.map((row) => ({
      ...row,
      validMonth: row.validMonth ?? snapshot.pricePeriod?.validMonth ?? null,
      periodStatus: row.periodStatus ?? snapshot.pricePeriod?.status,
    })),
    now,
  );
}
