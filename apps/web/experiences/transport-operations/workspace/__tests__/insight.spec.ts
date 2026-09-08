import { describe, expect, it } from 'vitest';
import { toCorridorInsight, toFleetInsight } from '../insight';
import type {
  CorridorInsight,
  CorridorInsightView,
  FleetInsightView,
  VehicleInsight,
} from '../../transport-types';

const RANGE = { from: '2026-09-01', to: '2026-09-30', businessDays: 30 };

const vehicle = (over: Partial<VehicleInsight> = {}): VehicleInsight => ({
  vehicleId: 'v1',
  registrationPlate: '29H-111.11',
  status: 'IDLE',
  runCount: 3,
  activeBusinessDays: 6,
  utilisation: 0.2,
  loadedKm: 300,
  emptyKm: 100,
  totalKm: 400,
  emptyRatio: 0.25,
  legsMissingDistance: 0,
  ...over,
});

const fleetView = (over: Partial<FleetInsightView> = {}): FleetInsightView => ({
  range: RANGE,
  utilisationFormula: 'ngayCoChangKhongHuy / ngayLichTrongKhoang',
  vehicles: [vehicle()],
  presence: { total: 1, idle: 1, onTrip: 0, underMaintenance: 0 },
  totals: {
    loadedKm: 300,
    emptyKm: 100,
    totalKm: 400,
    emptyRatio: 0.25,
    legsMissingDistance: 0,
  },
  ...over,
});

const corridor = (over: Partial<CorridorInsight> = {}): CorridorInsight => ({
  corridorKey: 'hà nội → hải phòng',
  originLabel: 'Hà Nội',
  destinationLabel: 'Hải Phòng',
  legCount: 4,
  orderCodes: ['ORD-001', 'ORD-002'],
  runCodes: ['RUN-001', 'RUN-002'],
  loadedKm: 420,
  medianLoadedKm: 105,
  attributedEmptyKm: 160,
  legsMissingDistance: 0,
  ...over,
});

const corridorView = (over: Partial<CorridorInsightView> = {}): CorridorInsightView => ({
  range: RANGE,
  grouping: 'FREE_TEXT_LABEL_COMPATIBILITY',
  emptyAttribution: 'PRECEDING_LOADED_LEG_IN_SAME_RUN',
  corridors: [corridor()],
  ...over,
});

describe('bang doi xe — cong thuc di CUNG con so', () => {
  it('cau giai thich ty le su dung luon co mat, va no noi ro day la ty le theo NGAY', () => {
    const model = toFleetInsight(fleetView());

    expect(model.utilisationNote).toContain('NGÀY');
    expect(model.utilisationNote).toContain('không phải theo giờ chạy');
  });

  it('xe thieu km bi BO khoi bieu do va duoc dem rieng — khong ve thanh cot cao 0', () => {
    const model = toFleetInsight(
      fleetView({
        vehicles: [
          vehicle(),
          vehicle({
            vehicleId: 'v2',
            registrationPlate: '29H-222.22',
            loadedKm: null,
            emptyKm: null,
            totalKm: null,
            emptyRatio: null,
            legsMissingDistance: 2,
          }),
        ],
      }),
    );

    expect(model.chart.plates).toEqual(['29H-111.11']);
    expect(model.chart.omittedVehicles).toBe(1);
    /* Nhung xe do VAN co mat trong bang, kem mot ghi chu — khong bi giau di. */
    expect(model.vehicles).toHaveLength(2);
    expect(model.vehicles[1]?.incomplete).toBe(true);
    expect(model.vehicles[1]?.totalKm).toBe('—');
  });

  /*
   * Mot chiec xe chua du du lieu KHONG duoc dung dau bang "chay rong nhieu nhat" — do la mot cao
   * buoc dua tren cho trong, va no se den tay mot nguoi lai xe that.
   */
  it('xe chua tinh duoc ty le rong khong bao gio vao danh sach chay rong nhieu nhat', () => {
    const model = toFleetInsight(
      fleetView({
        vehicles: [
          vehicle({ emptyRatio: 0.1 }),
          vehicle({ vehicleId: 'v2', registrationPlate: '29H-222.22', emptyRatio: null }),
        ],
      }),
    );

    expect(model.worstEmptyRatio.map((row) => row.plate)).toEqual(['29H-111.11']);
  });

  it('ty le null hien ra dau gach, khong phai 0%', () => {
    const base = fleetView();
    const model = toFleetInsight(
      fleetView({
        vehicles: [vehicle({ utilisation: null, emptyRatio: null })],
        totals: { ...base.totals, emptyRatio: null },
      }),
    );

    expect(model.vehicles[0]?.utilisation).toBe('—');
    expect(model.vehicles[0]?.emptyRatio).toBe('—');
    expect(model.metrics.find((metric) => metric.key === 'empty-ratio')?.value).toBe('—');
  });

  it('tat dinh', () => {
    expect(toFleetInsight(fleetView())).toEqual(toFleetInsight(fleetView()));
  });
});

describe('bao cao tuyen — hai cau cong bo phai len bang', () => {
  it('noi ro tuyen dang gom theo NHAN, khong theo dia diem co that', () => {
    const model = toCorridorInsight(corridorView());

    expect(model.groupingNote).toContain('NHÃN');
    expect(model.emptyAttributionNote).toContain('NGAY SAU');
  });

  it('moi dong mo thang sang ban do cua mot vong chay CO THAT', () => {
    const model = toCorridorInsight(corridorView());

    /* MA vong chay, khong phai `id` — quy uoc `SELECTION_QUERY_PARAM`. */
    expect(model.corridors[0]?.firstRunCode).toBe('RUN-001');
  });

  it('km rong chua tinh duoc hien ra dau gach, khong phai 0', () => {
    const model = toCorridorInsight(
      corridorView({
        corridors: [corridor({ attributedEmptyKm: null, legsMissingDistance: 1 })],
      }),
    );

    expect(model.corridors[0]?.emptyKm).toBe('—');
    expect(model.corridors[0]?.incomplete).toBe(true);
  });

  it('tuyen khong co vong chay nao thi khong bia mot duong dan', () => {
    const model = toCorridorInsight(corridorView({ corridors: [corridor({ runCodes: [] })] }));

    expect(model.corridors[0]?.firstRunCode).toBeNull();
  });

  it('tat dinh', () => {
    expect(toCorridorInsight(corridorView())).toEqual(toCorridorInsight(corridorView()));
  });
});
