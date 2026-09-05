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

/**
 * Mot lan tra cuu dong gop duoc gi vao du kien cua luot.
 *
 * BA TRANG THAI, khong phai hai — va su khac nhau giua hai trang thai cuoi la mot bat bien an toan:
 *
 *   · KHONG CO KHOA        -> "toi khong co y kien ve truong nay"; du kien cu duoc giu.
 *   · CO KHOA, co gia tri  -> "day la du kien moi"; de len du kien cu.
 *   · CO KHOA, gia tri null -> "du kien cu KHONG CON DUNG NUA"; xoa han.
 *
 * Nhanh thu ba ton tai vi mot ly do cu the: xem `mergeBusinessFacts` ben duoi.
 */
export type BusinessFactsPatch = Partial<TurnBusinessFacts>;

/**
 * Gom cac lan tra cuu thanh du kien cua LUOT.
 *
 * LAN SAU DE LEN LAN TRUOC: model goi `tinh_don` hai lan (sua so luong roi tinh lai) thi con so
 * dung la con so lan cuoi. Mot cong cu KHONG khai bao truong nao thi khong lam mat ket qua cua
 * cong cu truoc do trong cung luot.
 *
 * ---------------------------------------------------------------------------------------------
 * VI SAO `null` PHAI XOA DUOC, chu khong duoc coi la "khong co y kien".
 *
 * Du kien co hai loai. Mot lan BAO GIA dung mai mai: gia hom nay van la gia hom nay. Nhung TRANG
 * THAI DON la anh chup cua mot thuc the DOI DUOC, va no het han ngay trong luot:
 *
 *   vong 1  tra_cuu_don  -> don `approved` -> orderState.levels = [recorded, confirmed]
 *   vong 2  huy_don      -> don thanh `rejected`
 *   vong 3  soan_tra_loi -> xin khoi `trang_thai_don`
 *
 * Neu vong 2 khong xoa duoc anh chup cua vong 1, bo soan se render "Đơn của mình đã được chốt."
 * cho mot don VUA BI HUY — va no di qua ca cong tham quyen, vi grant cua vong 1 van con trong bao.
 * Khach nhan mot tin vua bao huy vua bao da chot. Do la dung lop khang dinh sai ma ca ban #189
 * ton tai de chan, va lan nay no den tu duong "an toan" (khoi tat dinh), khong tu van xuoi — nen
 * khong mot phep G1–G4 nao cham toi.
 *
 * Vi the `cancelOrder()` khai bao `{ orderState: null }`, va vong lap nay ton trong dieu do.
 */
export function mergeBusinessFacts(
  base: TurnBusinessFacts,
  ...patches: readonly BusinessFactsPatch[]
): TurnBusinessFacts {
  const pick = <K extends keyof TurnBusinessFacts>(
    patch: BusinessFactsPatch,
    facts: TurnBusinessFacts,
    key: K,
  ): TurnBusinessFacts[K] => (key in patch ? (patch[key] as TurnBusinessFacts[K]) : facts[key]);
  return patches.reduce<TurnBusinessFacts>(
    (facts, patch) => ({
      quote: pick(patch, facts, 'quote'),
      pricedOrder: pick(patch, facts, 'pricedOrder'),
      paymentPolicy: pick(patch, facts, 'paymentPolicy'),
      orderState: pick(patch, facts, 'orderState'),
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
