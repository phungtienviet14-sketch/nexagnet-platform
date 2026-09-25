import { describe, expect, it } from 'vitest';
import {
  createRefreshGate,
  FORBIDDEN_IS_ANSWER_META,
  isForbiddenAnswer,
  passwordChangeProblems,
  passwordExpiryLabel,
  permissionsKey,
  reactToFailure,
  SESSION_ENDED_NOTICE,
  sessionSignalOf,
  type FailureContext,
} from './session-signals';

describe('tin hieu phien tu mot loi API (#395)', () => {
  it('401 = phien da chet; 403 = quyen da doi; loi khac khong noi gi ve phien', () => {
    expect(sessionSignalOf({ status: 401 })).toBe('SESSION_ENDED');
    expect(sessionSignalOf({ status: 403, reason: 'PASSWORD_CHANGE_REQUIRED' })).toBe(
      'ACCESS_CHANGED',
    );
    expect(sessionSignalOf({ status: 403, reason: null })).toBe('ACCESS_CHANGED');
    for (const status of [400, 404, 409, 500]) expect(sessionSignalOf({ status })).toBeNull();
    expect(sessionSignalOf(new Error('mang'))).toBeNull();
    expect(sessionSignalOf(null)).toBeNull();
  });

  it('muoi 403 trong mot nhip chi doc lai /auth/me MOT lan', () => {
    let clock = 1_000;
    const gate = createRefreshGate(5_000, () => clock);
    const allowed = Array.from({ length: 10 }, () => gate()).filter(Boolean);
    expect(allowed).toHaveLength(1);
    clock += 4_999;
    expect(gate()).toBe(false);
    clock += 1;
    expect(gate()).toBe(true);
  });

  it('cung noi dung quyen, khac thu tu → cung mot khoa; thieu truong → null (ban guong theo vai)', () => {
    expect(permissionsKey(['b', 'a'])).toBe(permissionsKey(['a', 'b']));
    expect(permissionsKey([])).toBe('');
    expect(permissionsKey(undefined)).toBeNull();
  });
});

describe('mot loi API → man hinh lam gi (#395)', () => {
  const working: FailureContext = { isSession: true, hasUser: true, isSigningOut: false };

  it('401 khi dang lam viec: noi VI SAO va ve dang nhap ngay', () => {
    expect(reactToFailure({ status: 401 }, working)).toEqual({
      notice: SESSION_ENDED_NOTICE,
      refresh: 'NOW',
    });
    // Chua co ai tren man hinh (vd trang dang nhap): ve dang nhap, khong noi "phien da ket thuc".
    expect(reactToFailure({ status: 401 }, { ...working, hasUser: false })).toEqual({
      notice: null,
      refresh: 'NOW',
    });
  });

  it('TU DANG XUAT: mot query bay ve 401 truoc khi nguoi dung duoc go KHONG bao gio noi "bi khoa"', () => {
    const signingOut = { ...working, isSigningOut: true };
    for (const status of [401, 403, 500]) {
      expect(reactToFailure({ status }, signingOut)).toEqual({ notice: null, refresh: 'NONE' });
    }
  });

  it('403 → doc lai /auth/me qua cong chan; 403 cua mot lan DO thi im lang, 401 cua no van la phien chet', () => {
    expect(reactToFailure({ status: 403 }, working)).toEqual({ notice: null, refresh: 'GATED' });
    const probe = { ...working, meta: FORBIDDEN_IS_ANSWER_META };
    expect(reactToFailure({ status: 403 }, probe)).toEqual({ notice: null, refresh: 'NONE' });
    expect(reactToFailure({ status: 401 }, probe).notice).toBe(SESSION_ENDED_NOTICE);
    expect(isForbiddenAnswer({ forbiddenIsAnswer: true })).toBe(true);
    expect(isForbiddenAnswer({ forbiddenIsAnswer: 'yes' })).toBe(false);
    expect(isForbiddenAnswer(undefined)).toBe(false);
  });

  it('ngoai che do phien, hay loi khong noi gi ve phien: khong lam gi', () => {
    expect(reactToFailure({ status: 401 }, { ...working, isSession: false })).toEqual({
      notice: null,
      refresh: 'NONE',
    });
    for (const status of [400, 409, 500]) {
      expect(reactToFailure({ status }, working)).toEqual({ notice: null, refresh: 'NONE' });
    }
    expect(reactToFailure(new Error('mang'), working)).toEqual({ notice: null, refresh: 'NONE' });
  });
});

describe('han mat khau tam — gio Viet Nam, cung bo dinh dang voi the mat khau tam', () => {
  it('doc theo Asia/Ho_Chi_Minh du trinh duyet de mui gio nao', () => {
    // 17:30 UTC = 00:30 ngay hom sau o Viet Nam (UTC+7).
    const label = passwordExpiryLabel('2026-09-25T17:30:00.000Z');
    expect(label).toContain('00:30');
    expect(label).toContain('26/09/2026');
  });

  it('khong co han, hoac han hong: khong hien dong do', () => {
    expect(passwordExpiryLabel(null)).toBeNull();
    expect(passwordExpiryLabel(undefined)).toBeNull();
    expect(passwordExpiryLabel('khong-phai-ngay')).toBeNull();
  });
});

describe('man doi mat khau bat buoc', () => {
  const current = ['tam', '0001'].join('-');
  const strong = ['duong', 've', 'ba', 'vi'].join('-');

  it('du dieu kien thi khong con gi sai', () => {
    expect(passwordChangeProblems({ current, next: strong, confirm: strong })).toEqual([]);
  });

  it('noi dung tung dieu sai, theo thu tu o nhap', () => {
    expect(passwordChangeProblems({ current: '', next: 'ngan', confirm: 'khac' })).toEqual([
      'Nhập mật khẩu tạm đang dùng.',
      'Mật khẩu mới cần ít nhất 12 ký tự.',
      'Hai lần nhập mật khẩu mới chưa khớp nhau.',
    ]);
    const same = current.repeat(2);
    expect(passwordChangeProblems({ current: same, next: same, confirm: same })).toEqual([
      'Mật khẩu mới phải khác mật khẩu tạm.',
    ]);
  });
});
