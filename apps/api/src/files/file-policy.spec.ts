import { describe, expect, it } from 'vitest';
import {
  FILE_PURPOSE_RULES,
  PLATFORM_FILE_KEY_PREFIX,
  buildPlatformFileKey,
  hasActiveContent,
  isPlatformFileKey,
  normaliseMimeType,
  rejectFile,
  safeFilename,
  sha256Of,
  sniffMimeType,
} from './file-policy.js';

/**
 * CHINH SACH TAT DINH cua nen tang tep — `#287` P5, va cac bai 9/10 cua P12.
 *
 * Khong mang, khong dia, khong CSDL: moi bat bien o day kiem duoc ma khong dung mot Postgres nao.
 */

/** Byte dau THAT cua tung loai — khong mot tep gia nao, vi chinh phep nhan dang dang duoc do. */
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('IHDR'),
]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from('WEBPVP8 '),
]);
const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n');
const AT = new Date('2026-09-18T04:05:06.000Z');

describe('Nhan dang loai tep tu byte dau — PF-010', () => {
  it('nhan dung bon loai trong danh sach trang', () => {
    expect(sniffMimeType(JPEG)).toBe('image/jpeg');
    expect(sniffMimeType(PNG)).toBe('image/png');
    expect(sniffMimeType(WEBP)).toBe('image/webp');
    expect(sniffMimeType(PDF)).toBe('application/pdf');
  });

  /**
   * `null` chu khong mot phong doan. Mot bo nhan dang cang rong thi cang nhieu loai duoc "nhan ra",
   * trong khi o day dieu ta muon la NGUOC LAI.
   */
  it('tra null cho moi thu khong khop khuon nao', () => {
    expect(sniffMimeType(Buffer.from('khong phai anh'))).toBeNull();
    expect(sniffMimeType(Buffer.alloc(0))).toBeNull();
    expect(sniffMimeType(Buffer.from([0xff, 0xd8]))).toBeNull();
  });

  /** `RIFF` mot minh la mot tep WAV, khong phai WebP — hai doan phai khop CA HAI. */
  it('khong nham mot tep RIFF khac thanh WebP', () => {
    const wav = Buffer.concat([
      Buffer.from('RIFF'),
      Buffer.from([0x24, 0x00, 0x00, 0x00]),
      Buffer.from('WAVEfmt '),
    ]);
    expect(sniffMimeType(wav)).toBeNull();
  });
});

describe('Noi dung chay duoc bi chan truoc ca danh sach trang — PF-011', () => {
  it.each([
    ['tep thuc thi Windows', Buffer.from('MZ\u0090\u0000program')],
    ['tep thuc thi Linux', Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01])],
    ['kho nen (docx/xlsx/jar deu la zip)', Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00])],
    ['SVG', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>')],
    ['SVG thut dau dong', Buffer.from('\n  <?xml version="1.0"?><svg/>')],
    ['HTML', Buffer.from('<!DOCTYPE html><html><body>')],
  ])('chan %s', (_label, bytes) => {
    expect(hasActiveContent(bytes)).toBe(true);
  });

  it('khong chan anh va PDF that', () => {
    for (const bytes of [JPEG, PNG, WEBP, PDF]) expect(hasActiveContent(bytes)).toBe(false);
  });

  /**
   * `#287` P5: *"SVG remains rejected unless a proven sanitization pipeline exists"*. Khong co
   * duong lam sach nao o day, nen no bi tu choi — VA bang ma ly do cua noi dung chay duoc, khong
   * bang mot ma "loai khong cho phep" nghe nhu mot lan go nham.
   */
  it('SVG bi tu choi vi CHAY DUOC, khong vi "khong nam trong danh sach"', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>');
    expect(
      rejectFile({
        bytes: svg,
        declaredMimeType: 'image/svg+xml',
        purpose: 'OPERATIONAL_DOCUMENT',
      }),
    ).toBe('FILE_ACTIVE_CONTENT_REJECTED');
    for (const rule of Object.values(FILE_PURPOSE_RULES)) {
      expect(Object.keys(rule.allowedMimeTypes)).not.toContain('image/svg+xml');
    }
  });
});

describe('Cong nhan mot lan tai len — PF-012 (`#287` P12 bai 10)', () => {
  it('nhan mot tep hop le', () => {
    expect(
      rejectFile({ bytes: JPEG, declaredMimeType: 'image/jpeg', purpose: 'OPERATIONAL_DOCUMENT' }),
    ).toBeNull();
  });

  it('chuan hoa content-type truoc khi so — trinh duyet gui kem charset', () => {
    expect(normaliseMimeType('image/JPEG; charset=binary')).toBe('image/jpeg');
    expect(
      rejectFile({
        bytes: JPEG,
        declaredMimeType: 'image/JPEG; charset=binary',
        purpose: 'GENERIC_ATTACHMENT',
      }),
    ).toBeNull();
  });

  it('tu choi tep rong', () => {
    expect(
      rejectFile({
        bytes: Buffer.alloc(0),
        declaredMimeType: 'image/jpeg',
        purpose: 'OPERATIONAL_DOCUMENT',
      }),
    ).toBe('FILE_EMPTY');
  });

  it('tu choi loai khong nam trong danh sach trang cua muc dich', () => {
    expect(
      rejectFile({ bytes: JPEG, declaredMimeType: 'image/gif', purpose: 'OPERATIONAL_DOCUMENT' }),
    ).toBe('FILE_MIME_NOT_ALLOWED');
  });

  /**
   * BAI 10 CUA `#287` P12: *"MIME/extension/content mismatch rejected"*.
   *
   * Hai chieu, va ca hai deu phai dong: mot tep PDF khai la anh, va mot tep khong nhan dang duoc
   * khai la anh. Chi do chieu thu nhat se de lot dung truong hop nguy hiem hon.
   */
  it('tu choi khi noi dung khong khop khai bao', () => {
    expect(
      rejectFile({ bytes: PDF, declaredMimeType: 'image/png', purpose: 'OPERATIONAL_DOCUMENT' }),
    ).toBe('FILE_CONTENT_MISMATCH');
    expect(
      rejectFile({
        bytes: Buffer.from('chi la van ban'),
        declaredMimeType: 'image/png',
        purpose: 'OPERATIONAL_DOCUMENT',
      }),
    ).toBe('FILE_CONTENT_MISMATCH');
  });

  it('tu choi tep vuot gioi han cua muc dich', () => {
    const max = FILE_PURPOSE_RULES.OPERATIONAL_DOCUMENT.maxBytes;
    const huge = Buffer.concat([JPEG, Buffer.alloc(max)]);
    expect(
      rejectFile({ bytes: huge, declaredMimeType: 'image/jpeg', purpose: 'OPERATIONAL_DOCUMENT' }),
    ).toBe('FILE_TOO_LARGE');
  });
});

describe('Ten hien thi an toan — PF-013', () => {
  it('bo moi phan duong dan, giu doan cuoi', () => {
    expect(safeFilename('../../etc/passwd', 'image/jpeg', 'OPERATIONAL_DOCUMENT')).toBe(
      'passwd.jpg',
    );
    expect(safeFilename('C:\\Users\\a\\bien-nhan.png', 'image/png', 'OPERATIONAL_DOCUMENT')).toBe(
      'bien-nhan.png',
    );
  });

  /**
   * `hoa-don.pdf.exe` phai ra mot ten KHONG chay duoc. Duoi suy tu MIME DA DUYET, khong tu duoi
   * nguoi dung viet — nen ke ca khi mot ngay nao do mot loai tep moi lot qua danh sach trang, ten
   * tra ra van khong bao gio la mot duoi thuc thi.
   */
  it('ep duoi tep theo MIME da duyet, khong theo duoi nguoi dung viet', () => {
    expect(safeFilename('hoa-don.pdf.exe', 'application/pdf', 'FINANCIAL_EVIDENCE')).toBe(
      'hoa-don.pdf.pdf',
    );
    expect(safeFilename('anh.jpg', 'image/png', 'OPERATIONAL_DOCUMENT')).toBe('anh.png');
  });

  it('bo ky tu dieu khien va ky tu he tep doi xu dac biet', () => {
    expect(safeFilename('bien\u0000nhan"*?<>|:.jpg', 'image/jpeg', 'OPERATIONAL_DOCUMENT')).toBe(
      'biennhan.jpg',
    );
  });

  it('khong bao gio tra ve chuoi rong', () => {
    for (const nasty of ['', '   ', '...', '.jpg', '/', '\\']) {
      expect(safeFilename(nasty, 'image/jpeg', 'OPERATIONAL_DOCUMENT')).toBe('tep.jpg');
    }
  });

  it('cat ten dai nhung giu nguyen duoi', () => {
    const name = safeFilename(`${'a'.repeat(400)}.jpg`, 'image/jpeg', 'OPERATIONAL_DOCUMENT');
    expect(name.endsWith('.jpg')).toBe(true);
    expect(name.length).toBeLessThanOrEqual(84);
  });
});

describe('Khoa object — PF-014', () => {
  it('gom theo nam/thang UTC duoi dung mot tien to', () => {
    expect(buildPlatformFileKey('abc-123', 'image/jpeg', AT, 'OPERATIONAL_DOCUMENT')).toBe(
      `${PLATFORM_FILE_KEY_PREFIX}2026/09/abc-123.jpg`,
    );
  });

  it('tu choi ma tep co the tro thanh mot duong dan', () => {
    for (const bad of ['../evil', 'a/b', 'a b', '']) {
      expect(() => buildPlatformFileKey(bad, 'image/jpeg', AT, 'OPERATIONAL_DOCUMENT')).toThrow();
    }
  });

  it('tu choi loai tep ngoai danh sach trang cua muc dich', () => {
    expect(() => buildPlatformFileKey('abc', 'image/gif', AT, 'OPERATIONAL_DOCUMENT')).toThrow();
  });

  /**
   * RAO CHONG DOC/XOA TUY Y. `storageKey` la mot cot chuoi TU DO o CSDL: truoc khi dua no cho kho,
   * phai chac no tro vao dung khu cua nen tang tep.
   */
  it('chi nhan khoa nam trong khu cua nen tang tep', () => {
    expect(
      isPlatformFileKey(buildPlatformFileKey('abc', 'image/jpeg', AT, 'GENERIC_ATTACHMENT')),
    ).toBe(true);

    for (const outside of [
      'media/2026/08/anh-zalo-cua-khach.webp',
      'media/transport-evidence/2026/09/x.jpg',
      `${PLATFORM_FILE_KEY_PREFIX}2026/../../secret.jpg`,
      `${PLATFORM_FILE_KEY_PREFIX}2026//x.jpg`,
      `${PLATFORM_FILE_KEY_PREFIX}\u0000.jpg`,
      '/etc/passwd',
      '',
    ]) {
      expect(isPlatformFileKey(outside)).toBe(false);
    }
  });
});

describe('Toan ven noi dung — PF-015 (`#287` P12 bai 9)', () => {
  it('bam hex thuong 64 ky tu, va doi theo tung byte', () => {
    const hash = sha256Of(JPEG);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Of(JPEG)).toBe(hash);
    expect(sha256Of(Buffer.concat([JPEG, Buffer.from([0x00])]))).not.toBe(hash);
  });

  /** Bam cua tep rong la mot hang so da biet — neo phep do vao mot gia tri ngoai ma nguon nay. */
  it('khop gia tri SHA-256 chuan cua tep rong', () => {
    expect(sha256Of(Buffer.alloc(0))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });
});

describe('Luat theo muc dich — PF-016', () => {
  /**
   * `#287` P11 va Quyet dinh kien truc #6: nen tang khong duoc nhac ten mot mien nao. Bai nay quet
   * chinh cac GIA TRI cua bang luat, nen mot muc dich `TRANSPORT_*` them vao se do ngay.
   */
  it('khong mot muc dich nao mang ten mot mien', () => {
    for (const purpose of Object.keys(FILE_PURPOSE_RULES)) {
      expect(purpose).not.toMatch(/TRANSPORT|ULTTY|AMICO|ORDER|DEALER|ZALO/i);
    }
  });

  it('moi muc dich co gioi han dung luong va han giu doc duoc', () => {
    for (const rule of Object.values(FILE_PURPOSE_RULES)) {
      expect(rule.maxBytes).toBeGreaterThan(0);
      expect(rule.retentionDays).toBeGreaterThanOrEqual(0);
      expect(Object.keys(rule.allowedMimeTypes).length).toBeGreaterThan(0);
    }
  });

  /** Chung tu tai chinh phai co han giu — mot he thong don byte truoc moc do lam mat bang chung. */
  it('chung tu tai chinh va giay to van hanh deu co han giu', () => {
    expect(FILE_PURPOSE_RULES.FINANCIAL_EVIDENCE.retentionDays).toBeGreaterThan(0);
    expect(FILE_PURPOSE_RULES.OPERATIONAL_DOCUMENT.retentionDays).toBeGreaterThan(0);
  });
});
