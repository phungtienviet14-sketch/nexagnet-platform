import { DASH, formatBusinessDate, formatClock, formatKm, formatVnd } from '../../format';
import type { Tone } from '../../ui/Surface';
import {
  FUND_BALANCE_STANCE_LABEL,
  FUND_BALANCE_STANCE_TONE,
  FUND_ENTRY_KIND_LABEL,
  PAYSLIP_COMPONENT_SOURCE_LABEL,
  PAYSLIP_KIND_LABEL,
  PAYSLIP_STATUS_LABEL,
  PAYSLIP_STATUS_TONE,
} from './labels';
import type {
  DriverFundEntry,
  DriverFundStatement,
  DriverPayslipComponentView,
  DriverPayslipView,
  DriverSettlementSelfStatement,
} from './types';

/**
 * TIEN CUA CHINH LAI XE — quy, quyet toan, phieu luong. Port `driver-fund.ts` + `payroll.ts` web.
 *
 * LUAT DOC quan trong nhat: CHIEU cua so du doc tu `balanceStance`, KHONG tu dau cua `balance`.
 * `COMPANY_OWES_DRIVER` la "công ty đang nợ lái xe" — doc nguoc la doi soat sai ca ky, va do chinh
 * la ly do may chu tra mot truong rieng thay vi de man hinh tu suy.
 */

export interface FundBalanceModel {
  readonly balanceLabel: string;
  readonly stanceLabel: string;
  readonly tone: Tone;
  readonly hasAccount: boolean;
  readonly sentence: string;
}

export function toFundBalance(statement: DriverFundStatement): FundBalanceModel {
  const stanceLabel = FUND_BALANCE_STANCE_LABEL[statement.balanceStance] ?? statement.balanceStance;
  return {
    balanceLabel: formatVnd(Math.abs(statement.balance)),
    stanceLabel,
    tone: FUND_BALANCE_STANCE_TONE[statement.balanceStance] ?? 'neutral',
    hasAccount: statement.account !== null,
    sentence:
      statement.account === null
        ? 'Bạn chưa có phát sinh quỹ nào.'
        : `${stanceLabel}: ${formatVnd(Math.abs(statement.balance))}.`,
  };
}

/** Dien giai may viet cho phieu dau vao quy (`Phieu do dau <ma>`) -> cau nguoi doc hieu. */
const FUEL_POSTING_NOTE = /^Phieu do dau \S+$/;

export function fundEntryNote(entry: Pick<DriverFundEntry, 'kind' | 'note'>): string | null {
  if (entry.note === null || !FUEL_POSTING_NOTE.test(entry.note)) return entry.note;
  return entry.kind === 'RUN_EXPENSE'
    ? 'Tiền dầu lái xe trả tiền mặt (phiếu đổ dầu theo vòng xe)'
    : 'Tiền dầu lái xe trả tiền mặt (phiếu đổ dầu)';
}

export interface FundLedgerRow {
  readonly id: string;
  readonly kindLabel: string;
  /** So CO DAU dung nhu may chu ghi — khong dao, khong tinh lai. */
  readonly amountLabel: string;
  readonly businessDateLabel: string;
  readonly note: string | null;
  readonly isReversed: boolean;
  readonly isReversal: boolean;
}

function signed(amount: number): string {
  if (!Number.isFinite(amount)) return DASH;
  return amount < 0 ? `−${formatVnd(Math.abs(amount))}` : `+${formatVnd(amount)}`;
}

export function toFundLedgerRows(entries: readonly DriverFundEntry[]): readonly FundLedgerRow[] {
  const reversed = new Set(
    entries.flatMap((entry) => (entry.reversalOfId === null ? [] : [entry.reversalOfId])),
  );
  return entries.map((entry) => ({
    id: entry.id,
    kindLabel: FUND_ENTRY_KIND_LABEL[entry.kind] ?? entry.kind,
    amountLabel: signed(entry.signedAmount),
    businessDateLabel: formatBusinessDate(entry.businessDate),
    note: fundEntryNote(entry),
    isReversed: reversed.has(entry.id),
    isReversal: entry.reversalOfId !== null,
  }));
}

/** So dong so quy hien san tren dien thoai; phan con lai sau nut "Xem tất cả". */
export const LEDGER_PREVIEW_ROWS = 8;

export interface LedgerWindow {
  readonly rows: readonly FundLedgerRow[];
  readonly hiddenCount: number;
}

/** May chu tra so cai CU truoc (`businessDate` tang dan) — dien thoai doc MOI truoc, cat gon. */
export function ledgerWindow(rows: readonly FundLedgerRow[], showAll: boolean): LedgerWindow {
  const newest = [...rows].reverse();
  const shown = showAll ? newest : newest.slice(0, LEDGER_PREVIEW_ROWS);
  return { rows: shown, hiddenCount: newest.length - shown.length };
}

export interface SettlementFigure {
  readonly key: string;
  readonly label: string;
  readonly value: string;
}

/** BON con so — khong co so du quy tho (khong co trong khung nhin, co y). */
export function toSettlementFigures(
  statement: DriverSettlementSelfStatement,
): readonly SettlementFigure[] {
  return [
    { key: 'credited', label: 'Lương đã ghi nhận', value: formatVnd(statement.wageCredited) },
    { key: 'cashed', label: 'Lương đã nhận', value: formatVnd(statement.wageCashedOut) },
    { key: 'remaining', label: 'Lương còn lại', value: formatVnd(statement.wageRemaining) },
    {
      key: 'reimbursement',
      label: 'Công ty trả lại hoàn ứng',
      value: formatVnd(statement.reimbursementOutstanding),
    },
  ];
}

export interface PayslipComponentRow {
  readonly key: string;
  readonly label: string;
  readonly sourceLabel: string;
  readonly amountLabel: string;
  readonly isDeduction: boolean;
  readonly quantityLabel: string | null;
  readonly note: string | null;
}

export interface PayslipRow {
  readonly id: string;
  readonly periodLabel: string;
  readonly rangeLabel: string;
  readonly kindLabel: string;
  readonly statusLabel: string;
  readonly tone: Tone;
  readonly isReversed: boolean;
  readonly netLabel: string;
  readonly grossLabel: string;
  readonly deductionsLabel: string;
  readonly tripCountLabel: string;
  readonly distanceLabel: string;
  readonly approvedAtLabel: string;
  readonly paidAtLabel: string | null;
  readonly correctionReason: string | null;
  readonly components: readonly PayslipComponentRow[];
}

const count = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });

function toComponentRow(component: DriverPayslipComponentView, index: number): PayslipComponentRow {
  return {
    key: `${component.source}:${index}`,
    label: component.label,
    sourceLabel: PAYSLIP_COMPONENT_SOURCE_LABEL[component.source] ?? component.source,
    amountLabel: formatVnd(component.amount),
    isDeduction: component.kind === 'DEDUCTION',
    quantityLabel:
      component.quantity === null || component.unitAmount === null
        ? null
        : `${count.format(component.quantity)} × ${formatVnd(component.unitAmount)}`,
    note: component.note,
  };
}

export function toPayslipRow(payslip: DriverPayslipView, timeZone: string): PayslipRow {
  return {
    id: payslip.id,
    periodLabel: payslip.period.label,
    rangeLabel: `${formatBusinessDate(payslip.period.startDate)} – ${formatBusinessDate(payslip.period.endDate)}`,
    kindLabel: PAYSLIP_KIND_LABEL[payslip.kind] ?? payslip.kind,
    statusLabel: PAYSLIP_STATUS_LABEL[payslip.status] ?? payslip.status,
    tone: PAYSLIP_STATUS_TONE[payslip.status] ?? 'neutral',
    isReversed: payslip.status === 'REVERSED',
    netLabel: formatVnd(payslip.netAmount),
    grossLabel: formatVnd(payslip.grossEarnings),
    deductionsLabel: formatVnd(payslip.totalDeductions),
    tripCountLabel: Number.isFinite(payslip.tripCount) ? count.format(payslip.tripCount) : DASH,
    distanceLabel: formatKm(payslip.distanceKm),
    approvedAtLabel: formatClock(payslip.approvedAt, timeZone),
    paidAtLabel: payslip.paidAt === null ? null : formatClock(payslip.paidAt, timeZone),
    correctionReason: payslip.correctionReason,
    components: payslip.components.map(toComponentRow),
  };
}
