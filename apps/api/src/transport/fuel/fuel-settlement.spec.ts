import { describe, expect, it } from 'vitest';
import {
  sameSettlementResult,
  sumAcceptedSettlement,
  type SettlementFacts,
} from './fuel-settlement.js';

/**
 * `INV-07` DUOI DANG MOT PHEP CONG — khong can mot CSDL de hoi.
 *
 * Phep cong nay quyet dinh CON SO DUY NHAT di sang T5. Truoc Issue #103 no la mot phuong thuc rieng
 * cua service va chi do duoc gian tiep qua mot bai IT tren Postgres; nay no la mot ham thuan, va
 * moi nhanh cua no do duoc thang o day.
 */

const facts = (overrides: Partial<SettlementFacts> = {}): SettlementFacts => ({
  lines: [
    { id: 'dong-khop', amount: 4_200_000 },
    { id: 'dong-chap-nhan', amount: 2_000_000 },
    { id: 'dong-bo-qua', amount: 900_000 },
    { id: 'dong-cho-sua-phieu', amount: 1_500_000 },
  ],
  matches: [{ statementLineId: 'dong-khop' }],
  discrepancies: [
    { statementLineId: 'dong-chap-nhan', resolution: 'ACCEPT_SUPPLIER_AMOUNT' },
    { statementLineId: 'dong-bo-qua', resolution: 'IGNORE_WITH_REASON' },
    { statementLineId: 'dong-cho-sua-phieu', resolution: 'ENTRY_CORRECTION_REQUIRED' },
  ],
  ...overrides,
});

describe('Tong duoc chap nhan — hai nguon, va chi hai', () => {
  it('cong dong DA KHOP va dong duoc quyet ACCEPT_SUPPLIER_AMOUNT', () => {
    expect(sumAcceptedSettlement(facts())).toEqual({
      amount: 4_200_000 + 2_000_000,
      lineCount: 2,
    });
  });

  /**
   * `INV-07` viet thanh mot phep tru: hai quyet dinh nay KHONG dua tien di tiep.
   *
   * "Bo qua co ly do" va "phieu sai, sua roi chay lai" deu la nhung cau tra loi hop le cho mot
   * chenh lech — nhung khong cau nao la mot loi hua tra tien cho cay xang.
   */
  it('IGNORE_WITH_REASON va ENTRY_CORRECTION_REQUIRED khong vao tong', () => {
    expect(sumAcceptedSettlement(facts({ matches: [] }))).toEqual({
      amount: 2_000_000,
      lineCount: 1,
    });
  });

  /** Mot dong vua khop VUA co quyet dinh chap nhan van chi duoc dem MOT lan. */
  it('khong dem hai lan mot dong vua khop vua duoc chap nhan', () => {
    const both = sumAcceptedSettlement(
      facts({
        matches: [{ statementLineId: 'dong-khop' }],
        discrepancies: [{ statementLineId: 'dong-khop', resolution: 'ACCEPT_SUPPLIER_AMOUNT' }],
      }),
    );
    expect(both).toEqual({ amount: 4_200_000, lineCount: 1 });
  });

  /**
   * Mot ky ma MOI dong deu bi tu choi van dong duoc, va ban giao cua no mang so 0.
   *
   * Do la mot ket qua that chu khong phai mot loi — `CHECK` cua bang ban giao cho phep `>= 0` dung
   * vi truong hop nay. Ep no duong se buoc nguoi doi soat bia ra mot dong de dong duoc ky.
   */
  it('khong dong nao duoc chap nhan -> tong 0, khong phai mot loi', () => {
    expect(sumAcceptedSettlement(facts({ matches: [], discrepancies: [] }))).toEqual({
      amount: 0,
      lineCount: 0,
    });
  });

  /** Dong bi tu choi luc nhap khong co so tien; no khong duoc lam ca phep cong thanh `NaN`. */
  it('dong khong co so tien duoc dem la 0 chu khong lam hong phep cong', () => {
    const withNull = sumAcceptedSettlement({
      lines: [{ id: 'dong-hong', amount: null }],
      matches: [{ statementLineId: 'dong-hong' }],
      discrepancies: [],
    });
    expect(withNull).toEqual({ amount: 0, lineCount: 1 });
  });

  /** Mot chenh lech khong gan vao dong bang ke nao (`FUEL_ENTRY_ONLY`) khong cong gi vao tong. */
  it('chenh lech khong co ve bang ke khong dua duoc tien vao tong', () => {
    const entryOnly = sumAcceptedSettlement(
      facts({
        matches: [],
        discrepancies: [{ statementLineId: null, resolution: 'ACCEPT_SUPPLIER_AMOUNT' }],
      }),
    );
    expect(entryOnly).toEqual({ amount: 0, lineCount: 0 });
  });
});

/**
 * PHEP SO SANH QUYET DINH CO PHAT MOT BAN SUA DOI HAY KHONG — Issue #103 §2.
 *
 * No CO Y chi doc hai con so. Neu no doc them `emittedAt` hay `emittedBy`, moi lan bam "dong ky" se
 * de ra mot `revision` moi, va chuoi ban sua doi bien thanh mot bo dem so lan bam nut.
 */
describe('Hai ban giao co cung ket qua kinh te khong', () => {
  it('cung so tien va cung so dong = giong nhau', () => {
    expect(
      sameSettlementResult(
        { amount: 10_000_000, lineCount: 3 },
        { amount: 10_000_000, lineCount: 3 },
      ),
    ).toBe(true);
  });

  it('khac so tien = khac', () => {
    expect(
      sameSettlementResult(
        { amount: 10_000_000, lineCount: 3 },
        { amount: 12_000_000, lineCount: 3 },
      ),
    ).toBe(false);
  });

  /**
   * CUNG tong nhung KHAC so dong van la mot ket qua khac.
   *
   * Mot dong 2 trieu bi thay bang hai dong 1 trieu cho ra cung mot so tien, nhung do la mot ban doi
   * chieu KHAC — va T5 dung so dong de doi chieu voi chung tu cua cay xang.
   */
  it('cung tong nhung khac so dong = khac', () => {
    expect(
      sameSettlementResult(
        { amount: 10_000_000, lineCount: 3 },
        { amount: 10_000_000, lineCount: 4 },
      ),
    ).toBe(false);
  });
});
