import { describe, expect, it } from 'vitest';
import { buildMediaKey, isAllowedMediaHost, parseAllowedHosts } from './media-policy.js';

const ZALO = ['zdn.vn'];

describe('isAllowedMediaHost — chan SSRF truoc khi ra mang', () => {
  it('cho qua CDN anh cua Zalo (host that lay tu log PoC)', () => {
    expect(isAllowedMediaHost('https://photo-stal-16.zdn.vn/gr/jpg/abc/def.jpg', ZALO)).toBe(true);
    expect(isAllowedMediaHost('https://zdn.vn/x.jpg', ZALO)).toBe(true);
  });

  // Khop theo BIEN DAU CHAM, khong phai endsWith chuoi: `evil-zdn.vn` ket thuc bang "zdn.vn"
  // nhung la ten mien HOAN TOAN KHAC do ke tan cong so huu.
  it('chan ten mien chi TRUNG DUOI chuoi, khong phai cung mien', () => {
    expect(isAllowedMediaHost('https://evil-zdn.vn/x.jpg', ZALO)).toBe(false);
    expect(isAllowedMediaHost('https://zdn.vn.evil.com/x.jpg', ZALO)).toBe(false);
  });

  it('chan dia chi noi bo / metadata cua may chu dam may', () => {
    expect(isAllowedMediaHost('http://169.254.169.254/computeMetadata/v1/', ZALO)).toBe(false);
    expect(isAllowedMediaHost('http://localhost:3001/knowledge', ZALO)).toBe(false);
    expect(isAllowedMediaHost('http://10.0.0.5/', ZALO)).toBe(false);
  });

  it('chan giao thuc khong phai http(s) va chuoi khong phai URL', () => {
    expect(isAllowedMediaHost('file:///etc/passwd', ZALO)).toBe(false);
    expect(isAllowedMediaHost('not-a-url', ZALO)).toBe(false);
  });

  // FAIL CLOSED: xoa MEDIA_ALLOWED_HOSTS khong duoc bien thanh "cho phep tat ca".
  it('danh sach rong -> chan het (fail closed)', () => {
    expect(isAllowedMediaHost('https://photo-stal-16.zdn.vn/x.jpg', [])).toBe(false);
  });

  it('parseAllowedHosts: tach CSV, bo khoang trang va phan tu rong', () => {
    expect(parseAllowedHosts(' zdn.vn , zalo.me ,, ')).toEqual(['zdn.vn', 'zalo.me']);
    expect(parseAllowedHosts('')).toEqual([]);
  });
});

describe('buildMediaKey', () => {
  it('gom theo nam/thang UTC de rule lifecycle prefix `media/` quet duoc', () => {
    expect(buildMediaKey('ckabc123', new Date('2026-08-11T03:00:00.000Z'))).toBe(
      'media/2026/08/ckabc123.webp',
    );
    expect(buildMediaKey('ckabc123', new Date('2026-01-05T00:00:00.000Z'))).toBe(
      'media/2026/01/ckabc123.webp',
    );
  });

  // messageId la cuid do chinh DB sinh, nhung khoa object di thang vao duong dan luu tru —
  // khong duoc tin ma khong kiem (mot id la co the ghi de object khac trong bucket).
  it('tu choi id co ky tu ngoai [A-Za-z0-9_-] (chan vuot thu muc)', () => {
    const sentAt = new Date('2026-08-11T03:00:00.000Z');
    expect(() => buildMediaKey('../../etc/passwd', sentAt)).toThrow();
    expect(() => buildMediaKey('a/b', sentAt)).toThrow();
    expect(() => buildMediaKey('', sentAt)).toThrow();
  });

  it('ngay khong hop le -> nem loi thay vi sinh khoa `media/NaN/NaN/...`', () => {
    expect(() => buildMediaKey('ckabc123', new Date('khong-phai-ngay'))).toThrow();
  });
});
