import { describe, expect, it } from 'vitest';
import {
  evaluateCashout,
  evaluateCashoutReversal,
  foldAllocations,
  reversalPlanOf,
  type CashoutCapacity,
  type CashoutLine,
} from './cashout-allocation.js';

/**
 * `TX-07b` — CONG GHI cua mot lan chi tien cho lai xe.
 *
 * MOI duong tu choi mang mot ma RIENG. Do la yeu cau cua `.claude/rules/ecc/common/code-review.md`
 * (*"mot cong nghiep vu co N duong tu choi phai phan biet duoc N ly do"*), va o day no la dieu
 * kien de ke toan doc duoc "vi sao he thong khong cho chi" ma khong phai mo source.
 */

const capacity = (over: Partial<CashoutCapacity> = {}): CashoutCapacity => ({
  currencyCode: 'VND',
  wageRemainingByPayslip: new Map([
    ['ps-8', 10_000_000],
    ['ps-9', 11_000_000],
  ]),
  wageRemainingTotal: 21_000_000,
  reimbursementOutstanding: 1_500_000,
  ...over,
});

const wage = (payslipId: string, amount: number): CashoutLine => ({
  source: 'WAGE',
  amount,
  payslipId,
});

const reimbursement = (amount: number): CashoutLine => ({
  source: 'REIMBURSEMENT',
  amount,
  payslipId: null,
});

describe('evaluateCashout', () => {
  it('MOT lan chi phu HAI thang — dung hinh dang ma #237 doi', () => {
    const decision = evaluateCashout(
      [wage('ps-8', 10_000_000), wage('ps-9', 11_000_000)],
      capacity(),
      'VND',
    );
    expect(decision).toEqual({
      allowed: true,
      reason: 'CASHOUT_ALLOWED',
      wageTotal: 21_000_000,
      reimbursementTotal: 0,
      total: 21_000_000,
    });
  });

  it('luong VA hoan ung tren cung mot lan chi, nhung hai tong RIENG', () => {
    const decision = evaluateCashout(
      [wage('ps-8', 10_000_000), reimbursement(1_500_000)],
      capacity(),
      'VND',
    );
    expect(decision).toMatchObject({
      allowed: true,
      wageTotal: 10_000_000,
      reimbursementTotal: 1_500_000,
      total: 11_500_000,
    });
  });

  it('rut MOT PHAN mot thang la hop le', () => {
    expect(evaluateCashout([wage('ps-8', 4_000_000)], capacity(), 'VND')).toMatchObject({
      allowed: true,
      wageTotal: 4_000_000,
    });
  });

  it('khong dong nao thi khong co gi de chi', () => {
    expect(evaluateCashout([], capacity(), 'VND')).toMatchObject({
      allowed: false,
      reason: 'CASHOUT_NO_ALLOCATIONS',
    });
  });

  it.each([0, -1, 1.5])('so tien %s khong ghi duoc', (amount) => {
    expect(evaluateCashout([wage('ps-8', amount)], capacity(), 'VND')).toMatchObject({
      allowed: false,
      reason: 'CASHOUT_AMOUNT_INVALID',
    });
  });

  it('dong luong khong co phieu luong thi mat nguon goc thang', () => {
    expect(
      evaluateCashout([{ source: 'WAGE', amount: 1_000, payslipId: null }], capacity(), 'VND'),
    ).toMatchObject({ allowed: false, reason: 'CASHOUT_ALLOCATION_SHAPE_INVALID' });
  });

  it('dong hoan ung khong duoc mang phieu luong — hoan ung KHONG phai luong', () => {
    expect(
      evaluateCashout(
        [{ source: 'REIMBURSEMENT', amount: 1_000, payslipId: 'ps-8' }],
        capacity(),
        'VND',
      ),
    ).toMatchObject({ allowed: false, reason: 'CASHOUT_ALLOCATION_SHAPE_INVALID' });
  });

  it('phieu luong khong co so du ghi nhan nao thi khong rut duoc', () => {
    expect(evaluateCashout([wage('ps-KHONG-CO', 1_000)], capacity(), 'VND')).toMatchObject({
      allowed: false,
      reason: 'CASHOUT_PAYSLIP_NOT_CREDITED',
      subject: 'ps-KHONG-CO',
    });
  });

  it('cung mot phieu hai lan trong mot lan chi — gop lai se lot qua tran tung phieu', () => {
    expect(
      evaluateCashout([wage('ps-8', 6_000_000), wage('ps-8', 6_000_000)], capacity(), 'VND'),
    ).toMatchObject({ allowed: false, reason: 'CASHOUT_PAYSLIP_DUPLICATED', subject: 'ps-8' });
  });

  it('rut qua so con lai CUA MOT PHIEU', () => {
    expect(evaluateCashout([wage('ps-8', 10_000_001)], capacity(), 'VND')).toMatchObject({
      allowed: false,
      reason: 'CASHOUT_PAYSLIP_OVER_ALLOCATED',
      subject: 'ps-8',
    });
  });

  it('tung phieu deu du nhung TONG vuot so con lai cua lai xe', () => {
    // Mot phieu da bi dao lam tong cua lai xe thap hon tong cac phieu duong.
    const decision = evaluateCashout(
      [wage('ps-8', 10_000_000), wage('ps-9', 11_000_000)],
      capacity({ wageRemainingTotal: 15_000_000 }),
      'VND',
    );
    expect(decision).toMatchObject({ allowed: false, reason: 'CASHOUT_WAGE_EXCEEDS_REMAINING' });
  });

  it('hai dong hoan ung tren mot lan chi — mot but toan quy khong chia doi duoc', () => {
    expect(
      evaluateCashout([reimbursement(500_000), reimbursement(500_000)], capacity(), 'VND'),
    ).toMatchObject({ allowed: false, reason: 'CASHOUT_REIMBURSEMENT_DUPLICATED' });
  });

  it('hoan ung vuot so cong ty dang con no', () => {
    expect(evaluateCashout([reimbursement(1_500_001)], capacity(), 'VND')).toMatchObject({
      allowed: false,
      reason: 'CASHOUT_REIMBURSEMENT_EXCEEDS_OUTSTANDING',
    });
  });

  it('so quy dang DUONG thi khong co gi de hoan ung', () => {
    expect(
      evaluateCashout([reimbursement(1)], capacity({ reimbursementOutstanding: 0 }), 'VND'),
    ).toMatchObject({ allowed: false, reason: 'CASHOUT_REIMBURSEMENT_EXCEEDS_OUTSTANDING' });
  });

  it('khac don vi tien thi tu choi truoc moi phep cong', () => {
    expect(evaluateCashout([wage('ps-8', 1_000)], capacity(), 'USD')).toMatchObject({
      allowed: false,
      reason: 'CASHOUT_CURRENCY_MISMATCH',
    });
  });
});

describe('foldAllocations', () => {
  it('cong CO DAU — mot phieu dao tu tru ra, khong phai loc gi', () => {
    expect(foldAllocations([10_000_000, -10_000_000, 4_000_000])).toBe(4_000_000);
  });

  it('khong dong nao thi bang khong', () => {
    expect(foldAllocations([])).toBe(0);
  });
});

describe('evaluateCashoutReversal', () => {
  it('mot phieu goc dang hieu luc thi dao duoc', () => {
    expect(evaluateCashoutReversal('ORIGINAL', 'POSTED')).toEqual({
      allowed: true,
      reason: 'CASHOUT_REVERSAL_ALLOWED',
    });
  });

  it('phieu da bi dao thi khong dao lan hai', () => {
    expect(evaluateCashoutReversal('ORIGINAL', 'REVERSED')).toEqual({
      allowed: false,
      reason: 'CASHOUT_ALREADY_REVERSED',
    });
  });

  it('khong dao mot phieu dao — chuoi lich su phai doc duoc mot chieu', () => {
    expect(evaluateCashoutReversal('REVERSAL', 'POSTED')).toEqual({
      allowed: false,
      reason: 'CASHOUT_IS_A_REVERSAL',
    });
  });
});

describe('reversalPlanOf', () => {
  it('doi dau tung dong va giu nguyen nguon goc', () => {
    const plan = reversalPlanOf([
      { source: 'WAGE', amount: 10_000_000, payslipId: 'ps-8', driverFundEntryId: null },
      { source: 'REIMBURSEMENT', amount: 1_500_000, payslipId: null, driverFundEntryId: 'fe-1' },
    ]);
    expect(plan.wage).toEqual([{ payslipId: 'ps-8', amount: -10_000_000 }]);
    expect(plan.reimbursement).toEqual([{ reversesFundEntryId: 'fe-1', amount: -1_500_000 }]);
  });
});
