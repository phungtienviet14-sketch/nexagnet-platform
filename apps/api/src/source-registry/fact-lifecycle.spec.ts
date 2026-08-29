import { describe, expect, it } from 'vitest';
import {
  canUseFact,
  evaluateFactTransition,
  FACT_STATUSES,
  isUsableFactStatus,
  type FactTransitionContext,
  type FactUsageContext,
} from './fact-lifecycle.js';

const ready: FactTransitionContext = {
  sourceEffective: true,
  hasExplicitApproval: true,
  approvalIsCustomerConfirmed: true,
  hasAssumptionEvidence: true,
  hasSupersedingFact: true,
};

const usable: FactUsageContext = {
  status: 'CONFIRMED',
  classification: 'INTERNAL',
  hasOpenBlockingConflict: false,
  required: 'CONFIRMED_ONLY',
  withinEffectiveWindow: true,
};

describe('su that khong duoc vuot len truoc nguon cua chinh no', () => {
  it('khong CONFIRMED duoc khi nguon chua co hieu luc', () => {
    expect(
      evaluateFactTransition('PROPOSED', 'CONFIRMED', { ...ready, sourceEffective: false }),
    ).toEqual({ allowed: false, reason: 'FACT_SOURCE_NOT_EFFECTIVE' });
  });

  it('khong CONFIRMED duoc khi khong co phe duyet tuong minh', () => {
    expect(
      evaluateFactTransition('PROPOSED', 'CONFIRMED', { ...ready, hasExplicitApproval: false })
        .reason,
    ).toBe('FACT_APPROVAL_MISSING');
  });
});

// TRONG TAM CUA CA TEP NAY.
//
// Ultty dang chay that tren ba gia dinh do CHINH CHUNG TA dat ra (`ASM-01..03`) vi chua hoi duoc
// khach. Hai bai duoi khoa hai dieu khac nhau, va thieu cai nao thi mo hinh cung noi doi:
//   1. mot gia dinh phai mang du bon truong — khong thi no la quyet dinh vinh vien khong ai ky;
//   2. mot gia dinh KHONG tu troi thanh su that cua khach bang mot lan duyet noi bo.
describe('gia dinh lam viec — phai phan biet duoc voi su that da xac nhan', () => {
  it('danh dau gia dinh ma thieu ly do/rui ro/dao nguoc/chu so huu thi bi tu choi', () => {
    expect(
      evaluateFactTransition('PROPOSED', 'WORKING_ASSUMPTION', {
        ...ready,
        hasAssumptionEvidence: false,
      }),
    ).toEqual({ allowed: false, reason: 'FACT_ASSUMPTION_EVIDENCE_MISSING' });
  });

  it('du bon truong thi ghi nhan duoc', () => {
    expect(evaluateFactTransition('PROPOSED', 'WORKING_ASSUMPTION', ready).allowed).toBe(true);
  });

  it('gia dinh KHONG thanh su that bang mot lan duyet NOI BO', () => {
    expect(
      evaluateFactTransition('WORKING_ASSUMPTION', 'CONFIRMED', {
        ...ready,
        approvalIsCustomerConfirmed: false,
      }),
    ).toEqual({ allowed: false, reason: 'FACT_ASSUMPTION_NEEDS_CUSTOMER_CONFIRMATION' });
  });

  it('gia dinh thanh su that khi va chi khi KHACH xac nhan', () => {
    expect(evaluateFactTransition('WORKING_ASSUMPTION', 'CONFIRMED', ready).allowed).toBe(true);
  });

  it('gia dinh va su that da xac nhan la HAI trang thai khac nhau, ca hai deu dung duoc', () => {
    expect(isUsableFactStatus('WORKING_ASSUMPTION')).toBe(true);
    expect(isUsableFactStatus('CONFIRMED')).toBe(true);
    expect(isUsableFactStatus('PROPOSED')).toBe(false);
  });
});

describe('lich su khong bi ghi de', () => {
  it('SUPERSEDED can chi ro ban nao thay the', () => {
    expect(
      evaluateFactTransition('CONFIRMED', 'SUPERSEDED', { ...ready, hasSupersedingFact: false })
        .reason,
    ).toBe('FACT_SUPERSEDER_MISSING');
  });

  it('ban da thay the la diem cuoi', () => {
    for (const to of FACT_STATUSES) {
      if (to === 'SUPERSEDED') continue;
      expect(evaluateFactTransition('SUPERSEDED', to, ready).reason).toBe('FACT_ALREADY_TERMINAL');
    }
  });
});

describe('canUseFact — cong runtime, tra ve ma chu khong phai boolean', () => {
  it('de xuat chua duyet thi khong dung duoc', () => {
    expect(canUseFact({ ...usable, status: 'PROPOSED' })).toEqual({
      allowed: false,
      reason: 'FACT_NOT_APPROVED',
    });
  });

  it('ban da bi thay the thi khong dung duoc', () => {
    expect(canUseFact({ ...usable, status: 'SUPERSEDED' }).reason).toBe('FACT_NO_LONGER_EFFECTIVE');
  });

  it('ngoai cua so hieu luc thi khong dung duoc', () => {
    expect(canUseFact({ ...usable, withinEffectiveWindow: false }).reason).toBe(
      'FACT_OUTSIDE_EFFECTIVE_WINDOW',
    );
  });

  // FAIL-SAFE: co xung dot dang mo thi DUNG LAI, khong chon ben nao. Day la cho "khong co ke
  // thang im lang" duoc thi hanh o tang runtime.
  it('xung dot dang mo chan ca su that DA XAC NHAN', () => {
    expect(
      canUseFact({ ...usable, status: 'CONFIRMED', hasOpenBlockingConflict: true }),
    ).toEqual({ allowed: false, reason: 'FACT_BLOCKED_BY_OPEN_CONFLICT' });
  });

  it('viec doi su that da xac nhan thi tu choi mot gia dinh', () => {
    expect(
      canUseFact({ ...usable, status: 'WORKING_ASSUMPTION', required: 'CONFIRMED_ONLY' }),
    ).toEqual({ allowed: false, reason: 'FACT_IS_WORKING_ASSUMPTION' });
  });

  it('viec chap nhan chay tren gia dinh thi dung duoc gia dinh', () => {
    expect(
      canUseFact({ ...usable, status: 'WORKING_ASSUMPTION', required: 'ASSUMPTION_ALLOWED' }),
    ).toEqual({ allowed: true, reason: 'FACT_USABLE' });
  });

  // Thu tu kiem tra la mot HOP DONG, khong phai chi tiet hien thuc: mot su that da bi bac bo phai
  // bao "khong con hieu luc", KHONG duoc bao "dang co xung dot" — nguoi doc se di sai huong.
  it('trang thai duoc xet TRUOC xung dot', () => {
    expect(
      canUseFact({ ...usable, status: 'REJECTED', hasOpenBlockingConflict: true }).reason,
    ).toBe('FACT_NO_LONGER_EFFECTIVE');
  });
});
