import type { OrderView } from '@netviet/shared';
import { CUSTOMER_STAGE_LABEL, type CustomerOrderStage } from '../customer-view';
import { toCustomerOrderDetail, type CustomerOrderDetail } from './order-detail';

/**
 * SO DON HUONG KHACH — doc duoc, loc duoc, mo ra xem duoc (Issue #110 §Đơn hàng).
 *
 * Bo loc o day la bo loc NGHIEP VU, khong phai bo loc ky thuat: nguoi dung tim theo ten nhom,
 * ten dai ly, ten san pham va trang thai cong viec — khong ai tim don theo `status` cua may hay
 * theo mot ma noi bo nao.
 *
 * Toan bo tep chay TRONG TRINH DUYET tren tap tin da tai ve. Voi 10-20 don/ngay (xem CLAUDE.md)
 * do la lua chon dung: them mot tham so loc len API se tao mot hop dong moi phai giu, de doi lay
 * mot thu ma mot vong `filter` lam xong trong mot phan nghin giay.
 */

/** `tat_ca` la mot lua chon THAT trong bo loc, nen no nam trong kieu — khong phai `null` tra hinh. */
export type OrderStageFilter = CustomerOrderStage | 'tat_ca';

export interface OrderFilter {
  readonly stage: OrderStageFilter;
  /** Chuoi nguoi dung go — so sanh khong dau hoa/thuong, da cat khoang trang. */
  readonly search: string;
}

export const DEFAULT_ORDER_FILTER: OrderFilter = { stage: 'tat_ca', search: '' };

export const ORDER_STAGE_FILTERS: readonly {
  readonly value: OrderStageFilter;
  readonly label: string;
}[] = [
  { value: 'tat_ca', label: 'Tất cả' },
  { value: 'cho_duyet', label: CUSTOMER_STAGE_LABEL.cho_duyet },
  { value: 'cho_nhap_don', label: CUSTOMER_STAGE_LABEL.cho_nhap_don },
  { value: 'da_gui', label: CUSTOMER_STAGE_LABEL.da_gui },
  { value: 'da_huy', label: CUSTOMER_STAGE_LABEL.da_huy },
];

/**
 * So khop KHONG DAU.
 *
 * Dai ly go "ha noi" khi nhom ten "Hà Nội", va Sale go "felix" khi san pham ten "Ghế Felix". Mot
 * phep so sanh nguyen van se tra ve rong trong ca hai truong hop va nguoi dung se ket luan la
 * he thong khong co don do. `NFD` + bo dau ket hop la cach chuan de so sanh tieng Viet;
 * `đ`/`Đ` khong phai to hop dau nen phai doi rieng.
 */
export function foldVietnamese(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

function haystackOf(order: CustomerOrderDetail): string {
  return foldVietnamese(
    [
      order.groupName ?? '',
      order.dealerName ?? '',
      order.branch ?? '',
      order.excerpt,
      ...order.lines.map((line) => line.productName),
    ].join(' '),
  );
}

export function matchesOrderFilter(order: CustomerOrderDetail, filter: OrderFilter): boolean {
  if (filter.stage !== 'tat_ca' && order.stage !== filter.stage) return false;
  const needle = foldVietnamese(filter.search);
  if (needle.length === 0) return true;
  return haystackOf(order).includes(needle);
}

/**
 * SO DON = tin da duoc hieu la DAT DON.
 *
 * Giu dung phep loc cua U-UI0 (`intent === 'dat_don'`): muc "Đơn hàng" phai la don, khong phai
 * moi tin nhan. Cac tin khac van doc duoc o muc Hội thoại.
 */
export function toOrderBook(orders: readonly OrderView[]): readonly CustomerOrderDetail[] {
  return orders
    .filter((order) => order.intent === 'dat_don')
    .map(toCustomerOrderDetail)
    .sort((left, right) => Date.parse(right.receivedAt) - Date.parse(left.receivedAt));
}

export function filterOrderBook(
  book: readonly CustomerOrderDetail[],
  filter: OrderFilter,
): readonly CustomerOrderDetail[] {
  return book.filter((order) => matchesOrderFilter(order, filter));
}

/**
 * Don dang duoc mo — cung quy tac tat dinh nhu hoi thoai.
 *
 * Khoa duoc yeu cau neu no CON TRONG KET QUA LOC dang hien -> nguoc lai la don dau danh sach ->
 * `null` khi bo loc khong con don nao. Diem quan trong la ve "trong ket qua loc": giu mot don
 * dang mo trong khi no da bi loc khoi danh sach ben trai se lam man hinh tu mau thuan voi chinh
 * no, va nguoi dung khong con biet minh dang nhin cai gi.
 */
export function resolveOrderSelection(
  visible: readonly CustomerOrderDetail[],
  requested: string | null,
): string | null {
  if (visible.length === 0) return null;
  if (requested && visible.some((order) => order.reference === requested)) return requested;
  return visible[0]!.reference;
}

export function findInOrderBook(
  book: readonly CustomerOrderDetail[],
  reference: string | null,
): CustomerOrderDetail | null {
  if (!reference) return null;
  return book.find((order) => order.reference === reference) ?? null;
}

/** Cau tom tat tren dau so don — dem tren ket qua DANG HIEN, khong tren toan bo. */
export function orderBookHeadline(
  visible: readonly CustomerOrderDetail[],
  total: number,
): string {
  if (total === 0) return 'Chưa có đơn hàng nào.';
  if (visible.length === total) {
    const awaitingEntry = visible.filter((order) => order.stage === 'cho_nhap_don').length;
    return awaitingEntry > 0
      ? `${total} đơn đã ghi nhận · ${awaitingEntry} đơn chờ nhập vào phần mềm bán hàng.`
      : `${total} đơn đã ghi nhận.`;
  }
  return `${visible.length} / ${total} đơn khớp bộ lọc đang chọn.`;
}
