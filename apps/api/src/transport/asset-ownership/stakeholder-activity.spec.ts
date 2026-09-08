import { describe, expect, it } from 'vitest';
import type { RunLeg, VehicleRun } from '../movement/movement.types.js';
import type { Vehicle } from '../transport.types.js';
import type { InsightRange } from '../insight/insight.types.js';
import { buildStakeholderActivity, type StakeholderDowntime } from './stakeholder-activity.js';

/**
 * BE MAT BEN HUU QUAN — PHAN HOAT DONG (`#278` N9).
 *
 * Bo bai nay khoa BON dieu ma #278 N9 doi, va ca bon deu la dieu se hong AM THAM neu khong co bai:
 * pham vi, tap truong, `null` khong phai `0`, va "chua bat tinh nang" khong duoc doc thanh "khong
 * co ngay nghi nao".
 */

const RANGE: InsightRange = { from: '2026-09-01', to: '2026-09-30', businessDays: 30 };

const vehicle = (over: Partial<Vehicle> = {}): Vehicle => ({
  id: 'v1',
  registrationPlate: '29H-111.11',
  vehicleClass: 'TRACTOR',
  allowedPayloadKg: 20000,
  currentOdoKm: 100_000,
  status: 'IDLE',
  operationalControl: 'INTERNAL_OPERATED',
  ownershipRegisterComplete: false,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  ...over,
});

const run = (over: Partial<VehicleRun> = {}): VehicleRun => ({
  id: 'r1',
  code: 'RUN-001',
  vehicleId: 'v1',
  status: 'COMPLETED',
  businessDate: '2026-09-08',
  startedAt: null,
  completedAt: null,
  note: null,
  createdAt: '2026-09-08T01:00:00.000Z',
  updatedAt: '2026-09-08T01:00:00.000Z',
  cancelledAt: null,
  cancellationReason: null,
  ...over,
});

const leg = (over: Partial<RunLeg> = {}): RunLeg => ({
  id: 'l1',
  runId: 'r1',
  sequence: 1,
  kind: 'LOADED',
  status: 'COMPLETED',
  orderId: null,
  originLabel: 'Hà Nội',
  destinationLabel: 'Hải Phòng',
  businessDate: '2026-09-08',
  distanceKm: 100,
  plannedDistanceKm: null,
  startedAt: null,
  completedAt: null,
  note: null,
  createdAt: '2026-09-08T01:00:00.000Z',
  updatedAt: '2026-09-08T01:00:00.000Z',
  ...over,
});

const downtime = (over: Partial<StakeholderDowntime> = {}): StakeholderDowntime => ({
  workOrderDays: 3,
  openWorkOrderCount: 1,
  ...over,
});

describe('pham vi — xe cua nguoi khac khong bao gio lot vao mot con so nao', () => {
  it('bo qua vong chay cua chiec xe khong nam trong danh sach truyen vao', () => {
    /*
     * Day dung tinh huong that: `InsightCoreFacts.listRuns()` tra ve MOI vong chay cua doanh
     * nghiep. Neu builder khong tu loc, km cua `v2` se cong vao bang cua nguoi chi so huu `v1`.
     */
    const view = buildStakeholderActivity({
      range: RANGE,
      vehicles: [vehicle({ id: 'v1' })],
      runs: [run({ id: 'r1', vehicleId: 'v1' }), run({ id: 'r2', vehicleId: 'v2' })],
      legsByRun: new Map([
        ['r1', [leg({ runId: 'r1', distanceKm: 100 })]],
        ['r2', [leg({ id: 'l2', runId: 'r2', distanceKm: 999 })]],
      ]),
      downtimeByVehicle: new Map(),
    });

    expect(view.vehicles).toHaveLength(1);
    expect(view.vehicles[0]?.vehicleId).toBe('v1');
    expect(view.vehicles[0]?.totalKm).toBe(100);
    expect(view.vehicles[0]?.runCount).toBe(1);
  });
});

describe('tap truong — mot truong tien khong duoc phep xuat hien o day', () => {
  it('moi dong chi mang dung nhung khoa da duoc #278 N9 cho phep', () => {
    /*
     * Bai nay la CONG THAT chan tien ro ri sang man hinh co dong. `buildFleetInsight()` co the moc
     * them truong bat cu luc nao — do la be mat cua Bang doi xe. Neu mot ngay ai do doi phep chep
     * o `stakeholder-activity.ts` thanh mot phep trai (`...vehicle`), bai nay do NGAY.
     */
    const view = buildStakeholderActivity({
      range: RANGE,
      vehicles: [vehicle()],
      runs: [run()],
      legsByRun: new Map([['r1', [leg()]]]),
      downtimeByVehicle: new Map([['v1', downtime()]]),
    });

    expect(Object.keys(view.vehicles[0] ?? {}).sort()).toEqual(
      [
        'activeBusinessDays',
        'downtime',
        'emptyKm',
        'emptyRatio',
        'legsMissingDistance',
        'loadedKm',
        'registrationPlate',
        'runCount',
        'status',
        'totalKm',
        'utilisation',
        'vehicleId',
      ].sort(),
    );
  });
});

describe('`null` khong phai `0`', () => {
  it('con mot chang thieu km thi CA BON o km ve `null` cung luc', () => {
    const view = buildStakeholderActivity({
      range: RANGE,
      vehicles: [vehicle()],
      runs: [run()],
      legsByRun: new Map([
        ['r1', [leg({ distanceKm: 100 }), leg({ id: 'l2', sequence: 2, distanceKm: null })]],
      ]),
      downtimeByVehicle: new Map(),
    });

    const row = view.vehicles[0];
    expect(row?.loadedKm).toBeNull();
    expect(row?.emptyKm).toBeNull();
    expect(row?.totalKm).toBeNull();
    expect(row?.emptyRatio).toBeNull();
    // Va noi RO con bao nhieu chang thieu, de nguoi doc biet vi sao bon o tren la dau gach.
    expect(row?.legsMissingDistance).toBe(1);
  });

  it('khoang rong cho `utilisation` bang `null`, khong phai `0`', () => {
    const view = buildStakeholderActivity({
      range: { from: '2026-09-01', to: '2026-09-01', businessDays: 0 },
      vehicles: [vehicle()],
      runs: [],
      legsByRun: new Map(),
      downtimeByVehicle: new Map(),
    });

    expect(view.vehicles[0]?.utilisation).toBeNull();
  });
});

describe('bao duong — "chua bat tinh nang" khac han "khong nghi ngay nao"', () => {
  it('khong co nang luc thi noi ra thanh loi, va o so ngay la `null`', () => {
    const view = buildStakeholderActivity({
      range: RANGE,
      vehicles: [vehicle()],
      runs: [run()],
      legsByRun: new Map([['r1', [leg()]]]),
      downtimeByVehicle: null,
    });

    expect(view.unavailableSources).toEqual(['MAINTENANCE_CAPABILITY_OFF']);
    expect(view.vehicles[0]?.downtime).toBeNull();
  });

  it('co nang luc thi KHONG bao thieu nguon, ke ca khi khong doc duoc dong nao', () => {
    // `Map` rong = co nang luc, nhung lan doc cua chiec xe nay khong ra ket qua. Khac han `null`.
    const view = buildStakeholderActivity({
      range: RANGE,
      vehicles: [vehicle()],
      runs: [run()],
      legsByRun: new Map([['r1', [leg()]]]),
      downtimeByVehicle: new Map(),
    });

    expect(view.unavailableSources).toEqual([]);
    expect(view.vehicles[0]?.downtime).toBeNull();
  });

  it('so ngay nghi di thang tu cong bao duong, khong duoc lam tron lai o day', () => {
    const view = buildStakeholderActivity({
      range: RANGE,
      vehicles: [vehicle()],
      runs: [run()],
      legsByRun: new Map([['r1', [leg()]]]),
      downtimeByVehicle: new Map([['v1', downtime({ workOrderDays: 7, openWorkOrderCount: 2 })]]),
    });

    expect(view.vehicles[0]?.downtime).toEqual({ workOrderDays: 7, openWorkOrderCount: 2 });
  });
});
