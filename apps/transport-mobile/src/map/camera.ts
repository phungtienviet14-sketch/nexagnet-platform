import type { MapPoint } from './map-types';

/**
 * KHUNG NHIN theo DU LIEU — port THUAN cua web `visual/map-camera.ts` (#278 N5, #374 §7).
 *
 * KHONG CO TOA DO MAC DINH NAO. Khong co diem hop le -> `null` -> KHONG ve ban do: mot ban do "bay
 * ve giua Viet Nam" doc y het mot ban do co du lieu ma xe dang o cho khac.
 *
 * MOT diem -> canh giua voi muc phong co dinh (khung rong 0 dua vao fit se phong toi muc toi da —
 * thay mot mai nha chu khong thay con duong). Hai diem sat nhau -> noi khung toi be rong toi thieu.
 */
export type MapBounds = readonly [west: number, south: number, east: number, north: number];

export type MapCamera =
  | {
      readonly kind: 'FIT';
      readonly bounds: MapBounds;
      readonly paddingPx: number;
      readonly maxZoom: number;
    }
  | {
      readonly kind: 'CENTER';
      readonly longitude: number;
      readonly latitude: number;
      readonly zoom: number;
    };

export const FIT_PADDING_PX = 48;
export const MAX_FIT_ZOOM = 13;
/** 0,05° ≈ 5 km o vi do Viet Nam — vua khit o muc ~13 tren khung ~420px. */
export const MIN_FIT_SPAN_DEG = 0.05;

const isLongitude = (value: number): boolean =>
  Number.isFinite(value) && value >= -180 && value <= 180;
const isLatitude = (value: number): boolean =>
  Number.isFinite(value) && value >= -90 && value <= 90;

/**
 * Diem VE DUOC: huu han, trong mien, va khong phai (0,0) — "Null Island" la dau hieu cua mot ban
 * dinh vi CHUA CO (struct zero-init, parse hong), khong phai mot chiec xe ngoai vinh Guinea.
 */
export function isDrawablePoint(point: { latitude: number; longitude: number }): boolean {
  return (
    isLatitude(point.latitude) &&
    isLongitude(point.longitude) &&
    !(Math.abs(point.latitude) < 1e-9 && Math.abs(point.longitude) < 1e-9)
  );
}

export function drawablePoints(points: readonly MapPoint[]): readonly MapPoint[] {
  return points.filter(isDrawablePoint);
}

export function boundsOf(points: readonly MapPoint[]): MapBounds | null {
  const usable = drawablePoints(points);
  if (usable.length === 0) return null;
  const longitudes = usable.map((point) => point.longitude);
  const latitudes = usable.map((point) => point.latitude);
  return [
    Math.min(...longitudes),
    Math.min(...latitudes),
    Math.max(...longitudes),
    Math.max(...latitudes),
  ];
}

const widen = (low: number, high: number, min: number, max: number): [number, number] => {
  if (high - low >= MIN_FIT_SPAN_DEG) return [low, high];
  const middle = (low + high) / 2;
  const half = MIN_FIT_SPAN_DEG / 2;
  return [Math.max(min, middle - half), Math.min(max, middle + half)];
};

export function cameraFor(bounds: MapBounds | null): MapCamera | null {
  if (bounds === null) return null;
  const [west, south, east, north] = bounds;
  if (!isLongitude(west) || !isLongitude(east) || !isLatitude(south) || !isLatitude(north)) {
    return null;
  }
  if (west > east || south > north) return null;
  if (west === east && south === north) {
    return { kind: 'CENTER', longitude: west, latitude: south, zoom: MAX_FIT_ZOOM };
  }
  const [fitWest, fitEast] = widen(west, east, -180, 180);
  const [fitSouth, fitNorth] = widen(south, north, -90, 90);
  return {
    kind: 'FIT',
    bounds: [fitWest, fitSouth, fitEast, fitNorth],
    paddingPx: FIT_PADDING_PX,
    maxZoom: MAX_FIT_ZOOM,
  };
}

/** Khoa GIA TRI — camera chi chay lai khi TOA DO doi, khong keo ban do ve moi lan lam tuoi. */
export function boundsKey(bounds: MapBounds | null): string {
  return bounds === null ? 'none' : bounds.join(',');
}

export interface PointFeatureCollection {
  readonly type: 'FeatureCollection';
  readonly features: Array<{
    readonly type: 'Feature';
    readonly id: string;
    readonly properties: {
      readonly id: string;
      readonly kind: string;
      readonly label: string;
      readonly stale: boolean;
      /** Mau ve cua diem — lop ve doc `['get', 'color']`, khong tu chon mau theo loai. */
      readonly color: string;
    };
    readonly geometry: { readonly type: 'Point'; readonly coordinates: [number, number] };
  }>;
}

/** GeoJSON cua cac diem — `[lng, lat]` dung thu tu GeoJSON; diem khong ve duoc bi bo. */
export function pointsFeatureCollection(
  points: readonly MapPoint[],
  colorFor: (point: MapPoint) => string = () => '#5F6770',
): PointFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: drawablePoints(points).map((point) => ({
      type: 'Feature',
      id: point.id,
      properties: {
        id: point.id,
        kind: point.kind,
        label: point.label,
        stale: point.stale === true,
        color: colorFor(point),
      },
      geometry: { type: 'Point', coordinates: [point.longitude, point.latitude] },
    })),
  };
}
