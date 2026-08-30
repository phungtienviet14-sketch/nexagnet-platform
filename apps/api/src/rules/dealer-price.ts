import type { DealerPriceOverride, PriceRow } from '../knowledge/domain.js';

/**
 * CONG DUY NHAT quyet dinh mot dai ly duoc ap GIA RIENG hay GIA SI CHUNG cho mot SKU.
 *
 * Vi sao la mot ham rieng chu khong phai vai dong trong `priceFor`:
 *
 * 1. `enabled` / `effectiveFrom` / `effectiveTo` truoc day CHI duoc loc trong cau truy van luc
 *    nap snapshot. Snapshot nap MOT LAN luc boot (`KnowledgeService.onModuleInit`) va chi nap lai
 *    khi co nguoi sua nguon su that — nen mot tien trinh API song lien tuc van ap deal DA HET HAN,
 *    va van bo qua deal VUA TOI ngay hieu luc. Quyet dinh phai chay lai tren `now` cua TUNG luot.
 * 2. Mot cong nghiep vu co N duong tu choi phai phan biet duoc N ly do (ecc/code-review.md).
 *    Tra ve `number | null` thi "khong co deal", "deal tat", "deal het han" va "chua du so luong"
 *    deu thanh cung mot con so — khong loc duoc, khong dem duoc, khong debug duoc.
 *
 * Ham THUAN: khong doc dong ho he thong, khong cham telemetry. `rules/` khong duoc phu thuoc
 * runtime vao tang quan sat; ben goi (co `TelemetryService`) moi la noi phat quyet dinh.
 */

/** Nguon cua don gia cuoi cung — nhin mot phat biet tien o dau ra. */
export type DealerPriceSource = 'dealer_override' | 'base_wholesale' | 'unresolved';

/**
 * Ma ly do. Trung ten voi bo tu vung quyet dinh cua ban hang
 * (`orders/sales-order-decisions.ts` — `rules.dealer_price`) de mot ma di thang tu day ra trace
 * ma khong qua mot bang anh xa nao.
 */
export type DealerPriceReason =
  | 'DEALER_PRICE_OVERRIDE_APPLIED'
  | 'DEALER_PRICE_BASE_NO_OVERRIDE'
  | 'DEALER_PRICE_OVERRIDE_DISABLED'
  | 'DEALER_PRICE_OVERRIDE_NOT_YET_EFFECTIVE'
  | 'DEALER_PRICE_OVERRIDE_EXPIRED'
  | 'DEALER_PRICE_OVERRIDE_BELOW_MIN_QUANTITY'
  | 'DEALER_PRICE_DEALER_UNKNOWN'
  | 'DEALER_PRICE_SKU_UNPRICED';

export interface DealerPriceResolution {
  /** `null` = khong tinh duoc gia. KHONG duoc doi thanh 0 — 0 la mot so tien. */
  readonly unitPrice: number | null;
  readonly source: DealerPriceSource;
  readonly reason: DealerPriceReason;
  /** ID ban ghi deal da xet (ke ca khi bi tu choi) — de doi chieu voi Postgres. */
  readonly overrideId: string | null;
  /** Nguong da ap dung khi xet. `null` khi khong co deal nao de xet. */
  readonly minQuantity: number | null;
}

export interface DealerPriceQuery {
  readonly sku: string;
  readonly dealerId: string | null;
  readonly quantity: number;
  readonly prices: readonly PriceRow[];
  readonly overrides: readonly DealerPriceOverride[];
  readonly now: Date;
}

/**
 * ASM-03 (Issue #77): deal ap tu SL 1 cho toi khi khach noi khac.
 *
 * Ban ghi cu trong Postgres co `minQuantity = NULL`. Doc NULL ra phai cho DUNG mot gia dinh — 1 —
 * chu khong phai mot khai niem "khong gioi han" rieng: hai duong hieu khac nhau cho cung mot o
 * du lieu la cho de lech gia.
 */
export const DEFAULT_MIN_QUANTITY = 1;

export function resolveDealerPrice(query: DealerPriceQuery): DealerPriceResolution {
  const base = query.prices.find((row) => row.sku === query.sku)?.wholesale ?? null;

  // Chua map dai ly thi KHONG duoc doi chieu deal cua bat ky ai — gia rieng la cua rieng mot
  // dai ly, ro sang nguoi khac la bao sai gia cho ca hai.
  if (!query.dealerId) return fallback(base, 'DEALER_PRICE_DEALER_UNKNOWN', null, null);

  const override = query.overrides.find(
    (candidate) => candidate.dealerId === query.dealerId && candidate.sku === query.sku,
  );
  if (!override) return fallback(base, 'DEALER_PRICE_BASE_NO_OVERRIDE', null, null);

  const overrideId = override.id ?? null;
  const minQuantity = override.minQuantity ?? DEFAULT_MIN_QUANTITY;

  // `enabled` vang mat = dang bat: goi khach in-memory khong khai truong nay, va coi thieu la tat
  // se lam moi deal bien mat im lang khi doi PERSISTENCE.
  if (override.enabled === false) {
    return fallback(base, 'DEALER_PRICE_OVERRIDE_DISABLED', overrideId, minQuantity);
  }
  if (override.effectiveFrom && query.now.getTime() < override.effectiveFrom.getTime()) {
    return fallback(base, 'DEALER_PRICE_OVERRIDE_NOT_YET_EFFECTIVE', overrideId, minQuantity);
  }
  if (override.effectiveTo && query.now.getTime() > override.effectiveTo.getTime()) {
    return fallback(base, 'DEALER_PRICE_OVERRIDE_EXPIRED', overrideId, minQuantity);
  }
  // Nguong la ">=": deal "lay 5 cai moi duoc gia nay" phai an NGAY o cai thu 5.
  if (query.quantity < minQuantity) {
    return fallback(base, 'DEALER_PRICE_OVERRIDE_BELOW_MIN_QUANTITY', overrideId, minQuantity);
  }

  return {
    unitPrice: override.price,
    source: 'dealer_override',
    reason: 'DEALER_PRICE_OVERRIDE_APPLIED',
    overrideId,
    minQuantity,
  };
}

/**
 * Quay ve bang gia chung. Neu bang gia chung cung khong co dong nao cho SKU thi KHONG bia ra so:
 * `unresolved` chay tiep thanh canh bao va chan auto-confirm o tang tren.
 */
function fallback(
  base: number | null,
  reason: DealerPriceReason,
  overrideId: string | null,
  minQuantity: number | null,
): DealerPriceResolution {
  if (base === null) {
    return {
      unitPrice: null,
      source: 'unresolved',
      reason: 'DEALER_PRICE_SKU_UNPRICED',
      overrideId,
      minQuantity,
    };
  }
  return { unitPrice: base, source: 'base_wholesale', reason, overrideId, minQuantity };
}
