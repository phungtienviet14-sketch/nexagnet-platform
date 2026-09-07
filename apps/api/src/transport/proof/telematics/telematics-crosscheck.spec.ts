import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CROSS_CHECK_POLICY,
  crossCheckTracks,
  type CrossCheckSample,
} from './telematics-crosscheck.js';
import {
  TelematicsUnavailableError,
  UnconfiguredVehicleTelematicsAdapter,
  type TelematicsFix,
} from './vehicle-telematics.port.js';

const T0 = new Date('2026-09-08T02:00:00Z');
const at = (minutes: number): Date => new Date(T0.getTime() + minutes * 60_000);

const HANOI = { latitude: 21.0285, longitude: 105.8542 };
const HAIPHONG = { latitude: 20.8449, longitude: 106.6881 };

const phone = (minutes: number, point = HANOI): CrossCheckSample => ({ point, at: at(minutes) });

const fix = (minutes: number, point = HANOI): TelematicsFix => ({
  vehicleId: 'vehicle-1',
  point,
  recordedAt: at(minutes),
  speedMetresPerSecond: null,
  odometerKm: null,
  providerRef: null,
});

/**
 * TELE-010 — doi chieu cheo hai nguon vi tri doc lap.
 *
 * Bai quan trong nhat cua tep nay la bai DAU TIEN, va no khong ve hinh hoc: mot he thong chua
 * duoc cam vao nguon thu hai KHONG duoc bao "khong co bat thuong". Neu no bao, thi man hinh doi
 * chieu se hien mau xanh cho moi chiec xe, mai mai, o mot he chua bao gio doi chieu cai gi — va
 * khong ai phat hien ra, vi mot he thong khong bao gio keu trong y het mot he thong khong loi.
 */
describe('Doi chieu cheo telematics — TELE-010', () => {
  it('CHUA CO nguon thu hai KHONG phai la "hai nguon dong y"', () => {
    const result = crossCheckTracks([phone(0), phone(1), phone(2)], null);
    expect(result.verdict).toBe('NO_SECOND_SOURCE');
    expect(result.verdict).not.toBe('AGREE');
    expect(result.comparedPairs).toBe(0);
    expect(result.medianDivergenceMetres).toBeNull();
  });

  it('hai nguon ta cung mot hanh trinh thi DONG Y', () => {
    const track = [phone(0), phone(2), phone(4), phone(6)];
    const result = crossCheckTracks(track, [fix(0), fix(2), fix(4), fix(6)]);
    expect(result.verdict).toBe('AGREE');
    expect(result.comparedPairs).toBe(4);
    expect(result.medianDivergenceMetres).toBeCloseTo(0, 1);
  });

  it('lech vai chuc met van DONG Y — do la sai so thiet bi, khong phai mau thuan', () => {
    const drifted = { latitude: HANOI.latitude + 0.0005, longitude: HANOI.longitude };
    const result = crossCheckTracks(
      [phone(0), phone(2), phone(4)],
      [fix(0, drifted), fix(2, drifted), fix(4, drifted)],
    );
    expect(result.verdict).toBe('AGREE');
    expect(result.medianDivergenceMetres).toBeLessThan(100);
  });

  it('hai nguon o hai tinh khac nhau thi LECH', () => {
    const result = crossCheckTracks(
      [phone(0), phone(2), phone(4)],
      [fix(0, HAIPHONG), fix(2, HAIPHONG), fix(4, HAIPHONG)],
    );
    expect(result.verdict).toBe('DIVERGENT');
    expect(result.medianDivergenceMetres).toBeGreaterThan(80_000);
    expect(result.worstAt).not.toBeNull();
  });

  it('MOT diem rac don le KHONG lat duoc phan quyet — do la ca ly do dung trung vi', () => {
    // Bon cap khop, mot cap lech 89 km. `max` se to ca chuyen; trung vi thi khong.
    const track = [phone(0), phone(2), phone(4), phone(6), phone(8)];
    const result = crossCheckTracks(track, [fix(0), fix(2), fix(4, HAIPHONG), fix(6), fix(8)]);
    expect(result.verdict).toBe('AGREE');
    expect(result.comparedPairs).toBe(5);
    // Nhung gia tri lon nhat VAN duoc ghi ra — nguoi xem lai co cai de nhin.
    expect(result.maxDivergenceMetres).toBeGreaterThan(80_000);
  });

  it('ghep cap theo THOI GIAN, khong theo chi so', () => {
    // Hai nguon lay mau lech pha: dien thoai o phut 0/10/20, hop GSHT o phut 1/11/21.
    const result = crossCheckTracks([phone(0), phone(10), phone(20)], [fix(1), fix(11), fix(21)]);
    expect(result.verdict).toBe('AGREE');
    expect(result.comparedPairs).toBe(3);
  });

  it('khong mot cap nao roi vao cung cua so thi noi ro la KHONG CHONG LAN', () => {
    // Hop GSHT ghi buoi chieu, dien thoai ghi buoi sang.
    const result = crossCheckTracks([phone(0), phone(2), phone(4)], [fix(600), fix(602)]);
    expect(result.verdict).toBe('NO_OVERLAP');
    expect(result.comparedPairs).toBe(0);
  });

  it('mau qua nho thi KHONG ket luan', () => {
    const result = crossCheckTracks([phone(0), phone(2)], [fix(0), fix(2)]);
    expect(result.verdict).toBe('NO_OVERLAP');
    expect(result.comparedPairs).toBe(2);
  });

  it('nguong doi duoc theo khach ma khong dong vao thuat toan', () => {
    const strict = { ...DEFAULT_CROSS_CHECK_POLICY, divergenceMetres: 10 };
    const drifted = { latitude: HANOI.latitude + 0.0005, longitude: HANOI.longitude };
    const track = [phone(0), phone(2), phone(4)];
    const fixes = [fix(0, drifted), fix(2, drifted), fix(4, drifted)];
    expect(crossCheckTracks(track, fixes).verdict).toBe('AGREE');
    expect(crossCheckTracks(track, fixes, strict).verdict).toBe('DIVERGENT');
  });
});

/**
 * TELE-011 — adapter mac dinh KHONG duoc gia vo lam gi.
 */
describe('Adapter telematics mac dinh — TELE-011', () => {
  const adapter = new UnconfiguredVehicleTelematicsAdapter();

  it('noi ro rang chua co nha cung cap, kem mot MA', () => {
    expect(adapter.describe()).toEqual({ available: false, reason: 'NO_PROVIDER_CONFIGURED' });
  });

  it('NEM khi bi goi, khong tra ve mang rong', async () => {
    // Mang rong se khong phan biet duoc voi "xe do khong chay hom nay".
    await expect(
      adapter.fetch({ vehicleId: 'vehicle-1', from: at(0), to: at(60) }),
    ).rejects.toBeInstanceOf(TelematicsUnavailableError);
  });

  it('loi mang theo ma ly do de nguoi truc biet phai cau hinh cai gi', async () => {
    await expect(
      adapter.fetch({ vehicleId: 'vehicle-1', from: at(0), to: at(60) }),
    ).rejects.toMatchObject({ reason: 'NO_PROVIDER_CONFIGURED' });
  });
});
