import { describe, expect, it } from 'vitest';
import type { TransportCompliancePolicy } from './asset-compliance-policy.js';
import type { MaintenancePlan, MaintenanceWorkOrder } from './asset-compliance.types.js';
import { dueOnly, evaluateDue, lastServiceOf } from './maintenance-schedule.js';

const policy: TransportCompliancePolicy = {
  expiryWarningDays: 30,
  expiryWarningDaysByType: {},
  maintenanceDueSoonKm: 500,
  maintenanceDueSoonDays: 7,
};

const plan = (overrides: Partial<MaintenancePlan> = {}): MaintenancePlan => ({
  id: 'plan-1',
  vehicleId: 'veh-1',
  name: 'Thay dau may',
  triggerKind: 'ODOMETER',
  intervalKm: 10_000,
  intervalDays: null,
  baselineOdoKm: 100_000,
  baselineDate: '2026-06-01',
  status: 'ACTIVE',
  createdBy: 'ke-toan',
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
  ...overrides,
});

const order = (overrides: Partial<MaintenanceWorkOrder> = {}): MaintenanceWorkOrder => ({
  id: 'wo-1',
  vehicleId: 'veh-1',
  planId: 'plan-1',
  status: 'COMPLETED',
  description: 'Thay dau',
  openedDate: '2026-07-01',
  openedOdoKm: 105_000,
  openedBy: 'ke-toan',
  openedAt: '2026-07-01T00:00:00.000Z',
  completedDate: '2026-07-02',
  completedOdoKm: 105_200,
  completedBy: 'ke-toan',
  completedAt: '2026-07-02T00:00:00.000Z',
  cancelledAt: null,
  cancelledBy: null,
  cancellationReason: null,
  costAmount: null,
  currencyCode: 'VND',
  costingExpenseRef: null,
  note: null,
  updatedAt: '2026-07-02T00:00:00.000Z',
  ...overrides,
});

describe('han bao duong — VT-063 "cai nao toi truoc"', () => {
  /** ACCEPTANCE 4 — den han theo km. */
  it('ACCEPTANCE 4: vuot moc km -> OVERDUE, va can cu la ODOMETER', () => {
    const due = evaluateDue(plan(), [], 111_000, '2026-09-03', policy);

    expect(due.dueAtOdoKm).toBe(110_000);
    expect(due.odoRemainingKm).toBe(-1_000);
    expect(due.state).toBe('OVERDUE');
    expect(due.reachedBy).toBe('ODOMETER');
  });

  it('ACCEPTANCE 4 (bis): con trong nguong bao truoc -> DUE_SOON', () => {
    const due = evaluateDue(plan(), [], 109_800, '2026-09-03', policy);
    expect(due.odoRemainingKm).toBe(200);
    expect(due.state).toBe('DUE_SOON');
  });

  it('con xa moc thi OK, khong lam nhieu bang canh bao', () => {
    const due = evaluateDue(plan(), [], 102_000, '2026-09-03', policy);
    expect(due.state).toBe('OK');
    expect(due.reachedBy).toBeNull();
  });

  /** ACCEPTANCE 5 — den han theo thoi gian. */
  it('ACCEPTANCE 5: vuot moc ngay -> OVERDUE, va can cu la CALENDAR', () => {
    const calendar = plan({ triggerKind: 'CALENDAR', intervalKm: null, intervalDays: 90 });
    const due = evaluateDue(calendar, [], 100_000, '2026-09-03', policy);

    expect(due.dueOnDate).toBe('2026-08-30');
    expect(due.daysRemaining).toBe(-4);
    expect(due.state).toBe('OVERDUE');
    expect(due.reachedBy).toBe('CALENDAR');
  });

  it('ACCEPTANCE 5 (bis): con vai ngay -> DUE_SOON', () => {
    const calendar = plan({ triggerKind: 'CALENDAR', intervalKm: null, intervalDays: 97 });
    const due = evaluateDue(calendar, [], 100_000, '2026-09-03', policy);
    expect(due.daysRemaining).toBe(3);
    expect(due.state).toBe('DUE_SOON');
  });
});

describe('hai truc chay doc lap, lay cai NANG hon', () => {
  /**
   * Mot xe chay it nhung lau ngay VAN phai vao xuong.
   *
   * Day la cho de sai nhat cua "cai nao toi truoc": lay truc con nhe hon se lam mot trong hai truc
   * khong bao gio phat, va loi do im lang — khong ai thay mot canh bao KHONG hien ra.
   */
  it('chay it nhung qua han ngay -> van OVERDUE', () => {
    const both = plan({
      triggerKind: 'ODOMETER_OR_CALENDAR',
      intervalKm: 10_000,
      intervalDays: 90,
    });
    const due = evaluateDue(both, [], 100_500, '2026-09-03', policy);

    expect(due.odoRemainingKm).toBe(9_500);
    expect(due.daysRemaining).toBe(-4);
    expect(due.state).toBe('OVERDUE');
    expect(due.reachedBy).toBe('CALENDAR');
  });

  it('chay nhieu nhung moi bao duong -> van OVERDUE theo km', () => {
    const both = plan({
      triggerKind: 'ODOMETER_OR_CALENDAR',
      intervalKm: 10_000,
      intervalDays: 365,
    });
    const due = evaluateDue(both, [], 111_000, '2026-09-03', policy);

    expect(due.state).toBe('OVERDUE');
    expect(due.reachedBy).toBe('ODOMETER');
  });
});

describe('moc goc tinh tu lan bao duong gan nhat', () => {
  it('lan COMPLETED cua chinh ke hoach do tro thanh moc moi', () => {
    const due = evaluateDue(plan(), [order()], 111_000, '2026-09-03', policy);

    expect(due.lastServicedOdoKm).toBe(105_200);
    expect(due.dueAtOdoKm).toBe(115_200);
    expect(due.state).toBe('OK');
  });

  /**
   * Mot lan vao thay guong KHONG duoc reset chu ky thay dau may.
   *
   * Lenh sua dot xuat (`planId = null`) la mot su kien khac han mot lan bao duong theo lich. Neu no
   * lam moc, moi lan sua vat se day han bao duong ra xa them mot chu ky — va dong co se chay qua
   * han ma bang dieu khien van bao "OK".
   */
  it('lenh sua DOT XUAT (planId = null) KHONG lam moc', () => {
    const adhoc = order({ id: 'wo-adhoc', planId: null, completedOdoKm: 108_000 });
    const due = evaluateDue(plan(), [adhoc], 111_000, '2026-09-03', policy);

    expect(due.lastServicedOdoKm).toBe(100_000);
    expect(due.state).toBe('OVERDUE');
  });

  it('lenh dang MO chua phai mot lan bao duong xong', () => {
    const open = order({
      id: 'wo-open',
      status: 'OPEN',
      completedDate: null,
      completedOdoKm: null,
    });
    expect(lastServiceOf(plan(), [open])).toEqual({ odoKm: 100_000, date: '2026-06-01' });
  });

  it('lenh da HUY khong bao gio lam moc', () => {
    const cancelled = order({ id: 'wo-x', status: 'CANCELLED' });
    expect(lastServiceOf(plan(), [cancelled])).toEqual({ odoKm: 100_000, date: '2026-06-01' });
  });

  it('hai lan dong cung ngay: lan co odo LON HON la lan sau', () => {
    const first = order({ id: 'wo-a', completedDate: '2026-07-02', completedOdoKm: 105_200 });
    const second = order({ id: 'wo-b', completedDate: '2026-07-02', completedOdoKm: 105_900 });

    expect(lastServiceOf(plan(), [first, second]).odoKm).toBe(105_900);
  });
});

describe('dueOnly — bang viec cua nguoi truc', () => {
  it('bo cac dong OK va xep OVERDUE len truoc', () => {
    const rows = [
      evaluateDue(plan({ id: 'ok' }), [], 102_000, '2026-09-03', policy),
      evaluateDue(plan({ id: 'soon' }), [], 109_800, '2026-09-03', policy),
      evaluateDue(plan({ id: 'over' }), [], 111_000, '2026-09-03', policy),
    ];

    expect(dueOnly(rows).map((row) => row.planId)).toEqual(['over', 'soon']);
  });
});
