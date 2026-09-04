import { describe, expect, it } from 'vitest';
import type { MaintenanceWorkOrder } from './asset-compliance.types.js';
import {
  operationalConflictsOnly,
  resolveEffectiveVehicleState,
  type VehicleStateInput,
} from './effective-vehicle-state.js';

const order = (
  id: string,
  status: MaintenanceWorkOrder['status'] = 'OPEN',
): MaintenanceWorkOrder => ({
  id,
  vehicleId: 'veh-1',
  planId: null,
  status,
  description: 'Sua phanh',
  openedDate: '2026-09-01',
  openedOdoKm: 100_000,
  openedBy: 'ke-toan',
  openedAt: '2026-09-01T00:00:00.000Z',
  completedDate: status === 'COMPLETED' ? '2026-09-02' : null,
  completedOdoKm: status === 'COMPLETED' ? 100_050 : null,
  completedBy: status === 'COMPLETED' ? 'ke-toan' : null,
  completedAt: status === 'COMPLETED' ? '2026-09-02T00:00:00.000Z' : null,
  cancelledAt: status === 'CANCELLED' ? '2026-09-02T00:00:00.000Z' : null,
  cancelledBy: status === 'CANCELLED' ? 'ke-toan' : null,
  cancellationReason: status === 'CANCELLED' ? 'Mo nham' : null,
  costAmount: null,
  currencyCode: 'VND',
  costingExpenseRef: null,
  note: null,
  updatedAt: '2026-09-02T00:00:00.000Z',
});

const input = (overrides: Partial<VehicleStateInput> = {}): VehicleStateInput => ({
  vehicleId: 'veh-1',
  registrationPlate: '29H-12345',
  recordedStatus: 'IDLE',
  workOrders: [],
  inTransitTripIds: [],
  ...overrides,
});

describe('trang thai hieu luc cua xe — T1 §7.2 + §18.2', () => {
  /** ACCEPTANCE 6 — bao duong dang mo thi xe UNDER_MAINTENANCE. */
  it('ACCEPTANCE 6: co lenh sua dang MO -> UNDER_MAINTENANCE', () => {
    const state = resolveEffectiveVehicleState(
      input({ recordedStatus: 'UNDER_MAINTENANCE', workOrders: [order('wo-1')] }),
    );

    expect(state.effectiveStatus).toBe('UNDER_MAINTENANCE');
    expect(state.reason).toBe('MAINTENANCE_LOCK');
    expect(state.openWorkOrderIds).toEqual(['wo-1']);
    expect(state.inconsistencies).toEqual([]);
  });

  /** ACCEPTANCE 7 — xe dang chay chuyen va khong co bao duong thi ON_TRIP. */
  it('ACCEPTANCE 7: co chuyen IN_TRANSIT, khong bao duong -> ON_TRIP', () => {
    const state = resolveEffectiveVehicleState(
      input({ recordedStatus: 'ON_TRIP', inTransitTripIds: ['trip-1'] }),
    );

    expect(state.effectiveStatus).toBe('ON_TRIP');
    expect(state.reason).toBe('ACTIVE_IN_TRANSIT_TRIP');
    expect(state.inconsistencies).toEqual([]);
  });

  /** ACCEPTANCE 8 — khong bao duong, khong chuyen thi IDLE. */
  it('ACCEPTANCE 8: khong bao duong, khong chuyen -> IDLE', () => {
    const state = resolveEffectiveVehicleState(input());

    expect(state.effectiveStatus).toBe('IDLE');
    expect(state.reason).toBe('NO_ACTIVE_WORK');
    expect(state.inconsistencies).toEqual([]);
  });

  /**
   * ACCEPTANCE 9 — bao duong VA chuyen dang chay cung dung thi phat mau thuan.
   *
   * Hai khang dinh, va CA HAI deu can: bao duong THANG (mot xe dang sua khong duoc bao la san sang
   * — §18.2), va mau thuan duoc PHAT RA thay vi bi nuot. Chi giu ve dau se lam he thong noi doi mot
   * cach im lang; chi giu ve sau se lam dieu do vien dieu mot chuyen len mot chiec xe trong xuong.
   */
  it('ACCEPTANCE 9: bao duong + IN_TRANSIT -> UNDER_MAINTENANCE VA mot mau thuan tuong minh', () => {
    const state = resolveEffectiveVehicleState(
      input({
        recordedStatus: 'ON_TRIP',
        workOrders: [order('wo-1')],
        inTransitTripIds: ['trip-9'],
      }),
    );

    expect(state.effectiveStatus).toBe('UNDER_MAINTENANCE');
    expect(state.inconsistencies).toContain('MAINTENANCE_WHILE_IN_TRANSIT');
    expect(state.openWorkOrderIds).toEqual(['wo-1']);
    expect(state.inTransitTripIds).toEqual(['trip-9']);
  });
});

describe('lenh sua da dong khong con khoa xe', () => {
  it('lenh COMPLETED khong giu xe o UNDER_MAINTENANCE nua', () => {
    const state = resolveEffectiveVehicleState(
      input({ workOrders: [order('wo-1', 'COMPLETED')], inTransitTripIds: ['trip-1'] }),
    );

    expect(state.effectiveStatus).toBe('ON_TRIP');
    expect(state.openWorkOrderIds).toEqual([]);
  });

  it('lenh CANCELLED cung khong khoa xe — mot lenh mo nham phai go duoc', () => {
    const state = resolveEffectiveVehicleState(input({ workOrders: [order('wo-1', 'CANCELLED')] }));
    expect(state.effectiveStatus).toBe('IDLE');
  });
});

describe('cot dang luu duoc DOI CHIEU, khong duoc tin', () => {
  /**
   * Dung do lech ma T1 §18.2 mo ta: "xe `IDLE` trong khi chuyen da phan cong cho no dang
   * `IN_TRANSIT`". Truoc T6 khong co gi phat hien duoc no.
   */
  it('cot IDLE trong khi thuc te dang chay -> RECORDED_STATUS_STALE', () => {
    const state = resolveEffectiveVehicleState(
      input({ recordedStatus: 'IDLE', inTransitTripIds: ['trip-1'] }),
    );

    expect(state.effectiveStatus).toBe('ON_TRIP');
    expect(state.recordedStatus).toBe('IDLE');
    expect(state.inconsistencies).toContain('RECORDED_STATUS_STALE');
  });

  /**
   * HAI mau thuan la HAI dong, khong mot `boolean`.
   *
   * Mot xe vua bi phan cong nham vua co cot du lieu cu la hai viec khac nhau cho hai nguoi khac
   * nhau: dieu do vien goi xe ve, va ai do di dong bo du lieu. Gop thanh mot co se lam ca hai deu
   * khong duoc lam.
   */
  it('hai mau thuan cung luc thi ca hai deu duoc goi ten', () => {
    const state = resolveEffectiveVehicleState(
      input({
        recordedStatus: 'IDLE',
        workOrders: [order('wo-1')],
        inTransitTripIds: ['trip-1'],
      }),
    );

    expect(state.inconsistencies).toEqual([
      'MAINTENANCE_WHILE_IN_TRANSIT',
      'RECORDED_STATUS_STALE',
    ]);
  });
});

describe('operationalConflictsOnly — bang canh bao cua Giam doc', () => {
  it('chi giu mau thuan VAN HANH, bo do lech du lieu', () => {
    const conflict = resolveEffectiveVehicleState(
      input({ vehicleId: 'veh-conflict', workOrders: [order('wo-1')], inTransitTripIds: ['t'] }),
    );
    const stale = resolveEffectiveVehicleState(
      input({ vehicleId: 'veh-stale', recordedStatus: 'ON_TRIP' }),
    );

    expect(stale.inconsistencies).toEqual(['RECORDED_STATUS_STALE']);
    expect(operationalConflictsOnly([conflict, stale]).map((state) => state.vehicleId)).toEqual([
      'veh-conflict',
    ]);
  });
});
