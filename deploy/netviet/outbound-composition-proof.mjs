/**
 * BANG CHUNG RUNTIME CHO RANH GIOI SOAN TIN GUI RA — chay tren `dist/` DA SHIP (Issue #189 muc 9).
 *
 * ---------------------------------------------------------------------------------------------
 * VI SAO CAN MOT TANG NUA, KHI DA CO 2400 BAI UNIT.
 *
 * Bo unit chung minh MA NGUON. Tep nay chung minh CAI DANG CHAY: no `import` thang tu
 * `apps/api/dist/` cua chinh image vua deploy, tuc di qua ca buoc bien dich, ca buoc dong goi va
 * ca buoc day len registry. Mot ban sua dung tren `src/` nhung khong co trong image la mot ban
 * sua khong ton tai, va do la dung loai su co ma dot Release Identity sinh ra de chan.
 *
 * CHAY BANG DUONG DA CO SAN, khong mo cua hau:
 *
 *   docker compose --profile tools run --rm --no-deps -T bootstrap \
 *     node --input-type=module - < outbound-composition-proof.mjs
 *
 * Dich vu `bootstrap` dung `${APP_IMAGE}` — cung image voi API — nen `dist/` o day CHINH LA
 * `dist/` ma API dang chay. Cung khuon voi `deterministic-smoke.mjs`.
 *
 * ---------------------------------------------------------------------------------------------
 * CHI DOC. Tep nay khong cham DB, khong goi LLM, khong gui mot tin nao. Moi ham no goi deu la ham
 * thuan. Do la dieu kien de chay duoc no tren mot stack co du lieu that ma khong doi gi.
 */

import process from 'node:process';

const SIGNAL_PREFIX = '##DEPLOY-SIGNAL##';
const LAYER = 'outboundComposition';
const DIST = process.env.API_DIST_DIR ?? '/app/apps/api/dist';

function emit(status, reason, detail) {
  process.stdout.write(
    `${SIGNAL_PREFIX} ${JSON.stringify({ layer: LAYER, status, reason, detail })}\n`,
  );
}

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: Boolean(ok), detail });
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}\n`);
}

let composer;
let authority;
let facts;
try {
  composer = await import(`${DIST}/outbound/outbound-composer.js`);
  authority = await import(`${DIST}/outbound/outbound-authority.js`);
  facts = await import(`${DIST}/outbound/outbound-facts.js`);
} catch (error) {
  emit('fail', 'SHIPPED_DIST_NOT_IMPORTABLE', { dist: DIST, error: String(error) });
  process.exit(1);
}

const { composeOutbound, deterministicComposition } = composer;
const {
  decideOutboundAuthority,
  grantsFromPricedOrder,
  grantsFromQuote,
  mergeAuthority,
  outboundFingerprint,
  pinnedOutboundVerdict,
} = authority;
const { NO_BUSINESS_FACTS, mergeBusinessFacts } = facts;

/* ------------------------------------------------------------------ *
 * DU KIEN TONG HOP — khong mot dong nao la du lieu khach that
 * ------------------------------------------------------------------ */

const UNIT_PRICE = 1_150_000;
const APPROVED_DOC = 'San pham co tua lung luoi, khung thep son tinh dien.';

const quoteFacts = {
  quote: {
    period: '2026-09',
    qualifier: 'Day la don gia CTV (gia si) ap dung theo bang gia hien hanh.',
    lines: [{ sku: 'PROOF-SKU', name: 'San pham thu nghiem', unit: 'cai', unitPrice: UNIT_PRICE }],
  },
};

const pricedOrder = {
  orderType: 'TH1',
  dealerName: 'Dai ly thu nghiem',
  branch: 'HN',
  lines: [
    {
      skuRaw: 'PROOF-SKU',
      sku: 'PROOF-SKU',
      productName: 'San pham thu nghiem',
      quantity: 10,
      unitPrice: UNIT_PRICE,
      lineTotal: UNIT_PRICE * 10,
      matched: true,
    },
  ],
  itemsSubtotal: UNIT_PRICE * 10,
  shippingFee: 0,
  policy: 'cong_no_30',
  codCollect: false,
  codFee: 0,
  vat: false,
  vatAmount: 0,
  grandTotal: UNIT_PRICE * 10,
  warnings: [],
  confirmationText: '',
};

const plan = (requestedBlocks, narrative = '', kind = 'faq') => ({
  kind,
  requestedBlocks,
  narrative,
});

const compose = (outboundPlan, patch = {}, context = {}) =>
  composeOutbound(outboundPlan, mergeBusinessFacts(NO_BUSINESS_FACTS, patch), {
    systemSources: [APPROVED_DOC],
    customerText: '',
    authority: { grants: [] },
    ...context,
  });

const NO_GRANT = { grants: [] };

/* ------------------------------------------------------------------ *
 * AM TINH — muc 9: thieu tham quyen thi khong render, khong gui
 * ------------------------------------------------------------------ */

{
  const composition = compose(plan(['price_quote'], 'Da em gui gia cho minh a.'));
  const verdict = decideOutboundAuthority(composition, NO_GRANT);
  check(
    'am tinh 1 — xin khoi tien, khong co tham quyen dinh gia -> khong khoi, khong con so',
    composition.blocks.length === 0 &&
      composition.omitted.some((entry) => entry.kind === 'price_quote') &&
      !/\d/u.test(composition.text),
    `mode=${composition.mode} blocks=${composition.blocks.length} verdict=${verdict.reason}`,
  );
}

{
  const composition = compose(plan(['payment_policy'], 'Da em kiem tra giup minh a.'));
  check(
    'am tinh 2 — xin khoi chinh sach, khong co tham quyen -> khong cau chinh sach nao',
    composition.blocks.length === 0 &&
      composition.omitted.some((entry) => entry.kind === 'payment_policy'),
    `omitted=${composition.omitted.map((entry) => `${entry.kind}:${entry.reason}`).join(',')}`,
  );
}

{
  const composition = compose(plan(['order_commitment'], 'Da em xem lai giup minh a.'), {
    orderState: { orderId: 'PROOF-1', status: 'draft', levels: [], priced: null },
  });
  check(
    'am tinh 3 — xin xac nhan don, trang thai khong uy quyen muc nao -> khong cam ket',
    composition.blocks.length === 0 && !/ghi nhan|chot|đã/iu.test(composition.text),
    `omitted=${composition.omitted.map((entry) => `${entry.kind}:${entry.reason}`).join(',')}`,
  );
}

{
  // Khoi khong co nguon tat dinh trong repo: du xin bao nhieu lan cung khong render ra gi.
  const composition = compose(plan(['promotion', 'approval']), { pricedOrder });
  const allNoSource = composition.omitted.every((entry) => entry.reason === 'NO_AUTHORITY_SOURCE');
  check(
    'am tinh 4 — khuyen mai / phe duyet khong co nguon -> luon bi bo',
    composition.blocks.length === 0 && composition.omitted.length === 2 && allNoSource,
    composition.omitted.map((entry) => `${entry.kind}:${entry.reason}`).join(','),
  );
}

/* ------------------------------------------------------------------ *
 * VAN XUOI TUY Y KHONG DI VONG DUOC QUA BO SOAN
 * ------------------------------------------------------------------ */

{
  const seeds = [
    'Tong don la 1.150.000.', // so tien khong hau to
    'Anh duoc thanh toan sau 30 ngay.', // cum chinh sach ngoai tu dien
    'Don cua anh da vao he thong roi.', // dong tu cam ket ngoai tu dien
    'Da gia 990 thoi a.', // so tran duoi 1000, `k` ngam
    'Ben minh cho khat tien hang toi khi ban xong.', // chinh sach khong chu so
    'DON CUA MINH CHOT XONG ROI NHE',
  ];
  const results = seeds.map((text) => {
    const composition = compose(plan(['price_quote', 'payment_policy', 'order_commitment'], text));
    const verdict = decideOutboundAuthority(composition, NO_GRANT);
    return { text, composition, verdict };
  });

  /*
   * KHANG DINH DUNG THU MUC 8 HOP DONG NEU: "no mutation can cause an unauthorized structured
   * business block/value/state to be rendered/sent".
   *
   * Do la mot menh de ve CAU TRUC, va no dung voi CA nhung cau ma bo trich khong nhan ra — vi khoi
   * khong den tu van ban. Doi hoi hon the (vd "khong cau nao trong so nay den duoc tay khach") la
   * doi mot dieu ma thiet ke KHONG khang dinh, va mot bang chung khang dinh qua tay la mot bang
   * chung sai.
   */
  const structural = results.filter(
    ({ composition, verdict }) =>
      composition.blocks.length > 0 ||
      composition.mode === 'deterministic_business' ||
      (verdict.sendable && verdict.claims.length > 0),
  );
  check(
    'am tinh 5 — khong bien the nao dung duoc mot khoi / mot khang dinh co tham quyen',
    structural.length === 0,
    `${seeds.length} cau thu, ${structural.length} dung duoc khoi`,
  );

  /*
   * DO LUONG PHAN DU, khong giau no.
   *
   * Mot cau CO vat mang (chu so, hoac be mat chinh sach/cam ket bo trich nhan ra) thi bi hop dong
   * neo nguon bo han. Mot cau dinh tinh, KHONG chu so, dien dat ngoai bo trich thi van di ra duoc
   * — duoi dang VAN XUOI KHONG CO THAM QUYEN, khong phai duoi dang mot khang dinh nghiep vu. Day
   * la phan du da duoc noi ro trong bao cao, va tep nay in ra con so cua no de nguoi review khong
   * phai tin mot cau van.
   */
  const rejected = results.filter(({ composition }) => !composition.narrative.admitted);
  const asProse = results.filter(({ composition }) => composition.narrative.admitted);
  check(
    'am tinh 5b — cau MANG VAT MANG bi hop dong neo nguon bo han',
    rejected.length >= 4,
    `${rejected.length}/${seeds.length} bi bo: ` +
      rejected.map(({ composition }) => composition.narrative.reason).join(','),
  );
  process.stdout.write(
    `INFO  phan du da biet: ${asProse.length}/${seeds.length} cau dinh tinh khong chu so di ra duoc ` +
      `duoi dang van xuoi KHONG tham quyen (khong khoi, claims=[]): ` +
      `${JSON.stringify(asProse.map(({ text }) => text))}\n`,
  );
}

/* ------------------------------------------------------------------ *
 * DUONG DUONG — du kien co that thi render DUNG con so tat dinh
 * ------------------------------------------------------------------ */

{
  const grants = mergeAuthority(grantsFromQuote([UNIT_PRICE]));
  const composition = compose(plan(['price_quote'], ''), quoteFacts, { authority: grants });
  const verdict = decideOutboundAuthority(composition, grants);
  check(
    'duong duong 1 — bao gia co tham quyen -> render dung don gia cua bang gia',
    verdict.sendable &&
      verdict.reason === 'AUTHORITY_SATISFIED' &&
      composition.text.includes('1.150.000đ') &&
      composition.mode === 'deterministic_business',
    `verdict=${verdict.reason} text=${JSON.stringify(composition.text.slice(0, 80))}`,
  );
}

{
  const grants = mergeAuthority(grantsFromPricedOrder(pricedOrder));
  const composition = compose(
    plan(['order_pricing', 'payment_policy'], ''),
    { pricedOrder },
    { authority: grants },
  );
  const verdict = decideOutboundAuthority(composition, grants);
  check(
    'duong duong 2 — don da tinh gia -> dung don gia / thanh tien / tong / dieu khoan cua don',
    verdict.sendable &&
      composition.text.includes('11.500.000đ') &&
      composition.text.includes('Công nợ 30 ngày') &&
      composition.blocks.length === 2,
    `blocks=${composition.blocks.map((block) => block.kind).join(',')} verdict=${verdict.reason}`,
  );
}

{
  const composition = compose(
    plan([], 'Da san pham co tua lung luoi, khung thep son tinh dien a.'),
  );
  const verdict = decideOutboundAuthority(composition, NO_GRANT);
  check(
    'duong duong 3 — cau FAQ thuong khong mang he qua van gui duoc',
    verdict.sendable &&
      verdict.reason === 'NARRATIVE_ONLY_COMPOSITION' &&
      composition.mode === 'narrative_only',
    `verdict=${verdict.reason}`,
  );
}

/* ------------------------------------------------------------------ *
 * DIEM NGHEN GUI — vang mat / lech dau deu KHONG gui
 * ------------------------------------------------------------------ */

{
  const composition = compose(plan([], 'Da san pham co tua lung luoi a.'));
  const verdict = decideOutboundAuthority(composition, NO_GRANT);
  const base = {
    steps: [],
    primaryRole: 'router',
    senderType: 'dai_ly',
    llmCalls: 1,
    brainMode: 'proof',
    supervisor: { riskLevel: 'none', escalate: false, reasons: [] },
  };

  const absentDecision = pinnedOutboundVerdict(base, composition.text);
  const absentComposition = pinnedOutboundVerdict(
    { ...base, outboundAuthority: verdict },
    composition.text,
  );
  const mismatched = pinnedOutboundVerdict(
    { ...base, outboundAuthority: verdict, outboundComposition: composition },
    'Da gia 990.000d a.',
  );
  const intact = pinnedOutboundVerdict(
    { ...base, outboundAuthority: verdict, outboundComposition: composition },
    composition.text,
  );

  check(
    'diem nghen 1 — khong co phan quyet ghim -> KHONG gui',
    absentDecision.sendable === false && absentDecision.reason === 'AUTHORITY_DECISION_ABSENT',
    absentDecision.reason,
  );
  check(
    'diem nghen 2 — co phan quyet nhung KHONG co ban soan co kieu -> KHONG gui',
    absentComposition.sendable === false && absentComposition.reason === 'COMPOSITION_ABSENT',
    absentComposition.reason,
  );
  check(
    'diem nghen 3 — van ban da doi sau khi duoc cap phan quyet -> KHONG gui',
    mismatched.sendable === false && mismatched.reason === 'AUTHORITY_PAYLOAD_MISMATCH',
    mismatched.reason,
  );
  check(
    'diem nghen 4 — phan quyet + ban soan + van ban khop dau -> gui duoc',
    intact.sendable === true,
    intact.reason,
  );
  check(
    'diem nghen 5 — van ban tat dinh tron van co ban soan (khong duoc mien)',
    deterministicComposition('Xac nhan don').mode === 'deterministic_document' &&
      outboundFingerprint('a  b') === outboundFingerprint(' a b '),
    'deterministic_document + dau bo qua khoang trang',
  );
}

/* ------------------------------------------------------------------ *
 * KET
 * ------------------------------------------------------------------ */

const failed = checks.filter((entry) => !entry.ok);
const detail = { dist: DIST, total: checks.length, failed: failed.length };
if (failed.length) {
  emit('fail', 'OUTBOUND_COMPOSITION_PROOF_FAILED', {
    ...detail,
    cases: failed.map((entry) => entry.name),
  });
  process.exitCode = 1;
} else {
  emit('ok', 'OUTBOUND_COMPOSITION_PROOF_PASSED', detail);
}
