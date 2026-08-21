import {
  type ClarifySlot,
  type OrderDraft,
  type OrderDraftItem,
  type ParsedOrder,
  type ParseResult,
} from '@netviet/shared';
import type { Product } from '../knowledge/domain.js';
import { matchProduct } from '../rules/rules.js';

/**
 * Don NHAP: gop tung manh thong tin qua nhieu luot tin, roi tra loi mot cau hoi duy nhat —
 * "con thieu gi de chot duoc don nay?".
 *
 * Toan bo file thuan (pure): khong DB, khong LLM, khong dong ho. Ly do giong `rules.ts` — day la
 * cho quyet dinh CO HOI KHACH HAY KHONG, va mot quyet dinh khong tai lap duoc thi khong debug duoc
 * khi khach bao "bot hoi lai cau da tra loi roi".
 */

/** Nguon goc mot manh du kien, de biet manh nao duoc phep de len manh nao. */
export interface DraftMergeInput {
  readonly previous: OrderDraft | null;
  readonly incoming: OrderDraft;
  /**
   * Danh muc de so khop dong hang theo SKU CHUAN thay vi theo chuoi khach viet.
   *
   * Bat buoc trong thuc te: khach go "ghe felix" o tin dau, con parser o tin sau ke thua ngu canh
   * roi tra ve "ghe nang an toan tre em eus felix (mau xam)". Hai chuoi khac nhau, MOT san pham —
   * so khop bang chuoi se tao ra hai dong hang cho mot mon.
   */
  readonly products?: Product[];
}

const EMPTY_DRAFT: OrderDraft = { items: [] };

export function emptyDraft(): OrderDraft {
  return { ...EMPTY_DRAFT, items: [] };
}

/** `ParseResult` -> `OrderDraft`. Lay `order` day du truoc, roi moi den `draft` nua voi. */
export function draftFromParse(result: ParseResult): OrderDraft {
  if (result.order) return draftFromParsedOrder(result.order);
  return result.draft ? normalizeDraft(result.draft) : emptyDraft();
}

function draftFromParsedOrder(order: ParsedOrder): OrderDraft {
  return normalizeDraft({
    orderType: order.orderType,
    items: order.items.map((item) => ({
      skuRaw: item.skuRaw,
      quantity: item.quantity,
      ...(item.unitPriceRaw !== undefined ? { unitPriceRaw: item.unitPriceRaw } : {}),
    })),
    ...(order.totalRaw !== undefined ? { totalRaw: order.totalRaw } : {}),
    noVat: order.noVat,
    ...(order.wantVat !== undefined ? { wantVat: order.wantVat } : {}),
    ...(order.customerName ? { customerName: order.customerName } : {}),
    ...(order.customerPhone ? { customerPhone: order.customerPhone } : {}),
    ...(order.customerAddress ? { customerAddress: order.customerAddress } : {}),
    ...(order.codCollect !== undefined ? { codCollect: order.codCollect } : {}),
  });
}

/** Bo dong rong va chuoi trang — mot dong `{}` lam gap nham va sinh cau hoi vo nghia. */
function normalizeDraft(draft: OrderDraft): OrderDraft {
  return {
    ...draft,
    items: draft.items.filter((item) => item.skuRaw?.trim() || item.quantity !== undefined),
  };
}

/**
 * GOP hai don nhap. Quy tac: tin MOI de len tin cu (khach doi y thi lay y sau), nhung tin moi
 * KHONG duoc xoa thong tin cu bang cach im lang — chi ghi de khi that su co gia tri moi.
 *
 * Ghep dong hang la cho de sai nhat. Ba truong hop, theo dung thu tu:
 *  1. Tin moi co ca ten SP lan so luong  -> dong doc lap, ghep theo ten SP.
 *  2. Tin moi CHI co so luong, don nhap cu co DUNG MOT dong thieu so luong -> dien vao dong do.
 *     Day chinh la "bot hoi bao nhieu cai, khach dap '20'".
 *  3. Nguoc lai -> them dong moi.
 */
export function mergeDraft({ previous, incoming, products }: DraftMergeInput): OrderDraft {
  if (!previous) return normalizeDraft(incoming);
  const items = mergeItems(previous.items, normalizeDraft(incoming).items, products ?? []);
  return {
    items,
    ...pickDefined('orderType', previous, incoming),
    ...pickDefined('totalRaw', previous, incoming),
    ...pickDefined('noVat', previous, incoming),
    ...pickDefined('wantVat', previous, incoming),
    ...pickDefined('customerName', previous, incoming),
    ...pickDefined('customerPhone', previous, incoming),
    ...pickDefined('customerAddress', previous, incoming),
    ...pickDefined('codCollect', previous, incoming),
  };
}

function pickDefined<K extends keyof OrderDraft>(
  key: K,
  previous: OrderDraft,
  incoming: OrderDraft,
): Partial<OrderDraft> {
  const next = incoming[key] ?? previous[key];
  return next === undefined ? {} : ({ [key]: next } as Partial<OrderDraft>);
}

function mergeItems(
  previous: readonly OrderDraftItem[],
  incoming: readonly OrderDraftItem[],
  products: Product[],
): OrderDraftItem[] {
  let merged = [...previous];
  for (const item of incoming) {
    if (item.skuRaw) {
      const index = merged.findIndex(
        (candidate) => candidate.skuRaw && sameProduct(candidate.skuRaw, item.skuRaw!, products),
      );
      merged =
        index >= 0
          ? merged.map((candidate, position) =>
              position === index ? { ...candidate, ...item } : candidate,
            )
          : [...merged, item];
      continue;
    }
    // Chi co so luong: dien vao dong dang thieu, neu va CHI NEU co dung mot dong nhu vay.
    const pending = merged.filter((candidate) => candidate.quantity === undefined);
    merged =
      pending.length === 1
        ? merged.map((candidate) =>
            candidate === pending[0] ? { ...candidate, ...item } : candidate,
          )
        : [...merged, item];
  }
  return merged;
}

/**
 * Hai chuoi co chi cung MOT san pham khong. Uu tien SKU chuan; khong map duoc ve danh muc thi
 * moi so chuoi — de tin nhac mot SP la van gop duoc voi chinh no o luot sau.
 */
function sameProduct(left: string, right: string, products: Product[]): boolean {
  const leftSku = matchProduct(left, products)?.sku;
  const rightSku = matchProduct(right, products)?.sku;
  if (leftSku && rightSku) return leftSku === rightSku;
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

/**
 * Khoang trong cua don nhap.
 *
 * `askable` = thu CHINH KHACH biet cau tra loi. `blocking` = thu chi noi bo quyet duoc (thieu bang
 * gia, chua duyet VAT, chua co bieu cuoc) — hoi khach nhung thu do vua vo duyen vua khong bao gio
 * co cau tra loi dung, nen chung di thang sang Sale.
 */
export interface DraftGaps {
  readonly askable: ClarifySlot[];
  readonly blocking: string[];
  readonly complete: boolean;
}

export interface GapContext {
  readonly products: Product[];
  /** Nhom da map dai ly chua — chua map thi khong phai viec cua khach. */
  readonly dealerKnown: boolean;
}

export function analyzeDraft(draft: OrderDraft, ctx: GapContext): DraftGaps {
  const askable: ClarifySlot[] = [];
  const blocking: string[] = [];

  if (draft.items.length === 0) {
    askable.push('product');
  } else {
    // Mot dong khong co ten SP, hoac co ten nhung khong khop danh muc, deu la "chua biet ban gi".
    const unknownProduct = draft.items.some(
      (item) => !item.skuRaw || matchProduct(item.skuRaw, ctx.products) === null,
    );
    if (unknownProduct) askable.push('product');
    if (draft.items.some((item) => item.quantity === undefined)) askable.push('quantity');
  }

  if (draft.orderType === 'TH2' && !hasRecipient(draft)) askable.push('recipient');
  if (!ctx.dealerKnown) blocking.push('unmapped_dealer');
  if (draft.wantVat === true && draft.noVat !== true) blocking.push('vat_policy');
  if (draft.orderType === 'TH2') blocking.push('shipping_cod_pricing');

  return {
    askable: dedupe(askable),
    blocking: dedupe(blocking),
    complete: askable.length === 0,
  };
}

/** TH2 can DU ca nguoi nhan lan duong den: thieu mot trong hai thi don khong giao duoc. */
function hasRecipient(draft: OrderDraft): boolean {
  return Boolean(draft.customerName?.trim()) && Boolean(draft.customerPhone?.trim() || draft.customerAddress?.trim());
}

function dedupe<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

/**
 * Don nhap DA DU -> `ParsedOrder` cho rules engine.
 *
 * Tra `null` khi con thieu, thay vi dien mac dinh. Mot so luong mac dinh (`1`) o day se di thang
 * qua `priceOrder` va thanh mot xac nhan gui cho khach — sai so luong ma khong sinh canh bao nao.
 */
export function toParsedOrder(draft: OrderDraft, ctx: GapContext): ParsedOrder | null {
  if (!analyzeDraft(draft, ctx).complete) return null;
  const items = draft.items.flatMap((item) =>
    item.skuRaw && item.quantity !== undefined
      ? [
          {
            skuRaw: item.skuRaw,
            quantity: item.quantity,
            ...(item.unitPriceRaw !== undefined ? { unitPriceRaw: item.unitPriceRaw } : {}),
          },
        ]
      : [],
  );
  if (!items.length) return null;
  return {
    orderType: draft.orderType ?? 'TH1',
    items,
    ...(draft.totalRaw !== undefined ? { totalRaw: draft.totalRaw } : {}),
    noVat: draft.noVat ?? false,
    ...(draft.wantVat !== undefined ? { wantVat: draft.wantVat } : {}),
    ...(draft.customerName ? { customerName: draft.customerName } : {}),
    ...(draft.customerPhone ? { customerPhone: draft.customerPhone } : {}),
    ...(draft.customerAddress ? { customerAddress: draft.customerAddress } : {}),
    ...(draft.codCollect !== undefined ? { codCollect: draft.codCollect } : {}),
  };
}

/** Don nhap co mang thong tin gi dang giu lai khong — rong thi khong tao mach. */
export function draftHasContent(draft: OrderDraft): boolean {
  return (
    draft.items.length > 0 ||
    Boolean(draft.customerName || draft.customerPhone || draft.customerAddress)
  );
}
