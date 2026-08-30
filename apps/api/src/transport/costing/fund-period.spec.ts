import { describe, expect, it } from 'vitest';
import {
  FUND_PERIOD_STATUSES,
  evaluateFundPeriodTransition,
  isFrozenFundPeriod,
  periodCovers,
  periodsOverlap,
} from './fund-period.js';

describe('may trang thai ky quy (T1 §7.3)', () => {
  it('di dung duong OPEN -> CLOSING -> CLOSED -> REOPENED -> CLOSING', () => {
    expect(evaluateFundPeriodTransition('OPEN', 'CLOSING').allowed).toBe(true);
    expect(evaluateFundPeriodTransition('CLOSING', 'CLOSED').allowed).toBe(true);
    expect(evaluateFundPeriodTransition('CLOSED', 'REOPENED').allowed).toBe(true);
    expect(evaluateFundPeriodTransition('REOPENED', 'CLOSING').allowed).toBe(true);
  });

  it('KHONG co duong tat OPEN -> CLOSED: khong ai chot duoc ma bo qua buoc dong bang', () => {
    const decision = evaluateFundPeriodTransition('OPEN', 'CLOSED');
    expect(decision.allowed).toBe(false);
    expect(decision.allowed === false && decision.reason).toBe('PERIOD_TRANSITION_NOT_PERMITTED');
  });

  it('REOPENED khong quay ve OPEN — hai trang thai noi hai dieu khac nhau', () => {
    expect(evaluateFundPeriodTransition('REOPENED', 'OPEN').allowed).toBe(false);
    expect(evaluateFundPeriodTransition('CLOSED', 'OPEN').allowed).toBe(false);
  });

  it('chuyen sang chinh no mang MOT MA RIENG, khong phai "khong co canh"', () => {
    for (const status of FUND_PERIOD_STATUSES) {
      const decision = evaluateFundPeriodTransition(status, status);
      expect(decision.allowed, status).toBe(false);
      expect(decision.allowed === false && decision.reason, status).toBe('PERIOD_ALREADY_IN_STATE');
    }
  });

  it('ky DONG BANG tu luc BAT DAU chot, khong phai tu luc chot xong', () => {
    expect(isFrozenFundPeriod('CLOSING')).toBe(true);
    expect(isFrozenFundPeriod('CLOSED')).toBe(true);
    expect(isFrozenFundPeriod('OPEN')).toBe(false);
    expect(isFrozenFundPeriod('REOPENED')).toBe(false);
  });
});

describe('khoang ngay cua ky — HAI DAU DEU TINH', () => {
  const august = { startDate: '2026-08-01', endDate: '2026-08-31' };

  it('ngay dau va ngay cuoi ky DEU thuoc ky', () => {
    expect(periodCovers(august, '2026-08-01')).toBe(true);
    expect(periodCovers(august, '2026-08-31')).toBe(true);
    expect(periodCovers(august, '2026-08-15')).toBe(true);
  });

  it('ngoai khoang thi khong thuoc', () => {
    expect(periodCovers(august, '2026-07-31')).toBe(false);
    expect(periodCovers(august, '2026-09-01')).toBe(false);
  });

  /**
   * Cai bay kinh dien cua khoang nua mo: neu ngay cuoi ky KHONG thuoc ky, thi 01/08..31/08 va
   * 31/08..30/09 se duoc coi la khong chong lap — trong khi mot but toan ngay 31/08 roi vao ca hai.
   * EXCLUDE constraint o migration dung `'[]'` chinh vi dieu nay; bai duoi day khoa cung mot y o
   * tang TypeScript.
   */
  it('hai ky cham nhau DUNG MOT NGAY van la chong lap', () => {
    expect(periodsOverlap(august, { startDate: '2026-08-31', endDate: '2026-09-30' })).toBe(true);
  });

  it('hai ky lien nhau ma khong cham thi khong chong lap', () => {
    expect(periodsOverlap(august, { startDate: '2026-09-01', endDate: '2026-09-30' })).toBe(false);
  });

  it('mot ky nam gon trong ky kia van la chong lap', () => {
    expect(periodsOverlap(august, { startDate: '2026-08-10', endDate: '2026-08-20' })).toBe(true);
    expect(periodsOverlap({ startDate: '2026-08-10', endDate: '2026-08-20' }, august)).toBe(true);
  });
});
