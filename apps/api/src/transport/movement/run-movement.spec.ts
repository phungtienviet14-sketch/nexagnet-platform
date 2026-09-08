import { describe, expect, it } from 'vitest';
import type { RunLeg } from './movement.types.js';
import { summariseRunDistance, summariseRunMovement } from './run-distance.js';

/**
 * DA DI vs DU DINH — `#276` L6, va hai bai bat buoc cua L9:
 *
 *     bai 10  mot chang RONG da huy KHONG duoc dem vao km rong THUC TE
 *     bai 11  km chua biet o lai `null`, KHONG thanh 0
 *
 * Bai 10 co mot bay: `summariseRunDistance()` cu da loai chang huy roi, nen mot bai chi kiem
 * "chang huy khong duoc dem" se XANH ma khong chung minh duoc gi moi. Cai L6 that su doi la phan
 * biet chang DA CHAY XONG voi chang MOI CHI LA KE HOACH — va bo bai duoi day kiem dung dieu do.
 */

const AT = '2026-09-11T10:00:00.000Z';

const leg = (over: Partial<RunLeg> & Pick<RunLeg, 'id'>): RunLeg => ({
  runId: 'run-1',
  sequence: 1,
  kind: 'LOADED',
  status: 'COMPLETED',
  orderId: null,
  originLabel: 'Hà Nội',
  destinationLabel: 'Hải Phòng',
  businessDate: '2026-09-11',
  distanceKm: 100,
  plannedDistanceKm: null,
  startedAt: AT,
  completedAt: AT,
  note: null,
  createdAt: AT,
  updatedAt: AT,
  ...over,
});

describe('phep gop DA DI vs DU DINH (#276 L6)', () => {
  it('chi chang DA HOAN THANH moi vao o THUC TE', () => {
    const summary = summariseRunMovement([
      leg({ id: 'l1', kind: 'EMPTY', distanceKm: 20 }),
      leg({ id: 'l2', sequence: 2, kind: 'LOADED', distanceKm: 100 }),
      leg({ id: 'l3', sequence: 3, kind: 'EMPTY', status: 'PLANNED', plannedDistanceKm: 55 }),
    ]);
    expect(summary.actual).toMatchObject({
      loadedKm: 100,
      emptyKm: 20,
      totalKm: 120,
      complete: true,
      countedLegs: 2,
    });
    expect(summary.actual.emptyRatio).toBeCloseTo(20 / 120);
  });

  it('chang CHUA CHAY XONG vao o DU DINH, khong vao o thuc te', () => {
    const summary = summariseRunMovement([
      leg({ id: 'l1', kind: 'EMPTY', status: 'PLANNED', plannedDistanceKm: 55, completedAt: null }),
      leg({
        id: 'l2',
        sequence: 2,
        status: 'IN_TRANSIT',
        plannedDistanceKm: 120,
        completedAt: null,
      }),
    ]);
    expect(summary.actual.totalKm).toBe(0);
    expect(summary.actual.countedLegs).toBe(0);
    expect(summary.planned).toMatchObject({ emptyKm: 55, loadedKm: 120, totalKm: 175 });
  });

  it('km DU KIEN khong bao gio chay vao o THUC TE, ke ca khi chang da hoan thanh', () => {
    const summary = summariseRunMovement([
      leg({ id: 'l1', kind: 'EMPTY', distanceKm: null, plannedDistanceKm: 999 }),
    ]);
    expect(summary.actual.emptyKm).toBe(0);
    expect(summary.actual.legsMissingDistance).toEqual({ loaded: 0, empty: 1 });
    expect(summary.actual.complete).toBe(false);
  });

  it('km da ghi tren mot chang CHUA XONG chi la ky vong — no vao o du dinh', () => {
    const summary = summariseRunMovement([
      leg({ id: 'l1', status: 'PLANNED', distanceKm: 90, completedAt: null }),
    ]);
    expect(summary.planned.loadedKm).toBe(90);
    expect(summary.actual.totalKm).toBe(0);
  });

  it('bai 10 -- chang RONG da huy khong vao o nao, va duoc dem rieng', () => {
    const summary = summariseRunMovement([
      leg({ id: 'l1', kind: 'LOADED', distanceKm: 100 }),
      leg({
        id: 'l2',
        sequence: 2,
        kind: 'EMPTY',
        status: 'CANCELLED',
        distanceKm: 500,
        plannedDistanceKm: 500,
        completedAt: null,
      }),
    ]);
    expect(summary.actual.emptyKm).toBe(0);
    expect(summary.planned.emptyKm).toBe(0);
    expect(summary.cancelledLegs).toBe(1);
  });

  it('bai 11 -- km chua biet o lai `null`, va ty le KHONG duoc tinh tren du lieu khuyet', () => {
    const summary = summariseRunMovement([
      leg({ id: 'l1', kind: 'LOADED', distanceKm: 100 }),
      leg({ id: 'l2', sequence: 2, kind: 'EMPTY', distanceKm: null }),
    ]);
    expect(summary.actual.complete).toBe(false);
    expect(summary.actual.emptyRatio).toBeNull();
    expect(summary.actual.legsMissingDistance).toEqual({ loaded: 0, empty: 1 });
  });

  it('khong chang nao -> khong con so nao bi bia ra', () => {
    const summary = summariseRunMovement([]);
    expect(summary.actual).toMatchObject({ totalKm: 0, emptyRatio: null, complete: true });
    expect(summary.planned).toMatchObject({ totalKm: 0, emptyRatio: null, complete: true });
    expect(summary.cancelledLegs).toBe(0);
  });

  it('phep gop CU khong doi hanh vi — no van tra ve mot con so gop nhu truoc', () => {
    const legs = [
      leg({ id: 'l1', kind: 'LOADED', distanceKm: 100 }),
      leg({ id: 'l2', sequence: 2, kind: 'EMPTY', status: 'PLANNED', distanceKm: 20 }),
      leg({ id: 'l3', sequence: 3, kind: 'EMPTY', status: 'CANCELLED', distanceKm: 500 }),
    ];
    expect(summariseRunDistance(legs)).toMatchObject({
      loadedKm: 100,
      emptyKm: 20,
      totalKm: 120,
      countedLegs: 2,
    });
  });
});
