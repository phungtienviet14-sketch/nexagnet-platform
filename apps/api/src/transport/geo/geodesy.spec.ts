import { describe, expect, it } from 'vitest';
import {
  EARTH_MEAN_RADIUS_METRES,
  greatCircleMetres,
  groundSpeedMetresPerSecond,
  initialBearingDegrees,
} from './geodesy.js';

/**
 * GEO-001 — do dai tren mat cau, doi chieu voi cac gia tri DUNG VE GIAI TICH.
 *
 * Cac bai o day KHONG lay so tu mot thu vien khac roi chep vao. Chung lay nhung cap diem ma
 * khoang cach mat cau co CONG THUC DONG: mot do vi tuyen la piR/180, hai diem doi tam la piR,
 * vuong goc nhau la piR/2. Neu hien thuc sai he so hay quen doi sang radian, ba bai do do ngay.
 */
describe('Khoang cach mat cau — GEO-001', () => {
  const R = EARTH_MEAN_RADIUS_METRES;

  it('cung mot diem thi bang 0, khong ra NaN', () => {
    const p = { latitude: 21.0285, longitude: 105.8542 };
    expect(greatCircleMetres(p, { ...p })).toBe(0);
  });

  it('mot do vi tuyen o xich dao = piR/180', () => {
    const measured = greatCircleMetres({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 });
    expect(measured).toBeCloseTo((Math.PI * R) / 180, 3);
  });

  it('mot phan tu vong tron = piR/2', () => {
    const measured = greatCircleMetres(
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 90 },
    );
    expect(measured).toBeCloseTo((Math.PI * R) / 2, 3);
  });

  it('hai diem doi tam = piR', () => {
    expect(
      greatCircleMetres({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 180 }),
    ).toBeCloseTo(Math.PI * R, 3);
    expect(
      greatCircleMetres({ latitude: 90, longitude: 0 }, { latitude: -90, longitude: 0 }),
    ).toBeCloseTo(Math.PI * R, 3);
  });

  it('doi xung: d(a,b) = d(b,a)', () => {
    const a = { latitude: 20.8449, longitude: 106.6881 };
    const b = { latitude: 21.0285, longitude: 105.8542 };
    expect(greatCircleMetres(a, b)).toBeCloseTo(greatCircleMetres(b, a), 9);
  });

  it('KHONG vong qua nua trai dat o kinh tuyen 180', () => {
    const measured = greatCircleMetres(
      { latitude: 0, longitude: 179.9 },
      { latitude: 0, longitude: -179.9 },
    );
    expect(measured).toBeLessThan(25_000);
  });

  it('Ha Noi - Hai Phong ra dung bac 89 km (doi chieu thuc te)', () => {
    const measured = greatCircleMetres(
      { latitude: 21.0285, longitude: 105.8542 },
      { latitude: 20.8449, longitude: 106.6881 },
    );
    expect(measured).toBeGreaterThan(87_000);
    expect(measured).toBeLessThan(91_000);
  });

  it('hai diem cach nhau vai met van do duoc, khong bi lam tron ve 0', () => {
    const measured = greatCircleMetres(
      { latitude: 21.0285, longitude: 105.8542 },
      { latitude: 21.02855, longitude: 105.8542 },
    );
    expect(measured).toBeGreaterThan(4);
    expect(measured).toBeLessThan(7);
  });
});

describe('Huong di ban dau — GEO-002', () => {
  const origin = { latitude: 0, longitude: 0 };

  it('bac = 0, dong = 90, nam = 180, tay = 270', () => {
    expect(initialBearingDegrees(origin, { latitude: 1, longitude: 0 })).toBeCloseTo(0, 6);
    expect(initialBearingDegrees(origin, { latitude: 0, longitude: 1 })).toBeCloseTo(90, 6);
    expect(initialBearingDegrees(origin, { latitude: -1, longitude: 0 })).toBeCloseTo(180, 6);
    expect(initialBearingDegrees(origin, { latitude: 0, longitude: -1 })).toBeCloseTo(270, 6);
  });

  it('luon nam trong [0,360)', () => {
    const bearing = initialBearingDegrees(
      { latitude: 10, longitude: 20 },
      { latitude: -5, longitude: -30 },
    );
    expect(bearing).toBeGreaterThanOrEqual(0);
    expect(bearing).toBeLessThan(360);
  });
});

describe('Toc do mat dat suy tu hai ban dinh vi — GEO-003', () => {
  it('mot do vi tuyen trong 3600 giay', () => {
    const speed = groundSpeedMetresPerSecond(
      { latitude: 0, longitude: 0 },
      { latitude: 1, longitude: 0 },
      3600,
    );
    expect(speed).toBeCloseTo((Math.PI * EARTH_MEAN_RADIUS_METRES) / 180 / 3600, 6);
  });

  it('khoang thoi gian 0 hoac am tra ve null thay vi chia cho 0', () => {
    const a = { latitude: 0, longitude: 0 };
    const b = { latitude: 1, longitude: 0 };
    expect(groundSpeedMetresPerSecond(a, b, 0)).toBeNull();
    expect(groundSpeedMetresPerSecond(a, b, -5)).toBeNull();
  });
});
