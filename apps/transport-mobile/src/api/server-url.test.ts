import { describe, expect, it } from 'vitest';
import { normalizeServerUrl } from './server-url';

describe('normalizeServerUrl', () => {
  it('them https:// va bo dau / cuoi', () => {
    expect(normalizeServerUrl('  van-tai.example.vn/ ', false)).toEqual({
      ok: true,
      url: 'https://van-tai.example.vn',
    });
  });

  it('giu duong dan con (may chu dat sau mot tien to)', () => {
    expect(normalizeServerUrl('https://example.vn/api/', false)).toEqual({
      ok: true,
      url: 'https://example.vn/api',
    });
  });

  it('tu choi http tran tren mang cong cong, ke ca o ban phat trien', () => {
    expect(normalizeServerUrl('http://van-tai.example.vn', true).ok).toBe(false);
  });

  it('chi cho http toi may cuc bo khi ban phat trien cho phep', () => {
    expect(normalizeServerUrl('http://10.0.2.2:3001', true)).toEqual({
      ok: true,
      url: 'http://10.0.2.2:3001',
    });
    expect(normalizeServerUrl('http://10.0.2.2:3001', false).ok).toBe(false);
  });

  it('tu choi thong tin dang nhap, query va chuoi rong', () => {
    expect(normalizeServerUrl('https://a:b@example.vn', false).ok).toBe(false);
    expect(normalizeServerUrl('https://example.vn/?x=1', false).ok).toBe(false);
    expect(normalizeServerUrl('   ', false).ok).toBe(false);
    expect(normalizeServerUrl('ftp://example.vn', false).ok).toBe(false);
  });
});
