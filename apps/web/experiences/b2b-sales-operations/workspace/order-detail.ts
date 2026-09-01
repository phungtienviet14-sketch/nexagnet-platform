import type { OrderView, PolicyType, PricedLine } from '@netviet/shared';
import { toCustomerOrder, type CustomerOrder } from '../customer-view';

/**
 * MOT DON, NHIN DAY DU — nhung van chi bang nhung gi khach duoc nhin (Issue #110 §Đơn hàng).
 *
 * `CustomerOrder` du cho mot DONG trong danh sach. No khong du cho o chi tiet: nguoi dung mo mot
 * don ra la de tra loi "don nay gom nhung gi, theo chinh sach nao, va da di toi dau" — ba cau ma
 * mot dong tom tat khong tra loi duoc.
 *
 * Ranh gioi giu Y NGUYEN nhu `customer-view.ts`: khong `...order` tu `OrderView`. Phep spread duy
 * nhat o day la tren mot `CustomerOrder` DA CHIEU — mot kieu dong, viet tay, khong co cho de dat
 * `traceId` vao. Do la khac biet quan trong: spread mot kieu dong thi an toan THEO KIEU, con
 * spread `OrderView` thi khong bao gio an toan.
 */

/** Mot dong hang, doc duoc boi nguoi khong biet SKU la gi. */
export interface CustomerOrderLine {
  /** Ten san pham; khi he thong chua khop duoc danh muc thi la CHINH CHU khach da viet. */
  readonly productName: string;
  readonly quantity: number;
  /** `null` khi chua co gia — KHONG phai `0`. Mot don gia 0đ la mot khang dinh sai. */
  readonly unitPrice: number | null;
  readonly lineTotal: number | null;
  /** `false` = he thong chua khop duoc dong nay vao danh muc san pham. */
  readonly recognised: boolean;
}

export const CUSTOMER_POLICY_LABEL: Readonly<Record<PolicyType, string>> = {
  cong_no_30: 'Công nợ 30 ngày',
  cong_no_45: 'Công nợ 45 ngày',
  ky_gui: 'Ký gửi',
  thanh_toan_ngay: 'Thanh toán ngay',
  cod: 'COD (thu hộ)',
};

/** TH1 = giao cho dai ly; TH2 = giao thang khach cua dai ly. Goi ten bang VIEC, khong bang ma. */
const ORDER_TYPE_LABEL: Readonly<Record<string, string>> = {
  TH1: 'Giao cho đại lý',
  TH2: 'Giao thẳng khách của đại lý',
};

/**
 * MOC THOI GIAN NGHIEP VU — chi dung nhung truong THAT SU con nam tren don.
 *
 * `at` la `null` khi moc do CO THAT nhung khong co dau thoi gian nao ben vung de doc ra. Do la
 * mot cau tra loi trung thuc, va no phai duoc phep ton tai: bia mot gio cho moc "đã huỷ" — vi
 * `OrderView` khong mang thoi diem huy — se lam mot dong lich su doc len nhu bang chung, trong
 * khi no chi la mot phong doan.
 */
export interface CustomerTimelineEntry {
  readonly key: string;
  readonly label: string;
  readonly at: string | null;
  readonly detail: string | null;
}

export interface CustomerDeliveryTarget {
  readonly name: string | null;
  readonly phone: string | null;
  readonly address: string | null;
}

export interface CustomerOrderDetail extends CustomerOrder {
  readonly lines: readonly CustomerOrderLine[];
  readonly orderTypeLabel: string | null;
  readonly branch: string | null;
  readonly policyLabel: string | null;
  readonly itemsSubtotal: number | null;
  readonly shippingFee: number | null;
  readonly codFee: number | null;
  readonly vatAmount: number | null;
  /**
   * Noi giao cua don TH2 — chi co khi khach DA GHI trong tin.
   *
   * Day la du lieu NGHIEP VU cua chinh doanh nghiep (nguoi nhan hang cua don ho vua chot), khong
   * phai noi tang ky thuat: thieu no thi Sale khong go duoc don vao phan mem ban hang. No hien o
   * o CHI TIET chu khong tren danh sach — mot man hinh danh sach rai so dien thoai la thu khong
   * ai can va ai di ngang qua cung doc duoc.
   */
  readonly deliverTo: CustomerDeliveryTarget | null;
  /** Ly do huy do nguoi hoac he thong ghi lai; `null` khi don chua bi huy. */
  readonly cancelReason: string | null;
  /** Sua don = THAY THE (xem `OrderView.supersedesOrderId`), nen mot don co the o hai dau. */
  readonly replacesEarlierOrder: boolean;
  readonly replacedByNewerOrder: boolean;
  readonly timeline: readonly CustomerTimelineEntry[];
}

function toLine(line: PricedLine): CustomerOrderLine {
  return {
    productName: line.productName ?? line.skuRaw,
    quantity: line.quantity,
    unitPrice: line.unitPrice > 0 ? line.unitPrice : null,
    lineTotal: line.lineTotal > 0 ? line.lineTotal : null,
    recognised: line.matched,
  };
}

function trimmedOrNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

function deliveryTargetOf(order: OrderView): CustomerDeliveryTarget | null {
  const priced = order.priced;
  if (!priced) return null;
  const name = trimmedOrNull(priced.customerName);
  const phone = trimmedOrNull(priced.customerPhone);
  const address = trimmedOrNull(priced.customerAddress);
  if (!name && !phone && !address) return null;
  return { name, phone, address };
}

/**
 * LICH SU MOT DON, xay tu nhung gi CON DOC DUOC — khong tu mot ban ghi su kien nao.
 *
 * Nen tang KHONG luu mot dong su kien cho don: khong co `sentAt`, `rejectedAt`, `approvedAt`. Nen
 * ham nay lam dung mot viec — doc cac truong BEN VUNG dang co (`createdAt`, `salesHandoff`,
 * `cancelReason`, cap `supersedes*`) roi noi chung lai theo thu tu nghiep vu. No khong suy dien
 * mot moc nao khong co bang chung, va khong hien mot gio nao khong duoc luu.
 */
export function toBusinessTimeline(order: OrderView): readonly CustomerTimelineEntry[] {
  const entries: CustomerTimelineEntry[] = [
    // Khong nhac lai TEN NHOM o day: o chi tiet da noi ro nhom nao ngay tren dau. Lap lai vua
    // thua, vua de ra mot cau nhu "Nhóm Nhóm đại lý Thái Nguyên" khi ten nhom da co san chu
    // "Nhóm" — ma ten nhom Zalo thi gan nhu luon co.
    { key: 'received', label: 'Nhận tin từ nhóm', at: order.createdAt, detail: null },
  ];

  if (order.supersedesOrderId) {
    entries.push({
      key: 'replaces',
      label: 'Thay cho một đơn đã chốt trước đó',
      at: null,
      detail: 'Đơn cũ đã được huỷ và thay bằng đơn này.',
    });
  }

  const handoff = order.salesHandoff;
  if (handoff) {
    // `salesHandoff.createdAt` duoc dat DUNG LUC gui xac nhan (`OrdersService.sendConfirmation`),
    // nen day la dau thoi gian THAT cua viec gui — khong phai mot xap xi.
    entries.push({
      key: 'sent',
      label: 'Đã gửi xác nhận vào nhóm',
      at: handoff.createdAt,
      detail: null,
    });
    if (handoff.followUp) {
      entries.push({
        key: 'followup',
        label: 'Hệ thống đã nhắc lại việc nhập đơn',
        at: handoff.followUp.at,
        detail: null,
      });
    }
    if (handoff.status === 'completed') {
      entries.push({
        key: 'entered',
        label: 'Đã nhập vào phần mềm bán hàng',
        at: null,
        detail: null,
      });
    }
    if (handoff.status === 'cancelled') {
      entries.push({
        key: 'handoff-cancelled',
        label: 'Việc nhập đơn đã được đóng lại',
        at: null,
        detail: 'Đơn bị huỷ trước khi kịp nhập vào phần mềm bán hàng.',
      });
    }
  }

  if (order.status === 'rejected') {
    entries.push({
      key: 'cancelled',
      label: 'Đã huỷ',
      at: null,
      detail: trimmedOrNull(order.cancelReason),
    });
  }

  if (order.supersededByOrderId) {
    entries.push({
      key: 'replaced',
      label: 'Đã được thay bằng một đơn mới',
      at: null,
      detail: 'Số liệu mới nhất nằm ở đơn thay thế.',
    });
  }

  return entries;
}

export function toCustomerOrderDetail(order: OrderView): CustomerOrderDetail {
  const priced = order.priced;
  return {
    // Spread mot `CustomerOrder` DA CHIEU, khong phai `OrderView` — xem chu thich dau tep.
    ...toCustomerOrder(order),
    lines: (priced?.lines ?? []).map(toLine),
    orderTypeLabel: priced ? (ORDER_TYPE_LABEL[priced.orderType] ?? null) : null,
    branch: priced?.branch ?? null,
    policyLabel: priced?.policy ? CUSTOMER_POLICY_LABEL[priced.policy] : null,
    itemsSubtotal: priced?.itemsSubtotal ?? null,
    shippingFee: priced && priced.shippingFee > 0 ? priced.shippingFee : null,
    codFee: priced && priced.codFee > 0 ? priced.codFee : null,
    vatAmount: priced && priced.vatAmount > 0 ? priced.vatAmount : null,
    deliverTo: deliveryTargetOf(order),
    cancelReason: order.status === 'rejected' ? trimmedOrNull(order.cancelReason) : null,
    replacesEarlierOrder: Boolean(order.supersedesOrderId),
    replacedByNewerOrder: Boolean(order.supersededByOrderId),
    timeline: toBusinessTimeline(order),
  };
}

/**
 * Tim mot don theo ma tham chieu — nguon cua duong dan sau (`?selected=`).
 *
 * `null` khi khong tim thay, va do la mot ket qua BINH THUONG: mot duong dan luu tu hom qua tro
 * toi don da bi don di la chuyen thuong. Man hinh phai noi duoc dieu do bang mot cau, khong phai
 * bang mot o trong.
 */
export function findOrderByReference(
  orders: readonly OrderView[],
  reference: string | null,
): OrderView | null {
  if (!reference) return null;
  return orders.find((order) => order.id === reference) ?? null;
}
