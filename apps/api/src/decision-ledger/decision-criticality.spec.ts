import { describe, expect, it } from 'vitest';
import { failureModeFor } from './decision-criticality.js';
import { DECISION_CRITICALITIES } from './decision-ledger.types.js';

/**
 * MUC 11 hop dong nhiem vu — chinh sach that bai phai TUONG MINH va phan biet duoc theo muc.
 *
 * Bai o day co y ngan: chung khoa BANG CHINH SACH lai, de mot lan doi vo tinh (vd "cho tat ca
 * fail-open cho don gian") do ngay thay vi lo ra o mot su co that.
 */

describe('chinh sach that bai theo muc nghiem trong', () => {
  it('tien va tham quyen thi FAIL CLOSED', () => {
    expect(failureModeFor('FINANCIAL_OR_AUTHORIZATION')).toBe('FAIL_CLOSED');
  });

  it('nghiep vu thuong thi di tiep NHUNG phai doi soat', () => {
    expect(failureModeFor('BUSINESS_STANDARD')).toBe('RECONCILE');
  });

  it('quan sat thi di tiep, khong doi soat', () => {
    expect(failureModeFor('ADVISORY')).toBe('BEST_EFFORT');
  });

  it('MOI muc deu co chinh sach — khong co muc nao roi vao mac dinh im lang', () => {
    for (const criticality of DECISION_CRITICALITIES) {
      expect(failureModeFor(criticality)).toBeDefined();
    }
  });

  it('ba muc cho ra BA hanh vi khac nhau — khong gop', () => {
    // Neu hai muc cho cung mot hanh vi thi mot trong hai la trang tri, va nguoi doc se tin rang
    // he thong phan biet chung trong khi no khong.
    const modes = new Set(DECISION_CRITICALITIES.map(failureModeFor));
    expect(modes.size).toBe(DECISION_CRITICALITIES.length);
  });
});
