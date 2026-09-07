import {
  EMPTY_VALUE,
  formatBusinessDate,
  formatBusinessDateRange,
  formatCount,
  formatMoney,
} from '../customer-view';
import type {
  DriverCashoutDetail,
  DriverSettlementBalance,
  DriverSettlementStatement,
  UnsettledWageMonth,
  WageMonth,
  WageMonthPayslip,
} from '../transport-types';
import { driverLabelOf, type AssetDirectory } from './assets';

/**
 * KHUNG NHIN cua `TX-07b`.
 *
 * MOT CAM TUYET DOI, cung cau voi `payroll.ts`: **khong mot so du nao duoc tinh o day**. Da ghi
 * nhan, da rut, con lai va hoan ung deu do may chu cong tu so cai va tra ra. Neu mot ham o day
 * nhan hai so roi cho ra mot so tien, no phai di ra — hai nguoi doc cung mot bang se ra hai con
 * so, va con so sai la con so nguoi lai xe cam ve nha.
 *
 * `formatMoney` chi DINH DANG.
 */

/* ------------------------------------------------------------------ *
 * Bon con so cua mot lai xe
 * ------------------------------------------------------------------ */

export interface SettlementBalanceRow {
  readonly driverId: string;
  readonly driverLabel: string;
  readonly creditedLabel: string;
  readonly cashedOutLabel: string;
  readonly remainingLabel: string;
  readonly reimbursementLabel: string;
  /** Con tien chua rut — de man hinh nhan manh dung nhung dong dang cho. */
  readonly hasRemaining: boolean;
  /** Cong ty con no lai xe mot khoan hoan ung. */
  readonly owesReimbursement: boolean;
}

export const toSettlementBalanceRow = (
  balance: DriverSettlementBalance,
  directory: AssetDirectory,
): SettlementBalanceRow => ({
  driverId: balance.driverId,
  driverLabel: driverLabelOf(directory, balance.driverId),
  creditedLabel: formatMoney(balance.wageCredited),
  cashedOutLabel: formatMoney(balance.wageCashedOut),
  remainingLabel: formatMoney(balance.wageRemaining),
  reimbursementLabel: formatMoney(balance.reimbursementOutstanding),
  hasRemaining: balance.wageRemaining > 0,
  owesReimbursement: balance.reimbursementOutstanding > 0,
});

export const toSettlementBalanceRows = (
  balances: readonly DriverSettlementBalance[],
  directory: AssetDirectory,
): readonly SettlementBalanceRow[] =>
  balances.map((balance) => toSettlementBalanceRow(balance, directory));

/* ------------------------------------------------------------------ *
 * Nguon goc thang
 * ------------------------------------------------------------------ */

export interface WageMonthRow {
  readonly periodId: string;
  readonly label: string;
  readonly rangeLabel: string;
  readonly creditedLabel: string;
  readonly cashedOutLabel: string;
  readonly remainingLabel: string;
  readonly payslipCountLabel: string;
  /**
   * SO CON LAI THO, va no khong phai mot ban sao thua cua `remainingLabel`.
   *
   * Bieu mau chi phai gui mot SO nguyen dong len may chu. Doc nguoc no ra tu chuoi da dinh dang la
   * mot duong hong lang le: `formatMoney` chen dau phan cach theo ngon ngu, va mot lan doi ngon
   * ngu se lam phep doc nguoc do ra mot so khac ma khong bao loi.
   */
  readonly remaining: number;
  /** Cac phieu cua ky, tung phieu mot — nguon goc thang, va dau vao cua bieu mau chi. */
  readonly payslips: readonly WageMonthPayslip[];
  /** Thang nay con tien chua rut — thang duy nhat chon duoc tren bieu mau chi. */
  readonly isDrawable: boolean;
}

export const toWageMonthRows = (months: readonly WageMonth[]): readonly WageMonthRow[] =>
  months.map((month) => ({
    periodId: month.periodId,
    label: month.periodLabel,
    rangeLabel: formatBusinessDateRange(month.startDate, month.endDate),
    creditedLabel: formatMoney(month.credited),
    cashedOutLabel: formatMoney(month.cashedOut),
    remainingLabel: formatMoney(month.remaining),
    payslipCountLabel: `${formatCount(month.payslips.length)} phiếu`,
    remaining: month.remaining,
    payslips: month.payslips,
    isDrawable: month.remaining > 0,
  }));

/**
 * BIEU MAU CHI cua mot thang -> cac dong gui len may chu.
 *
 * Mot ky co the co NHIEU phieu (ban goc + phieu bo sung), nen mot thang co the sinh NHIEU dong.
 * Ham nay KHONG quyet dinh mot khoan tien nao: no chi doc lai `remaining` ma may chu da tinh cho
 * TUNG phieu, va bo qua nhung phieu khong con du. Phep cong duy nhat o day la phep cong ma nguoi
 * doc thay ngay tren man hinh.
 *
 * KHONG chia lai so con lai cua ca thang cho cac phieu: mot phep chia o day se la mot khoan tien
 * do giao dien nghi ra, va no se lech voi so cai ngay lan dau mot phieu bi dao.
 */
export interface CashoutWageLine {
  readonly source: 'WAGE';
  readonly amount: number;
  readonly payslipId: string;
}

export const toWageLines = (month: WageMonthRow): readonly CashoutWageLine[] =>
  month.payslips
    .filter((payslip) => payslip.remaining > 0)
    .map((payslip) => ({
      source: 'WAGE' as const,
      amount: payslip.remaining,
      payslipId: payslip.payslipId,
    }));

/* ------------------------------------------------------------------ *
 * Lan chi + phan bo
 * ------------------------------------------------------------------ */

/**
 * NHAN cua mot nguon tien. `REIMBURSEMENT` KHONG duoc goi la luong o bat cu dau —
 * #237: *"Do not call reimbursement salary"*, va mot nhan sai o day la cach re nhat de dieu do
 * xay ra.
 */
export const CASHOUT_SOURCE_LABEL = {
  WAGE: 'Lương',
  REIMBURSEMENT: 'Hoàn ứng',
} as const;

export interface CashoutAllocationRow {
  readonly id: string;
  readonly sourceLabel: string;
  readonly amountLabel: string;
  /** Ma phieu luong — nguon goc thang. `EMPTY_VALUE` o dong hoan ung. */
  readonly payslipLabel: string;
  readonly isReimbursement: boolean;
}

export interface CashoutRow {
  readonly id: string;
  readonly businessDateLabel: string;
  readonly methodLabel: string;
  readonly referenceLabel: string;
  readonly totalLabel: string;
  readonly statusLabel: string;
  readonly isReversal: boolean;
  readonly isReversed: boolean;
  readonly reversalReasonLabel: string;
  readonly allocations: readonly CashoutAllocationRow[];
  /** Dao duoc khong — mot ban goc con hieu luc. */
  readonly canReverse: boolean;
}

/**
 * TONG cua mot lan chi = CONG cac dong, khong phai mot cot doc san.
 *
 * May chu co y khong luu cot tong (`INV-01`), nen man hinh cong lai o day. Day la ngoai le DUY
 * NHAT voi cau "khong tinh gi o tep nay": phep cong nay khong quyet dinh mot khoan tien nao — no
 * chi hien lai chinh nhung dong dang nam ngay ben duoi.
 */
const totalOf = (detail: DriverCashoutDetail): number =>
  detail.allocations.reduce((sum, allocation) => sum + allocation.amount, 0);

export const toCashoutRows = (cashouts: readonly DriverCashoutDetail[]): readonly CashoutRow[] =>
  cashouts.map((detail) => ({
    id: detail.cashout.id,
    businessDateLabel: formatBusinessDate(detail.cashout.businessDate),
    methodLabel: detail.cashout.method,
    referenceLabel: detail.cashout.reference ?? EMPTY_VALUE,
    totalLabel: formatMoney(totalOf(detail)),
    statusLabel:
      detail.cashout.kind === 'REVERSAL'
        ? 'Phiếu đảo'
        : detail.cashout.status === 'REVERSED'
          ? 'Đã bị đảo'
          : 'Đã chi',
    isReversal: detail.cashout.kind === 'REVERSAL',
    isReversed: detail.cashout.status === 'REVERSED',
    reversalReasonLabel: detail.cashout.reversalReason ?? EMPTY_VALUE,
    allocations: detail.allocations.map((allocation) => ({
      id: allocation.id,
      sourceLabel: CASHOUT_SOURCE_LABEL[allocation.source],
      amountLabel: formatMoney(allocation.amount),
      payslipLabel: allocation.payslipId ?? EMPTY_VALUE,
      isReimbursement: allocation.source === 'REIMBURSEMENT',
    })),
    canReverse: detail.cashout.kind === 'ORIGINAL' && detail.cashout.status === 'POSTED',
  }));

/* ------------------------------------------------------------------ *
 * Canh bao cua so quyet toan (`F-08`)
 * ------------------------------------------------------------------ */

export interface UnsettledWageRow {
  readonly periodId: string;
  readonly label: string;
  readonly remainingLabel: string;
  readonly ageLabel: string;
}

/**
 * CANH BAO, khong phai loi buoc toi.
 *
 * Chu so huu noi ro cong ty khong co tinh giu luong; lai xe co the tu chon de tien tich luy. Nen
 * cau chu o day noi mot SU THAT DEM DUOC ("da qua N ngay ke tu cuoi ky") va khong ket luan ai sai.
 */
export const toUnsettledWageRows = (
  months: readonly UnsettledWageMonth[],
): readonly UnsettledWageRow[] =>
  months.map((month) => ({
    periodId: month.periodId,
    label: month.periodLabel,
    remainingLabel: formatMoney(month.remaining),
    ageLabel: `${formatCount(month.ageDays)} ngày kể từ cuối kỳ`,
  }));

export interface SettlementStatementView {
  readonly balance: SettlementBalanceRow;
  readonly months: readonly WageMonthRow[];
  readonly cashouts: readonly CashoutRow[];
  readonly unsettled: readonly UnsettledWageRow[];
  readonly windowLabel: string;
}

export const toSettlementStatementView = (
  statement: DriverSettlementStatement,
  directory: AssetDirectory,
): SettlementStatementView => ({
  balance: toSettlementBalanceRow(statement.balance, directory),
  months: toWageMonthRows(statement.months),
  cashouts: toCashoutRows(statement.cashouts),
  unsettled: toUnsettledWageRows(statement.unsettled),
  windowLabel: `${formatCount(statement.settlementWindowDays)} ngày`,
});
