import type {
  ComposedBlock,
  NarrativeDecision,
  OmittedBlock,
  OutboundAuthority,
  OutboundBlockKind,
  OutboundComposition,
  OutboundCompositionMode,
  OutboundPlan,
  OutboundPlanKind,
  PricedOrder,
} from '@netviet/shared';
import { POLICY_LABELS } from '../agents/risk-rules.js';
import { formatVnd } from '../rules/text.js';
import { authorizedAmounts, commitmentToken } from './outbound-claims.js';
import { outboundFingerprint, policyGrantTokens } from './outbound-authority.js';
import type { OrderStateFact, QuoteFact, TurnBusinessFacts } from './outbound-facts.js';
import {
  admitNarrative,
  buildGrounding,
  grantGrounding,
  groundingTokens,
  type NarrativeGrounding,
} from './outbound-narrative.js';

/**
 * BO SOAN TIN GUI RA — noi van ban den tay khach duoc DUNG, khong phai noi no duoc DUYET.
 *
 * ---------------------------------------------------------------------------------------------
 * DAY LA RANH GIOI DUNG SAI CUA CA HE THONG SAU #189.
 *
 * Truoc: model viet ca doan van, mot bo trich doc lai doan do, khong trich duoc gi thi cho gui.
 * Nay: model chi XIN loai khoi; TUNG KHOI do ham trong tep nay render tu `TurnBusinessFacts`.
 *
 * He qua truc tiep, va no la ca muc dich cua thay doi: mot bo trich BO SOT khong con bien duoc
 * mot khang dinh khong tham quyen thanh mot tin gui duoc, boi vi KHONG CO DUONG NAO render no.
 * Muon co mot con so tien trong khoi thi phai co `facts.quote`/`facts.pricedOrder`; muon co mot
 * cau chinh sach thi phai co `facts.paymentPolicy`; muon noi don da chot thi phai co
 * `facts.orderState` voi trang thai uy quyen den muc do. Khong co du kien -> KHOI BIEN MAT, kem
 * mot ma ly do. Khong bao gio hoi model dien vao (muc 5 hop dong).
 *
 * ---------------------------------------------------------------------------------------------
 * CHE DO SOAN DO HE THONG QUYET DINH, KHONG PHAI MODEL (muc 3 hop dong).
 *
 * `mode` duoc suy tu SO KHOI DUNG DUOC, khong tu `plan.kind`. Mot model gan nhan `faq` cho mot
 * luot co don da tinh gia van ra `deterministic_business`; mot model gan nhan bat ky cho mot cau
 * he qua ma luot khong co du kien nao van ra `narrative_only` — che do do render DUNG KHONG khoi
 * nghiep vu nao, nen cai nhan khong cap them duoc gi.
 *
 * ---------------------------------------------------------------------------------------------
 * VE CACH VIET: khoi nghiep vu co dinh dang bang/gach dau dong, khong phai van noi. Do la co y —
 * mot con so trong mot cau van co the bi doc nham la con so cua thu khac; mot dong `Tổng đơn:
 * 12.850.000đ` thi khong.
 */

/** THU TU RENDER co dinh. Hai luot xin cung mot bo khoi phai ra cung mot van ban. */
const BLOCK_ORDER: readonly OutboundBlockKind[] = [
  'price_quote',
  'order_pricing',
  'vat_cod_shipping',
  'payment_policy',
  'promotion',
  'order_commitment',
  'approval',
];

export interface ComposeContext {
  /**
   * CHUOI HE THONG SO HUU da tra cuu trong luot — van ban tai lieu da duyet, ten/mo ta san pham,
   * so tien rules engine da dinh dang, nhan chinh sach. KHONG phai ket qua cong cu da serialize:
   * ket qua cong cu echo lai tham so model tu gui, xem `outbound-narrative.ts`.
   */
  readonly systemSources: readonly string[];
  /** Tin khach vua gui — chi neo nguon cho lop SO. */
  readonly customerText: string;
  readonly authority: OutboundAuthority;
}

/**
 * SOAN mot tin gui ra tu ke hoach cua model + du kien tat dinh cua luot.
 *
 * Ham nay khong doc bien moi truong, khong goi mang, khong doc dong ho: cung dau vao ra cung dau
 * ra. Do la dieu kien de bang chung o muc 9 hop dong (chay lai tren `dist/` da ship) co nghia.
 */
export function composeOutbound(
  plan: OutboundPlan,
  facts: TurnBusinessFacts,
  context: ComposeContext,
): OutboundComposition {
  const blocks: ComposedBlock[] = [];
  const omitted: OmittedBlock[] = [];
  // Bo trung va sap thu tu TRUOC khi render: model xin `bao_gia` hai lan thi khach van chi thay
  // mot bang gia, va thu tu khong phu thuoc vao thu tu model liet ke.
  const requested = BLOCK_ORDER.filter((kind) => plan.requestedBlocks.includes(kind));
  for (const kind of requested) {
    const rendered = renderBlock(kind, facts);
    if ('reason' in rendered) omitted.push({ kind, reason: rendered.reason });
    else blocks.push(rendered);
  }

  /*
   * LOI NHAN duoc xet tren bang chung neo nguon KHONG ke phan bo soan vua render.
   *
   * Neu gop phan render vao truoc thi mot loi nhan se "muon" duoc con so cua khoi ben canh — vd
   * khoi bao gia render 1.150.000d, roi loi nhan noi "ben em con mau khac cung 1.150.000d" ma
   * chua he co dong gia nao cho mau do. Nen thu tu la: xet loi nhan truoc, gop sau.
   */
  const strict = buildGrounding(context.systemSources, context.customerText, context.authority);
  const narrative = admitNarrative(plan.narrative, {
    hasSystemSource: context.systemSources.length > 0,
    grounding: strict,
    granted: grantGrounding(context.authority),
  });

  const text = [
    ...(narrative.admitted ? [narrative.text] : []),
    ...blocks.flatMap((block) => block.lines),
  ]
    .join('\n')
    .trim();

  return {
    mode: modeOf(blocks, narrative),
    planKind: plan.kind,
    blocks,
    omitted,
    narrative,
    text,
    fingerprint: outboundFingerprint(text),
    // Bang chung ghim lai CO ke phan bo soan tu render: diem nghen gui quet lai VAN BAN CUOI, ma
    // van ban cuoi co ca so luong, ky gia, nhan chinh sach — nhung thu bo soan tu viet ra chu
    // khong phai model. Thieu chung thi lop phong thu chieu sau se bao dong gia moi lan gui.
    grounded: groundingTokens(widen(strict, blocks)),
  };
}

/**
 * VAN BAN DO MOT TANG TAT DINH DUNG TRON — xac nhan don, cau hoi lai, mau chuyen Sale.
 *
 * Van di qua kieu `OutboundComposition` chu khong duoc mien: mot duong tat khong co ban soan se
 * la cho dau tien mot doan van khong ai xet lot ra ngoai, va `COMPOSITION_ABSENT` se khong bao gio
 * bat duoc no. Khong co khoi nao vi ca van ban CHINH LA ket qua tat dinh.
 */
export function deterministicComposition(
  text: string,
  planKind: OutboundPlanKind = 'faq',
): OutboundComposition {
  const trimmed = text.trim();
  return {
    mode: trimmed ? 'deterministic_document' : 'empty',
    planKind,
    blocks: [],
    omitted: [],
    narrative: { admitted: false, reason: 'EMPTY' },
    text: trimmed,
    fingerprint: outboundFingerprint(trimmed),
    grounded: [],
  };
}

function modeOf(
  blocks: readonly ComposedBlock[],
  narrative: NarrativeDecision,
): OutboundCompositionMode {
  if (blocks.length) return 'deterministic_business';
  return narrative.admitted ? 'narrative_only' : 'empty';
}

/** Gop phan bo soan tu render vao bang chung neo nguon — xem chu thich o `composeOutbound`. */
function widen(base: NarrativeGrounding, blocks: readonly ComposedBlock[]): NarrativeGrounding {
  if (!blocks.length) return base;
  const rendered = buildGrounding(
    blocks.flatMap((block) => block.lines),
    '',
    { grants: [] },
  );
  return {
    numerals: new Set([...base.numerals, ...rendered.numerals]),
    policy: new Set([...base.policy, ...rendered.policy]),
    commitment: new Set([...base.commitment, ...rendered.commitment]),
  };
}

/* ------------------------------------------------------------------ *
 * RENDER TUNG KHOI — moi ham duoi day chi doc `facts`
 * ------------------------------------------------------------------ */

type BlockResult = ComposedBlock | { readonly reason: OmittedBlock['reason'] };

function renderBlock(kind: OutboundBlockKind, facts: TurnBusinessFacts): BlockResult {
  switch (kind) {
    case 'price_quote':
      return facts.quote ? priceQuoteBlock(facts.quote) : { reason: 'FACT_MISSING' };
    case 'order_pricing':
      return facts.pricedOrder ? orderPricingBlock(facts.pricedOrder) : { reason: 'FACT_MISSING' };
    case 'vat_cod_shipping':
      return facts.pricedOrder
        ? vatCodShippingBlock(facts.pricedOrder)
        : { reason: 'FACT_MISSING' };
    case 'payment_policy':
      return paymentPolicyBlock(facts);
    case 'order_commitment':
      return facts.orderState ? orderCommitmentBlock(facts.orderState) : { reason: 'FACT_MISSING' };
    /*
     * KHONG CO NGUON TAT DINH TRONG REPO.
     *
     * Muc 10 hop dong loai tru promotion engine khoi pham vi, va khong co bo phan nao cap quyen
     * huong khuyen mai hay phat mot cau phe duyet. Nen hai khoi nay LUON bi bo — va do la mot
     * hanh vi CAN CHUNG MINH, khong phai mot thieu sot: no cho thay mot khoi khong co nguon thi
     * du model xin bao nhieu lan cung khong render ra ky tu nao.
     */
    case 'promotion':
    case 'approval':
      return { reason: 'NO_AUTHORITY_SOURCE' };
  }
}

function priceQuoteBlock(quote: QuoteFact): BlockResult {
  if (!quote.lines.length) return { reason: 'FACT_INCOMPLETE' };
  const lines = [
    quote.period ? `Báo giá (kỳ ${quote.period}):` : 'Báo giá:',
    ...quote.lines.map(
      (line) => `· ${line.name}: ${formatVnd(line.unitPrice)}/${line.unit || 'cái'}`,
    ),
    quote.qualifier,
  ].filter(Boolean);
  return {
    kind: 'price_quote',
    claims: [
      {
        claim: 'financial',
        source: 'rules.quote',
        authorized: authorizedAmounts(quote.lines.map((line) => line.unitPrice)),
      },
    ],
    lines,
  };
}

/**
 * TIEN CUA MOT DON DA TINH.
 *
 * Chi render nhung dong ma chinh `priceOrder()` bat len: don khong co cuoc thi khong co dong
 * cuoc. Render mot dong `Cước vận chuyển: 0đ` la noi mot dieu ve chinh sach van chuyen ma ket qua
 * dinh gia khong he khang dinh.
 */
function orderPricingBlock(priced: PricedOrder): BlockResult {
  if (!priced.lines.length) return { reason: 'FACT_INCOMPLETE' };
  const amounts = [
    ...priced.lines.flatMap((line) => [line.unitPrice, line.lineTotal]),
    priced.itemsSubtotal,
    priced.grandTotal,
    ...(priced.shippingFee > 0 ? [priced.shippingFee] : []),
    ...(priced.codCollect ? [priced.codFee] : []),
    ...(priced.vat ? [priced.vatAmount] : []),
  ];
  const lines = [
    'Chi tiết đơn:',
    ...priced.lines.map(
      (line) =>
        `· ${line.productName ?? line.skuRaw}: ${line.quantity} x ${formatVnd(line.unitPrice)} = ${formatVnd(line.lineTotal)}`,
    ),
    `Tạm tính: ${formatVnd(priced.itemsSubtotal)}`,
    ...(priced.shippingFee > 0 ? [`Cước vận chuyển: ${formatVnd(priced.shippingFee)}`] : []),
    ...(priced.codCollect ? [`Thu hộ (COD): ${formatVnd(priced.codFee)}`] : []),
    ...(priced.vat ? [`VAT: ${formatVnd(priced.vatAmount)}`] : []),
    `Tổng đơn: ${formatVnd(priced.grandTotal)}`,
  ];
  return {
    kind: 'order_pricing',
    claims: [
      { claim: 'financial', source: 'rules.pricing', authorized: authorizedAmounts(amounts) },
    ],
    lines,
  };
}

/** CAU CHINH SACH ve VAT/COD/cuoc — khong mang con so; con so o `order_pricing`. */
function vatCodShippingBlock(priced: PricedOrder): BlockResult {
  const statements = [
    ...(priced.vat ? ['Đơn có xuất VAT.'] : []),
    ...(priced.codCollect ? ['Đơn có thu hộ (COD) khi giao.'] : []),
    ...(priced.shippingFee > 0 ? ['Đơn có tính cước vận chuyển.'] : []),
  ];
  // Don khong bat truong nao trong ba -> KHONG co gi de noi. Day la `FACT_INCOMPLETE` chu khong
  // phai mot khoi rong: mot khoi rong van la mot khoi, va no se lam `mode` thanh business.
  if (!statements.length) return { reason: 'FACT_INCOMPLETE' };
  return {
    kind: 'vat_cod_shipping',
    claims: [
      {
        claim: 'policy',
        source: 'rules.pricing',
        authorized: [
          ...(priced.vat ? ['vat'] : []),
          ...(priced.codCollect ? ['cod'] : []),
          ...(priced.shippingFee > 0 ? ['shipping'] : []),
        ],
      },
    ],
    lines: statements,
  };
}

/**
 * DIEU KHOAN THANH TOAN.
 *
 * Uu tien chinh sach cua CHINH DON da tinh (`priceOrder()` da ap dung no) roi moi den chinh sach
 * mac dinh cua cap dai ly: neu don duoc tinh theo mot chinh sach khac voi mac dinh cua dai ly thi
 * cau noi ra khach phai theo don, khong theo mac dinh.
 */
function paymentPolicyBlock(facts: TurnBusinessFacts): BlockResult {
  const fromOrder = facts.pricedOrder?.policy ?? null;
  const policy = fromOrder ?? facts.paymentPolicy?.policy ?? null;
  if (!policy) return { reason: 'FACT_MISSING' };
  const holder = fromOrder
    ? (facts.pricedOrder?.dealerName ?? facts.paymentPolicy?.dealerName ?? null)
    : (facts.paymentPolicy?.dealerName ?? null);
  return {
    kind: 'payment_policy',
    claims: [
      {
        claim: 'policy',
        source: fromOrder ? 'rules.pricing' : 'rules.policy',
        authorized: [...policyGrantTokens(policy)],
      },
    ],
    lines: [
      holder
        ? `Chính sách thanh toán áp dụng cho ${holder}: ${POLICY_LABELS[policy]}.`
        : `Chính sách thanh toán áp dụng: ${POLICY_LABELS[policy]}.`,
    ],
  };
}

/**
 * MUC CAM KET CUA DON.
 *
 * Lay muc CAO NHAT ma trang thai uy quyen — khong phai muc model xin, vi ke hoach khong co cho
 * nao de xin mot muc. Do la ly do `needs_edit` noi duoc "da ghi nhan" ma khong noi duoc "da chot"
 * (muc 8 ca 14), con `approved` thi noi duoc ca hai va bo soan chon cau "da chot" (ca 15).
 */
function orderCommitmentBlock(state: OrderStateFact): BlockResult {
  const level = state.levels.at(-1);
  if (!level) return { reason: 'COMMITMENT_LEVEL_UNAVAILABLE' };
  const sentences = {
    recorded: 'Đơn của mình đã được ghi nhận trong hệ thống, đang chờ duyệt.',
    confirmed: 'Đơn của mình đã được chốt.',
    fulfilled: 'Đơn của mình đã gửi xác nhận.',
  } as const;
  return {
    kind: 'order_commitment',
    claims: [
      { claim: 'order_commitment', source: 'order.state', authorized: [commitmentToken(level)] },
    ],
    lines: [sentences[level]],
  };
}
