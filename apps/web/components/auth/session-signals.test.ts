import { describe, expect, it } from 'vitest';
import {
  createRefreshGate,
  passwordChangeProblems,
  permissionsKey,
  sessionSignalOf,
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
