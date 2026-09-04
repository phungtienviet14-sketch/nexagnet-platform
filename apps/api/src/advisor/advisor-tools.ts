import type {
  OrderView,
  OutboundAuthorityGrant,
  OutboundBlockKind,
  OutboundPlan,
  OutboundPlanKind,
  SenderType,
} from '@netviet/shared';
import { tenantRetailAdviceOrNull } from '@netviet/tenant';
import {
  grantsFromDealerPolicy,
  grantsFromPersistedOrder,
  grantsFromPricedOrder,
  grantsFromQuote,
} from '../outbound/outbound-authority.js';
import { orderStateFacts, type BusinessFactsPatch } from '../outbound/outbound-facts.js';
import { POLICY_LABELS, quotePriceField, quoteQualifier } from '../agents/risk-rules.js';
import type { ContentService } from '../content/content.service.js';
import type { KnowledgeService, ResolvedGroup } from '../knowledge/knowledge.service.js';
import { rankFaqs } from '../content/faq-ranking.js';
import { DEFAULT_RULES_CONFIG } from '../rules/config.js';
import { matchProduct, priceOrder } from '../rules/rules.js';
import { formatVnd, normalize } from '../rules/text.js';
import { ORDER_TOOL_SPECS, isOrderTool, runOrderTool, type OrderToolDeps } from './order-tools.js';

/**
 * CONG CU cua agent tu van: cua duy nhat de LLM cham vao nguon su that.
 *
 * VI SAO PHAI LA CONG CU chu khong phai nhoi het vao prompt: danh muc + bang gia + 95 FAQ cua mot
 * khach khong vua trong mot prompt re tien, va nhoi ca vao thi LLM van phai tu chon — tuc van doan.
 * Cho no goi tra cuu la cho no lam dung viec no gioi (hieu khach hoi gi) va giao viec no lam do
 * (nho chinh xac mot bang so) cho Postgres.
 *
 * BAT BIEN KHONG DUOC DAO NGUOC (CLAUDE.md quyet dinh #5): LLM khong TINH tien. Moi con so tien
 * trong ket qua deu do `priceOrder()` / bang gia tao ra; LLM chi duoc NHAC LAI. `money-guard.ts`
 * kiem lai dieu do sau khi LLM viet xong.
 *
 * CONG CU TRONG FILE NAY DEU CHI DOC. Cong cu GHI (huy don, sua don) nam rieng o
 * `order-tools.ts` — tach file de ranh gioi "doc vs ghi" la ranh gioi NHIN THAY DUOC, khong phai
 * mot quy uoc phai tin. Doc mo hinh de doa o dau file do truoc khi them bat ky cong cu ghi nao.
 */

export interface AdvisorToolContext {
  readonly knowledge: KnowledgeService;
  readonly content?: ContentService;
  readonly resolved: ResolvedGroup;
  readonly senderType: SenderType;
  readonly chatId: string;
  readonly senderExternalId?: string;
  /** Don gan day cua chinh nguoi nay — chi doc, da loc san theo nhom + nguoi gui. */
  readonly recentOrders?: readonly OrderView[];
  /**
   * Cong GHI. VANG MAT = agent khong duoc chao ra cong cu huy/sua don nao ca.
   *
   * Mac dinh la vang mat co chu y: mot moi truong chua co y thuc ve chuyen nay (test, CI, demo
   * offline) thi khong tu nhien co quyen doi trang thai don.
   */
  readonly orderCommands?: OrderToolDeps;
}

export interface AdvisorToolSpec {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
}

/** Ket qua tra ve cho LLM: JSON gon, khong phai cau chu — LLM tu viet cau chu. */
export type AdvisorToolResult = Record<string, unknown>;

/**
 * MOT LAN TRA CUU: du kien cho LLM, KEM tham quyen tat dinh ma lan tra cuu do sinh ra.
 *
 * Day la cho DUY NHAT tham quyen tien/chinh sach/cam ket don duoc sinh ra tren duong co LLM. Bat
 * bien: `grants` chi den tu chinh ket qua rules engine / bang gia / cap dai ly / trang thai don —
 * khong bao gio tu van ban model viet ra. Xem `outbound/outbound-authority.ts`.
 */
export interface AdvisorToolOutcome {
  readonly output: AdvisorToolResult;
  readonly grants: readonly OutboundAuthorityGrant[];
  /**
   * DU KIEN CO KIEU ma lan tra cuu nay sinh ra — thu DUY NHAT bo soan render duoc (Issue #189).
   *
   * `grants` va `facts` di doi nhung khong thay nhau duoc: grant tra loi "co duoc phep noi
   * 1.150.000 khong", facts tra loi "1.150.000 la don gia cua cai gi". Truoc #189 chi can ve dau;
   * tu khi bo soan tu viet cau chu thi can ca hai.
   */
  readonly facts?: BusinessFactsPatch;
  /**
   * CHUOI HE THONG SO HUU ma lan tra cuu nay lay tu DB/rules — de neo nguon cho loi nhan.
   *
   * KHONG duoc dat `output` da serialize vao day. `output` co echo tham so model tu gui, nen neo
   * vao no la de model tu tao bang chung cho con so no sap viet. Xem `outbound-narrative.ts`.
   */
  readonly sources?: readonly string[];
  /** Chi cong cu `soan_tra_loi` dat truong nay — ke hoach tra loi, KHONG mang tham quyen. */
  readonly plan?: OutboundPlan;
}

/** Cong cu chi tra du kien mo ta, khong sinh tham quyen he qua nao. */
const descriptive = (output: AdvisorToolResult): AdvisorToolOutcome => ({ output, grants: [] });

/** Tran so muc tai lieu do vao prompt. Du de LLM chon, chua den muc thoi phong chi phi moi luot. */
const MAX_DOCS = 8;

const object = (
  properties: Record<string, unknown>,
  required: string[] = [],
): Record<string, unknown> => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

export const ADVISOR_TOOLS: readonly AdvisorToolSpec[] = [
  {
    name: 'tra_cuu_san_pham',
    description:
      'Tim san pham trong danh muc theo tu khoa khach viet (ke ca viet tat, khong dau). Tra ve ma SKU, ten day du, don vi va mo ta. GOI TRUOC khi noi ve bat ky san pham nao.',
    inputSchema: object(
      { tu_khoa: { type: 'string', description: 'Tu khoa khach viet, vd "v08", "ghe felix"' } },
      ['tu_khoa'],
    ),
  },
  {
    name: 'tra_cuu_tai_lieu',
    description:
      'Lay tai lieu DA DUYET (FAQ, bai tu van) cua mot san pham de tra loi cau hoi ve cong nang, cach dung, bao hanh, thong so. Tra ve mang rong neu chua co tai lieu duyet — luc do KHONG duoc tu tra loi.',
    inputSchema: object(
      {
        sku: { type: 'string', description: 'Ma SKU lay tu tra_cuu_san_pham' },
        cau_hoi: {
          type: 'string',
          description: 'Cau hoi cua khach, de xep hang tai lieu lien quan',
        },
      },
      ['sku', 'cau_hoi'],
    ),
  },
  {
    name: 'bao_gia',
    description:
      'Lay don gia hien hanh theo dung cap cua nguoi dang hoi (dai ly/CTV lay gia si). Day la NGUON DUY NHAT duoc phep noi con so tien. Khong co dong gia thi tra ve thieu du lieu.',
    inputSchema: object(
      { skus: { type: 'array', items: { type: 'string' }, description: 'Danh sach SKU' } },
      ['skus'],
    ),
  },
  {
    name: 'tinh_don',
    description:
      'Tinh tong mot don hang bang rules engine: don gia theo cap, thanh tien, chinh sach thanh toan, va cac canh bao. Dung khi khach hoi "tong bao nhieu" hoac truoc khi chot don.',
    inputSchema: object(
      {
        items: {
          type: 'array',
          items: object({ sku: { type: 'string' }, so_luong: { type: 'integer' } }, [
            'sku',
            'so_luong',
          ]),
        },
      },
      ['items'],
    ),
  },
  {
    name: 'tra_cuu_chinh_sach',
    description:
      'Chinh sach thanh toan/cong no ap dung cho dai ly cua nhom Zalo nay, va cap cua ho.',
    inputSchema: object({}),
  },
  {
    name: 'lich_su_don',
    description:
      'Cac don gan day CUA CHINH nguoi dang hoi trong nhom nay. Dung khi khach hoi ve don da dat, tinh trang giao hang.',
    inputSchema: object({}),
  },
];

/* ------------------------------------------------------------------ *
 * CONG CU KET THUC LUOT — KE HOACH TRA LOI (Issue #189)
 * ------------------------------------------------------------------ */

export const PLAN_TOOL = 'soan_tra_loi';

/**
 * TU VUNG KHOI ma model duoc dung, va anh xa sang kieu noi bo.
 *
 * Ten tieng Viet vi ca be mat cong cu con lai deu tieng Viet, va prompt cua khach nay viet bang
 * tieng Viet — tron hai thu tieng trong mot lan goi lam mo hinh chon nham nhieu hon. Anh xa
 * TUONG MINH chu khong lay thang ten kieu: doi ten mot kieu noi bo khong duoc phep am tham doi
 * be mat ma model da hoc.
 */
const BLOCK_BY_NAME: Readonly<Record<string, OutboundBlockKind>> = {
  bao_gia: 'price_quote',
  tinh_tien_don: 'order_pricing',
  chinh_sach_thanh_toan: 'payment_policy',
  vat_cod_van_chuyen: 'vat_cod_shipping',
  khuyen_mai: 'promotion',
  trang_thai_don: 'order_commitment',
  phe_duyet: 'approval',
};

const PLAN_KIND_BY_NAME: Readonly<Record<string, OutboundPlanKind>> = {
  faq: 'faq',
  tu_van_san_pham: 'product_advice',
  tinh_trang_don: 'order_status',
  chuyen_sale: 'handoff',
};

/**
 * CONG CU CUOI CUNG cua mot luot — model khai bao no MUON GUI GI, khong phai no gui gi.
 *
 * Doc ky `khoi_nghiep_vu`: day la danh sach LOAI khoi. Khong co cho nao trong lien ket nay de
 * model dat mot con so, mot loai chinh sach hay mot muc cam ket. `loi_nhan` la van xuoi, va no
 * phai qua hop dong neo nguon truoc khi den tay khach.
 *
 * VI SAO LA MOT CONG CU chu khong phai mot dinh dang van ban model tu tuan thu: cong cu di qua
 * `advisorToolsFor()`, tuc CA HAI nha cung cap (Claude, DeepSeek) nhan duoc no bang cung mot
 * duong, va dau vao la JSON co schema chu khong phai mot chuoi phai parse bang regex.
 */
export const PLAN_TOOL_SPEC: AdvisorToolSpec = {
  name: PLAN_TOOL,
  description:
    'BAT BUOC goi cuoi cung de gui cau tra loi cho khach. Ban KHONG duoc tu viet con so tien, dieu khoan cong no/thanh toan, cau VAT/COD/cuoc, hay cau noi don da duoc ghi nhan/chot vao `loi_nhan`. Muon khach thay nhung thu do thi XIN KHOI trong `khoi_nghiep_vu`; he thong se tu dung chung tu du lieu goc va ghep vao sau loi nhan cua ban.',
  inputSchema: object(
    {
      y_dinh: {
        type: 'string',
        enum: Object.keys(PLAN_KIND_BY_NAME),
        description: 'Luot nay dang lam gi.',
      },
      khoi_nghiep_vu: {
        type: 'array',
        items: { type: 'string', enum: Object.keys(BLOCK_BY_NAME) },
        description:
          'Cac khoi du lieu goc muon he thong ghep vao. Khong co du lieu goc thi khoi se khong xuat hien — dung viet bu bang loi.',
      },
      loi_nhan: {
        type: 'string',
        description:
          'Cau tra loi cho khach: giai thich, tra loi cong nang/cach dung/bao hanh tu tai lieu da duyet, hoi lai thong tin con thieu. Khong chua con so tien, dieu khoan thanh toan hay cau xac nhan don.',
      },
    },
    ['y_dinh', 'loi_nhan'],
  ),
};

/**
 * JSON model sinh -> ke hoach co kieu. Coi nhu du lieu ngoai: moi truong tu ep kieu.
 *
 * FAIL CLOSED theo huong IT DAC QUYEN NHAT: ten khoi la -> BO KHOI DO (khong phai bo ca ke
 * hoach, va cung khong phai doan xem model dinh noi khoi nao). `y_dinh` la -> `faq`, la y dinh
 * khong cap gi.
 */
export function parseOutboundPlan(input: Record<string, unknown>): OutboundPlan {
  const requested = Array.isArray(input.khoi_nghiep_vu) ? input.khoi_nghiep_vu : [];
  return {
    kind: PLAN_KIND_BY_NAME[String(input.y_dinh ?? '')] ?? 'faq',
    requestedBlocks: [
      ...new Set(
        requested.flatMap((name) =>
          typeof name === 'string' && BLOCK_BY_NAME[name] ? [BLOCK_BY_NAME[name]] : [],
        ),
      ),
    ],
    narrative: typeof input.loi_nhan === 'string' ? input.loi_nhan : '',
  };
}

/**
 * Bo cong cu chao ra cho MOT luot, theo dung quyen cua ngu canh do.
 *
 * Cong cu ghi chi xuat hien khi ben goi da cap `orderCommands`. Loc o day thay vi de LLM tu kiem
 * che: mot cong cu da chao ra roi thi som muon cung co luc duoc goi.
 *
 * `lich_su_don` bi thay bang `tra_cuu_don` khi co cong ghi — hai cong cu cung tra ve danh sach don
 * chi lam LLM chon nham, va `tra_cuu_don` moi la cai tra ve ma don dung de huy/sua.
 */
export function advisorToolsFor(ctx: AdvisorToolContext): readonly AdvisorToolSpec[] {
  // `soan_tra_loi` chao ra o MOI ngu canh, ke ca khi khong co cong ghi: no la duong ket thuc luot,
  // khong phai mot quyen.
  if (!ctx.orderCommands) return [...ADVISOR_TOOLS, PLAN_TOOL_SPEC];
  return [
    ...ADVISOR_TOOLS.filter((spec) => spec.name !== 'lich_su_don'),
    ...ORDER_TOOL_SPECS.map((spec) => ({ ...spec, inputSchema: { ...spec.inputSchema } })),
    PLAN_TOOL_SPEC,
  ];
}

export async function runAdvisorTool(
  name: string,
  input: Record<string, unknown>,
  ctx: AdvisorToolContext,
): Promise<AdvisorToolOutcome> {
  if (name === PLAN_TOOL) {
    // Ke hoach KHONG cap tham quyen va KHONG la nguon neo nguon: `grants`/`sources` deu rong.
    // Tra ve mot xac nhan gon de vong goi cong cu ket thuc sach se o ca hai nha cung cap.
    return { output: { da_nhan: true }, grants: [], plan: parseOutboundPlan(input) };
  }
  if (isOrderTool(name)) {
    return ctx.orderCommands
      ? runOrderTool(name, input, ctx.orderCommands)
      : descriptive({ loi: 'He thong chua bat quyen thay doi don o kenh nay.' });
  }
  switch (name) {
    case 'tra_cuu_san_pham':
      return findProducts(String(input.tu_khoa ?? ''), ctx);
    case 'tra_cuu_tai_lieu':
      return findDocs(String(input.sku ?? ''), String(input.cau_hoi ?? ''), ctx);
    case 'bao_gia':
      return quote(toStringArray(input.skus), ctx);
    case 'tinh_don':
      return computeOrder(input.items, ctx);
    case 'tra_cuu_chinh_sach':
      return policy(ctx);
    case 'lich_su_don':
      return recentOrders(ctx);
    default:
      return descriptive({ loi: `Khong co cong cu ten "${name}"` });
  }
}

function findProducts(keyword: string, ctx: AdvisorToolContext): AdvisorToolOutcome {
  const products = ctx.knowledge.products();
  const direct = matchProduct(keyword, products);
  const norm = normalize(keyword);
  // `matchProduct` doi tu khoa CHUA ten SP; khach go "v08" thi no khop, go "hut bui" thi khong.
  // Nen bo sung mot vong quet nguoc: ten/alias chua tu khoa.
  const loose =
    norm.length >= 2
      ? products.filter((product) =>
          [product.name, ...product.aliases].some((candidate) =>
            normalize(candidate).includes(norm),
          ),
        )
      : [];
  const found = [...new Set([...(direct ? [direct] : []), ...loose])].slice(0, 5);
  return {
    output: {
      tim_thay: found.length,
      san_pham: found.map((product) => ({
        sku: product.sku,
        ten: product.name,
        don_vi: product.unit,
        viet_tat: product.aliases,
        ...(product.description ? { mo_ta: product.description } : {}),
      })),
    },
    grants: [],
    // Danh muc la NGUON HE THONG: ten/don vi/mo ta deu tu DB cua khach. `tu_khoa` model go KHONG
    // co trong day — no la dau vao cua model, va neo nguon vao dau vao cua model la khong neo gi.
    sources: found.flatMap((product) => [
      product.name,
      product.unit,
      ...(product.description ? [product.description] : []),
      ...product.aliases,
    ]),
  };
}

function findDocs(sku: string, question: string, ctx: AdvisorToolContext): AdvisorToolOutcome {
  const snapshot = ctx.content?.snapshot();
  if (!snapshot) {
    return descriptive({ tai_lieu: [], ghi_chu: 'He thong noi dung chua san sang.' });
  }
  const active = <T extends { status: string }>(rows: readonly T[]): T[] =>
    rows.filter((row) => row.status === 'active');
  const faqs = active(snapshot.faqs).filter((faq) => !faq.productSku || faq.productSku === sku);
  const advice = active(snapshot.advice).filter((row) => !row.productSku || row.productSku === sku);
  // BM25 truot KHONG dong nghia voi "chua co tai lieu". Truoc 21/08 hai truong hop nay tra ve
  // cung mot ket qua rong, nen agent bao "chua co tai lieu duyet" cho mot san pham co 14 FAQ da
  // duyet — do la mot cau noi SAI voi khach, khong phai mot cau than trong.
  //
  // Truot thi do CA tap FAQ cua san pham cho LLM tu chon: no hieu cau hoi tot hon mot bo dem tu.
  // An toan vi day la tai lieu DA DUYET va no chi di vao prompt, khong di thang toi khach.
  const ranked = rankFaqs(faqs, normalize(question), ctx.knowledge.glossary());
  const fellBack = ranked.length === 0 && faqs.length > 0;
  const selected = (ranked.length ? ranked : faqs).slice(0, MAX_DOCS);
  const docs = [
    ...selected.map((faq) => ({ hoi: faq.question, dap: faq.answer })),
    ...advice.map((row) => ({ tieu_de: row.title, noi_dung: row.body })),
  ].slice(0, MAX_DOCS);
  if (!docs.length) {
    /*
     * KHONG CO TAI LIEU DUYET => KHONG CO NGUON => hop dong neo nguon se tu choi loi nhan (G1).
     *
     * Truoc #189, cau ghi chu nay la tat ca nhung gi ngan model tu tra loi bang kien thuc chung —
     * tuc mot loi de nghi. Nay no van o day de model hieu ngu canh, nhung thu THUC SU chan la
     * `sources` rong: khong co nguon thi van xuoi khong duoc nhan, du model viet gi.
     */
    return descriptive({
      tai_lieu: [],
      ghi_chu:
        'Chua co tai lieu DA DUYET cho san pham nay. KHONG duoc tu tra loi tu kien thuc chung: hay noi that la se nho Sale xac minh.',
    });
  }
  return {
    output: {
      tai_lieu: docs,
      ...(fellBack
        ? {
            ghi_chu:
              'Khong co muc nao khop that sat cau hoi. Day la tai lieu da duyet cua san pham — hay tu chon phan tra loi dung cau hoi; khong phan nao tra loi duoc thi noi that la se nho Sale xac minh.',
          }
        : {}),
    },
    grants: [],
    // Tai lieu DA DUYET la nguon he thong manh nhat co trong luot: mot nguoi that da doc va bam
    // duyet tung dong. Do luong 04/09/2026 cho thay ~26% so tai lieu nay lam bo trich vat mang
    // bao dong (9700 lít/phút, bảo hành 7 ngày) — neo nguon o day chinh la thu hap thu chung.
    sources: selected
      .flatMap((faq) => [faq.question, faq.answer])
      .concat(advice.flatMap((row) => [row.title, row.body])),
  };
}

function quote(skus: readonly string[], ctx: AdvisorToolContext): AdvisorToolOutcome {
  const strategy = tenantRetailAdviceOrNull();
  // Khach khong ban hang khong co chien luoc bao gia nao — tra ve mot ket qua NOI RO dieu do, de
  // LLM khong bia ra mot con so, thay vi nem giua mot vong goi cong cu.
  if (!strategy) {
    return descriptive({ bao_gia: [], loi: 'Goi khach nay khong co bang gia ban le de tra cuu' });
  }
  const field = quotePriceField(strategy, ctx.senderType);
  const prices = ctx.knowledge.prices();
  const products = ctx.knowledge.products();
  const rows = skus.map((sku) => {
    const product = products.find((candidate) => candidate.sku === sku);
    const price = prices.find((row) => row.sku === sku)?.[field];
    if (!product) return { sku, loi: 'Khong co SKU nay trong danh muc' };
    if (typeof price !== 'number' || price <= 0) {
      return { sku, ten: product.name, loi: 'Chua co dong gia hien hanh — phai chuyen Sale' };
    }
    return { sku, ten: product.name, don_gia: price, don_gia_chu: formatVnd(price) };
  });
  const period = ctx.knowledge.pricePeriod()?.validMonth ?? null;
  const qualifier = quoteQualifier(strategy, ctx.senderType);
  // CHI nhung dong DA tra ra mot muc gia moi thanh du kien. Dong bao "chua co dong gia hien hanh"
  // khong dong gop gi — do dung la truong hop phai chuyen Sale, khong phai truong hop de LLM doan.
  const priced = rows.flatMap((row) =>
    typeof row.don_gia === 'number' && row.ten
      ? [
          {
            sku: row.sku,
            name: row.ten,
            unit: products.find((product) => product.sku === row.sku)?.unit ?? '',
            unitPrice: row.don_gia,
          },
        ]
      : [],
  );
  return {
    output: { ky_gia: period, bao_gia: rows, cau_kem_theo: qualifier },
    grants: grantsFromQuote(priced.map((line) => line.unitPrice)),
    facts: priced.length ? { quote: { period, qualifier, lines: priced } } : {},
    sources: [
      ...priced.flatMap((line) => [line.name, line.unit, formatVnd(line.unitPrice)]),
      ...(period ? [period] : []),
      qualifier,
    ],
  };
}

function computeOrder(rawItems: unknown, ctx: AdvisorToolContext): AdvisorToolOutcome {
  const items = toOrderItems(rawItems);
  if (!items.length) return descriptive({ loi: 'Chua co dong hang nao de tinh.' });
  const priced = priceOrder(
    { orderType: 'TH1', items, noVat: false },
    {
      dealer: ctx.resolved.dealer,
      branch: ctx.resolved.branch,
      products: ctx.knowledge.products(),
      prices: ctx.knowledge.prices(),
      priceOverrides: ctx.knowledge.priceOverrides(),
      cfg: DEFAULT_RULES_CONFIG,
    },
  );
  return {
    output: {
      dong_hang: priced.lines.map((line) => ({
        ten: line.productName ?? line.skuRaw,
        so_luong: line.quantity,
        don_gia: line.unitPrice,
        thanh_tien: line.lineTotal,
        thanh_tien_chu: formatVnd(line.lineTotal),
        khop_danh_muc: line.matched,
      })),
      tong: priced.grandTotal,
      tong_chu: formatVnd(priced.grandTotal),
      chinh_sach: priced.policy ? POLICY_LABELS[priced.policy] : null,
      canh_bao: priced.warnings,
    },
    // `priceOrder()` la nguon tat dinh duy nhat cho tien trong ca he thong (CLAUDE.md #5), nen
    // chinh ket qua cua no — khong phai van ban LLM viet lai — la thu cap tham quyen.
    grants: grantsFromPricedOrder(priced),
    // CA KET QUA di thang vao du kien: bo soan render tung dong tu day, nen no can ca so luong,
    // ten SP va tung khoan (tam tinh/cuoc/COD/VAT/tong), khong chi tap gia tri nhu `grants`.
    facts: { pricedOrder: priced },
    sources: [
      ...priced.lines.flatMap((line) => [
        line.productName ?? line.skuRaw,
        String(line.quantity),
        formatVnd(line.unitPrice),
        formatVnd(line.lineTotal),
      ]),
      formatVnd(priced.itemsSubtotal),
      formatVnd(priced.grandTotal),
      ...(priced.policy ? [POLICY_LABELS[priced.policy]] : []),
    ],
  };
}

function policy(ctx: AdvisorToolContext): AdvisorToolOutcome {
  const dealer = ctx.resolved.dealer;
  if (!dealer) {
    return descriptive({
      loi: 'Nhom Zalo nay chua duoc map dai ly — khong tra loi chinh sach duoc, phai chuyen Sale.',
    });
  }
  return {
    output: {
      dai_ly: dealer.name,
      cap: dealer.tier,
      chinh_sach: POLICY_LABELS[dealer.defaultPolicy],
    },
    // Chua map dai ly -> khong grant. Do chinh la ca "policy_finance skipped" ma muc 7 doi phai
    // fail closed: khong co cap dai ly thi khong co dieu khoan nao de noi.
    grants: grantsFromDealerPolicy(dealer.defaultPolicy),
    facts: {
      paymentPolicy: {
        dealerName: dealer.name,
        tier: dealer.tier ?? null,
        policy: dealer.defaultPolicy,
      },
    },
    sources: [
      dealer.name,
      POLICY_LABELS[dealer.defaultPolicy],
      ...(dealer.tier ? [dealer.tier] : []),
    ],
  };
}

function recentOrders(ctx: AdvisorToolContext): AdvisorToolOutcome {
  const orders = (ctx.recentOrders ?? []).slice(0, 5);
  const output = {
    don: orders.map((order) => ({
      ma_don: order.id,
      trang_thai: order.status,
      tao_luc: order.createdAt,
      tong: order.priced?.grandTotal ?? null,
      dong_hang: (order.priced?.lines ?? []).map((line) => ({
        ten: line.productName ?? line.skuRaw,
        so_luong: line.quantity,
      })),
    })),
    ...(orders.length
      ? {}
      : {
          ghi_chu:
            'Khong tim thay don nao cua nguoi nay trong nhom — dung doan, hay hoi lai khach.',
        }),
  };
  return {
    output,
    grants: orders.flatMap((order) => grantsFromPersistedOrder(order)),
    facts: orderStateFacts(orders),
    sources: orders.flatMap((order) => [
      ...(order.priced?.lines ?? []).map((line) => line.productName ?? line.skuRaw),
      ...(order.priced ? [formatVnd(order.priced.grandTotal)] : []),
    ]),
  };
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function toOrderItems(value: unknown): { skuRaw: string; quantity: number }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (raw === null || typeof raw !== 'object') return [];
    const item = raw as Record<string, unknown>;
    const sku = typeof item.sku === 'string' ? item.sku.trim() : '';
    const quantity = Number(item.so_luong);
    return sku && Number.isInteger(quantity) && quantity > 0 ? [{ skuRaw: sku, quantity }] : [];
  });
}
