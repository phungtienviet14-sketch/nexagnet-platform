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
  businessAuthorityEvidence,
  documentEvidence,
  evidenceVersion,
  type SourceEvidence,
} from '../source-evidence.js';
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

/*
 * MOI HAM `*Facts` DUOI DAY TRA VE MOT MANH VA (`BusinessFactsPatch`), KHONG PHAI MOT GOC DAY DU.
 *
 * Phan biet nay khong con la mot chi tiet ke tu khi `mergeBusinessFacts` co ba trang thai: mot goc
 * day du mang `pricedOrder: null` se THU HOI don da tinh gia cua manh truoc do, chu khong con la
 * "khong co y kien". Fixture tra ve goc day du tung lam dung dieu do — `facts(pricedFacts(...),
 * policyFacts(...))` mat sach don — va bo test do voi mot ly do khong lien quan gi den thu no dinh
 * chung minh.
 */
export function quoteFacts(unitPrice = UNIT_PRICE): BusinessFactsPatch {
  return {
    quote: {
      period: '2026-09',
      qualifier: 'Đây là đơn giá CTV (giá sỉ) áp dụng cho đại lý/CTV theo bảng giá hiện hành.',
      lines: [{ sku: 'FELIX', name: 'Ghế Felix', unit: 'cái', unitPrice }],
    },
  };
}

export function policyFacts(policy: PolicyType): BusinessFactsPatch {
  return { paymentPolicy: { dealerName: 'Meta HN', tier: 'dai_ly', policy } };
}

export function orderStateFactsFor(
  status: OrderStatus,
  priced: PricedOrder | null = null,
): BusinessFactsPatch {
  return {
    orderState: { orderId: 'ORD-1', status, levels: commitmentLevelsFor(status), priced },
  };
}

export function pricedFacts(priced: PricedOrder = pricedOrder()): BusinessFactsPatch {
  return { pricedOrder: priced };
}

/**
 * THAM QUYEN suy ra tu DU KIEN bang chinh cac ham cap phep that.
 *
 * Day la cho quan trong nhat cua tep fixture: he thong that cap grant tu ket qua `priceOrder()` /
 * bang gia / cap dai ly / trang thai don, nen test cung phai lam vay. Mot test tu che grant se
 * chung minh duoc ca nhung thu he thong that khong bao gio cap.
 */
export function authorityFor(patch: BusinessFactsPatch): OutboundAuthority {
  const facts = mergeBusinessFacts(NO_BUSINESS_FACTS, patch);
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

/**
 * Nguon he thong mac dinh: mot bai FAQ da duyet khong mang con so nao.
 *
 * HAI CAU, khong phai mot cau hai ve ngan bang dau phay — tu #200 don vi rang buoc la CA CAU,
 * nen mot nguon mot cau se chi cho phep trich dung ca cau do. Hai cau cho phep bo test van do
 * duoc phep CHON (bai nay trich cau dau, bai kia trich cau sau) ma khong phai trich nua cau.
 */
export const APPROVED_DOC = 'Ghế Felix có tựa lưng lưới. Khung thép sơn tĩnh điện.';

/**
 * Soan mot ban, voi tham quyen suy tu chinh du kien.
 *
 * `context` cho phep tung bai ghi de nguon/tin khach/tham quyen — vd de chung minh mot loi nhan
 * KHONG co nguon thi bi tu choi (G1), hay mot grant vang mat thi khoi bien mat.
 */
/**
 * KHACH CUA BO TEST. Bat ky gia tri nao cung duoc, mien la CUNG mot gia tri o hai dau — do chinh
 * la thu dang duoc kiem: mot manh bang chung cua khach khac khong thoa man duoc ban soan nay.
 */
export const TEST_TENANT = 'test-tenant';

/** Khach KHAC — dung de chung minh phep loc theo khach that su chan (muc 8 ca 20 hop dong #205). */
export const OTHER_TENANT = 'other-tenant';

/**
 * TAI LIEU DA DUYET DA DUOC TUYEN BO LA KE DUOC.
 *
 * `sourceId` gan theo dau cua chinh doan van, nen hai doan khac nhau khong bao gio ghim trung —
 * bo test doi chieu duoc tung ghim mot.
 */
export function tellable(
  text: string,
  productSku: string | null = null,
  tenant: string = TEST_TENANT,
): SourceEvidence {
  return documentEvidence(`faq:test:${evidenceVersion(text)}`, text, { tenant, productSku }, true);
}

/** Nhieu doan cung mot luc, tat ca deu ke duoc. */
export function tellableAll(
  texts: readonly string[],
  productSku: string | null = null,
): SourceEvidence[] {
  return texts.map((text) => tellable(text, productSku));
}

/** TAI LIEU CHUA AI TUYEN BO — mac dinh cua moi ban ghi dang co. Fail closed. */
export function unclassified(text: string, productSku: string | null = null): SourceEvidence {
  return documentEvidence(
    `faq:test:${evidenceVersion(text)}`,
    text,
    { tenant: TEST_TENANT, productSku },
    undefined,
  );
}

/** BANG CHUNG THUOC THAM QUYEN — gia/chinh sach/trang thai don. Khong bao gio chon duoc. */
export function authorityOwned(text: string, productSku: string | null = null): SourceEvidence {
  return businessAuthorityEvidence(`quote:test:${evidenceVersion(text)}`, text, {
    tenant: TEST_TENANT,
    productSku,
  });
}

export function compose(
  outboundPlan: OutboundPlan,
  patch: BusinessFactsPatch = {},
  context: Partial<ComposeContext> = {},
): OutboundComposition {
  const turn = mergeBusinessFacts(NO_BUSINESS_FACTS, patch);
  return composeOutbound(outboundPlan, turn, {
    evidence: [tellable(APPROVED_DOC)],
    tenant: TEST_TENANT,
    customerText: '',
    authority: authorityFor(turn),
    ...context,
  });
}

/** Gom moi dong van ban cua cac khoi da render — de khang dinh "khong mot ky tu nao". */
export function blockText(composition: OutboundComposition): string {
  return composition.blocks.flatMap((block) => block.lines).join('\n');
}
