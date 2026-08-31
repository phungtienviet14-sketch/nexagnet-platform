import { describe, expect, it } from 'vitest';
import {
  CONSUMPTION_UNITS_PER_L100KM,
  FuelQuantityError,
  LITERS_UNITS_PER_LITER,
  computeConsumption,
  consumptionFromStored,
  exceedsConsumptionNorm,
  formatConsumption,
  formatLiters,
  litersFromStored,
  litersToUnits,
} from './fuel-quantity.js';

/**
 * `FUEL-001`, `FUEL-002` va `INV-06` — hat giong nghiem thu cua T1 §17, do o tang THUAN.
 *
 * Bo test nay khong dung mot CSDL nao va khong biet Nest: no khoa dung phan so hoc ma mot bao cao
 * dinh muc nhien lieu dua len. Neu phep tinh o day sai, moi con so tieu hao trong ca `TX-04` sai —
 * va no sai theo kieu khong ai nhin ra, vi tung phieu deu doc len "hop ly".
 */
describe('So lit — so nguyen co ty le, khong so thuc nhi phan', () => {
  it('doc dung ba chu so thap phan', () => {
    expect(litersToUnits('200')).toBe(200_000);
    expect(litersToUnits('12.345')).toBe(12_345);
    expect(litersToUnits(150.5)).toBe(150_500);
  });

  /**
   * Bai test CHINH cua ca tep: `0.1 + 0.2 !== 0.3` khong duoc phep xay ra o day.
   *
   * `0.1 + 0.2` bang so thuc cho `0.30000000000000004`; bang don vi nguyen thi cho dung `300`.
   * Chenh lech do nho toi muc khong ai thay tren mot phieu — no chi lo ra khi tong lit cua ca ky
   * lech vai chuc mililit so voi bang ke giay, va luc do khong ai tim ra dong nao sai.
   *
   * Hai khang dinh dau la mot PHEP DO, khong phai mot loi phan nan ve JavaScript: chung ghi lai
   * rang loi do CO THAT o dung nhung con so cua nghiep vu nay, nen ai muon bo tang so nguyen phai
   * doi mat voi no truoc.
   */
  it('cong don khong tich luy sai so', () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect([0.1, 0.2, 0.3].reduce((sum, value) => sum + value, 0)).not.toBe(0.6);

    const total = [0.1, 0.2, 0.3].reduce((sum, value) => sum + litersToUnits(value), 0);
    expect(total).toBe(600);
    expect(formatLiters(total)).toBe('0.600');
  });

  it('tu choi so lit 0, so am va qua nhieu chu so thap phan', () => {
    expect(() => litersToUnits('0')).toThrow(FuelQuantityError);
    expect(() => litersToUnits('-5')).toThrow(FuelQuantityError);
    expect(() => litersToUnits('1.2345')).toThrow(FuelQuantityError);
    expect(() => litersToUnits('mot tram')).toThrow(FuelQuantityError);
  });

  it('tu choi dang mu thay vi doc no thanh mot so vo nghia', () => {
    expect(() => litersToUnits(1e21)).toThrow(FuelQuantityError);
    expect(() => litersToUnits(Number.NaN)).toThrow(FuelQuantityError);
  });

  it('di ra va di vao cot NUMERIC(12,3) khong mat gia tri', () => {
    expect(formatLiters(12_345)).toBe('12.345');
    expect(formatLiters(200_000)).toBe('200.000');
    expect(litersFromStored('12.345')).toBe(12_345);
    expect(litersFromStored(null)).toBeNull();
  });
});

describe('Tieu hao — `INV-06`', () => {
  /**
   * `FUEL-001` (T1 §17) — chinh xac vi du cua hop dong: odo 100.000 -> 100.500, do 200 lit.
   *
   * `200 / 500 * 100 = 40` L/100km. Bai test nay la ly do phep tinh dung so hoc nguyen: `40.000`
   * don vi la mot con so DUNG, khong phai mot con so gan dung.
   */
  it('FUEL-001 — 200 lit tren 500 km = 40,000 L/100km', () => {
    const result = computeConsumption({
      litersUnits: 200 * LITERS_UNITS_PER_LITER,
      previousOdometerKm: 100_000,
      odometerKm: 100_500,
    });

    expect(result.consumptionUnits).toBe(40 * CONSUMPTION_UNITS_PER_L100KM);
    expect(formatConsumption(result.consumptionUnits ?? 0)).toBe('40.000');
    expect(result.reviewReasons).toEqual([]);
  });

  /**
   * `FUEL-002` — mau so <= 0 thi KHONG tinh, VA khong nem.
   *
   * Ca hai ve deu la yeu cau: khong bia ra mot con so, va khong lam hong viec nhap phieu. Mot lai
   * xe dung o cay xang luc 5 gio sang khong sua duoc odo cua chuyen truoc, va chan ho nop phieu se
   * chi khien phieu do khong bao gio duoc nhap.
   */
  it('FUEL-002 — odo khong tien thi khong chia, danh dau can kiem tra, khong nem', () => {
    for (const odometerKm of [100_000, 99_000]) {
      const result = computeConsumption({
        litersUnits: 200 * LITERS_UNITS_PER_LITER,
        previousOdometerKm: 100_000,
        odometerKm,
      });
      expect(result.consumptionUnits).toBeNull();
      expect(result.reviewReasons).toEqual(['ODOMETER_NOT_ADVANCED']);
    }
  });

  it('chua co lan do dau nao truoc do KHONG phai mot loi', () => {
    const result = computeConsumption({
      litersUnits: 50 * LITERS_UNITS_PER_LITER,
      previousOdometerKm: null,
      odometerKm: 12_000,
    });
    expect(result.consumptionUnits).toBeNull();
    expect(result.reviewReasons).toEqual(['NO_PREVIOUS_ODOMETER']);
  });

  it('lam tron nua len khi phep chia khong chan, va giu duoc do phan giai cua cot', () => {
    // 100 lit / 173 km * 100 = 57,8034... -> 57,803
    const result = computeConsumption({
      litersUnits: 100 * LITERS_UNITS_PER_LITER,
      previousOdometerKm: 0,
      odometerKm: 173,
    });
    expect(result.consumptionUnits).toBe(57_803);
    expect(formatConsumption(57_803)).toBe('57.803');
    expect(consumptionFromStored('57.803')).toBe(57_803);
  });
});

describe('Dinh muc tieu hao — VT-046, du lieu cua goi khach', () => {
  it('khach chua khai dinh muc thi KHONG canh bao gi', () => {
    expect(exceedsConsumptionNorm(99_000, null, 10)).toBe(false);
  });

  it('khong tinh duoc tieu hao thi cung khong canh bao', () => {
    expect(exceedsConsumptionNorm(null, 30, 10)).toBe(false);
  });

  /**
   * Dung sai duoc doc la PHAN TRAM TREN dinh muc: 30 L/100km + 10% = tran 33 L/100km.
   *
   * `33.000` khong vuot (bang tran), `33.001` thi vuot. Ghi ca hai bien o day vi mot bo test chi
   * kiem "40 vuot 30" se van xanh khi ai do quen mat phan dung sai.
   */
  it('chi keu khi VUOT dinh muc cong dung sai', () => {
    expect(exceedsConsumptionNorm(30_000, 30, 10)).toBe(false);
    expect(exceedsConsumptionNorm(33_000, 30, 10)).toBe(false);
    expect(exceedsConsumptionNorm(33_001, 30, 10)).toBe(true);
    expect(exceedsConsumptionNorm(40_000, 30, 10)).toBe(true);
  });
});
