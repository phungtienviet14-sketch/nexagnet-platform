import { describe, expect, it } from 'vitest';
import {
  FIT_PADDING_PX,
  MAX_FIT_ZOOM,
  MIN_FIT_SPAN_DEG,
  boundsKey,
  boundsOf,
  cameraFor,
  isDrawablePoint,
  pointsFeatureCollection,
} from './camera';
import type { MapPoint } from './map-types';

const HN: MapPoint = {
  id: 'a',
  kind: 'pickup',
  latitude: 21.0285,
  longitude: 105.8542,
  label: 'A',
};
const HP: MapPoint = {
  id: 'b',
  kind: 'delivery',
  latitude: 20.8449,
  longitude: 106.6881,
  label: 'B',
};

describe('cameraFor — cung ngu nghia web map-camera.ts', () => {
  it('null hoac khung hong -> null (khong ve ban do)', () => {
    expect(cameraFor(null)).toBeNull();
    expect(cameraFor([Number.NaN, 0, 1, 1])).toBeNull();
    expect(cameraFor([200, 0, 201, 1])).toBeNull();
    expect(cameraFor([10, 5, 9, 6])).toBeNull();
  });

  it('mot diem -> CENTER o muc phong toi da cua fit', () => {
    expect(cameraFor([105, 21, 105, 21])).toEqual({
      kind: 'CENTER',
      longitude: 105,
      latitude: 21,
      zoom: MAX_FIT_ZOOM,
    });
  });

  it('hai diem xa -> FIT voi le 48 va tran zoom 13', () => {
    const camera = cameraFor(boundsOf([HN, HP]));
    expect(camera).toEqual({
      kind: 'FIT',
      bounds: [105.8542, 20.8449, 106.6881, 21.0285],
      paddingPx: FIT_PADDING_PX,
      maxZoom: MAX_FIT_ZOOM,
    });
  });

  it('hai diem sat nhau -> khung noi toi be rong toi thieu', () => {
    const camera = cameraFor([105.85, 21.02, 105.851, 21.021]);
    expect(camera?.kind).toBe('FIT');
    if (camera?.kind !== 'FIT') return;
    expect(camera.bounds[2] - camera.bounds[0]).toBeCloseTo(MIN_FIT_SPAN_DEG, 9);
    expect(camera.bounds[3] - camera.bounds[1]).toBeCloseTo(MIN_FIT_SPAN_DEG, 9);
  });
});

describe('diem ve duoc', () => {
  it('bo Null Island, NaN, ngoai mien', () => {
    expect(isDrawablePoint({ latitude: 0, longitude: 0 })).toBe(false);
    expect(isDrawablePoint({ latitude: 91, longitude: 0 })).toBe(false);
    expect(isDrawablePoint({ latitude: Number.NaN, longitude: 1 })).toBe(false);
    expect(isDrawablePoint(HN)).toBe(true);
  });

  it('khong diem hop le -> khong khung', () => {
    expect(boundsOf([{ ...HN, latitude: 0, longitude: 0 }])).toBeNull();
    expect(boundsKey(null)).toBe('none');
    expect(boundsKey([1, 2, 3, 4])).toBe('1,2,3,4');
  });
});

describe('pointsFeatureCollection', () => {
  it('GeoJSON [lng, lat], co thuoc tinh cu/moi', () => {
    const collection = pointsFeatureCollection(
      [{ ...HN, stale: true }, HP, { ...HP, id: 'x', latitude: 0, longitude: 0 }],
      (point) => (point.stale ? 'grey' : 'teal'),
    );
    expect(collection.features).toHaveLength(2);
    expect(collection.features[0]?.geometry.coordinates).toEqual([105.8542, 21.0285]);
    expect(collection.features[0]?.properties).toMatchObject({ stale: true, color: 'grey' });
    expect(collection.features[1]?.properties).toMatchObject({ stale: false, color: 'teal' });
  });
});
