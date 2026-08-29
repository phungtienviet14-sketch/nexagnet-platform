import { describe, expect, it } from 'vitest';
import type { DealerPriceOverride, PriceRow } from '../knowledge/domain.js';
import { resolveDealerPrice } from './dealer-price.js';

/**
 * CONG GIA RIENG THEO DAI LY — bo test nay la HOP DONG cua U2 Step 2.
 *
 * Truoc ban va, `enabled` / `effectiveFrom` / `effectiveTo` chi duoc loc trong CAU TRUY VAN luc
 * nap snapshot (`prisma-knowledge.repository.ts`). Snapshot do duoc nap MOT LAN luc boot va chi
 * nap lai khi co nguoi sua nguon su that, nen mot tien trinh API chay lien tuc se:
 *   · van ap mot deal DA HET HAN tu luc boot toi luc co nguoi bam Sua;
 *   · van KHONG ap mot deal vua toi ngay hieu luc.
 * Ca hai deu la bao SAI GIA cho khach ma khong sinh mot canh bao nao.
 *
 * Nen cong nay phai quyet dinh tai LUC TINH GIA, tren `now` cua chinh luot do.
 */

const prices: PriceRow[] = [
  { sku: 'GHE-FELIX', wholesale: 1_150_000 },
  { sku: 'NOI-CHIEN', wholesale: 890_000 },
];

const now = new Date('2026-08-15T03:00:00Z');

function override(patch: Partial<DealerPriceOverride> = {}): DealerPriceOverride {
  return {
    id: 'ovr-1',
    dealerId: 'd1',
    sku: 'GHE-FELIX',
    price: 1_000_000,
    minQuantity: 1,
    enabled: true,
    ...patch,
  };
}

describe('resolveDealerPrice — cong quyet dinh gia rieng', () => {
  it('dai ly A + SKU X + qty 1 + minQty 1 -> AP DEAL RIENG', () => {
    const result = resolveDealerPrice({
      sku: 'GHE-FELIX',
      dealerId: 'd1',
      quantity: 1,
      prices,
      overrides: [override()],
      now,
    });
    expect(result.source).toBe('dealer_override');
    expect(result.reason).toBe('DEALER_PRICE_OVERRIDE_APPLIED');
    expect(result.unitPrice).toBe(1_000_000);
    expect(result.overrideId).toBe('ovr-1');
    expect(result.minQuantity).toBe(1);
  });

  it('dai ly B (khong co deal) + cung SKU -> GIA SI CHUNG', () => {
    const result = resolveDealerPrice({
      sku: 'GHE-FELIX',
      dealerId: 'd2',
      quantity: 10,
      prices,
      overrides: [override()],
      now,
    });
    expect(result.source).toBe('base_wholesale');
    expect(result.reason).toBe('DEALER_PRICE_BASE_NO_OVERRIDE');
    expect(result.unitPrice).toBe(1_150_000);
    expect(result.overrideId).toBeNull();
  });

  it('deal BI TAT -> gia si chung, va noi ro vi sao', () => {
    const result = resolveDealerPrice({
      sku: 'GHE-FELIX',
      dealerId: 'd1',
      quantity: 10,
      prices,
      overrides: [override({ enabled: false })],
      now,
    });
    expect(result.source).toBe('base_wholesale');
    expect(result.reason).toBe('DEALER_PRICE_OVERRIDE_DISABLED');
    expect(result.unitPrice).toBe(1_150_000);
  });

  it('deal CHUA TOI NGAY hieu luc -> gia si chung', () => {
    const result = resolveDealerPrice({
      sku: 'GHE-FELIX',
      dealerId: 'd1',
      quantity: 10,
      prices,
      overrides: [override({ effectiveFrom: new Date('2026-09-01T00:00:00Z') })],
      now,
    });
    expect(result.source).toBe('base_wholesale');
    expect(result.reason).toBe('DEALER_PRICE_OVERRIDE_NOT_YET_EFFECTIVE');
    expect(result.unitPrice).toBe(1_150_000);
  });

  it('deal DA HET HAN -> gia si chung', () => {
    const result = resolveDealerPrice({
      sku: 'GHE-FELIX',
      dealerId: 'd1',
      quantity: 10,
      prices,
      overrides: [override({ effectiveTo: new Date('2026-07-31T23:59:59Z') })],
      now,
    });
    expect(result.source).toBe('base_wholesale');
    expect(result.reason).toBe('DEALER_PRICE_OVERRIDE_EXPIRED');
    expect(result.unitPrice).toBe(1_150_000);
  });

  it('CHUA DAT nguong so luong -> gia si chung, khong bao gia thap hon muc duoc huong', () => {
    const result = resolveDealerPrice({
      sku: 'GHE-FELIX',
      dealerId: 'd1',
      quantity: 4,
      prices,
      overrides: [override({ minQuantity: 5 })],
      now,
    });
    expect(result.source).toBe('base_wholesale');
    expect(result.reason).toBe('DEALER_PRICE_OVERRIDE_BELOW_MIN_QUANTITY');
    expect(result.unitPrice).toBe(1_150_000);
  });

  it('DUNG BANG nguong so luong -> ap deal, vi nguong la lon-hon-hoac-bang', () => {
    const result = resolveDealerPrice({
      sku: 'GHE-FELIX',
      dealerId: 'd1',
      quantity: 5,
      prices,
      overrides: [override({ minQuantity: 5 })],
      now,
    });
    expect(result.source).toBe('dealer_override');
    expect(result.unitPrice).toBe(1_000_000);
  });

  it('CHUA MAP DAI LY -> khong duoc vo tinh an gia rieng cua bat ky ai', () => {
    const result = resolveDealerPrice({
      sku: 'GHE-FELIX',
      dealerId: null,
      quantity: 100,
      prices,
      overrides: [override()],
      now,
    });
    expect(result.source).toBe('base_wholesale');
    expect(result.reason).toBe('DEALER_PRICE_DEALER_UNKNOWN');
    expect(result.unitPrice).toBe(1_150_000);
    expect(result.overrideId).toBeNull();
  });

  it('SKU khong co dong gia nao -> khong bia ra gia', () => {
    const result = resolveDealerPrice({
      sku: 'KHONG-CO',
      dealerId: 'd1',
      quantity: 1,
      prices,
      overrides: [],
      now,
    });
    expect(result.source).toBe('unresolved');
    expect(result.unitPrice).toBeNull();
  });

  /**
   * ASM-03: deal ap tu SL 1 cho toi khi khach noi khac. Ban ghi CU trong Postgres co
   * `minQuantity = NULL`; doc no phai ra DUNG mot gia dinh (1), khong phai mot khai niem
   * "khong gioi han" mo ho.
   */
  it('minQuantity NULL/undefined (ban ghi cu) -> hieu la 1, khong phai khong gioi han', () => {
    const result = resolveDealerPrice({
      sku: 'GHE-FELIX',
      dealerId: 'd1',
      quantity: 1,
      prices,
      overrides: [override({ minQuantity: undefined })],
      now,
    });
    expect(result.source).toBe('dealer_override');
    expect(result.minQuantity).toBe(1);
  });

  /**
   * `enabled` vang mat (goi khach in-memory khong khai truong nay) phai la BAT — neu khong,
   * chuyen tu memory sang prisma se lam moi deal bien mat mot cach im lang.
   */
  it('enabled vang mat -> coi la dang bat', () => {
    const result = resolveDealerPrice({
      sku: 'GHE-FELIX',
      dealerId: 'd1',
      quantity: 1,
      prices,
      overrides: [override({ enabled: undefined })],
      now,
    });
    expect(result.source).toBe('dealer_override');
  });

  it('cua so hieu luc BAO now -> ap deal', () => {
    const result = resolveDealerPrice({
      sku: 'GHE-FELIX',
      dealerId: 'd1',
      quantity: 1,
      prices,
      overrides: [
        override({
          effectiveFrom: new Date('2026-08-01T00:00:00Z'),
          effectiveTo: new Date('2026-08-31T23:59:59Z'),
        }),
      ],
      now,
    });
    expect(result.source).toBe('dealer_override');
    expect(result.reason).toBe('DEALER_PRICE_OVERRIDE_APPLIED');
  });

  /**
   * Bay THOI GIAN THAT: snapshot nap luc boot van con giu deal, nhung luot nay xay ra SAU khi
   * deal het han. Quyet dinh phai theo `now` cua luot, khong theo luc nap.
   */
  it('cung mot snapshot, hai thoi diem -> hai ket qua khac nhau', () => {
    const deal = override({ effectiveTo: new Date('2026-08-20T00:00:00Z') });
    const trong = resolveDealerPrice({
      sku: 'GHE-FELIX',
      dealerId: 'd1',
      quantity: 1,
      prices,
      overrides: [deal],
      now: new Date('2026-08-19T00:00:00Z'),
    });
    const sau = resolveDealerPrice({
      sku: 'GHE-FELIX',
      dealerId: 'd1',
      quantity: 1,
      prices,
      overrides: [deal],
      now: new Date('2026-08-21T00:00:00Z'),
    });
    expect(trong.source).toBe('dealer_override');
    expect(sau.source).toBe('base_wholesale');
    expect(sau.reason).toBe('DEALER_PRICE_OVERRIDE_EXPIRED');
  });

  it('deal cua dai ly KHAC cho cung SKU khong duoc ro sang', () => {
    const result = resolveDealerPrice({
      sku: 'GHE-FELIX',
      dealerId: 'd2',
      quantity: 1,
      prices,
      overrides: [override({ dealerId: 'd1' }), override({ id: 'ovr-9', dealerId: 'd9' })],
      now,
    });
    expect(result.source).toBe('base_wholesale');
    expect(result.unitPrice).toBe(1_150_000);
  });
});
