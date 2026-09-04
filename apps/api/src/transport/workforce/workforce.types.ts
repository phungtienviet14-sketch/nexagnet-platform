import type { BusinessDate } from '../business-date.js';

/**
 * KIEU DOC cua `transport-workforce` (`TX-07`).
 *
 * QUY UOC DON VI, khai MOT LAN o day: tien la so nguyen DONG (`GD-03`); `distanceKm` la so nguyen
 * KILOMET; `litersUnits` la MILI-LIT (ty le 3, cung thang do voi `TX-04`); moi `*Date` la NGAY
 * nghiep vu `YYYY-MM-DD` (`INV-25`).
 */

export const PAYROLL_PERIOD_STATUSES = ['OPEN', 'CLOSED'] as const;
export type PayrollPeriodStatus = (typeof PAYROLL_PERIOD_STATUSES)[number];

export const PAYSLIP_STATUSES = ['DRAFT', 'APPROVED', 'PAID', 'REVERSED'] as const;
export type PayslipStatus = (typeof PAYSLIP_STATUSES)[number];

export const PAYSLIP_KINDS = ['ORIGINAL', 'SUPPLEMENTAL', 'REVERSAL'] as const;
export type PayslipKind = (typeof PAYSLIP_KINDS)[number];

export const PAYSLIP_COMPONENT_KINDS = ['EARNING', 'DEDUCTION'] as const;
export type PayslipComponentKind = (typeof PAYSLIP_COMPONENT_KINDS)[number];

/**
 * NGUON mot thanh phan luong.
 *
 * `MANUAL_DEDUCTION` la ma DUY NHAT mang chieu tru, va no doi mot nguoi ky ten. Khong mot ma nao
 * o day sinh tu ket qua doi soat hay tu so du quy — `GD-12` + `INV-27` duoc giu bang CHINH BO TU
 * VUNG NAY, va bang rang buoc `TransportPayslipComponent_deduction_manual_only` duoi Postgres.
 */
export const PAYSLIP_COMPONENT_SOURCES = [
  'BASE_SALARY',
  'PER_TRIP',
  'PER_KM',
  'FUEL_SAVING_BONUS',
  'MANUAL_BONUS',
  'MANUAL_DEDUCTION',
] as const;
export type PayslipComponentSource = (typeof PAYSLIP_COMPONENT_SOURCES)[number];

/**
 * DAU VAO VANG MAT luc chay luong — ghi ten thay vi de ngam.
 *
 * Mot con so thieu phai doc duoc TREN PHIEU. Neu khong, mot thang khong co du lieu dau se cho ra
 * "thuong tiet kiem dau = 0" va khong ai phan biet duoc no voi "lai xe khong tiet kiem duoc lit
 * nao".
 */
export const PAYROLL_MISSING_INPUTS = [
  /** Khach khong bat `transport-fuel`, hoac ky nay khong co du lieu tieu hao tat dinh. */
  'FUEL_SAVING_UNAVAILABLE',
  /** Khach khong bat `transport-costing` — khong doc duoc so du quy de HIEN THI. */
  'DRIVER_FUND_UNAVAILABLE',
] as const;
export type PayrollMissingInput = (typeof PAYROLL_MISSING_INPUTS)[number];

export interface PayrollPeriod {
  readonly id: string;
  readonly label: string;
  readonly startDate: BusinessDate;
  readonly endDate: BusinessDate;
  readonly status: PayrollPeriodStatus;
  readonly closedAt: string | null;
  readonly closedBy: string | null;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** THAM SO LUONG da chup lai. Doc ra cung mot so mai mai, ke ca khi cau hinh doi sau do. */
export interface PayrollPolicySnapshot {
  readonly baseSalaryVnd: number;
  readonly perTripVnd: number;
  readonly perKmVnd: number;
  readonly fuelSavingBonusVndPerLiter: number;
}

export interface PayrollRun {
  readonly id: string;
  readonly periodId: string;
  readonly sequence: number;
  readonly policySnapshot: PayrollPolicySnapshot;
  readonly policyVersion: string;
  readonly missingInputs: readonly PayrollMissingInput[];
  readonly runBy: string;
  readonly runAt: string;
}

export interface PayslipComponent {
  readonly id: string;
  readonly payslipId: string;
  readonly kind: PayslipComponentKind;
  readonly source: PayslipComponentSource;
  readonly label: string;
  /** DUONG, luon. Chieu nam o `kind`. */
  readonly amount: number;
  readonly quantity: number | null;
  readonly unitAmount: number | null;
  readonly recordedBy: string | null;
  readonly note: string | null;
  readonly createdAt: string;
}

export interface Payslip {
  readonly id: string;
  readonly runId: string;
  readonly driverId: string;
  readonly kind: PayslipKind;
  readonly status: PayslipStatus;
  readonly grossEarnings: number;
  readonly totalDeductions: number;
  readonly netAmount: number;
  readonly currencyCode: string;
  /** `GD-12` — THONG TIN. `null` KHAC `0`: `null` la "khong doc duoc", `0` la "so du bang khong". */
  readonly driverFundBalanceSnapshot: number | null;
  readonly tripCount: number;
  readonly distanceKm: number;
  readonly correctsId: string | null;
  readonly correctionReason: string | null;
  readonly approvedAt: string | null;
  readonly approvedBy: string | null;
  readonly paidAt: string | null;
  readonly paidBy: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PayslipDetail {
  readonly payslip: Payslip;
  readonly components: readonly PayslipComponent[];
}
