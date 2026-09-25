import { describe, expect, it } from 'vitest';
import { gateTarget } from './route-gate';

describe('gateTarget — trang thai phien quyet dinh man hinh', () => {
  it('dang khoi dong hoac o cua vao (index) thi khong dieu huong', () => {
    expect(gateTarget('booting', ['(auth)', 'login'])).toBeNull();
    expect(gateTarget('signedIn', [])).toBeNull();
    expect(gateTarget('signedOut', [])).toBeNull();
  });

  it('dang nhap xong khi con o man dang nhap -> ve cua vao de chon trai nghiem theo vai', () => {
    expect(gateTarget('signedIn', ['(auth)', 'login'])).toBe('/');
    expect(gateTarget('signedIn', ['(auth)', 'server'])).toBe('/');
  });

  it('tai khoan khong co trai nghiem duoc o lai man "khong co quyen"', () => {
    expect(gateTarget('signedIn', ['(auth)', 'no-access'])).toBeNull();
  });

  it('da dang nhap va dang o man cua vai thi de yen', () => {
    expect(gateTarget('signedIn', ['(driver)'])).toBeNull();
    expect(gateTarget('signedIn', ['account'])).toBeNull();
  });

  it('chon may chu xong -> sang man dang nhap', () => {
    expect(gateTarget('signedOut', ['(auth)', 'server'])).toBe('/(auth)/login');
  });

  it('doi doanh nghiep tu man dang nhap -> ve man may chu', () => {
    expect(gateTarget('needsServer', ['(auth)', 'login'])).toBe('/(auth)/server');
  });

  it('het phien khi dang lam viec -> ve man dang nhap, khong o lai tab cua vai', () => {
    expect(gateTarget('signedOut', ['(driver)', 'map'])).toBe('/(auth)/login');
    expect(gateTarget('signedOut', ['(auth)', 'no-access'])).toBe('/(auth)/login');
  });

  it('dang o dung man can o thi khong dieu huong lap', () => {
    expect(gateTarget('signedOut', ['(auth)', 'login'])).toBeNull();
    expect(gateTarget('needsServer', ['(auth)', 'server'])).toBeNull();
  });
});
