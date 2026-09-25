import { formatBusinessDate, formatClock, formatKm } from '../../format';
import { phaseLabel } from '../office/control-tower';
import { normalizeSearch } from '../office/form-input';
import type { JourneyEvent, RunJourneyView, RunLeg, TransportOrder } from '../office/types';

/**
 * DON HANG + HANH TRINH tren dien thoai giam doc — HAM THUAN.
 *
 * Loc/tim phia may khach (danh sach da nam het trong bo nho, may chu chua phan trang `/orders`). Nhan
 * trang thai lay tu web (`office-lifecycle.ts`). Chang `IN_TRANSIT` doc la "Trên đường" — chu "Đang
 * chạy" chi danh cho vong chay ACTIVE.
 */

export type OrderFilter = 'ALL' | 'OPEN' | 'FULFILLED' | 'CANCELLED';

export const ORDER_FILTERS: readonly OrderFilter[] = ['ALL', 'OPEN', 'FULFILLED', 'CANCELLED'];

export const ORDER_FILTER_LABEL: Readonly<Record<OrderFilter, string>> = {
  ALL: 'Tất cả',
  OPEN: 'Đang mở',
  FULFILLED: 'Đã giao xong',
  CANCELLED: 'Đã huỷ',
};

export type OrderTone = 'live' | 'neutral' | 'danger' | 'pending';

export function orderStatusLabel(status: string): string {
  return status === 'OPEN' || status === 'FULFILLED' || status === 'CANCELLED'
    ? ORDER_FILTER_LABEL[status]
    : status;
}

export function orderStatusTone(status: string): OrderTone {
  if (status === 'OPEN') return 'pending';
  if (status === 'FULFILLED') return 'live';
  if (status === 'CANCELLED') return 'neutral';
  return 'neutral';
}

export function filterOrders(
  orders: readonly TransportOrder[],
  filter: { readonly status: OrderFilter; readonly search: string },
  customerNameOf: (customerId: string | null) => string,
): readonly TransportOrder[] {
  const needle = normalizeSearch(filter.search);
  return orders.filter((order) => {
    if (filter.status !== 'ALL' && order.status !== filter.status) return false;
    if (needle === '') return true;
    const haystack = normalizeSearch(
      `${order.code} ${customerNameOf(order.customerId)} ${order.originLabel} ${order.destinationLabel}`,
    );
    return haystack.includes(needle);
  });
}

/** Dem theo trang thai CHO CHIP LOC — dem tren danh sach may chu tra ve, khong phai so nghiep vu. */
export function countByStatus(
  orders: readonly TransportOrder[],
): Readonly<Record<OrderFilter, number>> {
  return {
    ALL: orders.length,
    OPEN: orders.filter((order) => order.status === 'OPEN').length,
    FULFILLED: orders.filter((order) => order.status === 'FULFILLED').length,
    CANCELLED: orders.filter((order) => order.status === 'CANCELLED').length,
  };
}

const LEG_STATUS_LABEL: Readonly<Record<string, string>> = {
  PLANNED: 'Dự kiến',
  IN_TRANSIT: 'Trên đường',
  COMPLETED: 'Đã xong',
  CANCELLED: 'Đã huỷ',
};

export const legStatusLabel = (status: string): string => LEG_STATUS_LABEL[status] ?? status;

export interface LegRow {
  readonly key: string;
  readonly title: string;
  readonly isEmpty: boolean;
  readonly route: string;
  readonly status: string;
  readonly km: string;
  readonly plannedKm: string;
  readonly runId: string;
}

export function legRows(legs: readonly RunLeg[]): readonly LegRow[] {
  return [...legs]
    .sort((a, b) => a.sequence - b.sequence)
    .map((leg) => ({
      key: leg.id,
      title: `Chặng ${leg.sequence} · ${leg.kind === 'EMPTY' ? 'RỖNG' : 'CÓ HÀNG'}`,
      isEmpty: leg.kind === 'EMPTY',
      route: `${leg.originLabel} → ${leg.destinationLabel}`,
      status: legStatusLabel(leg.status),
      km: formatKm(leg.distanceKm),
      plannedKm: formatKm(leg.plannedDistanceKm),
      runId: leg.runId,
    }));
}

/* ------------------------------------------------------------------ *
 * Hanh trinh vong chay — `GET /transport/journey/runs/:runCode`
 * ------------------------------------------------------------------ */

const CHECKPOINT_LABEL: Readonly<Record<string, string>> = {
  ASSIGNED: 'Nhận việc',
  DEPARTED: 'Xuất phát',
  PICKUP_ARRIVAL: 'Đến điểm lấy hàng',
  GATE_ENTRY: 'Vào cổng',
  LOADING: 'Xếp hàng',
  PICKUP_DEPARTURE: 'Rời điểm lấy hàng',
  DELIVERY_ARRIVAL: 'Đến nơi giao',
  DELIVERY_ACCEPTED: 'Người nhận đã nhận',
  COMPLETED: 'Kết thúc vòng chạy',
};

export const eventLabel = (event: Pick<JourneyEvent, 'code'>): string =>
  event.code === 'FUEL_ENTRY' ? 'Đổ dầu' : (CHECKPOINT_LABEL[event.code] ?? event.code);

export interface TimelineRow {
  readonly key: string;
  readonly label: string;
  readonly at: string;
  readonly proof: string;
  readonly hasProof: boolean;
}

/** N moc GAN NHAT, moi nhat truoc. Thieu bang chung vi tri noi trung tinh, khong buoc toi. */
export function recentTimeline(
  journey: Pick<RunJourneyView, 'timeline'>,
  timeZone?: string,
  limit = 6,
): readonly TimelineRow[] {
  return [...journey.timeline]
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, limit)
    .map((event, index) => ({
      key: `${event.subjectId}:${index}`,
      label: eventLabel(event),
      at: formatClock(event.at, timeZone),
      hasProof: event.hasLocationProof,
      proof: event.hasLocationProof ? 'có kèm vị trí' : 'không kèm bằng chứng vị trí',
    }));
}

export function journeyLegLines(journey: Pick<RunJourneyView, 'legs'>): readonly string[] {
  return journey.legs.map((leg) => {
    const kind = leg.kind === 'EMPTY' ? 'RỖNG' : (leg.orderCode ?? 'có hàng · chưa gắn đơn');
    return `Chặng ${leg.sequence} · ${kind} · ${legStatusLabel(leg.status)} · ${phaseLabel(leg.phase)} · ${formatKm(leg.distanceKm)}`;
  });
}

export const orderDateLabel = (order: Pick<TransportOrder, 'businessDate'>): string =>
  formatBusinessDate(order.businessDate);
