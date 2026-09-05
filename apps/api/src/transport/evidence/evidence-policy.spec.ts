import { describe, expect, it } from 'vitest';
import { MEDIA_KEY_PREFIX } from '../../media/media-policy.js';
import {
  TRANSPORT_EVIDENCE_CONTENT_TYPES,
  TRANSPORT_EVIDENCE_KEY_PREFIX,
  buildEvidenceKey,
  isTransportEvidenceLocator,
  normaliseContentType,
  rejectEvidence,
} from './evidence-policy.js';

/** `#169` — phan TAT DINH cua bang chung: khong mang, khong dia. */

const AT = new Date('2026-09-04T07:00:00.000Z');
const MAX = 15_000_000;

describe('danh sach trang loai tep', () => {
  it('nhan bon loai da khai, va CHI bon loai do', () => {
    for (const contentType of Object.keys(TRANSPORT_EVIDENCE_CONTENT_TYPES)) {
      expect(rejectEvidence({ contentType, byteSize: 100 }, MAX), contentType).toBeNull();
    }
    expect(Object.keys(TRANSPORT_EVIDENCE_CONTENT_TYPES).sort()).toEqual([
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
    ]);
  });

  /**
   * SVG la mot TAI LIEU CO THE CHUA SCRIPT. Mot "anh" bang chung ma trinh duyet chay duoc la mot
   * duong XSS di thang qua cong tai len — va no khong giong mot rui ro cho toi luc ai do mo bang
   * chung do trong tab cua ke toan.
   */
  it('TU CHOI SVG, HTML va cac kieu chay duoc khac', () => {
    for (const contentType of [
      'image/svg+xml',
      'text/html',
      'application/javascript',
      'application/x-msdownload',
      'text/plain',
    ]) {
      expect(rejectEvidence({ contentType, byteSize: 100 }, MAX), contentType).toBe(
        'EVIDENCE_CONTENT_TYPE_NOT_ALLOWED',
      );
    }
  });

  it('chuan hoa tham so va hoa/thuong cua content-type', () => {
    expect(normaliseContentType('image/JPEG; charset=binary')).toBe('image/jpeg');
    expect(rejectEvidence({ contentType: 'IMAGE/PNG ', byteSize: 10 }, MAX)).toBeNull();
  });

  /** Ba duong tu choi, BA MA — khong gop thanh mot `false`. */
  it('phan biet tep rong voi tep qua lon', () => {
    expect(rejectEvidence({ contentType: 'image/png', byteSize: 0 }, MAX)).toBe('EVIDENCE_EMPTY');
    expect(rejectEvidence({ contentType: 'image/png', byteSize: MAX + 1 }, MAX)).toBe(
      'EVIDENCE_TOO_LARGE',
    );
    expect(rejectEvidence({ contentType: 'image/png', byteSize: MAX }, MAX)).toBeNull();
  });

  it('loai tep sai duoc bao TRUOC kich thuoc — nguoi dung sua dung viec truoc', () => {
    expect(rejectEvidence({ contentType: 'image/svg+xml', byteSize: MAX + 1 }, MAX)).toBe(
      'EVIDENCE_CONTENT_TYPE_NOT_ALLOWED',
    );
  });
});

describe('khoa object', () => {
  it('nam duoi tien to cua nen tang, trong mot khu rieng cua van tai', () => {
    const key = buildEvidenceKey('abc123', 'image/jpeg', AT);
    expect(key.startsWith(MEDIA_KEY_PREFIX)).toBe(true);
    expect(key).toBe(`${TRANSPORT_EVIDENCE_KEY_PREFIX}2026/09/abc123.jpg`);
  });

  /**
   * Duoi tep suy tu CONTENT-TYPE da qua danh sach trang, KHONG tu ten tep nguoi dung gui len.
   * `hoa-don.pdf.exe` va nhung ten kem `../` deu tung la duong ghi de tep.
   */
  it('duoi tep den tu content-type, moi loai mot duoi', () => {
    expect(buildEvidenceKey('x', 'image/png', AT).endsWith('.png')).toBe(true);
    expect(buildEvidenceKey('x', 'image/webp', AT).endsWith('.webp')).toBe(true);
    expect(buildEvidenceKey('x', 'application/pdf', AT).endsWith('.pdf')).toBe(true);
  });

  it('ma khong an toan bi TU CHOI truoc khi ghep vao duong dan', () => {
    for (const bad of ['../../etc/passwd', 'a/b', 'a b', '']) {
      expect(() => buildEvidenceKey(bad, 'image/png', AT), bad).toThrow();
    }
  });

  it('loai tep ngoai danh sach trang khong sinh duoc khoa', () => {
    expect(() => buildEvidenceKey('abc', 'image/svg+xml', AT)).toThrow();
  });
});

/**
 * CONG CHONG DOC TUY Y. `TransportFuelReceiptEvidence.locator` la mot cot chuoi TU DO — no da nhan
 * dinh vi tu truoc khi co duong tai len nay. Truoc khi dua mot chuoi bat ky cho `MediaStore.get()`,
 * phai chac no tro vao dung khu cua bang chung van tai.
 */
describe('pham vi cua dinh vi', () => {
  it('nhan dinh vi do chinh he thong nay sinh ra', () => {
    expect(isTransportEvidenceLocator(buildEvidenceKey('abc', 'image/jpeg', AT))).toBe(true);
  });

  it('TU CHOI anh tin nhan Zalo cua khach — cung bucket, khac khu', () => {
    expect(isTransportEvidenceLocator('media/2026/08/tin-nhan-cua-khach.webp')).toBe(false);
  });

  it('TU CHOI duong dan vuot ra ngoai, ke ca khi bat dau dung tien to', () => {
    for (const bad of [
      `${TRANSPORT_EVIDENCE_KEY_PREFIX}../../secret.env`,
      `${TRANSPORT_EVIDENCE_KEY_PREFIX}2026//x.jpg`,
      `${TRANSPORT_EVIDENCE_KEY_PREFIX}2026/09/x.jpg\0.png`,
      '/etc/passwd',
      '',
    ]) {
      expect(isTransportEvidenceLocator(bad), bad).toBe(false);
    }
  });

  it('mot ten tep co hai dau cham VAN hop le — rao so theo TUNG DOAN', () => {
    expect(isTransportEvidenceLocator(`${TRANSPORT_EVIDENCE_KEY_PREFIX}2026/09/a..b.jpg`)).toBe(
      true,
    );
  });
});
