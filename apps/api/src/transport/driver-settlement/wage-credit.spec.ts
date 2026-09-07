import { describe, expect, it } from 'vitest';
import {
  WAGE_SETTLEMENT_WINDOW_DAYS,
  bearsWageCredit,
  foldWageMonths,
  unsettledBeyondWindow,
  type PostedPayslipFact,
} from './wage-credit.js';

/**
 * `TX-07b` — LUONG DA GHI NHAN doc tu chinh phieu luong, khong tu mot bang sao.
 *
 * Bo bai nay khoa hai dieu ma phan con lai cua tranche dua len:
 *
 *   1. phieu nao MANG mot khoan luong da ghi nhan (va phieu nao khong);
 *   2. mot lan dao phieu lam so da ghi nhan quay ve dung so cu — khong tru hai lan.
 *
 * Diem thu hai la cho de sai nhat trong ca tep: `issueCorrection('REVERSAL')` cua `TX-07` dua ban
 * goc sang `REVERSED` VA phat mot phieu `REVERSAL` mang net doi dau. Neu phep cong o day loai
 * `REVERSED` ra thi ban goc bien mat trong khi ban dao van con — tuc mot lai xe da duoc tra
 * 10.000.000 bong nhien "no" 10.000.000.
 */

const period = {
  periodId: 'per-08',
  periodLabel: 'Thang 8/2026',
  periodStartDate: '2026-08-01',
  periodEndDate: '2026-08-31',
  runId: 'run-08-1',
  currencyCode: 'VND',
};

const payslip = (over: Partial<PostedPayslipFact>): PostedPayslipFact => ({
  ...period,
  payslipId: 'ps-1',
  kind: 'ORIGINAL',
  status: 'APPROVED',
  netAmount: 10_000_000,
  ...over,
});

describe('bearsWageCredit', () => {
  it('mot phieu DRAFT chua mang khoan luong nao — no con sua duoc', () => {
    expect(bearsWageCredit('DRAFT')).toBe(false);
  });

  it.each(['APPROVED', 'PAID', 'REVERSED'] as const)(
    'phieu %s mang mot khoan luong da ghi nhan',
    (status) => {
      expect(bearsWageCredit(status)).toBe(true);
    },
  );
});

describe('foldWageMonths', () => {
  it('gom theo ky va giu lai ma phieu — nguon goc thang khong bi gop mat', () => {
    const months = foldWageMonths(
      [
        payslip({ payslipId: 'ps-8', netAmount: 10_000_000 }),
        payslip({
          payslipId: 'ps-9',
          periodId: 'per-09',
          periodLabel: 'Thang 9/2026',
          periodStartDate: '2026-09-01',
          periodEndDate: '2026-09-30',
          runId: 'run-09-1',
          netAmount: 11_000_000,
        }),
      ],
      new Map(),
    );

    expect(months.map((month) => month.periodId)).toEqual(['per-08', 'per-09']);
    expect(months[0]).toMatchObject({
      credited: 10_000_000,
      cashedOut: 0,
      remaining: 10_000_000,
      payslips: [{ payslipId: 'ps-8', netAmount: 10_000_000, cashedOut: 0, remaining: 10_000_000 }],
    });
    expect(months[1]?.credited).toBe(11_000_000);
  });

  it('xep ky CU truoc — thu tu ke toan doc, va thu tu tien nen duoc rut', () => {
    const months = foldWageMonths(
      [
        payslip({
          payslipId: 'ps-9',
          periodId: 'per-09',
          periodStartDate: '2026-09-01',
          periodEndDate: '2026-09-30',
        }),
        payslip({ payslipId: 'ps-8' }),
      ],
      new Map(),
    );
    expect(months.map((month) => month.periodId)).toEqual(['per-08', 'per-09']);
  });

  it('bo phieu DRAFT ra khoi so da ghi nhan', () => {
    const months = foldWageMonths([payslip({ status: 'DRAFT' })], new Map());
    expect(months).toEqual([]);
  });

  it('phieu bo sung cong them vao dung ky cua no', () => {
    const months = foldWageMonths(
      [
        payslip({ payslipId: 'ps-8' }),
        payslip({ payslipId: 'ps-8b', kind: 'SUPPLEMENTAL', netAmount: 500_000 }),
      ],
      new Map(),
    );
    expect(months[0]?.credited).toBe(10_500_000);
    expect(months[0]?.payslips.map((row) => row.payslipId)).toEqual(['ps-8', 'ps-8b']);
  });

  it('DAO mot phieu dua so da ghi nhan cua ky ve 0 — khong tru hai lan', () => {
    const months = foldWageMonths(
      [
        payslip({ payslipId: 'ps-8', status: 'REVERSED' }),
        payslip({ payslipId: 'ps-8r', kind: 'REVERSAL', netAmount: -10_000_000 }),
      ],
      new Map(),
    );
    expect(months[0]?.credited).toBe(0);
    expect(months[0]?.remaining).toBe(0);
  });

  it('tru phan da rut theo tung phieu', () => {
    const months = foldWageMonths([payslip({ payslipId: 'ps-8' })], new Map([['ps-8', 4_000_000]]));
    expect(months[0]).toMatchObject({
      credited: 10_000_000,
      cashedOut: 4_000_000,
      remaining: 6_000_000,
    });
  });
});

describe('unsettledBeyondWindow', () => {
  const months = (remaining: number, endDate: string) =>
    foldWageMonths([payslip({ periodEndDate: endDate, netAmount: remaining })], new Map());

  it('cua so mac dinh la 30 ngay — tran cham luong cua Dieu 97 k.4 BLLD 2019', () => {
    expect(WAGE_SETTLEMENT_WINDOW_DAYS).toBe(30);
  });

  it('mot ky con du va da qua cua so thi duoc goi ten, kem so ngay', () => {
    const flagged = unsettledBeyondWindow(
      months(10_000_000, '2026-08-31'),
      '2026-10-05',
      WAGE_SETTLEMENT_WINDOW_DAYS,
    );
    expect(flagged).toHaveLength(1);
    expect(flagged[0]).toMatchObject({ periodId: 'per-08', remaining: 10_000_000, ageDays: 35 });
  });

  it('van con trong cua so thi khong goi ten', () => {
    expect(unsettledBeyondWindow(months(10_000_000, '2026-08-31'), '2026-09-20', 30)).toEqual([]);
  });

  it('ky da rut het thi khong bao gio bi goi ten, du bao lau', () => {
    const paid = foldWageMonths([payslip({})], new Map([['ps-1', 10_000_000]]));
    expect(unsettledBeyondWindow(paid, '2027-01-01', 30)).toEqual([]);
  });
});
