import {
  EMPTY_VALUE,
  PAYROLL_MISSING_INPUT_LABEL,
  PAYROLL_PERIOD_STATUS_LABEL,
  PAYSLIP_COMPONENT_SOURCE_LABEL,
  PAYSLIP_KIND_LABEL,
  PAYSLIP_STATUS_LABEL,
  formatBusinessDateRange,
  formatCount,
  formatDistance,
  formatInstant,
  formatMoney,
  payrollPeriodTone,
  payslipStatusTone,
  type StatusTone,
} from '../customer-view';
import type {
  DriverPayslipComponentView,
  DriverPayslipView,
  PayrollPeriod,
  PayrollRun,
  Payslip,
  PayslipComponent,
  PayslipDetail,
} from '../transport-types';
import { driverLabelOf, type AssetDirectory } from './assets';

/**
 * KHUNG NHIN cua `TX-07`.
 *
 * MOT CAM TUYET DOI o tep nay: **khong mot khoan luong nao duoc tinh o day**. Luong co ban, don
 * gia theo chuyen, theo km, thuong tiet kiem nhien lieu, cac khoan tru — tat ca do
 * `PayrollCalculator` o may chu tinh va chot vao `policySnapshot` cua lan chay. Neu mot ham o day
 * nhan hai so roi cho ra mot so tien, no phai di ra: hai nguoi doc cung mot phieu se ra hai con so,
 * va con so sai la con so nguoi lai xe cam ve nha.
 *
 * `formatMoney` chi DINH DANG. Cong/tru la chuyen khac.
 */

/* ------------------------------------------------------------------ *
 * Ky luong
 * ------------------------------------------------------------------ */

export interface PayrollPeriodRow {
  readonly id: string;
  readonly label: string;
  readonly rangeLabel: string;
  readonly statusLabel: string;
  readonly tone: StatusTone;
  readonly closedAtLabel: string;
  readonly isOpen: boolean;
}

export const toPayrollPeriodRows = (
  periods: readonly PayrollPeriod[],
): readonly PayrollPeriodRow[] =>
  periods.map((period) => ({
    id: period.id,
    label: period.label,
    rangeLabel: formatBusinessDateRange(period.startDate, period.endDate),
    statusLabel: PAYROLL_PERIOD_STATUS_LABEL[period.status],
    tone: payrollPeriodTone(period.status),
    closedAtLabel: formatInstant(period.closedAt),
    isOpen: period.status === 'OPEN',
  }));

/* ------------------------------------------------------------------ *
 * Lan chay
 * ------------------------------------------------------------------ */

export interface PayrollRunRow {
  readonly id: string;
  readonly sequenceLabel: string;
  readonly runAtLabel: string;
  readonly policyVersion: string;
  /** Anh chup chinh sach luc chay — mot phieu cu phai doc duoc bang don gia CUA LUC DO. */
  readonly policyLines: readonly string[];
  /** Nguon du lieu THIEU. Rong = day du. Khong duoc giau: xem chu thich cua kieu. */
  readonly missingInputs: readonly string[];
  readonly hasMissingInputs: boolean;
}

export const toPayrollRunRows = (runs: readonly PayrollRun[]): readonly PayrollRunRow[] =>
  runs.map((run) => ({
    id: run.id,
    sequenceLabel: `Lần chạy ${formatCount(run.sequence)}`,
    runAtLabel: formatInstant(run.runAt),
    policyVersion: run.policyVersion,
    policyLines: [
      `Lương cơ bản: ${formatMoney(run.policySnapshot.baseSalaryVnd)}`,
      `Theo chuyến: ${formatMoney(run.policySnapshot.perTripVnd)}`,
      `Theo km: ${formatMoney(run.policySnapshot.perKmVnd)}`,
      `Thưởng tiết kiệm nhiên liệu: ${formatMoney(run.policySnapshot.fuelSavingBonusVndPerLiter)}/lít`,
    ],
    missingInputs: run.missingInputs.map((code) => PAYROLL_MISSING_INPUT_LABEL[code]),
    hasMissingInputs: run.missingInputs.length > 0,
  }));

/* ------------------------------------------------------------------ *
 * Phieu luong — be mat VAN HANH
 * ------------------------------------------------------------------ */

export interface PayslipRow {
  readonly id: string;
  readonly driverLabel: string;
  readonly kindLabel: string;
  readonly statusLabel: string;
  readonly tone: StatusTone;
  readonly grossLabel: string;
  readonly deductionsLabel: string;
  readonly netLabel: string;
  readonly tripCountLabel: string;
  readonly distanceLabel: string;
  readonly correctionReason: string | null;
  /**
   * Ba co CHI DUA TREN VONG DOI da co o may chu. Man hinh khong tu nghi ra dieu kien nao: mot phieu
   * `DRAFT` duyet duoc, mot phieu `APPROVED` chi tra duoc, va mot phieu `PAID` chi sua duoc bang
   * phieu bu/dao (`INV-20`).
   */
  readonly canApprove: boolean;
  readonly canPay: boolean;
  readonly canCorrect: boolean;
}

const toPayslipRow = (payslip: Payslip, directory: AssetDirectory): PayslipRow => ({
  id: payslip.id,
  driverLabel: driverLabelOf(directory, payslip.driverId),
  kindLabel: PAYSLIP_KIND_LABEL[payslip.kind],
  statusLabel: PAYSLIP_STATUS_LABEL[payslip.status],
  tone: payslipStatusTone(payslip.status),
  grossLabel: formatMoney(payslip.grossEarnings),
  deductionsLabel: formatMoney(payslip.totalDeductions),
  netLabel: formatMoney(payslip.netAmount),
  tripCountLabel: formatCount(payslip.tripCount),
  distanceLabel: formatDistance(payslip.distanceKm),
  correctionReason: payslip.correctionReason,
  canApprove: payslip.status === 'DRAFT',
  canPay: payslip.status === 'APPROVED',
  canCorrect: payslip.status === 'PAID' || payslip.status === 'APPROVED',
});

export const toPayslipRows = (
  payslips: readonly Payslip[],
  directory: AssetDirectory,
): readonly PayslipRow[] => payslips.map((payslip) => toPayslipRow(payslip, directory));

export interface PayslipComponentRow {
  readonly key: string;
  readonly label: string;
  readonly sourceLabel: string;
  readonly amountLabel: string;
  /** `true` = khoan TRU. Man hinh dung no de chon dau hien thi, khong de tinh lai gi. */
  readonly isDeduction: boolean;
  readonly quantityLabel: string;
  readonly note: string | null;
}

const toComponentRow = (
  component: PayslipComponent | DriverPayslipComponentView,
  index: number,
): PayslipComponentRow => ({
  key: 'id' in component ? component.id : `${component.source}:${index}`,
  label: component.label,
  sourceLabel: PAYSLIP_COMPONENT_SOURCE_LABEL[component.source],
  amountLabel: formatMoney(component.amount),
  isDeduction: component.kind === 'DEDUCTION',
  quantityLabel:
    component.quantity === null || component.unitAmount === null
      ? EMPTY_VALUE
      : `${formatCount(component.quantity)} × ${formatMoney(component.unitAmount)}`,
  note: component.note,
});

export interface PayslipDetailModel {
  readonly row: PayslipRow;
  readonly components: readonly PayslipComponentRow[];
  readonly approvedAtLabel: string;
  readonly paidAtLabel: string;
  /** Anh chup so du quy luc duyet — de NGUOI DUYET nhin truoc khi quyet (`GD-12`). */
  readonly fundSnapshotLabel: string;
}

export const toPayslipDetail = (
  detail: PayslipDetail | null,
  directory: AssetDirectory,
): PayslipDetailModel | null =>
  detail === null
    ? null
    : {
        row: toPayslipRow(detail.payslip, directory),
        components: detail.components.map(toComponentRow),
        approvedAtLabel: formatInstant(detail.payslip.approvedAt),
        paidAtLabel: formatInstant(detail.payslip.paidAt),
        fundSnapshotLabel: formatMoney(detail.payslip.driverFundBalanceSnapshot),
      };

/* ------------------------------------------------------------------ *
 * Phieu luong — be mat LAI XE
 * ------------------------------------------------------------------ */

export interface DriverPayslipRow {
  readonly id: string;
  readonly periodLabel: string;
  readonly rangeLabel: string;
  readonly kindLabel: string;
  readonly statusLabel: string;
  readonly tone: StatusTone;
  readonly netLabel: string;
  readonly grossLabel: string;
  readonly deductionsLabel: string;
  readonly tripCountLabel: string;
  readonly distanceLabel: string;
  readonly approvedAtLabel: string;
  readonly paidAtLabel: string;
  readonly correctionReason: string | null;
  readonly components: readonly PayslipComponentRow[];
}

/**
 * KHONG co bo loc `DRAFT` o day, va do khong phai thieu sot: kieu cua may chu la
 * `Exclude<PayslipStatus,'DRAFT'>` va ham dung khung nhin tra `null` cho phieu tam tinh. Loc lai o
 * day se tao mot lop bao ve THU HAI cho cung mot luat — va den mot luc nao do hai lop se lech nhau.
 */
export const toDriverPayslipRows = (
  payslips: readonly DriverPayslipView[],
): readonly DriverPayslipRow[] =>
  payslips.map((payslip) => ({
    id: payslip.id,
    periodLabel: payslip.period.label,
    rangeLabel: formatBusinessDateRange(payslip.period.startDate, payslip.period.endDate),
    kindLabel: PAYSLIP_KIND_LABEL[payslip.kind],
    statusLabel: PAYSLIP_STATUS_LABEL[payslip.status],
    tone: payslipStatusTone(payslip.status),
    netLabel: formatMoney(payslip.netAmount),
    grossLabel: formatMoney(payslip.grossEarnings),
    deductionsLabel: formatMoney(payslip.totalDeductions),
    tripCountLabel: formatCount(payslip.tripCount),
    distanceLabel: formatDistance(payslip.distanceKm),
    approvedAtLabel: formatInstant(payslip.approvedAt),
    paidAtLabel: formatInstant(payslip.paidAt),
    correctionReason: payslip.correctionReason,
    components: payslip.components.map(toComponentRow),
  }));

/**
 * Cau giai thich cho lai xe khi mot phieu DA BI DAO van hien ra.
 *
 * Giau phieu bi dao se lam phieu dao thanh mot dong am khong co doi ung — nguoi nhan luong se thay
 * mot khoan tru khong biet tru cua cai gi.
 */
export const REVERSED_PAYSLIP_NOTE =
  'Phiếu này đã bị đảo và được thay bằng một phiếu khác. Cả hai đều hiện ở đây để đọc được toàn ' +
  'bộ chuỗi sửa.';
