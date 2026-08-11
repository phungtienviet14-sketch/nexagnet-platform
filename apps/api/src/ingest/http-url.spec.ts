import { describe, expect, it } from 'vitest';
import { toHttpUrl } from './http-url.js';

describe('toHttpUrl', () => {
  it('giu URL http(s) hop le', () => {
    expect(toHttpUrl('https://photo-stal-16.zdn.vn/x.jpg')).toBe('https://photo-stal-16.zdn.vn/x.jpg');
    expect(toHttpUrl('http://x/y.jpg')).toBe('http://x/y.jpg');
  });

  // URL PHAN TICH DUOC nhung khac giao thuc — nhanh nay khac han "chuoi khong phai URL":
  // no di qua `new URL()` ma khong nem, nen phai chan bang kiem protocol.
  it('bo URL khac giao thuc http(s)', () => {
    expect(toHttpUrl('javascript:alert(1)')).toBeUndefined();
    expect(toHttpUrl('ftp://x/y.jpg')).toBeUndefined();
    expect(toHttpUrl('file:///etc/passwd')).toBeUndefined();
    expect(toHttpUrl('data:image/png;base64,AAAA')).toBeUndefined();
  });

  it('bo gia tri khong phai chuoi hoac chuoi rong', () => {
    expect(toHttpUrl(undefined)).toBeUndefined();
    expect(toHttpUrl('')).toBeUndefined();
    expect(toHttpUrl('not-a-url')).toBeUndefined();
    expect(toHttpUrl(null)).toBeUndefined();
    expect(toHttpUrl(123)).toBeUndefined();
  });
});
