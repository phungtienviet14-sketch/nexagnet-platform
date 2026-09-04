import type {
  OrderStatus,
  OutboundAuthority,
  OutboundBlockKind,
  OutboundComposition,
  OutboundPlan,
  OutboundPlanKind,
  PolicyType,
  PricedLine,
  PricedOrder,
} from '@netviet/shared';
import {
  commitmentLevelsFor,
  grantsFromDealerPolicy,
  grantsFromPersistedOrder,
  grantsFromPricedOrder,
  grantsFromQuote,
  mergeAuthority,
} from '../outbound-authority.js';
import { composeOutbound, type ComposeContext } from '../outbound-composer.js';
import {
  mergeBusinessFacts,
  NO_BUSINESS_FACTS,
  type BusinessFactsPatch,
  type TurnBusinessFacts,
} from '../outbound-facts.js';

/**
 * DU KIEN GIA cho bo test ban soan.
 *
 * MOI HAM O DAY DUNG DU KIEN, KHONG DUNG GRANT — va do la co y. Grant duoc sinh ra tu chinh du
 * kien bang cac ham `grantsFrom*` THAT (xem `authorityFor` ben duoi), khong duoc viet tay. Neu
 * test tu viet grant thi no se chung minh mot he thong khac voi he thong dang chay: hai ben co
 * the lech nhau ma khong bai nao do.
 */

const UNIT_PRICE = 1_150_000;

export function line(patch: Partial<PricedLine> = {}): PricedLine {
  const quantity = patch.quantity ?? 10;
  const unitPrice = patch.unitPrice ?? UNIT_PRICE;
  return {
    skuRaw: 'FELIX',
    sku: 'FELIX',
    productName: 'Ghế Felix',
    matched: true,
    ...patch,
    quantity,
    unitPrice,
    lineTotal: patch.lineTotal ?? quantity * unitPrice,
  };
}

export function pricedOrder(patch: Partial<PricedOrder> = {}): PricedOrder {
  const lines = patch.lines ?? [line()];
  const itemsSubtotal = patch.itemsSubtotal ?? lines.reduce((sum, row) => sum + row.lineTotal, 0);
  const shippingFee = patch.shippingFee ?? 0;
  const codFee = patch.codFee ?? 0;
  const vatAmount = patch.vatAmount ?? 0;
  return {
    orderType: 'TH1',
    dealerName: 'Meta HN',
    branch: 'HN',
    policy: null,
    codCollect: false,
    vat: false,
    warnings: [],
    confirmationText: '',
    ...patch,
    lines,
    itemsSubtotal,
    shippingFee,
    codFee,
    vatAmount,
    grandTotal: patch.grandTotal ?? itemsSubtotal + shippingFee + codFee + vatAmount,
  };
}

export function quoteFacts(unitPrice = UNIT_PRICE): TurnBusinessFacts {
  return {
    ...NO_BUSINESS_FACTS,
    quote: {
      period: '2026-09',
      qualifier: 'Đây là đơn giá CTV (giá sỉ) áp dụng cho đại lý/CTV theo bảng giá hiện hành.',
      lines: [{ sku: 'FELIX', name: 'Ghế Felix', unit: 'cái', unitPrice }],
    },
  };
}

export function policyFacts(policy: PolicyType): TurnBusinessFacts {
  return {
    ...NO_BUSINESS_FACTS,
    paymentPolicy: { dealerName: 'Meta HN', tier: 'dai_ly', policy },
  };
}

export function orderStateFactsFor(
  status: OrderStatus,
  priced: PricedOrder | null = null,
): TurnBusinessFacts {
  return {
    ...NO_BUSINESS_FACTS,
    orderState: { orderId: 'ORD-1', status, levels: commitmentLevelsFor(status), priced },
  };
}

export function pricedFacts(priced: PricedOrder = pricedOrder()): TurnBusinessFacts {
  return { ...NO_BUSINESS_FACTS, pricedOrder: priced };
}

/**
 * THAM QUYEN suy ra tu DU KIEN bang chinh cac ham cap phep that.
 *
 * Day la cho quan trong nhat cua tep fixture: he thong that cap grant tu ket qua `priceOrder()` /
 * bang gia / cap dai ly / trang thai don, nen test cung phai lam vay. Mot test tu che grant se
 * chung minh duoc ca nhung thu he thong that khong bao gio cap.
 */
export function authorityFor(facts: TurnBusinessFacts): OutboundAuthority {
  return mergeAuthority(
    facts.quote ? grantsFromQuote(facts.quote.lines.map((row) => row.unitPrice)) : [],
    facts.pricedOrder ? grantsFromPricedOrder(facts.pricedOrder) : [],
    facts.paymentPolicy ? grantsFromDealerPolicy(facts.paymentPolicy.policy) : [],
    facts.orderState
      ? grantsFromPersistedOrder({
          status: facts.orderState.status,
          priced: facts.orderState.priced,
        })
      : [],
  );
}

/**
 * Gom nhieu manh du kien thanh du kien cua MOT luot.
 *
 * Bat buoc phai di qua day chu khong spread tay: moi ham `*Facts` tra ve mot `TurnBusinessFacts`
 * DAY DU (cac truong khac la `null`), nen `{ ...a, ...b }` se XOA du kien cua `a`. Loi do im lang
 * va lam mot bai test tuong minh dang do mot thu ma no khong do.
 */
export function facts(...patches: readonly BusinessFactsPatch[]): TurnBusinessFacts {
  return mergeBusinessFacts(NO_BUSINESS_FACTS, ...patches);
}

export function plan(
  requestedBlocks: readonly OutboundBlockKind[],
  narrative = '',
  kind: OutboundPlanKind = 'faq',
): OutboundPlan {
  return { kind, requestedBlocks, narrative };
}

/** Nguon he thong mac dinh: mot bai FAQ da duyet khong mang con so nao. */
export const APPROVED_DOC = 'Ghế Felix có tựa lưng lưới, khung thép sơn tĩnh điện.';

/**
 * Soan mot ban, voi tham quyen suy tu chinh du kien.
 *
 * `context` cho phep tung bai ghi de nguon/tin khach/tham quyen — vd de chung minh mot loi nhan
 * KHONG co nguon thi bi tu choi (G1), hay mot grant vang mat thi khoi bien mat.
 */
export function compose(
  outboundPlan: OutboundPlan,
  facts: TurnBusinessFacts = NO_BUSINESS_FACTS,
  context: Partial<ComposeContext> = {},
): OutboundComposition {
  return composeOutbound(outboundPlan, facts, {
    systemSources: [APPROVED_DOC],
    customerText: '',
    authority: authorityFor(facts),
    ...context,
  });
}

/** Gom moi dong van ban cua cac khoi da render — de khang dinh "khong mot ky tu nao". */
export function blockText(composition: OutboundComposition): string {
  return composition.blocks.flatMap((block) => block.lines).join('\n');
}
