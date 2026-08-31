import { describe, expect, it } from 'vitest';
import { MONEY_MAX_AMOUNT, MoneyError } from '../money.js';
import {
  DRIVER_FUND_ENTRY_KINDS,
  LedgerSignError,
  assertExpenseSign,
  assertLedgerSign,
  foldFundBalance,
  foldTripDirectCost,
  signedAmountFor,
} from './driver-fund-ledger.js';

/**
 * LUAT DAU CUA SO CAI — bo test khoa quy uoc, khong khoa cach hien thuc.
 *
 * Vi du trung tam la vi du DUY NHAT trong T1 co tinh ra so (§9.2 + hat giong `FUND-001`). Neu ai do
 * doi quy uoc dau, bai do phai do — do la ca ly do no ton tai.
 */
describe('quy uoc dau cua but toan quy', () => {
  it('vi du cua T1 §9.2 ra dung con so cua hat giong FUND-001', () => {
    const advance = signedAmountFor('ADVANCE', 10_000_000);
    const bot = signedAmountFor('TRIP_EXPENSE', 150_000);

    expect(advance.amount).toBe(10_000_000);
    expect(bot.amount).toBe(-150_000);
    expect(foldFundBalance([advance.amount, bot.amount]).amount).toBe(9_850_000);
  });

  it('hoan tra lam so du giam, khong tang', () => {
    expect(signedAmountFor('RETURN', 2_000_000).amount).toBe(-2_000_000);
  });

  it('nguoi goi luon dua DO LON — mot so am o day la loi dau vao, khong phai mot y dinh', () => {
    expect(() => signedAmountFor('ADVANCE', -1)).toThrow(LedgerSignError);
  });

  it('ADJUSTMENT va REVERSAL khong co huong co dinh nen KHONG suy duoc tu do lon', () => {
    for (const kind of ['ADJUSTMENT', 'REVERSAL'] as const) {
      expect(() => signedAmountFor(kind, 1_000)).toThrow(LedgerSignError);
    }
  });

  it('so CO DAU sai huong bi chan o ca ba loai co huong', () => {
    expect(() => assertLedgerSign('ADVANCE', -1)).toThrow(LedgerSignError);
    expect(() => assertLedgerSign('RETURN', 1)).toThrow(LedgerSignError);
    expect(() => assertLedgerSign('TRIP_EXPENSE', 1)).toThrow(LedgerSignError);

    expect(assertLedgerSign('ADJUSTMENT', -5_000).amount).toBe(-5_000);
    expect(assertLedgerSign('ADJUSTMENT', 5_000).amount).toBe(5_000);
  });

  it('but toan 0 dong bi chan o MOI loai — mot dong 0 dong khong noi gi', () => {
    for (const kind of DRIVER_FUND_ENTRY_KINDS) {
      expect(() => assertLedgerSign(kind, 0), kind).toThrow(LedgerSignError);
    }
  });
});

describe('dau cua dong gia thanh chuyen', () => {
  it('khoan chi duong, dong dao am — do la cach tong tu tru ra', () => {
    expect(assertExpenseSign('EXPENSE', 150_000).amount).toBe(150_000);
    expect(assertExpenseSign('REVERSAL', -150_000).amount).toBe(-150_000);
  });

  it('sai huong bi chan ca hai chieu', () => {
    expect(() => assertExpenseSign('EXPENSE', -1)).toThrow(LedgerSignError);
    expect(() => assertExpenseSign('REVERSAL', 1)).toThrow(LedgerSignError);
    expect(() => assertExpenseSign('EXPENSE', 0)).toThrow(LedgerSignError);
  });

  it('mot khoan chi va dong dao cua no cong lai bang 0 — `INV-20` net ve khong', () => {
    const cost = assertExpenseSign('EXPENSE', 150_000).amount;
    const reversal = assertExpenseSign('REVERSAL', -cost).amount;
    expect(foldTripDirectCost([cost, reversal]).amount).toBe(0);
  });
});

describe('so du la TONG, va tong co bien', () => {
  it('so cai rong cho so du 0, khong phai `null`', () => {
    expect(foldFundBalance([]).amount).toBe(0);
  });

  it('SO DU AM la hop le — hat giong FUND-003, khong phai mot loi', () => {
    expect(foldFundBalance([1_000_000, -1_500_000]).amount).toBe(-500_000);
  });

  /**
   * Vi sao bai nay quan trong hon o T3 so voi T2: o day tien duoc CONG DON.
   *
   * Mot cot don le nam gon trong khoang bieu dien duoc khong bao dam gi ve TONG cua chung. Neu phep
   * cong tran lang le, so du se sai ma khong mot rang buoc `CHECK` nao cua tung hang bat duoc.
   */
  it('tong vuot khoang bieu dien duoc thi NEM, khong lang le mat chinh xac', () => {
    expect(() => foldFundBalance([MONEY_MAX_AMOUNT, 1])).toThrow(MoneyError);
  });

  it('bien duong chinh xac van cong duoc', () => {
    expect(foldFundBalance([MONEY_MAX_AMOUNT]).amount).toBe(MONEY_MAX_AMOUNT);
  });
});
