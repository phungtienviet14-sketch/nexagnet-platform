import { describe, expect, it } from 'vitest';
import type {
  DriverCashoutDetail,
  DriverSettlementBalance,
  WageMonth,
} from '../../transport-types';
import {
  CASHOUT_SOURCE_LABEL,
  toCashoutRows,
  toSettlementBalanceRow,
  toWageLines,
  toWageMonthRows,
} from '../driver-settlement';

/**
 * `TX-07b` tren man hinh.
 *
 * Bo bai nay khoa BA dieu ma giao dien de lam sai nhat:
 *
 *   1. hoan ung KHONG bao gio duoc goi la luong (#237);
 *   2. mot phieu dao doc ra la phieu dao — khong lang le tron vao lich su;
 *   3. bieu mau chi gui SO THO cua may chu, khong doc nguoc mot chuoi da dinh dang.
 */

const directory = {
  vehicles: new Map<string, string>(),
  drivers: new Map([['drv-1', 'Nguyen Van Binh']]),
};

const balance: DriverSettlementBalance = {
  driverId: 'drv-1',
  currencyCode: 'VND',
  wageCredited: 33_000_000,
  wageCashedOut: 10_000_000,
  wageRemaining: 23_000_000,
  fundBalance: -1_500_000,
  fundStance: 'COMPANY_OWES_DRIVER',
  reimbursementOutstanding: 1_500_000,
  reimbursementCashedOut: 0,
};

const month: WageMonth = {
  periodId: 'per-08',
  periodLabel: 'Thang 8/2026',
  startDate: '2026-08-01',
  endDate: '2026-08-31',
  credited: 10_500_000,
  cashedOut: 4_000_000,
  remaining: 6_500_000,
  payslips: [
    { payslipId: 'ps-8', netAmount: 10_000_000, cashedOut: 4_000_000, remaining: 6_000_000 },
    { payslipId: 'ps-8b', netAmount: 500_000, cashedOut: 0, remaining: 500_000 },
  ],
};

describe('toSettlementBalanceRow', () => {
  it('goi ten lai xe, khong hien ma', () => {
    expect(toSettlementBalanceRow(balance, directory).driverLabel).toBe('Nguyen Van Binh');
  });

  it('danh dau lai xe ma cong ty con no hoan ung', () => {
    const row = toSettlementBalanceRow(balance, directory);
    expect(row.owesReimbursement).toBe(true);
    expect(row.hasRemaining).toBe(true);
  });

  it('so quy CAN thi khong con gi de hoan ung', () => {
    const row = toSettlementBalanceRow(
      { ...balance, fundBalance: 0, fundStance: 'SETTLED', reimbursementOutstanding: 0 },
      directory,
    );
    expect(row.owesReimbursement).toBe(false);
  });
});

describe('toWageMonthRows', () => {
  it('giu so THO ben canh nhan da dinh dang', () => {
    const [row] = toWageMonthRows([month]);
    expect(row?.remaining).toBe(6_500_000);
    expect(row?.payslips).toHaveLength(2);
    expect(row?.payslipCountLabel).toBe('2 phiếu');
    expect(row?.isDrawable).toBe(true);
  });

  it('thang da rut het khong chon duoc tren bieu mau chi', () => {
    const [row] = toWageMonthRows([{ ...month, cashedOut: 10_500_000, remaining: 0 }]);
    expect(row?.isDrawable).toBe(false);
  });
});

describe('toWageLines', () => {
  it('mot dong cho MOI phieu con du, lay dung so con lai cua chinh phieu do', () => {
    const [row] = toWageMonthRows([month]);
    expect(toWageLines(row!)).toEqual([
      { source: 'WAGE', amount: 6_000_000, payslipId: 'ps-8' },
      { source: 'WAGE', amount: 500_000, payslipId: 'ps-8b' },
    ]);
  });

  it('bo qua phieu da rut het — khong gui mot dong 0 dong', () => {
    const [row] = toWageMonthRows([
      {
        ...month,
        payslips: [
          { payslipId: 'ps-8', netAmount: 10_000_000, cashedOut: 10_000_000, remaining: 0 },
          { payslipId: 'ps-8b', netAmount: 500_000, cashedOut: 0, remaining: 500_000 },
        ],
      },
    ]);
    expect(toWageLines(row!)).toEqual([{ source: 'WAGE', amount: 500_000, payslipId: 'ps-8b' }]);
  });

  it('phieu mang so AM (ban dao) khong sinh dong nao', () => {
    const [row] = toWageMonthRows([
      {
        ...month,
        payslips: [
          { payslipId: 'ps-8r', netAmount: -10_000_000, cashedOut: 0, remaining: -10_000_000 },
        ],
      },
    ]);
    expect(toWageLines(row!)).toEqual([]);
  });
});

const cashout = (
  over: Partial<DriverCashoutDetail['cashout']>,
): DriverCashoutDetail['cashout'] => ({
  id: 'co-1',
  driverId: 'drv-1',
  kind: 'ORIGINAL',
  status: 'POSTED',
  businessDate: '2026-10-05',
  currencyCode: 'VND',
  method: 'BANK_TRANSFER',
  reference: 'FT-01',
  reversesId: null,
  reversalReason: null,
  note: null,
  recordedBy: 'ke-toan-a',
  createdAt: '2026-10-05T03:00:00.000Z',
  ...over,
});

describe('toCashoutRows', () => {
  it('hoan ung mang nhan RIENG, va nhan do khong phai "Lương"', () => {
    expect(CASHOUT_SOURCE_LABEL.REIMBURSEMENT).toBe('Hoàn ứng');
    expect(CASHOUT_SOURCE_LABEL.REIMBURSEMENT).not.toBe(CASHOUT_SOURCE_LABEL.WAGE);

    const [row] = toCashoutRows([
      {
        cashout: cashout({}),
        allocations: [
          {
            id: 'al-1',
            cashoutId: 'co-1',
            source: 'REIMBURSEMENT',
            amount: 1_500_000,
            payslipId: null,
            driverFundEntryId: 'fe-1',
            note: null,
            createdAt: '2026-10-05T03:00:00.000Z',
          },
        ],
      },
    ]);
    expect(row?.allocations[0]?.sourceLabel).toBe('Hoàn ứng');
    expect(row?.allocations[0]?.isReimbursement).toBe(true);
  });

  it('mot phieu DAO doc ra la phieu dao, va khong dao duoc them lan nua', () => {
    const [original, reversal] = toCashoutRows([
      { cashout: cashout({ status: 'REVERSED' }), allocations: [] },
      {
        cashout: cashout({
          id: 'co-2',
          kind: 'REVERSAL',
          reversesId: 'co-1',
          reversalReason: 'Chuyen khoan bi tra ve',
        }),
        allocations: [],
      },
    ]);

    expect(original?.canReverse).toBe(false);
    expect(original?.statusLabel).toBe('Đã bị đảo');
    expect(reversal?.canReverse).toBe(false);
    expect(reversal?.statusLabel).toBe('Phiếu đảo');
    expect(reversal?.reversalReasonLabel).toBe('Chuyen khoan bi tra ve');
  });

  it('mot lan chi con hieu luc thi dao duoc', () => {
    const [row] = toCashoutRows([{ cashout: cashout({}), allocations: [] }]);
    expect(row?.canReverse).toBe(true);
    expect(row?.statusLabel).toBe('Đã chi');
  });
});
