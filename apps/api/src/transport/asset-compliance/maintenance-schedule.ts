import {
  addBusinessDays,
  businessDateDifferenceInDays,
  type BusinessDate,
} from '../business-date.js';
import type { TransportCompliancePolicy } from './asset-compliance-policy.js';
import type {
  MaintenanceDue,
  MaintenanceDueState,
  MaintenanceDueTrigger,
  MaintenancePlan,
  MaintenanceWorkOrder,
} from './asset-compliance.types.js';

/**
 * HAN BAO DUONG — VT-063: "lich dinh ky theo km HOAC thoi gian", va `MaintenanceDue` cua T1 §5 ghi
 * ro *"cai nao toi truoc"*.
 *
 * TAT DINH VA THUAN TUY, cung ly le voi `compliance-alerts.ts`: moc den han la mot HAM cua (chu
 * ky, lan bao duong gan nhat, odo hom nay, hom nay). Luu no thanh cot se lam moi lan khach doi chu
 * ky phai viet lai lich su — va lich su bao duong la BANG CHUNG, khong phai mot ban nhap.
 *
 * MOC GOC. Lan bao duong gan nhat cua CHINH ke hoach do (`COMPLETED`) la moc; chua co lan nao thi
 * dung `baselineOdoKm`/`baselineDate` cua ke hoach. Lenh sua DOT XUAT (`planId = null`) KHONG lam
 * moc: mot lan vao thay guong khong reset chu ky thay dau may.
 */

interface ServiceBaseline {
  readonly odoKm: number;
  readonly date: BusinessDate;
}

/**
 * Lan bao duong gan nhat DA HOAN THANH cua ke hoach nay.
 *
 * "Gan nhat" xet theo `completedDate` roi den `completedOdoKm`: hai lenh dong cung ngay thi lan co
 * so odo lon hon la lan sau. Chi so sanh ngay se cho ra moc lui, va lich se den han som mot chu ky.
 */
export function lastServiceOf(
  plan: MaintenancePlan,
  workOrders: readonly MaintenanceWorkOrder[],
): ServiceBaseline {
  let best: ServiceBaseline | null = null;
  for (const order of workOrders) {
    if (order.planId !== plan.id) continue;
    if (order.status !== 'COMPLETED') continue;
    if (order.completedDate === null || order.completedOdoKm === null) continue;
    if (
      best === null ||
      order.completedDate > best.date ||
      (order.completedDate === best.date && order.completedOdoKm > best.odoKm)
    ) {
      best = { odoKm: order.completedOdoKm, date: order.completedDate };
    }
  }
  return best ?? { odoKm: plan.baselineOdoKm, date: plan.baselineDate };
}

const worst = (left: MaintenanceDueState, right: MaintenanceDueState): MaintenanceDueState => {
  if (left === 'OVERDUE' || right === 'OVERDUE') return 'OVERDUE';
  if (left === 'DUE_SOON' || right === 'DUE_SOON') return 'DUE_SOON';
  return 'OK';
};

/**
 * TRANG THAI HAN cua mot ke hoach.
 *
 * Hai truc duoc tinh DOC LAP roi lay cai NANG HON — do la cach doc dung cua "cai nao toi truoc":
 * mot xe chay it nhung da mot nam khong bao duong VAN phai vao xuong, va mot xe moi ba thang nhung
 * da chay 20.000km cung vay. Lay cai nhe hon se lam mot trong hai truc khong bao gio phat.
 */
export function evaluateDue(
  plan: MaintenancePlan,
  workOrders: readonly MaintenanceWorkOrder[],
  currentOdoKm: number,
  today: BusinessDate,
  policy: TransportCompliancePolicy,
): MaintenanceDue {
  const baseline = lastServiceOf(plan, workOrders);

  const usesOdometer = plan.triggerKind !== 'CALENDAR' && plan.intervalKm !== null;
  const usesCalendar = plan.triggerKind !== 'ODOMETER' && plan.intervalDays !== null;

  const dueAtOdoKm = usesOdometer ? baseline.odoKm + (plan.intervalKm as number) : null;
  const dueOnDate = usesCalendar
    ? addBusinessDays(baseline.date, plan.intervalDays as number)
    : null;

  const odoRemainingKm = dueAtOdoKm === null ? null : dueAtOdoKm - currentOdoKm;
  const daysRemaining = dueOnDate === null ? null : businessDateDifferenceInDays(today, dueOnDate);

  const odoState: MaintenanceDueState =
    odoRemainingKm === null
      ? 'OK'
      : odoRemainingKm < 0
        ? 'OVERDUE'
        : odoRemainingKm <= policy.maintenanceDueSoonKm
          ? 'DUE_SOON'
          : 'OK';

  const dateState: MaintenanceDueState =
    daysRemaining === null
      ? 'OK'
      : daysRemaining < 0
        ? 'OVERDUE'
        : daysRemaining <= policy.maintenanceDueSoonDays
          ? 'DUE_SOON'
          : 'OK';

  const state = worst(odoState, dateState);

  /**
   * Can cu nao "toi truoc". Khi ca hai cung o mot muc, TRUC KM duoc ghi nhan: VT-063 dat odo lam
   * can cu chinh ("canh bao dua tren odo cap nhat tu moi lan do dau"), va lich chi la luoi do
   * cho xe chay it.
   */
  const reachedBy: MaintenanceDueTrigger | null =
    state === 'OK' ? null : odoState === state ? 'ODOMETER' : 'CALENDAR';

  return {
    planId: plan.id,
    vehicleId: plan.vehicleId,
    planName: plan.name,
    triggerKind: plan.triggerKind,
    state,
    dueAtOdoKm,
    dueOnDate,
    odoRemainingKm,
    daysRemaining,
    reachedBy,
    currentOdoKm,
    lastServicedDate: baseline.date,
    lastServicedOdoKm: baseline.odoKm,
  };
}

/** Chi nhung ke hoach CAN LAM GI DO, nang truoc. */
export const dueOnly = (rows: readonly MaintenanceDue[]): readonly MaintenanceDue[] =>
  rows
    .filter((row) => row.state !== 'OK')
    .sort((left, right) => (left.state === right.state ? 0 : left.state === 'OVERDUE' ? -1 : 1));
