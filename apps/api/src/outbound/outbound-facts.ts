import type {
  OrderStatus,
  OrderView,
  OutboundCommitmentLevel,
  PolicyType,
  PricedOrder,
} from '@netviet/shared';
import { commitmentLevelsFor } from './outbound-authority.js';

/**
 * DU KIEN NGHIEP VU CO KIEU cua MOT LUOT — thu DUY NHAT bo soan duoc phep render (Issue #189).
 *
 * ---------------------------------------------------------------------------------------------
 * VI SAO TEP NAY PHAI CO, du `outbound-authority.ts` da co grant.
 *
 * Mot `OutboundAuthorityGrant` chi mang TAP CHUOI da chuan hoa: `{ claim: 'financial', authorized:
 * ['1150000','11500000'] }`. Do la du de TRA LOI cau hoi "cau nay co duoc phep noi khong", nhung
 * KHONG du de DUNG cau do: no khong biet 1.150.000 la don gia cua san pham nao, thuoc dong hang
 * thu may, hay do la tong don.
 *
 * Truoc #189 dieu do khong quan trong, vi cau chu la do model viet — grant chi di kiem lai. Sau
 * #189 thi bo soan phai TU VIET cau chu, nen no can chinh du kien co cau truc. Day la tep giu
 * chung.
 *
 * ---------------------------------------------------------------------------------------------
 * BAT BIEN: MOI truong trong tep nay den tu mot NGUON TAT DINH — `priceOrder()`, bang gia hien
 * hanh, cap dai ly da map, trang thai don da ben vung. KHONG mot truong nao duoc dien tu van ban
 * model viet, ke ca khi van ban do "trong co ve dung". Do la ca dinh nghia cua tep.
 */

/** Mot dong bao gia — den tu bang gia hien hanh qua `quotePriceField()`. */
export interface QuoteLineFact {
  readonly sku: string;
  readonly name: string;
  readonly unit: string;
  readonly unitPrice: number;
}

export interface QuoteFact {
  /** Ky gia dang hieu luc (`YYYY-MM`), `null` khi khach chua cau hinh ky nao. */
  readonly period: string | null;
  /** Cau qualifier TAT DINH cua goi khach — khong phai cau model tu nghi ra. */
  readonly qualifier: string;
  readonly lines: readonly QuoteLineFact[];
}

/** Chinh sach thanh toan cua dai ly DA MAP. Chua map -> khong co du kien nay, va do la fail closed. */
export interface PaymentPolicyFact {
  readonly dealerName: string;
  readonly tier: string | null;
  readonly policy: PolicyType;
}

/**
 * TRANG THAI DON DA BEN VUNG.
 *
 * `levels` la cac muc cam ket ma trang thai do uy quyen, tinh boi `commitmentLevelsFor()` —
 * KHONG phai mot muc do model chon. Bo soan lay muc CAO NHAT trong day, nen mot don `needs_edit`
 * chi noi duoc "da ghi nhan" (muc 8 ca 14 hop dong), khong bao gio "da chot".
 */
export interface OrderStateFact {
  readonly orderId: string;
  readonly status: OrderStatus;
  readonly levels: readonly OutboundCommitmentLevel[];
  /** Con so cua CHINH don do — da qua rules engine truoc khi duoc luu. */
  readonly priced: PricedOrder | null;
}

export interface TurnBusinessFacts {
  readonly quote: QuoteFact | null;
  readonly pricedOrder: PricedOrder | null;
  readonly paymentPolicy: PaymentPolicyFact | null;
  readonly orderState: OrderStateFact | null;
}

/** Luot chua tra cuu duoc gi. Gia tri BINH THUONG: khong tra cuu thi khong khang dinh duoc. */
export const NO_BUSINESS_FACTS: TurnBusinessFacts = {
  quote: null,
  pricedOrder: null,
  paymentPolicy: null,
  orderState: null,
};

/** Mot lan tra cuu dong gop duoc gi vao du kien cua luot. Moi truong deu tuy chon. */
export type BusinessFactsPatch = Partial<TurnBusinessFacts>;

/**
 * Gom cac lan tra cuu thanh du kien cua LUOT.
 *
 * LAN SAU DE LEN LAN TRUOC khi lan sau co gia tri: model goi `tinh_don` hai lan (sua so luong roi
 * tinh lai) thi con so dung la con so lan cuoi. Mot `undefined`/`null` KHONG xoa du kien da co —
 * mot cong cu tra ve rong khong duoc phep lam mat ket qua cua cong cu truoc do trong cung luot.
 */
export function mergeBusinessFacts(
  base: TurnBusinessFacts,
  ...patches: readonly BusinessFactsPatch[]
): TurnBusinessFacts {
  return patches.reduce<TurnBusinessFacts>(
    (facts, patch) => ({
      quote: patch.quote ?? facts.quote,
      pricedOrder: patch.pricedOrder ?? facts.pricedOrder,
      paymentPolicy: patch.paymentPolicy ?? facts.paymentPolicy,
      orderState: patch.orderState ?? facts.orderState,
    }),
    base,
  );
}

/** Luot nay co du kien nghiep vu nao khong — dung de bao cao, khong dung de cap phep. */
export function hasBusinessFacts(facts: TurnBusinessFacts): boolean {
  return Boolean(facts.quote ?? facts.pricedOrder ?? facts.paymentPolicy ?? facts.orderState);
}

/**
 * DON GAN NHAT CO THE NOI DEN, tu mot danh sach don da ben vung.
 *
 * MOT don, khong phai ca danh sach: bo soan noi mot cau ve "don cua minh", nen no phai biet CHINH
 * XAC don nao. Lay don DAU TIEN uy quyen it nhat mot muc — mot don `draft`/`rejected` dung dau
 * danh sach khong duoc phep chan mat don thuc su co the noi den, va cung khong duoc tu no tro
 * thanh du kien (`commitmentLevelsFor` tra ve rong cho ca hai trang thai do).
 *
 * O day chu khong o `advisor-tools.ts`: `order-tools.ts` cung can chinh phep nay sau khi sua don,
 * va de o tang cong cu thi hai tep cong cu se phai import lan nhau.
 */
export function orderStateFacts(orders: readonly OrderView[]): BusinessFactsPatch {
  for (const order of orders) {
    const levels = commitmentLevelsFor(order.status);
    if (!levels.length) continue;
    return {
      orderState: { orderId: order.id, status: order.status, levels, priced: order.priced ?? null },
    };
  }
  return {};
}
