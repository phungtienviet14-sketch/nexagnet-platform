import { describe, expect, it } from 'vitest';
import { evaluateAllowanceDecision, evaluateAllowanceProposal } from './allowance-lifecycle.js';

/**
 * WA-010 — luat cua phu cap cho, do o tang HAM THUAN.
 *
 * Moi bai o day mo ta mot su that NGHIEP VU, khong mot nhanh code: mot khoang cho khong duoc tra
 * tien hai lan, nguoi duyet cat bot duoc chu khong cong them duoc, va khong ai tu duyet cho chinh
 * minh.
 */

const proposal = (over: Partial<Parameters<typeof evaluateAllowanceProposal>[0]> = {}) => ({
  sessionStatus: 'CLOSED' as const,
  existingStatuses: [],
  candidateAmount: 500_000,
  reason: 'Cho nguoi nhan 4 tieng',
  selfDealing: false,
  ...over,
});

describe('De nghi mot khoan phu cap cho — WA-010', () => {
  it('ghi duoc tren mot phien da dong', () => {
    expect(evaluateAllowanceProposal(proposal())).toEqual({
      allowed: true,
      reason: 'WAITING_ALLOWANCE_PROPOSED',
    });
  });

  /**
   * `#279` O6 dat khoan tien nay tren THOI LUONG THUC TE. Mot phien chua dong thi chua co thoi
   * luong thuc te — chi co mot con so dang chay, va no se khac con so luc nguoi duyet bam.
   */
  it('khong ghi duoc khi phien cho con dang mo', () => {
    expect(evaluateAllowanceProposal(proposal({ sessionStatus: 'OPEN' })).reason).toBe(
      'WAITING_ALLOWANCE_SESSION_STILL_OPEN',
    );
  });

  it('mot phien da co khoan duoc duyet thi khong de nghi them', () => {
    expect(evaluateAllowanceProposal(proposal({ existingStatuses: ['APPROVED'] })).reason).toBe(
      'WAITING_ALLOWANCE_ALREADY_APPROVED',
    );
  });

  it('mot phien dang co de nghi cho duyet thi khong xep hang hai cai', () => {
    expect(evaluateAllowanceProposal(proposal({ existingStatuses: ['PENDING'] })).reason).toBe(
      'WAITING_ALLOWANCE_ALREADY_PENDING',
    );
  });

  /** De nghi bi TU CHOI khong chan de nghi moi — `#279` O6 giu lich su, khong khoa cua. */
  it('mot de nghi da bi tu choi khong chan mot de nghi moi', () => {
    expect(
      evaluateAllowanceProposal(proposal({ existingStatuses: ['REJECTED', 'REJECTED'] })).allowed,
    ).toBe(true);
  });

  it('so tien phai la so nguyen duong', () => {
    for (const amount of [0, -1, 1.5, Number.NaN]) {
      expect(evaluateAllowanceProposal(proposal({ candidateAmount: amount })).reason).toBe(
        'WAITING_ALLOWANCE_AMOUNT_INVALID',
      );
    }
  });

  it('phai ghi ly do — mot con so khong ai giai thich duoc la can cu cua mot khoan tien', () => {
    expect(evaluateAllowanceProposal(proposal({ reason: '   ' })).reason).toBe(
      'WAITING_ALLOWANCE_REASON_REQUIRED',
    );
  });

  /**
   * `selfDealing` duoc kiem DAU TIEN, va do la co y: mot nguoi tu de nghi cho chinh minh phai duoc
   * bao dung dieu do, ke ca khi so tien cung sai — vi cai ho phai sua khong phai con so.
   */
  it('bao tu giao dich truoc, khong bao so tien sai', () => {
    expect(
      evaluateAllowanceProposal(proposal({ selfDealing: true, candidateAmount: -5, reason: '' }))
        .reason,
    ).toBe('WAITING_ALLOWANCE_SELF_DEALING');
  });
});

const decision = (over: Partial<Parameters<typeof evaluateAllowanceDecision>[0]> = {}) => ({
  status: 'PENDING' as const,
  outcome: 'APPROVED' as const,
  candidateAmount: 500_000,
  approvedAmount: 500_000,
  selfDealing: false,
  ...over,
});

describe('Quyet dinh mot khoan phu cap cho — WA-010', () => {
  it('duyet dung so da de nghi', () => {
    expect(evaluateAllowanceDecision(decision())).toEqual({
      allowed: true,
      reason: 'WAITING_ALLOWANCE_APPROVED',
    });
  });

  it('duyet mot so THAP HON so de nghi', () => {
    expect(evaluateAllowanceDecision(decision({ approvedAmount: 300_000 })).allowed).toBe(true);
  });

  /**
   * Nguoi duyet CAT BOT duoc, KHONG cong them duoc. Cho phep duyet cao hon se bien cong duyet
   * thanh mot duong nhap lieu thu hai — va no la duong khong ai kiem, vi nguoi kiem chinh la nguoi
   * go.
   */
  it('KHONG duyet duoc cao hon so de nghi', () => {
    expect(evaluateAllowanceDecision(decision({ approvedAmount: 500_001 })).reason).toBe(
      'WAITING_ALLOWANCE_ABOVE_CANDIDATE',
    );
  });

  it('tu choi thi khong mang so tien nao', () => {
    expect(
      evaluateAllowanceDecision(decision({ outcome: 'REJECTED', approvedAmount: null })),
    ).toEqual({ allowed: true, reason: 'WAITING_ALLOWANCE_REJECTED' });
  });

  it('duyet ma khong ghi so tien thi bi tu choi', () => {
    expect(evaluateAllowanceDecision(decision({ approvedAmount: null })).reason).toBe(
      'WAITING_ALLOWANCE_AMOUNT_INVALID',
    );
  });

  it('khong quyet lai mot de nghi da quyet', () => {
    for (const status of ['APPROVED', 'REJECTED'] as const) {
      expect(evaluateAllowanceDecision(decision({ status })).reason).toBe(
        'WAITING_ALLOWANCE_ALREADY_DECIDED',
      );
    }
  });

  it('bao tu giao dich truoc moi ma khac', () => {
    expect(
      evaluateAllowanceDecision(decision({ selfDealing: true, status: 'APPROVED' })).reason,
    ).toBe('WAITING_ALLOWANCE_SELF_DEALING');
  });
});
