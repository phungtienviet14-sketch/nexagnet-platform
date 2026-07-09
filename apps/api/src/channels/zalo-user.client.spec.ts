import { describe, expect, it } from 'vitest';
import { isCredentials } from './zalo-user.client.js';

describe('isCredentials (validate phien zca da luu truoc khi login)', () => {
  it('chap nhan cred hop le (imei + userAgent chuoi + co cookie)', () => {
    expect(isCredentials({ imei: 'abc', userAgent: 'UA', cookie: [] })).toBe(true);
  });

  it('tu choi null / khong phai object', () => {
    expect(isCredentials(null)).toBe(false);
    expect(isCredentials('chuoi')).toBe(false);
    expect(isCredentials(123)).toBe(false);
  });

  it('tu choi khi imei khong phai chuoi (VD so) -> buoc quet QR lai', () => {
    expect(isCredentials({ imei: 123, userAgent: 'UA', cookie: [] })).toBe(false);
  });

  it('tu choi khi thieu userAgent', () => {
    expect(isCredentials({ imei: 'abc', cookie: [] })).toBe(false);
  });

  it('tu choi khi thieu cookie', () => {
    expect(isCredentials({ imei: 'abc', userAgent: 'UA' })).toBe(false);
  });
});
