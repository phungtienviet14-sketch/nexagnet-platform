import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { EffectiveVehicleState, MaintenanceWorkOrder } from './asset-compliance.types.js';
import { resolveEffectiveVehicleState } from './effective-vehicle-state.js';
import { evaluateDispatchReadiness, foldVehicleDowntime } from './vehicle-availability.js';

/**
 * `TX-06b` — XE NGHI BAO LAU, VA KHONG MOT CONG CHAN NAO BI BIA RA.
 *
 * Bo bai o `describe('khong bia mot cong chan nao')` la bo quan trong nhat cua tep: `Q-05` chua co
 * cau tra loi tu B, va #237 cam dung mot cong chan dieu chuyen. Neu ai do them mot ma vao
 * `blocking` ma khong co nguon, cac bai do se do — dung nhu chung duoc viet ra de lam.
 */

const order = (over: Partial<MaintenanceWorkOrder> = {}): MaintenanceWorkOrder => ({
  id: 'wo-1',
  vehicleId: 'veh-1',
  planId: null,
  kind: 'REPAIR',
  status: 'OPEN',
  description: 'Sua phanh',
  openedDate: '2027-03-01',
  openedOdoKm: 100_000,
  openedBy: 'ke-toan',
  openedAt: '2027-03-01T00:00:00.000Z',
  completedDate: null,
  completedOdoKm: null,
  completedBy: null,
  completedAt: null,
  cancelledAt: null,
  cancelledBy: null,
  cancellationReason: null,
  costAmount: null,
  currencyCode: 'VND',
  costingExpenseRef: null,
  note: null,
  updatedAt: '2027-03-01T00:00:00.000Z',
  vendorName: null,
  vendorPhone: null,
  partsCost: null,
  labourCost: null,
  evidenceLocator: null,
  tripId: null,
  plannedDate: null,
  plannedOdoKm: null,
  ...over,
});

const completed = (id: string, from: string, to: string): MaintenanceWorkOrder =>
  order({
    id,
    status: 'COMPLETED',
    openedDate: from,
    completedDate: to,
    completedOdoKm: 100_100,
    completedBy: 'ke-toan',
    completedAt: `${to}T00:00:00.000Z`,
  });

describe('foldVehicleDowntime', () => {
  it('mot lenh dong trong cung ngay van la MOT ngay xe nghi, khong phai khong', () => {
    const downtime = foldVehicleDowntime(
      'veh-1',
      [completed('wo-1', '2027-03-01', '2027-03-01')],
      '2027-03-10',
    );
    expect(downtime.spans[0]?.days).toBe(1);
    expect(downtime.totalDays).toBe(1);
    expect(downtime.openSpanCount).toBe(0);
  });

  it('lenh dang mo dem toi HOM NAY, va hom nay do nguoi goi dua vao', () => {
    const downtime = foldVehicleDowntime(
      'veh-1',
      [order({ openedDate: '2027-03-01' })],
      '2027-03-05',
    );
    expect(downtime.spans[0]).toMatchObject({ days: 5, isOpen: true, toDate: null });
    expect(downtime.openSpanCount).toBe(1);
  });

  it('lenh da HUY khong tinh — mot lenh mo nham khong lam xe nghi ngay nao', () => {
    const cancelled = order({ id: 'wo-x', status: 'CANCELLED', cancelledBy: 'ke-toan' });
    expect(foldVehicleDowntime('veh-1', [cancelled], '2027-03-10').spans).toEqual([]);
  });

  it('xep khoang theo ngay mo, cu truoc', () => {
    const downtime = foldVehicleDowntime(
      'veh-1',
      [
        completed('wo-2', '2027-03-05', '2027-03-06'),
        completed('wo-1', '2027-03-01', '2027-03-02'),
      ],
      '2027-03-10',
    );
    expect(downtime.spans.map((span) => span.workOrderId)).toEqual(['wo-1', 'wo-2']);
  });

  /**
   * Hai lenh cung mo la mot tinh huong THAT (thay dau + sua dieu hoa cung luc), va `totalDays`
   * CONG THANG. Bai nay khoa lua chon do lai: neu mot ngay nao do co nguoi them phep hop nhat
   * khoang chong lap vao chinh ham nay, hai nguoi doc cung mot bang se ra hai so.
   */
  it('hai khoang CHONG LAP duoc cong thang, khong hop nhat', () => {
    const downtime = foldVehicleDowntime(
      'veh-1',
      [
        completed('wo-1', '2027-03-01', '2027-03-03'),
        completed('wo-2', '2027-03-02', '2027-03-04'),
      ],
      '2027-03-10',
    );
    expect(downtime.totalDays).toBe(6);
  });

  it('giu ban chat cua tung lenh — mot lan chet doc duong doc ra duoc', () => {
    const downtime = foldVehicleDowntime(
      'veh-1',
      [order({ kind: 'ROADSIDE_BREAKDOWN', tripId: 'trip-1' })],
      '2027-03-02',
    );
    expect(downtime.spans[0]?.kind).toBe('ROADSIDE_BREAKDOWN');
  });
});

const stateOf = (input: {
  workOrders: readonly MaintenanceWorkOrder[];
  inTransitTripIds: readonly string[];
  recordedStatus?: 'IDLE' | 'ON_TRIP' | 'UNDER_MAINTENANCE';
}): EffectiveVehicleState =>
  resolveEffectiveVehicleState({
    vehicleId: 'veh-1',
    registrationPlate: '15C-556.33',
    recordedStatus: input.recordedStatus ?? 'UNDER_MAINTENANCE',
    workOrders: input.workOrders,
    inTransitTripIds: input.inTransitTripIds,
  });

describe('evaluateDispatchReadiness', () => {
  it('lenh sua dang mo la mot CANH BAO co ten', () => {
    const readiness = evaluateDispatchReadiness(
      stateOf({ workOrders: [order()], inTransitTripIds: [] }),
    );
    expect(readiness.warnings).toContain('VEHICLE_HAS_OPEN_WORK_ORDER');
    expect(readiness.effectiveStatus).toBe('UNDER_MAINTENANCE');
  });

  it('vua sua vua chay chuyen phat ra mot canh bao RIENG', () => {
    const readiness = evaluateDispatchReadiness(
      stateOf({ workOrders: [order()], inTransitTripIds: ['trip-1'] }),
    );
    expect(readiness.warnings).toContain('VEHICLE_MAINTENANCE_WHILE_IN_TRANSIT');
  });

  it('cot trang thai da troi khoi trang thai hieu luc cung duoc goi ten', () => {
    const readiness = evaluateDispatchReadiness(
      stateOf({ workOrders: [], inTransitTripIds: [], recordedStatus: 'UNDER_MAINTENANCE' }),
    );
    expect(readiness.warnings).toContain('VEHICLE_RECORDED_STATUS_STALE');
    expect(readiness.effectiveStatus).toBe('IDLE');
  });

  it('xe sach thi khong canh bao gi', () => {
    const readiness = evaluateDispatchReadiness(
      stateOf({ workOrders: [], inTransitTripIds: [], recordedStatus: 'IDLE' }),
    );
    expect(readiness.warnings).toEqual([]);
  });
});

/**
 * ===========================================================================
 * `Q-05` CHUA CO CAU TRA LOI, NEN `blocking` PHAI RONG.
 *
 * #237: *"Until an authoritative B rule exists for what strictly blocks dispatch, do not invent a
 * hard block."* Ba bai duoi day la cai gia phai tra neu ai do quen dieu do.
 */
describe('khong bia mot cong chan nao', () => {
  it('xe vua co lenh sua mo vua dang chay chuyen VAN khong bi chan', () => {
    const readiness = evaluateDispatchReadiness(
      stateOf({ workOrders: [order()], inTransitTripIds: ['trip-1'] }),
    );
    expect(readiness.warnings.length).toBeGreaterThan(0);
    expect(readiness.blocking).toEqual([]);
  });

  it('khong cau hinh nao lam `blocking` khac rong — ham chi nhan MOT tham so', () => {
    expect(evaluateDispatchReadiness.length).toBe(1);
  });

  /**
   * PHEP DO O TANG MA NGUON, khong o tang hanh vi.
   *
   * `evaluateTripTransition()` la cong DUY NHAT quyet mot lan chuyen trang thai chuyen. Neu mot
   * ngay nao do no bat dau doc trang thai xe hay lenh sua, thi mot cong chan da ra doi ma khong ai
   * tuyen bo — va bai nay do truoc khi dieu do di vao mot ban phat hanh.
   */
  it('may trang thai chuyen KHONG doc mot khai niem bao duong nao', () => {
    const lifecycle = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '../trips/trip-lifecycle.ts'),
      'utf8',
    );
    expect(lifecycle).not.toMatch(/maintenance/i);
    expect(lifecycle).not.toMatch(/UNDER_MAINTENANCE/);
    expect(lifecycle).not.toMatch(/workOrder/i);
  });
});
