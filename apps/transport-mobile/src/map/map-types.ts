/**
 * HOP DONG cua ban do dung chung — man lai xe dung hom nay, man giam doc dung lai CUNG props.
 *
 * `stale` = diem CU (vi tri cuoi cung biet, khong phai vi tri bay gio). #297: cu != hien tai, nen
 * no ve bang mau TRUNG TINH va nhan noi ro "lúc HH:mm" — khong bao gio do, khong bao gio nhu mot
 * cham song.
 */
export type MapPointKind = 'pickup' | 'delivery' | 'me' | 'vehicle';

export interface MapPoint {
  readonly id: string;
  readonly kind: MapPointKind;
  readonly latitude: number;
  readonly longitude: number;
  readonly label: string;
  readonly stale?: boolean;
}

export interface RunMapProps {
  readonly points: readonly MapPoint[];
  readonly height?: number;
  readonly testID?: string;
}
