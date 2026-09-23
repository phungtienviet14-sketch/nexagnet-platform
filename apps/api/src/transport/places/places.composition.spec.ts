import { describe, expect, it } from 'vitest';
import { buildAppComposition } from '../../app-composition.js';
import { TRANSPORT_PLACE_DECISIONS } from './place-decisions.js';

const controllerNames = (capabilities: Parameters<typeof buildAppComposition>[0]): string[] =>
  buildAppComposition(capabilities).controllers.map((controller) => controller.name);

const providerTokens = (capabilities: Parameters<typeof buildAppComposition>[0]): string[] =>
  buildAppComposition(capabilities).providers.map((provider) =>
    typeof provider === 'function'
      ? provider.name
      : typeof provider.provide === 'function'
        ? provider.provide.name
        : String(provider.provide),
  );

describe('composition cua be mat tim dia diem', () => {
  /**
   * Den cung `transport-core` — tao don la viec cua capability loi, va tim diem lay/giao la mot
   * phan cua tao don. KHONG mot capability moi (`CapabilityId` la enum dong).
   */
  it('controller, cong tim kiem va dich vu co mat o khach chi bat `transport-core`', () => {
    expect(controllerNames(['transport-core'])).toContain('TransportPlacesController');
    const tokens = providerTokens(['transport-core']);
    expect(tokens).toContain('TransportPlaceSearchPort');
    expect(tokens).toContain('TransportPlaceService');
  });

  it('khong co mat o khach khong dung van tai', () => {
    expect(controllerNames(['knowledge'])).not.toContain('TransportPlacesController');
    expect(providerTokens(['knowledge'])).not.toContain('TransportPlaceSearchPort');
  });

  /**
   * So hang rao thuoc `transport-proof`: cong dia diem da biet den va di CUNG capability do. Neu
   * adapter van dang ky khi `transport-proof` tat, dich vu se khong bao gio nhan `undefined` va
   * man hinh khong phan biet duoc "chua co so" voi "so rong".
   */
  it('cong dia diem da biet chi ton tai khi bat `transport-proof`', () => {
    expect(providerTokens(['transport-core'])).not.toContain('KnownPlacesFacts');
    expect(providerTokens(['transport-core', 'transport-proof'])).toContain('KnownPlacesFacts');
  });

  it('tu vung quyet dinh: mot diem `place.lookup`, chu so huu rieng', () => {
    expect(TRANSPORT_PLACE_DECISIONS.owner).toBe('transport-places');
    expect(TRANSPORT_PLACE_DECISIONS.points).toEqual(['place.lookup']);
    expect(Object.keys(TRANSPORT_PLACE_DECISIONS.labels).sort()).toEqual(
      [
        'PLACE_LOOKUP_BUSY',
        'PLACE_LOOKUP_DISABLED',
        'PLACE_LOOKUP_FROM_CACHE',
        'PLACE_LOOKUP_FROM_PROVIDER',
        'PLACE_LOOKUP_UNAVAILABLE',
      ].sort(),
    );
  });
});
