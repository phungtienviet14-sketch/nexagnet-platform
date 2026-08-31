import { describe, expect, it } from 'vitest';
import {
  DATA_CLASSIFICATIONS,
  evaluateApproval,
  evaluateSourceTransition,
  INITIAL_SOURCE_STATUS,
  isTelemetrySafeClassification,
  requiresPrivateVault,
  SOURCE_STATUSES,
  type SourceTransitionContext,
} from './source-lifecycle.js';

/** Nguon "day du" — dat cho moi cong deu mo, roi tung bai TAT DI dung mot dieu kien. */
const complete: SourceTransitionContext = {
  origin: 'CUSTOMER_SIGNED',
  hasExplicitApproval: true,
  hasContentHash: true,
  hasLocator: true,
  hasEffectiveFrom: true,
  hasSupersedingSource: true,
};

describe('vong doi nguon — bon bat bien', () => {
  it('bat dau o RECEIVED', () => {
    expect(INITIAL_SOURCE_STATUS).toBe('RECEIVED');
  });

  // "TAI LEN ≠ DA DUYET". Day la bai quan trong nhat cua tep: no khoa mot canh KHONG duoc phep
  // ton tai. Neu ai do them `RECEIVED -> EFFECTIVE` vao do thi cai gia phai tra khong phai la
  // "kem chat che hon" — ma la mot tep khach vua tai len da thanh nguon su that dang chay.
  it('RECEIVED khong di thang duoc toi EFFECTIVE, du moi dieu kien noi dung deu du', () => {
    const decision = evaluateSourceTransition('RECEIVED', 'EFFECTIVE', complete);
    expect(decision).toEqual({
      allowed: false,
      reason: 'SOURCE_TRANSITION_NOT_PERMITTED',
    });
  });

  // "LLM TRICH XUAT ≠ DA DUYET": ban da chuan hoa xong van phai qua nguoi doc truoc khi duyet.
  it('NORMALIZED khong di thang duoc toi APPROVED', () => {
    expect(evaluateSourceTransition('NORMALIZED', 'APPROVED', complete).reason).toBe(
      'SOURCE_TRANSITION_NOT_PERMITTED',
    );
  });

  it('REVIEWED -> APPROVED can mot ban ghi phe duyet tuong minh', () => {
    expect(
      evaluateSourceTransition('REVIEWED', 'APPROVED', {
        ...complete,
        hasExplicitApproval: false,
      }),
    ).toEqual({ allowed: false, reason: 'SOURCE_APPROVAL_MISSING' });

    expect(evaluateSourceTransition('REVIEWED', 'APPROVED', complete).allowed).toBe(true);
  });
});

// "KHONG KICH HOAT FAIL-OPEN" — ba dieu kien, va moi cai phai co MA RIENG. Bai nay ton tai de
// chan viec gop chung lai thanh mot `boolean`: nguoi truc doc trace phai biet di do lai hash hay
// di hoi moc hieu luc, chu khong chi biet "khong kich hoat duoc".
describe('APPROVED -> EFFECTIVE khong bao gio fail-open', () => {
  it.each([
    ['hasContentHash', 'SOURCE_HASH_MISSING'],
    ['hasLocator', 'SOURCE_LOCATOR_MISSING'],
    ['hasEffectiveFrom', 'SOURCE_EFFECTIVE_FROM_MISSING'],
  ] as const)('thieu %s -> %s', (field, reason) => {
    const decision = evaluateSourceTransition('APPROVED', 'EFFECTIVE', {
      ...complete,
      [field]: false,
    });
    expect(decision).toEqual({ allowed: false, reason });
  });

  it('du ca ba thi mo cong', () => {
    expect(evaluateSourceTransition('APPROVED', 'EFFECTIVE', complete).allowed).toBe(true);
  });
});

describe('thay the — lich su khong duoc bien mat trong im lang', () => {
  it('EFFECTIVE -> SUPERSEDED can chi ro ban nao thay the', () => {
    expect(
      evaluateSourceTransition('EFFECTIVE', 'SUPERSEDED', {
        ...complete,
        hasSupersedingSource: false,
      }),
    ).toEqual({ allowed: false, reason: 'SOURCE_SUPERSEDER_MISSING' });
  });

  it('ban da bi thay the la diem cuoi — khong hoi sinh duoc', () => {
    for (const to of SOURCE_STATUSES) {
      if (to === 'SUPERSEDED') continue;
      expect(evaluateSourceTransition('SUPERSEDED', to, complete).reason).toBe(
        'SOURCE_ALREADY_TERMINAL',
      );
    }
  });

  it('chuyen sang chinh no duoc tach rieng khoi "canh khong ton tai"', () => {
    expect(evaluateSourceTransition('EFFECTIVE', 'EFFECTIVE', complete).reason).toBe(
      'SOURCE_ALREADY_IN_STATE',
    );
  });
});

// BAT BIEN "BAN TEST NOI BO ≠ KHACH XAC NHAN".
//
// Day la that bai da xay ra that o Ultty: mot ban sao noi bo dung de test tung duoc mo ta nhu ban
// khach da xac nhan, va khong mot truong nao trong he thong noi duoc rang do la sai. Bai duoi day
// la cho no khong xay ra duoc nua.
describe('phe duyet — nguon goc quyet dinh MUC duoc phep dong dau', () => {
  const base = { actor: 'sale-lead', evidenceRef: 'HD/2026/PL01' } as const;

  it('ban INTERNAL_TEST KHONG bao gio thanh CUSTOMER_CONFIRMED', () => {
    expect(
      evaluateApproval({ ...base, level: 'CUSTOMER_CONFIRMED', origin: 'INTERNAL_TEST' }),
    ).toEqual({ allowed: false, reason: 'APPROVAL_ORIGIN_NOT_CUSTOMER' });
  });

  it('ban INTERNAL_DERIVED (thiet ke cua chinh ta) cung khong', () => {
    expect(
      evaluateApproval({ ...base, level: 'CUSTOMER_CONFIRMED', origin: 'INTERNAL_DERIVED' }).reason,
    ).toBe('APPROVAL_ORIGIN_NOT_CUSTOMER');
  });

  it('ban INTERNAL_TEST VAN duyet duoc — nhung chi toi muc INTERNAL_ACCEPTED', () => {
    expect(
      evaluateApproval({ ...base, level: 'INTERNAL_ACCEPTED', origin: 'INTERNAL_TEST' }),
    ).toEqual({ allowed: true, reason: 'APPROVAL_RECORDED' });
  });

  it('van ban khach ky thi dong dau xac nhan duoc', () => {
    expect(
      evaluateApproval({ ...base, level: 'CUSTOMER_CONFIRMED', origin: 'CUSTOMER_SIGNED' }).allowed,
    ).toBe(true);
  });

  it('phe duyet vo danh hoac khong dan chung deu bi tu choi', () => {
    expect(
      evaluateApproval({ ...base, actor: '  ', level: 'INTERNAL_ACCEPTED', origin: 'CUSTOMER_SIGNED' })
        .reason,
    ).toBe('APPROVAL_ACTOR_MISSING');
    expect(
      evaluateApproval({
        ...base,
        evidenceRef: '',
        level: 'INTERNAL_ACCEPTED',
        origin: 'CUSTOMER_SIGNED',
      }).reason,
    ).toBe('APPROVAL_EVIDENCE_MISSING');
  });
});

// PHAN LOAI PHAI DIEU KHIEN HANH VI, khong duoc la nhan trang tri. Hai ham duoi la hai hanh vi
// that ma no dieu khien: cai gi duoc vao span, va byte cua ai bat buoc nam ngoai repo.
describe('phan loai du lieu dieu khien hanh vi', () => {
  it('chi PUBLIC/INTERNAL duoc phep dua GIA TRI vao telemetry', () => {
    const safe = DATA_CLASSIFICATIONS.filter(isTelemetrySafeClassification);
    expect(safe).toEqual(['PUBLIC', 'INTERNAL']);
  });

  it('BUSINESS_SENSITIVE/PII/SECRET bat buoc nam trong kho rieng ngoai repo', () => {
    const vaulted = DATA_CLASSIFICATIONS.filter(requiresPrivateVault);
    expect(vaulted).toEqual(['BUSINESS_SENSITIVE', 'PII', 'SECRET']);
  });
});
