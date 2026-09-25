import { describe, expect, it } from 'vitest';
import {
  fundEntryNote,
  toFundBalance,
  toFundLedgerRows,
  toPayslipRow,
  toSettlementFigures,
} from './money';
import type { DriverFundStatement, DriverPayslipView } from './types';

function statement(overrides: Partial<DriverFundStatement> = {}): DriverFundStatement {
  return {
    account: { id: 'acc' },
    balance: -1_500_000,
    balanceStance: 'COMPANY_OWES_DRIVER',
    currencyCode: 'VND',
    entries: [],
    ...overrides,
  };
}

describe('toFundBalance — chieu doc tu balanceStance, KHONG tu dau', () => {
  it('so am + COMPANY_OWES_DRIVER van la cong ty no lai xe', () => {
    const model = toFundBalance(statement());
    expect(model.stanceLabel).toBe('Công ty đang nợ lái xe');
    expect(model.balanceLabel).not.toContain('-');
    expect(model.sentence).toBe('Công ty đang nợ lái xe: 1.500.000 ₫.');
  });

  it('cung mot con so, the dung khac -> cau khac', () => {
    expect(
      toFundBalance(statement({ balanceStance: 'DRIVER_HOLDS_COMPANY_CASH' })).stanceLabel,
    ).toBe('Lái xe đang giữ tiền của công ty');
  });

  it('chua co tai khoan quy -> noi that, khong bia so', () => {
    expect(toFundBalance(statement({ account: null, balance: 0 })).sentence).toBe(
      'Bạn chưa có phát sinh quỹ nào.',
    );
  });
});

describe('toFundLedgerRows', () => {
  it('nhan loai but toan, danh dau but toan da bi dao, dich dien giai phieu dau', () => {
    const rows = toFundLedgerRows([
      {
        id: 'e1',
        kind: 'RUN_EXPENSE',
        signedAmount: -300_000,
        businessDate: '2026-09-25',
        reversalOfId: null,
        note: 'Phieu do dau fe_123',
        createdAt: 'x',
      },
      {
        id: 'e2',
        kind: 'REVERSAL',
        signedAmount: 300_000,
        businessDate: '2026-09-26',
        reversalOfId: 'e1',
        note: null,
        createdAt: 'x',
      },
    ]);
    expect(rows[0]).toMatchObject({
      kindLabel: 'Chi phí vòng xe',
      isReversed: true,
      businessDateLabel: '25/09/2026',
      note: 'Tiền dầu lái xe trả tiền mặt (phiếu đổ dầu theo vòng xe)',
    });
    expect(rows[0]?.amountLabel.startsWith('−')).toBe(true);
    expect(rows[1]).toMatchObject({
      kindLabel: 'Đảo bút toán',
      isReversal: true,
      isReversed: false,
    });
  });

  it('dien giai nguoi go tay giu nguyen', () => {
    expect(fundEntryNote({ kind: 'ADVANCE', note: 'Ứng tiền đi Hải Phòng' })).toBe(
      'Ứng tiền đi Hải Phòng',
    );
  });
});

describe('toSettlementFigures', () => {
  it('bon con so, co hoan ung', () => {
    const figures = toSettlementFigures({
      currencyCode: 'VND',
      wageCredited: 10_000_000,
      wageCashedOut: 4_000_000,
      wageRemaining: 6_000_000,
      reimbursementOutstanding: 250_000,
      reimbursementCashedOut: 0,
    });
    expect(figures.map((figure) => figure.key)).toEqual([
      'credited',
      'cashed',
      'remaining',
      'reimbursement',
    ]);
    expect(figures[3]?.value).toBe('250.000 ₫');
  });
});

describe('toPayslipRow', () => {
  const payslip: DriverPayslipView = {
    id: 'p1',
    period: { label: 'Tháng 9/2026', startDate: '2026-09-01', endDate: '2026-09-30' },
    kind: 'ORIGINAL',
    status: 'REVERSED',
    grossEarnings: 12_000_000,
    totalDeductions: 500_000,
    netAmount: 11_500_000,
    tripCount: 22,
    distanceKm: 3_450,
    correctionReason: null,
    components: [
      {
        kind: 'EARNING',
        source: 'PER_TRIP',
        label: 'Theo chuyến',
        amount: 11_000_000,
        quantity: 22,
        unitAmount: 500_000,
        note: null,
      },
      {
        kind: 'DEDUCTION',
        source: 'MANUAL_DEDUCTION',
        label: 'Tạm ứng',
        amount: 500_000,
        quantity: null,
        unitAmount: null,
        note: 'x',
      },
    ],
    approvedAt: '2026-10-01T02:00:00.000Z',
    paidAt: null,
  };

  it('phieu bi dao van hien, co danh dau; thanh phan co so luong x don gia', () => {
    const row = toPayslipRow(payslip, 'Asia/Ho_Chi_Minh');
    expect(row.statusLabel).toBe('Đã bị đảo');
    expect(row.isReversed).toBe(true);
    expect(row.rangeLabel).toBe('01/09/2026 – 30/09/2026');
    expect(row.paidAtLabel).toBeNull();
    expect(row.components[0]?.quantityLabel).toBe('22 × 500.000 ₫');
    expect(row.components[1]).toMatchObject({ isDeduction: true, quantityLabel: null });
  });
});
