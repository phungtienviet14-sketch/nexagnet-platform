import { describe, expect, it } from 'vitest';
import type { ParsedOrder } from '@netviet/shared';
import type { Dealer, DealerPriceOverride, PriceRow, Product } from '../knowledge/domain.js';
import { DEFAULT_RULES_CONFIG } from './config.js';
import { resolveDealerPrice } from './dealer-price.js';
import { explainDealerPricing, priceOrder, type PriceContext } from './rules.js';

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

/**
 * BANG CHUNG PHAI NOI VE PHEP TINH DA THAT SU XAY RA.
 *
 * `priceOrder()` tinh tien, `explainDealerPricing()` sinh bang chung — HAI duong doc lap di qua
 * cung mot cong. Neu chung lech nhau thi trace se giai thich mot con so ma khach chua bao gio
 * nhan duoc, va do la kieu sai TE HON im lang: no lam nguoi doc tin vao mot lich su khong that.
 *
 * Truoc bo test nay `explainDealerPricing()` khong co MOT khang dinh nao o tang rules — no chi
 * duoc cham gian tiep qua orchestrator, tuc khong ai khoa cai bat bien "bang chung == so tien".
 */
describe('explainDealerPricing — bang chung khop voi so tien da tinh', () => {
  const products: Product[] = [
    { sku: 'GHE-FELIX', name: 'Ghế Felix', aliases: ['felix', 'ghe felix'], unit: 'cai' },
    { sku: 'NOI-CHIEN', name: 'Nồi chiên không dầu', aliases: ['noi chien', 'ncked'], unit: 'cai' },
  ];
  const dealer: Dealer = {
    id: 'd1',
    name: 'Meta HN',
    aliases: ['meta hn', 'meta'],
    tier: 'dai_ly',
    defaultPolicy: 'cong_no_30',
  };

  function ctx(patch: Partial<PriceContext> = {}): PriceContext {
    return {
      dealer,
      branch: 'HN',
      products,
      prices,
      priceOverrides: [override()],
      cfg: DEFAULT_RULES_CONFIG,
      now,
      ...patch,
    };
  }

  function order(items: ParsedOrder['items']): ParsedOrder {
    return { orderType: 'TH1', items, noVat: false };
  }

  it('deal duoc ap: bang chung mang DUNG don gia da vao don', () => {
    const parsed = order([{ skuRaw: 'felix', quantity: 3 }]);
    const context = ctx();

    const priced = priceOrder(parsed, context);
    const [evidence] = explainDealerPricing(parsed, context);

    expect(evidence).toBeDefined();
    expect(evidence!.reason).toBe('DEALER_PRICE_OVERRIDE_APPLIED');
    // Khang dinh QUAN TRONG NHAT cua tep nay: bang chung va so tien khong duoc lech.
    expect(evidence!.unitPrice).toBe(priced.lines[0]!.unitPrice);
    expect(priced.lines[0]!.unitPrice).toBe(1_000_000);
    expect(evidence!.overrideId).toBe('ovr-1');
  });

  it('khong co deal: bang chung noi gia si chung, va van khop so tien', () => {
    const parsed = order([{ skuRaw: 'felix', quantity: 3 }]);
    const context = ctx({ priceOverrides: [] });

    const priced = priceOrder(parsed, context);
    const [evidence] = explainDealerPricing(parsed, context);

    expect(evidence!.reason).toBe('DEALER_PRICE_BASE_NO_OVERRIDE');
    expect(evidence!.unitPrice).toBe(priced.lines[0]!.unitPrice);
    expect(priced.lines[0]!.unitPrice).toBe(1_150_000);
  });

  /**
   * CUNG MOT NGU CANH => CUNG MOT THOI DIEM cho ca hai duong.
   *
   * Day la hop dong ma orchestrator dua vao khi no ghim `now` MOT lan roi dung chung cho ca
   * `priceOrder` lan `explainDealerPricing`: neu hai ham tu doc dong ho rieng, mot deal het han
   * dung giua hai loi goi se cho ra "da ap deal" o so tien va "het han" o bang chung.
   */
  it('cung mot ngu canh, hai moc thoi gian: so tien va bang chung doi CUNG luc', () => {
    const hetHanLuc = new Date('2026-08-20T00:00:00Z');
    const parsed = order([{ skuRaw: 'felix', quantity: 3 }]);
    const overrides = [override({ effectiveTo: hetHanLuc })];

    const dungHan = ctx({ priceOverrides: overrides, now: hetHanLuc });
    expect(explainDealerPricing(parsed, dungHan)[0]!.reason).toBe('DEALER_PRICE_OVERRIDE_APPLIED');
    expect(priceOrder(parsed, dungHan).lines[0]!.unitPrice).toBe(1_000_000);

    const quaHan = ctx({
      priceOverrides: overrides,
      now: new Date(hetHanLuc.getTime() + 1),
    });
    expect(explainDealerPricing(parsed, quaHan)[0]!.reason).toBe('DEALER_PRICE_OVERRIDE_EXPIRED');
    expect(priceOrder(parsed, quaHan).lines[0]!.unitPrice).toBe(1_150_000);
  });

  /**
   * MOT quyet dinh cho MOT DONG HANG, khong mot quyet dinh gop cho ca don: hai dong cung don co
   * the ra hai ket cuc khac nhau, va gop lai thi mat dung cho khach se hoi.
   */
  it('don nhieu dong: moi dong mot bang chung rieng, ly do co the khac nhau', () => {
    const parsed = order([
      { skuRaw: 'felix', quantity: 2 },
      { skuRaw: 'noi chien', quantity: 2 },
    ]);
    const context = ctx({
      priceOverrides: [
        override({ minQuantity: 5 }),
        override({ id: 'ovr-2', sku: 'NOI-CHIEN', price: 800_000, minQuantity: 1 }),
      ],
    });

    const evidence = explainDealerPricing(parsed, context);
    expect(evidence).toHaveLength(2);
    expect(evidence[0]!.sku).toBe('GHE-FELIX');
    expect(evidence[0]!.reason).toBe('DEALER_PRICE_OVERRIDE_BELOW_MIN_QUANTITY');
    expect(evidence[0]!.minQuantity).toBe(5);
    expect(evidence[1]!.sku).toBe('NOI-CHIEN');
    expect(evidence[1]!.reason).toBe('DEALER_PRICE_OVERRIDE_APPLIED');
  });

  /**
   * Dong khong map duoc SKU KHONG sinh bang chung gia rieng: chua biet la hang gi thi khong co
   * "gia rieng cho hang do" de noi. Dong do da co duong canh bao rieng (`matched: false`) va se
   * chan auto-confirm o tang tren — them mot ban ghi `SKU_UNPRICED` o day chi lam nhieu trace.
   */
  it('dong khong map duoc SKU -> khong sinh bang chung gia rieng', () => {
    const parsed = order([
      { skuRaw: 'ban an go', quantity: 1 },
      { skuRaw: 'felix', quantity: 3 },
    ]);

    const evidence = explainDealerPricing(parsed, ctx());
    expect(evidence).toHaveLength(1);
    expect(evidence[0]!.sku).toBe('GHE-FELIX');
  });
});
