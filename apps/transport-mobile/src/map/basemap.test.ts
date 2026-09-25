import { describe, expect, it } from 'vitest';
import {
  LOCAL_BASEMAP_NOTICE,
  OPENFREEMAP_ATTRIBUTION,
  OPENFREEMAP_STYLE_URL,
  OSM_ATTRIBUTION,
  localStyle,
  resolveBasemap,
} from './basemap';
import { directionsUrl } from './directions';

describe('resolveBasemap', () => {
  it('mac dinh -> OpenFreeMap liberty, co ghi nguon', () => {
    expect(resolveBasemap({})).toEqual({
      kind: 'REMOTE',
      styleUrl: OPENFREEMAP_STYLE_URL,
      attribution: OPENFREEMAP_ATTRIBUTION,
    });
  });

  it('local -> nen trong, noi that', () => {
    expect(resolveBasemap({ provider: 'local', styleUrl: 'https://x.test/s.json' })).toEqual({
      kind: 'LOCAL',
      notice: LOCAL_BASEMAP_NOTICE,
    });
  });

  it('kieu tu khai qua HTTPS -> dung no, ghi nguon OSM', () => {
    expect(resolveBasemap({ styleUrl: 'https://tiles.example.vn/style.json' })).toEqual({
      kind: 'REMOTE',
      styleUrl: 'https://tiles.example.vn/style.json',
      attribution: OSM_ATTRIBUTION,
    });
  });

  it('URL khong an toan hoac nha cung cap la -> nen trong, khong nhay sang nha khac', () => {
    expect(resolveBasemap({ styleUrl: 'http://tiles.example.vn/style.json' }).kind).toBe('LOCAL');
    expect(resolveBasemap({ provider: 'google' }).kind).toBe('LOCAL');
  });

  it('kieu cuc bo khong co nguon, khong glyph', () => {
    const style = localStyle();
    expect(style.sources).toEqual({});
    expect(style.layers).toHaveLength(1);
  });
});

describe('directionsUrl', () => {
  const destination = { latitude: 20.8449123, longitude: 106.6881, label: 'Kho B' };
  it('Android geo: kem nhan', () => {
    expect(directionsUrl('android', destination)).toBe(
      'geo:20.844912,106.6881?q=20.844912,106.6881(Kho%20B)',
    );
  });
  it('iOS Apple Maps chi dua diem den', () => {
    expect(directionsUrl('ios', destination)).toBe('maps://?daddr=20.844912,106.6881');
  });
  it('web OpenStreetMap', () => {
    expect(directionsUrl('web', destination)).toBe(
      'https://www.openstreetmap.org/directions?route=%3B20.844912%2C106.6881',
    );
  });
});
