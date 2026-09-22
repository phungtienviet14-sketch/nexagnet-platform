import { describe, expect, it } from 'vitest';
import type { FuelConsumptionLink, FuelVehicleConsumption } from '../../fuel-review-types';
import {
  CONSUMPTION_INSIGHT_NOTICE,
  consumptionPeriodProblem,
  monthRangeOf,
  toConsumptionDrilldownModel,
} from '../fuel-consumption';

/**
 * MO HINH DRILL-DOWN TIEU HAO — `#313`.
 *
 * Man hinh chi TRINH BAY chuoi may chu da tinh. Bai kiem khoa ba dieu nguoi doc can thay: mat xich
 * KHONG tinh duoc noi ro vi sao va khong co con so; canh bao vuot dinh muc noi ro no khong tru tien
 * lai xe; va con so luc khai khac chuoi hien tai thi duoc noi ra.
 */

const link = (overrides: Partial<FuelConsumptionLink> = {}): FuelConsumptionLink => ({
  entryId: 'phieu-b',
  tripId: 'chuyen-1',
  runId: null,
  businessDate: '2026-09-03',
  occurredAt: '2026-09-03T01:00:00.000Z',
  verificationStatus: 'VERIFIED',
  litersUnits: 120_000,
  odometerKm: 1_400,
  previousEntryId: 'phieu-a',
  previousOdometerKm: 1_000,
  distanceKm: 400,
  consumptionUnits: 30_000,
  state: 'COMPUTED',
  insights: [],
  recorded: { previousOdometerKm: 1_000, consumptionUnits: 30_000, reviewReasons: [] },
  ...overrides,
});

const payload = (overrides: Partial<FuelVehicleConsumption> = {}): FuelVehicleConsumption => ({
  vehicle: { id: 'xe-1', registrationPlate: '29C-123.45', vehicleClass: 'tai-5-tan' },
  period: { from: '2026-09-01', to: '2026-09-30' },
  norm: { normL100km: 30, tolerancePercent: 10 },
  leadIn: null,
  links: [link()],
  summary: {
    entryCount: 1,
    computedCount: 1,
    reviewCount: 0,
    excludedCount: 0,
    unverifiedCount: 0,
    aboveNormCount: 0,
    totalLitersUnits: 120_000,
    totalDistanceKm: 400,
    consumptionUnits: 30_000,
    stateCounts: {
      COMPUTED: 1,
      NO_PREVIOUS_ODOMETER: 0,
      ODOMETER_NOT_ADVANCED: 0,
      PREVIOUS_FILL_UNANCHORED: 0,
      EXCLUDED_REJECTED: 0,
    },
  },
  isTruncated: false,
  ...overrides,
});

describe('toConsumptionDrilldownModel', () => {
  it('mat xich da tinh: moc truoc -> km hien tai -> quang duong -> so lit -> L/100km', () => {
    const [row] = toConsumptionDrilldownModel(payload(), null).rows;

    expect(row).toMatchObject({
      id: 'phieu-b',
      previousOdometerLabel: '1.000 km',
      odometerLabel: '1.400 km',
      distanceLabel: '400 km',
      litersLabel: '120,000 L',
      consumptionLabel: '30,000 L/100km',
      stateLabel: 'Đã tính',
      isComputed: true,
    });
  });

  it('odo khong tang: KHONG co con so tieu hao, trang thai noi ro can soat', () => {
    const [row] = toConsumptionDrilldownModel(
      payload({
        links: [
          link({
            state: 'ODOMETER_NOT_ADVANCED',
            odometerKm: 950,
            distanceKm: -50,
            consumptionUnits: null,
          }),
        ],
      }),
      null,
    ).rows;

    expect(row).toMatchObject({
      distanceLabel: '-50 km',
      consumptionLabel: '—',
      stateLabel: 'Số km không tăng — không tính, cần soát',
      stateTone: 'wait',
      isComputed: false,
    });
  });

  it('phieu bi tu choi: nam ngoai chuoi, khong co moc, khong co quang duong', () => {
    const [row] = toConsumptionDrilldownModel(
      payload({
        links: [
          link({
            state: 'EXCLUDED_REJECTED',
            verificationStatus: 'REJECTED',
            previousEntryId: null,
            previousOdometerKm: null,
            distanceKm: null,
            consumptionUnits: null,
          }),
        ],
      }),
      null,
    ).rows;

    expect(row).toMatchObject({
      previousOdometerLabel: '—',
      distanceLabel: '—',
      consumptionLabel: '—',
      stateLabel: 'Phiếu bị từ chối — không làm mốc km',
    });
  });

  it('canh bao vuot dinh muc noi ro: chi de soat xet, khong tru tien lai xe', () => {
    const model = toConsumptionDrilldownModel(
      payload({
        links: [link({ consumptionUnits: 40_000, insights: ['CONSUMPTION_ABOVE_NORM'] })],
      }),
      null,
    );

    expect(model.rows[0]?.insightLabels).toEqual([
      'Vượt định mức — chỉ để soát xét, không trừ tiền lái xe',
    ]);
    expect(model.notice).toBe(CONSUMPTION_INSIGHT_NOTICE);
    expect(model.notice).toContain('không tạo khoản nợ');
    expect(model.notice).toContain('khấu trừ lương');
  });

  it('so luc khai khac chuoi hien tai thi noi ra ca hai con so', () => {
    const [row] = toConsumptionDrilldownModel(
      payload({
        links: [
          link({
            insights: ['RECORDED_SNAPSHOT_DIFFERS'],
            recorded: { previousOdometerKm: 1_200, consumptionUnits: 60_000, reviewReasons: [] },
          }),
        ],
      }),
      null,
    ).rows;

    expect(row?.recordedNote).toBe('Lúc khai ghi: mốc 1.200 km, tiêu hao 60,000 L/100km.');
  });

  it('tong ky + dinh muc + moc truoc ky', () => {
    const model = toConsumptionDrilldownModel(
      payload({
        leadIn: {
          entryId: 'truoc',
          businessDate: '2026-08-30',
          occurredAt: '2026-08-30T01:00:00.000Z',
          odometerKm: 800,
        },
      }),
      null,
    );

    expect(model.title).toBe('Xe 29C-123.45');
    expect(model.normLabel).toBe('Định mức 30 L/100km, dung sai 10%.');
    expect(model.leadInLabel).toBe('Mốc km trước kỳ: 800 km (30/08/2026).');
    expect(model.cards.map((card) => card.label)).toEqual([
      'Tiêu hao bình quân kỳ',
      'Quãng đường đã tính',
      'Số lít đã tính',
      'Cần soát (không tính)',
      'Vượt định mức',
    ]);
    expect(model.cards[0]).toMatchObject({ value: '30,000 L/100km' });
  });

  it('hang xe chua co dinh muc: noi that, khong bia mot dinh muc', () => {
    const model = toConsumptionDrilldownModel(
      payload({ norm: { normL100km: null, tolerancePercent: 10 } }),
      null,
    );

    expect(model.normLabel).toBe(
      'Hạng xe này chưa khai định mức — không có cảnh báo vượt định mức.',
    );
  });

  it('bi cat vi vuot tran: noi ro, khong am tham', () => {
    expect(
      toConsumptionDrilldownModel(payload({ isTruncated: true }), null).truncatedNote,
    ).not.toBeNull();
    expect(toConsumptionDrilldownModel(payload(), null).truncatedNote).toBeNull();
  });

  it('danh dau phieu dang mo tu hop thu', () => {
    const model = toConsumptionDrilldownModel(payload(), 'phieu-b');

    expect(model.rows[0]?.isFocused).toBe(true);
  });
});

describe('ky mac dinh va kiem ky', () => {
  it('thang cua mot ngay nghiep vu, ke ca thang 2 nam nhuan', () => {
    expect(monthRangeOf('2026-09-16')).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(monthRangeOf('2028-02-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });

  it.each([
    [{ from: '2026-09-01', to: '2026-09-30' }, null],
    [{ from: '2026-09-30', to: '2026-09-01' }, 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.'],
    [{ from: '2026-01-01', to: '2026-12-31' }, 'Chọn tối đa 92 ngày một lần.'],
    [{ from: '', to: '2026-09-30' }, 'Chọn đủ ngày bắt đầu và ngày kết thúc.'],
  ])('%j -> %s', (range, expected) => {
    expect(consumptionPeriodProblem(range)).toBe(expected);
  });
});
