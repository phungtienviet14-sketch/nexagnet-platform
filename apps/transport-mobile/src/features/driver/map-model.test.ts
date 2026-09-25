import { describe, expect, it } from 'vitest';
import { toFieldCard } from './field-work';
import { leg } from './fixtures';
import { isFixStale, legPoints, nextStop } from './map-model';

describe('legPoints — chi toa do that', () => {
  it('co ca diem lay va giao', () => {
    const points = legPoints(toFieldCard(leg(), 'r', 'VX'));
    expect(points.map((point) => point.kind)).toEqual(['pickup', 'delivery']);
    expect(points[0]?.label).toBe('Lấy hàng · Kho A');
  });

  it('don chua co toa do / chang rong -> khong bia diem', () => {
    expect(
      legPoints(toFieldCard(leg({ pickupPoint: null, deliveryPoint: null }), 'r', 'VX')),
    ).toEqual([]);
    expect(
      legPoints(toFieldCard(leg({ pickupPoint: undefined, deliveryPoint: undefined }), 'r', 'VX')),
    ).toEqual([]);
    expect(
      legPoints(
        toFieldCard(
          leg({ pickupPoint: { latitude: 0, longitude: 0 }, deliveryPoint: null }),
          'r',
          'VX',
        ),
      ),
    ).toEqual([]);
  });
});

describe('nextStop', () => {
  it('chua roi diem lay -> diem lay; da roi -> diem giao', () => {
    expect(nextStop('PLANNED')).toBe('pickup');
    expect(nextStop('LOADING')).toBe('pickup');
    expect(nextStop('IN_TRANSIT')).toBe('delivery');
    expect(nextStop('DELIVERED')).toBe('delivery');
  });
});

describe('isFixStale', () => {
  it('qua 2 phut la cu; gio hong cung la cu', () => {
    const now = Date.parse('2026-09-25T01:00:00.000Z');
    expect(isFixStale('2026-09-25T00:59:00.000Z', now)).toBe(false);
    expect(isFixStale('2026-09-25T00:57:00.000Z', now)).toBe(true);
    expect(isFixStale('hong', now)).toBe(true);
  });
});
