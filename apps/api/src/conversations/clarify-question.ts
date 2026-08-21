import type { ClarifySlot, OrderDraft } from '@netviet/shared';
import type { Product } from '../knowledge/domain.js';
import { matchProduct } from '../rules/rules.js';

/**
 * Cau HOI LAI khach, dung tat dinh tu don nhap.
 *
 * Day la ban BAO DAM: no luon co, khong goi mang, khong the bia ten san pham hay con so tien.
 * `AdvisorAgent` co the soan mot cau tu nhien hon de len tren, nhung khi LLM hong/tat/lo noi mot
 * con so thi khach van nhan duoc mot cau hoi dung — im lang moi la hong that.
 *
 * Xung ho theo dung cach Sale that dang lam trong nhom: goi ten nguoi hoi, xung "em".
 */

export interface ClarifyContext {
  readonly draft: OrderDraft;
  readonly products: Product[];
  readonly displayName?: string;
}

/** Toi da hai slot trong mot cau: hoi ba thu mot luc thi khach chi tra loi thu cuoi. */
const MAX_SLOTS_PER_QUESTION = 2;

export function buildClarifyQuestion(
  slots: readonly ClarifySlot[],
  ctx: ClarifyContext,
): string | null {
  const selected = orderSlots(slots).slice(0, MAX_SLOTS_PER_QUESTION);
  if (!selected.length) return null;
  const parts = selected.flatMap((slot) => askFor(slot, ctx) ?? []);
  if (!parts.length) return null;
  return [greeting(ctx.displayName), parts.join(' '), 'để em chốt đơn giúp mình ạ.'].join(' ');
}

/**
 * Thu tu hoi co y nghia nghiep vu: chua biet BAN GI thi hoi so luong la vo nghia, va chua biet
 * ban gi/bao nhieu thi hoi dia chi nguoi nhan la hoi truoc mot don chua ton tai.
 */
const SLOT_ORDER: readonly ClarifySlot[] = ['product', 'quantity', 'recipient'];

function orderSlots(slots: readonly ClarifySlot[]): ClarifySlot[] {
  return SLOT_ORDER.filter((slot) => slots.includes(slot));
}

function greeting(displayName?: string): string {
  const name = displayName?.trim();
  return name ? `Dạ ${name} ơi,` : 'Dạ anh/chị ơi,';
}

function askFor(slot: ClarifySlot, ctx: ClarifyContext): string | null {
  switch (slot) {
    case 'product':
      return 'mình lấy sản phẩm nào ạ?';
    case 'quantity':
      return quantityQuestion(ctx);
    case 'recipient':
      return 'cho em xin tên người nhận, số điện thoại và địa chỉ giao ạ?';
  }
}

/**
 * Hoi so luong co GOI TEN san pham khi biet chac ten do. Trong nhom nhieu nguoi dang ban tin,
 * mot cau "bao nhieu cai a?" troi noi khong ai biet dang hoi ve cai gi.
 *
 * Ten lay tu DANH MUC (`matchProduct`), khong lay tu chuoi khach viet: chuoi khach viet co the la
 * viet tat sai, va nhac lai no nghia la xac nhan mot ten san pham khong ton tai.
 */
function quantityQuestion(ctx: ClarifyContext): string {
  const pending = ctx.draft.items.filter((item) => item.quantity === undefined);
  const names = pending.flatMap((item) => {
    const product = item.skuRaw ? matchProduct(item.skuRaw, ctx.products) : null;
    return product ? [product.name] : [];
  });
  const unique = [...new Set(names)];
  if (unique.length === 1) return `mình lấy bao nhiêu ${unique[0]} ạ?`;
  if (unique.length > 1) return `mình lấy bao nhiêu ${unique.join(' và bao nhiêu ')} ạ?`;
  return 'mình lấy số lượng bao nhiêu ạ?';
}
