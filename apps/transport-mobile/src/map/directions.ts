/**
 * MO CHI DUONG bang ung dung ban do CUA HE DIEU HANH — ung dung nay khong dan duong.
 *
 * Moi nen tang mot kieu lien ket, va ta chi DUA DIEM DEN, khong dua diem di: ung dung ban do tu lay
 * vi tri hien tai. Khong nhet danh tinh lai xe/chuyen vao URL (URL di qua ung dung ben thu ba).
 */
export type DirectionsPlatform = 'android' | 'ios' | 'web';

export interface Destination {
  readonly latitude: number;
  readonly longitude: number;
  readonly label: string;
}

const coordinate = (value: number): string => String(Math.round(value * 1e6) / 1e6);

export function directionsUrl(platform: DirectionsPlatform, destination: Destination): string {
  const lat = coordinate(destination.latitude);
  const lng = coordinate(destination.longitude);
  switch (platform) {
    case 'android':
      return `geo:${lat},${lng}?q=${lat},${lng}(${encodeURIComponent(destination.label)})`;
    case 'ios':
      return `maps://?daddr=${lat},${lng}`;
    case 'web':
      return `https://www.openstreetmap.org/directions?route=%3B${lat}%2C${lng}`;
  }
}

/** Duong du phong khi lien ket ung dung khong mo duoc (vd iOS khong co Apple Maps). */
export function directionsFallbackUrl(destination: Destination): string {
  return directionsUrl('web', destination);
}
