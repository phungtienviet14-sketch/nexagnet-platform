import { describe, expect, it } from 'vitest';
import type { AuthRole, AuthUser } from '../../../../lib/auth';
import {
  ACCOUNT_LOADING_NOTE,
  ACCOUNT_SESSIONLESS_NOTE,
  accountSummaryLine,
  toAccountPanel,
} from '../account';

/**
 * #222 P1-D — DANH TINH TAI KHOAN tren hai vo van tai.
 *
 * Cau hoi phai tra loi duoc: *"tôi đang đăng nhập bằng tài khoản nào?"*. Truoc ban nay khong be mat
 * van tai nao tra loi duoc — vo van hanh chi in mot NHAN VAI, vo lai xe khong in gi.
 *
 * `ADMIN`, `ACCOUNTING` va `SALE` deu duoc do, dung nhu #222 doi: ba vai la ba be mat that su khac
 * nhau, va vai `SALE` con la CHO GIU TAM cua lai xe (`GD-22`) nen nhan cua no de sai nhat.
 */

const userOf = (role: AuthRole, overrides: Partial<AuthUser> = {}): AuthUser => ({
  id: `user-${role.toLowerCase()}`,
  username: `tk-${role.toLowerCase()}`,
  name: `Nguoi ${role}`,
  role,
  ...overrides,
});

describe('#222 P1-D — ba vai, ba danh tinh doc duoc', () => {
  const cases: readonly { readonly role: AuthRole; readonly label: string }[] = [
    { role: 'ADMIN', label: 'Giám đốc' },
    { role: 'ACCOUNTING', label: 'Kế toán' },
    // `SALE` la cho giu tam cua vai LAI XE. In "Bán hàng" o day se lam mot nguoi lai xe nghi minh
    // dang nhap nham tai khoan.
    { role: 'SALE', label: 'Lái xe' },
  ];

  for (const item of cases) {
    it(`${item.role} thay du TEN, TAI KHOAN, VAI TRO va co duong dang xuat`, () => {
      const panel = toAccountPanel('session', userOf(item.role));

      expect(panel.identity).not.toBeNull();
      expect(panel.identity?.displayName).toBe(`Nguoi ${item.role}`);
      expect(panel.identity?.username).toBe(`tk-${item.role.toLowerCase()}`);
      expect(panel.identity?.roleLabel).toBe(item.label);
      expect(panel.canSignOut).toBe(true);
      expect(panel.note).toBeNull();
    });
  }

  it('MANAGER cung co danh tinh — khong co quyen van tai KHONG phai khong co tai khoan', () => {
    const panel = toAccountPanel('session', userOf('MANAGER'));
    expect(panel.identity?.roleLabel).toBe('Quản lý');
    expect(panel.canSignOut).toBe(true);
  });
});

describe('#222 P1-D — ba trang thai phien, ba cau tra loi khac nhau', () => {
  it('dang doi `/auth/me`: chua co danh tinh, va noi ro la DANG DOI', () => {
    const panel = toAccountPanel('loading', null);
    expect(panel.identity).toBeNull();
    expect(panel.note).toBe(ACCOUNT_LOADING_NOTE);
    // Khong bay nut dang xuat khi chua biet co phien hay khong.
    expect(panel.canSignOut).toBe(false);
  });

  it('tenant khong chay che do phien: noi that, va KHONG bay mot nut khong lam duoc gi', () => {
    for (const mode of ['none', 'api-key'] as const) {
      const panel = toAccountPanel(mode, null);
      expect(panel.identity, mode).toBeNull();
      expect(panel.note, mode).toBe(ACCOUNT_SESSIONLESS_NOTE);
      expect(panel.canSignOut, mode).toBe(false);
    }
  });

  it('che do phien nhung chua co nguoi -> cung mot cau, khong phai mot o trong', () => {
    expect(toAccountPanel('session', null).identity).toBeNull();
  });
});

describe('#222 P1-D — cac canh cua du lieu that', () => {
  it('ten hien thi rong thi lui ve tai khoan, khong de trong o "ban la ai"', () => {
    const panel = toAccountPanel('session', userOf('ACCOUNTING', { name: '   ' }));
    expect(panel.identity?.displayName).toBe('tk-accounting');
    // `username` van hien nguyen — de nguoi dung doi chieu duoc voi thu ho go luc dang nhap.
    expect(panel.identity?.username).toBe('tk-accounting');
  });

  it('dong gon cho 390px co DU hai manh, va KHONG mang tai khoan', () => {
    const panel = toAccountPanel('session', userOf('SALE', { name: 'Nguyen Van Binh' }));
    const identity = panel.identity;
    if (identity === null) throw new Error('phai co danh tinh o che do phien');

    const line = accountSummaryLine(identity);

    expect(line).toBe('Nguyen Van Binh · Lái xe');
    // Ba manh tren mot dong 390px se xuong hang hoac bi cat; `username` van co trong o mo ra.
    expect(line).not.toContain('tk-sale');
  });
});
