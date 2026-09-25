import { isDrawablePoint } from '../../map/camera';
import type { MapPoint } from '../../map/map-types';
import type { FieldLegCard } from './field-work';
import type { RunLegPhase } from './types';

/**
 * DIEM TREN BAN DO cua mot chang — CHI toa do THAT cua don (`pickupPoint`/`deliveryPoint`, #379).
 *
 * Khong co toa do thi KHONG co diem: khong geocode nhan, khong lay tam tinh, khong bia. Man hinh doc
 * `null` o day de noi "Đơn này chưa có toạ độ lấy/giao".
 */
export function legPoints(card: FieldLegCard): readonly MapPoint[] {
  const points: MapPoint[] = [];
  const pickup = card.leg.pickupPoint ?? null;
  const delivery = card.leg.deliveryPoint ?? null;
  if (pickup !== null && isDrawablePoint(pickup)) {
    points.push({
      id: `${card.legId}:pickup`,
      kind: 'pickup',
      latitude: pickup.latitude,
      longitude: pickup.longitude,
      label: `Lấy hàng · ${card.originLabel}`,
    });
  }
  if (delivery !== null && isDrawablePoint(delivery)) {
    points.push({
      id: `${card.legId}:delivery`,
      kind: 'delivery',
      latitude: delivery.latitude,
      longitude: delivery.longitude,
      label: `Giao hàng · ${card.destinationLabel}`,
    });
  }
  return points;
}

/**
 * NOI CAN DEN TIEP — doc tu GIAI DOAN may chu tinh, khong tu dong ho hay khoang cach.
 *
 * Chua roi diem lay hang (PLANNED/AT_PICKUP/LOADING) -> diem lay; da roi -> diem giao. Chi chon
 * NUT CHI DUONG nao lam nut chinh; khong quyet dinh nghiep vu nao doc gia tri nay.
 */
export function nextStop(phase: RunLegPhase): 'pickup' | 'delivery' {
  return phase === 'PLANNED' || phase === 'AT_PICKUP' || phase === 'LOADING'
    ? 'pickup'
    : 'delivery';
}

/** Vi tri cua toi CU sau bao lau — chi de doi mau cham sang trung tinh va noi "lúc HH:mm". */
export const MY_FIX_STALE_AFTER_MS = 2 * 60_000;

export function isFixStale(capturedAtIso: string, nowMs: number): boolean {
  const captured = Date.parse(capturedAtIso);
  if (!Number.isFinite(captured)) return true;
  return nowMs - captured > MY_FIX_STALE_AFTER_MS;
}
