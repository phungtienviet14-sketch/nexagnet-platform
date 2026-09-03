import type { BusinessDate } from '../business-date.js';
import type { PayslipComponentDraft } from './payroll-calculator.js';
import type {
  Payslip,
  PayslipDetail,
  PayslipStatus,
  PayrollMissingInput,
  PayrollPeriod,
  PayrollPolicySnapshot,
  PayrollRun,
} from './workforce.types.js';

export interface OpenPayrollPeriodInput {
  readonly label: string;
  readonly startDate: BusinessDate;
  readonly endDate: BusinessDate;
  readonly createdBy: string;
}

export interface ClosePayrollPeriodInput {
  readonly closedBy: string;
  readonly closedAt: Date;
}

/** Mot phieu se duoc ghi trong lan chay — ban ve, chua co `id`. */
export interface PayslipWriteInput {
  readonly driverId: string;
  readonly kind: Payslip['kind'];
  readonly correctsId: string | null;
  readonly correctionReason: string | null;
  readonly grossEarnings: number;
  readonly totalDeductions: number;
  readonly netAmount: number;
  readonly driverFundBalanceSnapshot: number | null;
  readonly tripCount: number;
  readonly distanceKm: number;
  readonly components: readonly PayslipComponentDraft[];
}

export interface RecordPayrollRunInput {
  readonly periodId: string;
  readonly policySnapshot: PayrollPolicySnapshot;
  readonly policyVersion: string;
  readonly missingInputs: readonly PayrollMissingInput[];
  readonly runBy: string;
  readonly payslips: readonly PayslipWriteInput[];
}

/**
 * MOT lan chay = MOT lan ghi.
 *
 * `RECORDED` mang ca `run` lan cac phieu vi nguoi goi can ca hai ngay, va mot lan doc lai sau do
 * se doc phai trang thai da bi nguoi khac doi.
 */
export type RecordPayrollRunOutcome =
  | { readonly kind: 'RECORDED'; readonly run: PayrollRun; readonly payslips: readonly Payslip[] }
  | { readonly kind: 'PERIOD_NOT_FOUND' }
  | { readonly kind: 'PERIOD_CLOSED' };

export interface TransitionPayslipInput {
  readonly to: PayslipStatus;
  readonly actor: string;
  readonly at: Date;
}

/**
 * `REJECTED` mang trang thai HIEN TAI doc duoc TU HANG DA KHOA, khong tu mot lan doc truoc do —
 * do la khac biet giua "toi tuong no o day" va "no dang o day".
 */
export type TransitionPayslipOutcome =
  | { readonly kind: 'MOVED'; readonly payslip: Payslip }
  | { readonly kind: 'REJECTED'; readonly current: PayslipStatus }
  | { readonly kind: 'NOT_FOUND' };

export interface IssueCorrectionInput {
  readonly correctsId: string;
  readonly runId: string;
  readonly reason: string;
  readonly actor: string;
  readonly payslip: PayslipWriteInput;
}

export type IssueCorrectionOutcome =
  | { readonly kind: 'ISSUED'; readonly payslip: Payslip }
  | { readonly kind: 'NOT_CORRECTABLE'; readonly current: PayslipStatus }
  | { readonly kind: 'ALREADY_REVERSED' }
  | { readonly kind: 'NOT_FOUND' };

/**
 * Kho cua `TX-07`.
 *
 * KHONG co ham nao SUA mot phieu da chot. Do khong phai thieu sot — do la `INV-20` duoc dat bang
 * hinh dang cua chinh giao dien nay: khong cung cap cai nut do o tang kho thi khong ai bam nham.
 * Duong sua duy nhat la `issueCorrection()`, va no GHI THEM chu khong ghi de.
 *
 * KHONG co ham nao doc bang cua capability khac. Chuyen, lai xe va so du quy den qua
 * `workforce.ports.ts`, va cac cong o do khong co mot ham ghi nao.
 */
export abstract class WorkforceRepository {
  abstract openPeriod(input: OpenPayrollPeriodInput): Promise<PayrollPeriod | null>;
  abstract closePeriod(id: string, input: ClosePayrollPeriodInput): Promise<PayrollPeriod | null>;
  abstract findPeriod(id: string): Promise<PayrollPeriod | null>;
  abstract listPeriods(): Promise<PayrollPeriod[]>;

  /** Mot lan chay va TAT CA phieu cua no, ghi trong MOT giao dich. */
  abstract recordRun(input: RecordPayrollRunInput): Promise<RecordPayrollRunOutcome>;
  abstract findRun(id: string): Promise<PayrollRun | null>;
  abstract listRuns(periodId: string): Promise<PayrollRun[]>;

  abstract findPayslip(id: string): Promise<PayslipDetail | null>;
  abstract listPayslips(runId: string): Promise<PayslipDetail[]>;
  abstract listPayslipsByDriver(driverId: string): Promise<PayslipDetail[]>;
  abstract transitionPayslip(
    id: string,
    from: PayslipStatus,
    input: TransitionPayslipInput,
  ): Promise<TransitionPayslipOutcome>;
  abstract issueCorrection(input: IssueCorrectionInput): Promise<IssueCorrectionOutcome>;
}
