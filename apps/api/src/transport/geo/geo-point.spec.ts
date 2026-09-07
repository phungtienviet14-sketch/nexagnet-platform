import { describe, expect, it } from 'vitest';
import { isWithinRoadNetworkBoundingBox, parseGeoPoint } from './geo-point.js';

/**
 * GEO-030 — bien vao cua toa do. Moi thu tu than may deu la `unknown` cho toi khi bai nay chay.
 *
 * Bai quan trong nhat o day la `NULL_ISLAND`. (0, 0) la mot toa do HOP LE ve mat toan hoc va la
 * gia tri MAC DINH cua gan nhu moi loi dinh vi: mot struct zero-init, mot truong JSON thieu, mot
 * `parseFloat` that bai. Neu nhan no, he thong se ghi lai mot vi tri "hop le" ngoai khoi chau Phi
 * cho moi lan GPS hong — va nhung hang do trong nhu du lieu that o moi bao cao ve sau.
 */
describe('Bien vao cua mot ban dinh vi — GEO-030', () => {
  it('toa do that thi qua', () => {
    const parsed = parseGeoPoint(21.0285, 105.8542);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.point).toEqual({ latitude: 21.0285, longitude: 105.8542 });
    }
  });

  it('(0, 0) bi tu choi voi ma RIENG — gia tri mac dinh cua mot loi, khong phai mot vi tri', () => {
    const parsed = parseGeoPoint(0, 0);
    expect(parsed).toEqual({ ok: false, rejection: 'NULL_ISLAND' });
  });

  it('vi do 0 mot minh VAN hop le — xich dao co that', () => {
    expect(parseGeoPoint(0, 105.8542).ok).toBe(true);
  });

  it('kinh do 0 mot minh VAN hop le — kinh tuyen goc co that', () => {
    expect(parseGeoPoint(51.4778, 0).ok).toBe(true);
  });

  it('NaN va Infinity bi tu choi rieng theo tung truc', () => {
    const lat = parseGeoPoint(Number.NaN, 105);
    const lon = parseGeoPoint(21, Number.POSITIVE_INFINITY);
    expect(lat.ok === false && lat.rejection).toBe('LATITUDE_NOT_FINITE');
    expect(lon.ok === false && lon.rejection).toBe('LONGITUDE_NOT_FINITE');
  });

  it('chuoi KHONG duoc am tham ep kieu — "21.03" khong phai mot so', () => {
    const parsed = parseGeoPoint('21.03', '105.85');
    expect(parsed.ok === false && parsed.rejection).toBe('LATITUDE_NOT_FINITE');
  });

  it('null va undefined bi tu choi', () => {
    expect(parseGeoPoint(null, 105).ok).toBe(false);
    expect(parseGeoPoint(undefined, 105).ok).toBe(false);
  });

  it('ngoai dai thi tu choi, va noi ro truc nao sai', () => {
    const cases: readonly [unknown, unknown, string][] = [
      [90.1, 105, 'LATITUDE_OUT_OF_RANGE'],
      [-90.1, 105, 'LATITUDE_OUT_OF_RANGE'],
      [21, 180.1, 'LONGITUDE_OUT_OF_RANGE'],
      [21, -180.1, 'LONGITUDE_OUT_OF_RANGE'],
    ];
    for (const [latitude, longitude, expected] of cases) {
      const parsed = parseGeoPoint(latitude, longitude);
      expect(parsed.ok === false && parsed.rejection).toBe(expected);
    }
  });

  it('dung o bien +-90 / +-180 thi VAN hop le', () => {
    expect(parseGeoPoint(90, 180).ok).toBe(true);
    expect(parseGeoPoint(-90, -180).ok).toBe(true);
  });
});

/**
 * GEO-031 — khung hoat dong tho.
 *
 * Bai o day ghi lai mot dieu de bi hieu nham: khung nay KHONG phai bien gioi. No phu luon mot dai
 * cua Lao, va do la ket qua tat yeu cua viec dung mot hinh chu nhat — khong phai mot loi can sua.
 * Neu ai do sau nay siet no lai cho "dung bien gioi hon", ho se lam hong dung cai truong hop ma
 * he thong phai chay duoc: mot chuyen xe qua cua khau.
 */
describe('Khung hoat dong tho — GEO-031', () => {
  it('Ha Noi, Hai Phong va Ca Mau nam trong khung', () => {
    expect(isWithinRoadNetworkBoundingBox({ latitude: 21.0285, longitude: 105.8542 })).toBe(true);
    expect(isWithinRoadNetworkBoundingBox({ latitude: 20.8449, longitude: 106.6881 })).toBe(true);
    expect(isWithinRoadNetworkBoundingBox({ latitude: 8.6, longitude: 104.9 })).toBe(true);
  });

  it('Bangkok, Quang Chau va Kansas nam ngoai khung', () => {
    expect(isWithinRoadNetworkBoundingBox({ latitude: 13.7563, longitude: 100.5018 })).toBe(false);
    expect(isWithinRoadNetworkBoundingBox({ latitude: 23.1291, longitude: 113.2644 })).toBe(false);
    expect(isWithinRoadNetworkBoundingBox({ latitude: 38.5, longitude: -98.0 })).toBe(false);
  });

  it('mot diem o Lao nam TRONG khung — do la hinh chu nhat, khong phai bien gioi', () => {
    expect(isWithinRoadNetworkBoundingBox({ latitude: 17.9757, longitude: 102.6331 })).toBe(true);
  });

  it('ngoai khung KHONG phai la khong hop le — chi la mot dieu can nguoi nhin', () => {
    const kansas = { latitude: 38.5, longitude: -98.0 };
    expect(parseGeoPoint(kansas.latitude, kansas.longitude).ok).toBe(true);
    expect(isWithinRoadNetworkBoundingBox(kansas)).toBe(false);
  });
});
