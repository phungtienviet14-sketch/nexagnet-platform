import type { OrderView, SenderType } from '@netviet/shared';
import { tenantRetailAdvice } from '@netviet/tenant';
import { POLICY_LABELS, quotePriceField, quoteQualifier } from '../agents/risk-rules.js';
import type { ContentService } from '../content/content.service.js';
import type { KnowledgeService, ResolvedGroup } from '../knowledge/knowledge.service.js';
import { rankFaqs } from '../content/faq-ranking.js';
import { DEFAULT_RULES_CONFIG } from '../rules/config.js';
import { matchProduct, priceOrder } from '../rules/rules.js';
import { formatVnd, normalize } from '../rules/text.js';

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
 * MOI CONG CU DEU CHI DOC. Khong co cong cu nao ghi DB, gui tin hay doi trang thai don — mot LLM
 * bi chen prompt qua tin nhan Zalo cua khach thi cung khong lam duoc gi ngoai viec doc.
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
}

export interface AdvisorToolSpec {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
}

/** Ket qua tra ve cho LLM: JSON gon, khong phai cau chu — LLM tu viet cau chu. */
export type AdvisorToolResult = Record<string, unknown>;

const object = (
  properties: Record<string, unknown>,
  required: string[] = [],
): Record<string, unknown> => ({ type: 'object', properties, required, additionalProperties: false });

export const ADVISOR_TOOLS: readonly AdvisorToolSpec[] = [
  {
    name: 'tra_cuu_san_pham',
    description:
      'Tim san pham trong danh muc theo tu khoa khach viet (ke ca viet tat, khong dau). Tra ve ma SKU, ten day du, don vi va mo ta. GOI TRUOC khi noi ve bat ky san pham nao.',
    inputSchema: object({ tu_khoa: { type: 'string', description: 'Tu khoa khach viet, vd "v08", "ghe felix"' } }, ['tu_khoa']),
  },
  {
    name: 'tra_cuu_tai_lieu',
    description:
      'Lay tai lieu DA DUYET (FAQ, bai tu van) cua mot san pham de tra loi cau hoi ve cong nang, cach dung, bao hanh, thong so. Tra ve mang rong neu chua co tai lieu duyet — luc do KHONG duoc tu tra loi.',
    inputSchema: object(
      {
        sku: { type: 'string', description: 'Ma SKU lay tu tra_cuu_san_pham' },
        cau_hoi: { type: 'string', description: 'Cau hoi cua khach, de xep hang tai lieu lien quan' },
      },
      ['sku', 'cau_hoi'],
    ),
  },
  {
    name: 'bao_gia',
    description:
      'Lay don gia hien hanh theo dung cap cua nguoi dang hoi (dai ly/CTV lay gia si). Day la NGUON DUY NHAT duoc phep noi con so tien. Khong co dong gia thi tra ve thieu du lieu.',
    inputSchema: object({ skus: { type: 'array', items: { type: 'string' }, description: 'Danh sach SKU' } }, ['skus']),
  },
  {
    name: 'tinh_don',
    description:
      'Tinh tong mot don hang bang rules engine: don gia theo cap, thanh tien, chinh sach thanh toan, va cac canh bao. Dung khi khach hoi "tong bao nhieu" hoac truoc khi chot don.',
    inputSchema: object(
      {
        items: {
          type: 'array',
          items: object({ sku: { type: 'string' }, so_luong: { type: 'integer' } }, ['sku', 'so_luong']),
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

export async function runAdvisorTool(
  name: string,
  input: Record<string, unknown>,
  ctx: AdvisorToolContext,
): Promise<AdvisorToolResult> {
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
      return { loi: `Khong co cong cu ten "${name}"` };
  }
}

function findProducts(keyword: string, ctx: AdvisorToolContext): AdvisorToolResult {
  const products = ctx.knowledge.products();
  const direct = matchProduct(keyword, products);
  const norm = normalize(keyword);
  // `matchProduct` doi tu khoa CHUA ten SP; khach go "v08" thi no khop, go "hut bui" thi khong.
  // Nen bo sung mot vong quet nguoc: ten/alias chua tu khoa.
  const loose = norm.length >= 2
    ? products.filter((product) =>
        [product.name, ...product.aliases].some((candidate) => normalize(candidate).includes(norm)),
      )
    : [];
  const found = [...new Set([...(direct ? [direct] : []), ...loose])].slice(0, 5);
  return {
    tim_thay: found.length,
    san_pham: found.map((product) => ({
      sku: product.sku,
      ten: product.name,
      don_vi: product.unit,
      viet_tat: product.aliases,
      ...(product.description ? { mo_ta: product.description } : {}),
    })),
  };
}

function findDocs(sku: string, question: string, ctx: AdvisorToolContext): AdvisorToolResult {
  const snapshot = ctx.content?.snapshot();
  if (!snapshot) return { tai_lieu: [], ghi_chu: 'He thong noi dung chua san sang.' };
  const active = <T extends { status: string }>(rows: readonly T[]): T[] =>
    rows.filter((row) => row.status === 'active');
  const faqs = active(snapshot.faqs).filter((faq) => !faq.productSku || faq.productSku === sku);
  const advice = active(snapshot.advice).filter((row) => !row.productSku || row.productSku === sku);
  const ranked = rankFaqs(faqs, normalize(question), ctx.knowledge.glossary());
  const docs = [
    ...ranked.map((faq) => ({ hoi: faq.question, dap: faq.answer })),
    ...advice.map((row) => ({ tieu_de: row.title, noi_dung: row.body })),
  ].slice(0, 6);
  return {
    tai_lieu: docs,
    ...(docs.length
      ? {}
      : {
          // Cau nay di THANG vao prompt cua LLM, nen phai noi ro phai lam gi — khong de no tu suy.
          ghi_chu:
            'Chua co tai lieu DA DUYET cho san pham nay. KHONG duoc tu tra loi tu kien thuc chung: hay noi that la se nho Sale xac minh.',
        }),
  };
}

function quote(skus: readonly string[], ctx: AdvisorToolContext): AdvisorToolResult {
  const strategy = tenantRetailAdvice();
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
  return {
    ky_gia: ctx.knowledge.pricePeriod()?.validMonth ?? null,
    bao_gia: rows,
    cau_kem_theo: quoteQualifier(strategy, ctx.senderType),
  };
}

function computeOrder(rawItems: unknown, ctx: AdvisorToolContext): AdvisorToolResult {
  const items = toOrderItems(rawItems);
  if (!items.length) return { loi: 'Chua co dong hang nao de tinh.' };
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
  };
}

function policy(ctx: AdvisorToolContext): AdvisorToolResult {
  const dealer = ctx.resolved.dealer;
  if (!dealer) {
    return { loi: 'Nhom Zalo nay chua duoc map dai ly — khong tra loi chinh sach duoc, phai chuyen Sale.' };
  }
  return {
    dai_ly: dealer.name,
    cap: dealer.tier,
    chinh_sach: POLICY_LABELS[dealer.defaultPolicy],
  };
}

function recentOrders(ctx: AdvisorToolContext): AdvisorToolResult {
  const orders = (ctx.recentOrders ?? []).slice(0, 5);
  return {
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
      : { ghi_chu: 'Khong tim thay don nao cua nguoi nay trong nhom — dung doan, hay hoi lai khach.' }),
  };
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function toOrderItems(value: unknown): { skuRaw: string; quantity: number }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (raw === null || typeof raw !== 'object') return [];
    const item = raw as Record<string, unknown>;
    const sku = typeof item.sku === 'string' ? item.sku.trim() : '';
    const quantity = Number(item.so_luong);
    return sku && Number.isInteger(quantity) && quantity > 0
      ? [{ skuRaw: sku, quantity }]
      : [];
  });
}
