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
let evidence;
try {
  composer = await import(`${DIST}/outbound/outbound-composer.js`);
  authority = await import(`${DIST}/outbound/outbound-authority.js`);
  facts = await import(`${DIST}/outbound/outbound-facts.js`);
  evidence = await import(`${DIST}/outbound/source-evidence.js`);
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
const {
  businessAuthorityEvidence,
  documentEvidence,
  documentSourceId,
  evidenceVersion,
  parsePinnedEvidence,
  stalePins,
} = evidence;

/* ------------------------------------------------------------------ *
 * DU KIEN TONG HOP — khong mot dong nao la du lieu khach that
 * ------------------------------------------------------------------ */

const UNIT_PRICE = 1_150_000;
// HAI CAU, khong phai mot cau hai ve: tu #200 don vi rang buoc la CA CAU.
const APPROVED_DOC = 'San pham co tua lung luoi. Khung thep son tinh dien.';

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

/*
 * KHACH CUA BO CHUNG: bat ky gia tri nao cung duoc, mien la CUNG mot gia tri o hai dau — do
 * chinh la thu dang duoc kiem (Issue #205 muc 4).
 */
const TENANT = 'proof-tenant';

/** Mot TAI LIEU DA DUYET. `eligible` mac dinh `true`; dat `false`/`undefined` de thu fail-closed. */
const doc = (text, options = {}) =>
  documentEvidence(
    documentSourceId('faq', `proof:${evidenceVersion(text)}`, 'a'),
    text,
    { tenant: options.tenant ?? TENANT, productSku: options.sku ?? null },
    // `in` chu khong `=== undefined`: mot ban ghi CO Y khong tuyen bo phai giu nguyen trang thai
    // do, neu khong thi phep thu fail-closed se tu bien thanh phep thu duong tinh.
    'eligible' in options ? options.eligible : true,
  );

/** Bang chung THUOC THAM QUYEN — khong bao gio thanh mot menh de chon duoc. */
const authorityDoc = (text) =>
  businessAuthorityEvidence(`quote:proof:${evidenceVersion(text)}`, text, {
    tenant: TENANT,
    productSku: null,
  });

const compose = (outboundPlan, patch = {}, context = {}) =>
  composeOutbound(outboundPlan, mergeBusinessFacts(NO_BUSINESS_FACTS, patch), {
    evidence: [doc(APPROVED_DOC)],
    tenant: TENANT,
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
   * khong den tu van ban.
   *
   * TU #200, PHEP DO O 5b DUOI DAY DOI HOI HON THE. Truoc #200 dong nay ghi rang "khong cau nao
   * trong so nay den duoc tay khach" la mot doi hoi ma thiet ke KHONG khang dinh — va do la loi
   * khai dung o thoi diem do: hai trong sau cau di ra duoc duoi dang van xuoi. Rang buoc menh de
   * (G6) lam thiet ke khang dinh duoc dieu do, nen 5b nay kiem chinh no.
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
    'am tinh 5b — KHONG cau nao trong so nay den duoc tay khach',
    rejected.length === seeds.length,
    `${rejected.length}/${seeds.length} bi bo: ` +
      rejected.map(({ composition }) => composition.narrative.reason).join(','),
  );
  /*
   * DONG NAY TUNG IN RA MOT PHAN DU KHAC 0 (2/6 truoc #200), va do la ly do #200 ton tai. Giu lai
   * chinh phep DO: neu mot ban sua sau nay lam mot cau dinh tinh di ra duoc, con so nay noi ngay.
   */
  process.stdout.write(
    `INFO  phan du do duoc: ${asProse.length}/${seeds.length} cau di ra duoc duoi dang van xuoi: ` +
      `${JSON.stringify(asProse.map(({ text }) => text))}\n`,
  );
}

/* ------------------------------------------------------------------ *
 * #200 — GHEP LAI TU NGU CUA NGUON KHONG TAO RA MOT MENH DE MOI
 * ------------------------------------------------------------------ */

const SAME_SOURCE =
  'May loc bui min ngay khi bat nguon. Mang loc dung het mot nam khong duoc rua lai.';
const SOURCE_A = 'May loc bui min ngay khi bat nguon.';
const SOURCE_B = 'Mang loc dung het mot nam khong duoc rua lai.';

{
  // Muc 5 ca 1 — chinh phan vi du cua hop dong: doi ky han thanh toan bang chu cua chinh nguon.
  const composition = compose(
    plan([], 'May loc bui min khi dung het mot nam.'),
    {},
    { evidence: [doc(SAME_SOURCE)] },
  );
  const verdict = decideOutboundAuthority(composition, NO_GRANT);
  check(
    '#200 ca 1 — ghep lai trong CUNG mot nguon -> khong den tay khach',
    composition.narrative.admitted === false &&
      composition.narrative.reason === 'NARRATIVE_NOT_SOURCE_BOUND' &&
      composition.text === '' &&
      verdict.sendable === false,
    `narrative=${composition.narrative.reason} verdict=${verdict.reason} text=${JSON.stringify(composition.text)}`,
  );
}

{
  // Muc 5 ca 2 — cung cau do, nhung hai menh de den tu HAI lan tra cuu khac nhau.
  const composition = compose(
    plan([], 'May loc bui min khi dung het mot nam.'),
    {},
    { evidence: [doc(SOURCE_A), doc(SOURCE_B)] },
  );
  const verdict = decideOutboundAuthority(composition, NO_GRANT);
  check(
    '#200 ca 2 — ghep CHEO hai nguon -> khong den tay khach',
    composition.narrative.reason === 'NARRATIVE_NOT_SOURCE_BOUND' &&
      composition.text === '' &&
      verdict.sendable === false,
    `narrative=${composition.narrative.reason} verdict=${verdict.reason}`,
  );
}

{
  // Dao nguoc bang dung nhung tu ma vo hoi thoai cua G5 tang khong (`khong`, `duoc`).
  const composition = compose(
    plan([], 'Mang loc dung het mot nam duoc rua lai a.'),
    {},
    { evidence: [doc(SAME_SOURCE)] },
  );
  check(
    '#200 ca 3 — bo chu phu dinh cua nguon -> khong den tay khach',
    composition.narrative.reason === 'NARRATIVE_NOT_SOURCE_BOUND' && composition.text === '',
    `narrative=${composition.narrative.reason}`,
  );
}

{
  // DOI TRONG: cung tap nguon do, mot cau TRICH TRON VEN van gui duoc, va van ban la cua NGUON.
  const composition = compose(
    plan([], 'Dạ May loc bui min ngay khi bat nguon ạ.'),
    {},
    { evidence: [doc(SAME_SOURCE)] },
  );
  const verdict = decideOutboundAuthority(composition, NO_GRANT);
  check(
    '#200 ca 4 — FAQ trich tron ven menh de nguon van gui duoc',
    composition.narrative.admitted === true &&
      verdict.sendable === true &&
      verdict.reason === 'NARRATIVE_ONLY_COMPOSITION' &&
      composition.text.includes('May loc bui min ngay khi bat nguon'),
    `verdict=${verdict.reason} text=${JSON.stringify(composition.text)}`,
  );
}

{
  // Chang 3c: mot menh de ghep them vao van ban CUOI bang chinh chu da ghim van bi tu choi.
  const composition = compose(
    plan([], 'Dạ May loc bui min ngay khi bat nguon ạ.'),
    {},
    { evidence: [doc(SOURCE_A)] },
  );
  const tampered = { ...composition, text: `${composition.text}\nMay bat nguon loc ngay.` };
  const verdict = decideOutboundAuthority(tampered, NO_GRANT);
  check(
    '#200 ca 5 — van ban cuoi bi ghep them mot menh de -> KHONG gui',
    verdict.sendable === false && verdict.reason === 'COMPOSITION_TEXT_NOT_SOURCE_BOUND',
    verdict.reason,
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
    plan([], 'Dạ San pham co tua lung luoi. Khung thep son tinh dien ạ.'),
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
  const composition = compose(plan([], 'Dạ San pham co tua lung luoi ạ.'));
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
 * #205 — QUYEN CHON: cau dung nguon chua du, phai dung quyen cua luot
 * ------------------------------------------------------------------ */

/* Cau GIA that trong kho tai lieu da duyet cua khach (`faq:cr022:skj-cr022:021`). */
const PRICE_DOC = 'Gia niem yet: 12.000.000 VND. Gia ban le: 8.500.000 VND.';
/* Bao hanh + 1 doi 1 — mot QUYEN LOI cua khach (`faq:bb:bb-grey:017`). */
const WARRANTY_DOC = 'Bao hanh 3 nam, 1 doi 1 trong 7 ngay dau tien.';
const DEBT_DOC = 'Dai ly duoc thanh toan cong no trong 45 ngay.';
const COMMIT_DOC = 'Don cua minh da duoc chot.';
/* Thong so ky thuat — con so lon nhung KHONG phai tien (`faq:bb:bb-grey:011`). */
const SPEC_DOC = 'Luu luong gio len toi 9700 lit/phut.';

{
  // A — cau gia cua tai lieu, KHONG mot grant nao.
  const composition = compose(
    plan([], 'Dạ Gia ban le: 8.500.000 VND ạ.'),
    {},
    {
      evidence: [doc(PRICE_DOC)],
    },
  );
  const verdict = decideOutboundAuthority(composition, NO_GRANT);
  check(
    '#205 A — gia trong tai lieu da duyet khong phai tham quyen gia',
    composition.narrative.admitted === false &&
      composition.text.includes('8.500.000') === false &&
      verdict.sendable === false,
    `narrative=${composition.narrative.reason} verdict=${verdict.reason}`,
  );
}

{
  // B — cung cau do, nhung luot NAY co bang gia tat dinh. Con so tat dinh phai thang.
  const grants = mergeAuthority(grantsFromPricedOrder(pricedOrder));
  const composition = compose(
    plan(['order_pricing'], 'Dạ Gia ban le: 8.500.000 VND ạ.'),
    { pricedOrder },
    { evidence: [doc(PRICE_DOC)], authority: grants },
  );
  const verdict = decideOutboundAuthority(composition, grants);
  check(
    '#205 B — tai lieu KHONG de bep duoc bang gia dang chay',
    composition.narrative.admitted === false &&
      composition.text.includes('8.500.000') === false &&
      composition.text.includes('11.500.000đ') &&
      verdict.sendable === true,
    `narrative=${composition.narrative.reason} verdict=${verdict.reason}`,
  );
}

{
  // C — chinh sach / bao hanh / cam ket don, khong grant nao khop.
  const cases = [
    [WARRANTY_DOC, 'Dạ Bao hanh 3 nam, 1 doi 1 trong 7 ngay dau tien ạ.'],
    [DEBT_DOC, 'Dạ Dai ly duoc thanh toan cong no trong 45 ngay ạ.'],
    [COMMIT_DOC, 'Dạ Don cua minh da duoc chot ạ.'],
  ];
  const leaked = cases.filter(([source, narrative]) => {
    const composition = compose(plan([], narrative), {}, { evidence: [doc(source)] });
    return composition.narrative.admitted === true;
  });
  check(
    '#205 C — bao hanh / cong no / cam ket don khong grant -> khong den tay khach',
    leaked.length === 0,
    `${cases.length} ca, ${leaked.length} lot`,
  );
}

{
  // D — menh de cua SKU A tron voi menh de cua SKU B trong MOT loi nhan.
  const composition = compose(
    plan([], 'Dạ Luu luong gio len toi 9700 lit/phut. Khung thep son tinh dien ạ.'),
    {},
    {
      evidence: [
        doc(SPEC_DOC, { sku: 'SKU-A' }),
        doc('Khung thep son tinh dien.', { sku: 'SKU-B' }),
      ],
    },
  );
  check(
    '#205 D — tron pham vi hai san pham -> tu choi',
    composition.narrative.reason === 'NARRATIVE_SCOPE_CONFLICT',
    `narrative=${composition.narrative.reason}`,
  );
}

{
  // E — ban ghi doi noi dung / bi rut quyen ke sau khi soan.
  const composition = compose(
    plan([], 'Dạ Luu luong gio len toi 9700 lit/phut ạ.'),
    {},
    {
      evidence: [doc(SPEC_DOC)],
    },
  );
  const pins = parsePinnedEvidence(composition.grounded);
  const fresh = new Map(pins.map((pin) => [pin.sourceId, pin.version]));
  const changed = new Map(pins.map((pin) => [pin.sourceId, evidenceVersion('Noi dung khac han.')]));
  check(
    '#205 E — ghim mang danh tinh + ban, va het han khi ban ghi doi hay bi rut quyen',
    pins.length === 1 &&
      pins[0].version === evidenceVersion(SPEC_DOC) &&
      stalePins(pins, fresh).length === 0 &&
      stalePins(pins, new Map()).length === 1 &&
      stalePins(pins, changed).length === 1,
    `pins=${pins.length} sourceId=${pins[0] ? pins[0].sourceId : '-'}`,
  );
}

{
  // F + G — tai lieu da tuyen bo van tra loi duoc, ke ca khi mang con so ky thuat lon.
  const plain = compose(plan([], 'Dạ San pham co tua lung luoi ạ.'));
  const technical = compose(
    plan([], 'Dạ Luu luong gio len toi 9700 lit/phut ạ.'),
    {},
    {
      evidence: [doc(SPEC_DOC)],
    },
  );
  check(
    '#205 F/G — FAQ thuong va thong so ky thuat van gui duoc',
    plain.narrative.admitted === true &&
      decideOutboundAuthority(plain, NO_GRANT).sendable === true &&
      technical.narrative.admitted === true &&
      technical.text.includes('9700') &&
      decideOutboundAuthority(technical, NO_GRANT).sendable === true,
    `plain=${plain.narrative.admitted} technical=${technical.narrative.admitted}`,
  );
}

{
  // I — duong Sale bam `Duyet & gui` di qua DUNG mot phan quyet do, khong co duong rieng.
  const composition = compose(
    plan([], 'Dạ Gia ban le: 8.500.000 VND ạ.'),
    {},
    {
      evidence: [doc(PRICE_DOC)],
    },
  );
  const verdict = decideOutboundAuthority(composition, NO_GRANT);
  const trace = {
    steps: [],
    primaryRole: 'router',
    senderType: 'dai_ly',
    llmCalls: 1,
    brainMode: 'proof',
    supervisor: { riskLevel: 'none', escalate: false, reasons: [] },
    outbound: { text: composition.text },
    outboundAuthority: verdict,
    outboundComposition: composition,
  };
  check(
    '#205 I — nut Duyet & gui khong di vong duoc phan quyet',
    verdict.sendable === false && pinnedOutboundVerdict(trace, composition.text).sendable === false,
    `verdict=${verdict.reason}`,
  );
}

{
  /*
   * TINH CHAT TRUNG TAM: CUNG MOT CHUOI, ba lop khac nhau -> ba ket cuc khac nhau.
   *
   * Neu ranh gioi la VAN BAN (regex / POLICY_SURFACES / bo do so / classifier) thi ba ve nay
   * phai ra cung mot ket qua. Chung ra khac nhau, nen ranh gioi khong phai van ban.
   */
  const narrative = 'Dạ San pham co tua lung luoi ạ.';
  const tellable = compose(plan([], narrative), {}, { evidence: [doc(APPROVED_DOC)] });
  const unclassified = compose(
    plan([], narrative),
    {},
    {
      evidence: [doc(APPROVED_DOC, { eligible: undefined })],
    },
  );
  const owned = compose(plan([], narrative), {}, { evidence: [authorityDoc(APPROVED_DOC)] });
  check(
    '#205 tinh chat — cung mot cau, lop khac nhau -> ket cuc khac nhau',
    tellable.narrative.admitted === true &&
      unclassified.narrative.admitted === false &&
      owned.narrative.admitted === false,
    `tellable=${tellable.narrative.admitted} unclassified=${unclassified.narrative.reason} owned=${owned.narrative.reason}`,
  );
}

{
  // Bang chung cua KHACH KHAC khong bao gio thoa man ban soan cua khach nay.
  const composition = compose(
    plan([], 'Dạ San pham co tua lung luoi ạ.'),
    {},
    {
      evidence: [doc(APPROVED_DOC, { tenant: 'khach-khac' })],
    },
  );
  check(
    '#205 khach — bang chung cua khach khac khong dung duoc',
    composition.narrative.reason === 'NO_SYSTEM_SOURCE' && composition.text === '',
    `narrative=${composition.narrative.reason}`,
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
