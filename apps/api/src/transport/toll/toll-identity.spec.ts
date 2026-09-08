import { describe, expect, it } from 'vitest';
import {
  looksLikeVietnamesePlate,
  normalizeAccountNo,
  normalizeTollPlate,
  parseSignedTollAmount,
  tollRowFingerprint,
  tollSourceDigest,
  type TollFingerprintInput,
} from './toll-identity.js';

const base: TollFingerprintInput = {
  provider: 'VETC',
  accountNo: 'TK-001',
  kind: 'TOLL_PASS',
  vehiclePlate: '15C-556.33',
  passedAt: '2026-08-31T16:40:00.000Z',
  businessDate: '2026-09-01',
  signedAmount: -52_000,
  stationLabel: 'Tram Phap Van',
  providerRef: null,
};

describe('chuan hoa bien so va so tai khoan', () => {
  it('ba cach viet cua CUNG mot bien so cho ra cung mot chuoi', () => {
    expect(normalizeTollPlate('15C-556.33')).toBe('15C55633');
    expect(normalizeTollPlate('15c 556 33')).toBe('15C55633');
    expect(normalizeTollPlate(' 15C55633 ')).toBe('15C55633');
  });

  it('nhan ra khuon bien so Viet Nam, va TU CHOI chuoi chi CHUA mot bien so', () => {
    expect(looksLikeVietnamesePlate('29H1-234.56')).toBe(true);
    expect(looksLikeVietnamesePlate('15C-556.33')).toBe(true);
    // Khuon phai NEO HAI DAU: mot bo loc khong neo se tim thay "bien so" trong moi chuoi du dai.
    expect(looksLikeVietnamesePlate('xe 15C55633 qua tram')).toBe(false);
    expect(looksLikeVietnamesePlate('')).toBe(false);
  });

  it('so tai khoan bo dau phan cach nhung GIU nguyen chu so va chu cai', () => {
    expect(normalizeAccountNo(' tk-001 ')).toBe('TK001');
    expect(normalizeAccountNo('TK 001')).toBe('TK001');
  });
});

describe('so tien CO DAU tren mot dong ETC', () => {
  it('doc duoc dang Viet Nam co phan cach hang nghin', () => {
    expect(parseSignedTollAmount('52.000')).toBe(52_000);
    expect(parseSignedTollAmount('1.500.000')).toBe(1_500_000);
    expect(parseSignedTollAmount('52000')).toBe(52_000);
  });

  it('doc duoc so AM o ca hai quy uoc khong nhap nhang', () => {
    expect(parseSignedTollAmount('-52.000')).toBe(-52_000);
    expect(parseSignedTollAmount('(52.000)')).toBe(-52_000);
  });

  it('KHONG doan mot chuoi phan cach sai cho', () => {
    expect(parseSignedTollAmount('4.20')).toBeNull();
    expect(parseSignedTollAmount('4.2000.00')).toBeNull();
    expect(parseSignedTollAmount('abc')).toBeNull();
    expect(parseSignedTollAmount('')).toBeNull();
  });

  /**
   * 0d duoc chap nhan. Mot luot mien phi la mot du kien co that co the co, va TU CHOI no se lam
   * mat mot dong ma nha cung cap that su da phat ra — dat hon nhieu so voi viec de nguoi doi soat
   * nhin thay mot dong 0d.
   */
  it('chap nhan 0 dong', () => {
    expect(parseSignedTollAmount('0')).toBe(0);
  });
});

describe('dau van cua mot dong', () => {
  it('cung mot su kien viet theo hai kieu bien so van cho CUNG mot dau van', () => {
    expect(tollRowFingerprint({ ...base, vehiclePlate: '15c 556 33' })).toBe(
      tollRowFingerprint(base),
    );
  });

  it('doi so tien, doi tram hay doi loai deu doi dau van', () => {
    expect(tollRowFingerprint({ ...base, signedAmount: -52_001 })).not.toBe(
      tollRowFingerprint(base),
    );
    expect(tollRowFingerprint({ ...base, stationLabel: 'Tram Cau Gie' })).not.toBe(
      tollRowFingerprint(base),
    );
    expect(tollRowFingerprint({ ...base, kind: 'ADJUSTMENT' })).not.toBe(tollRowFingerprint(base));
  });

  /**
   * ===========================================================================
   * TIEM DAU PHAN CACH — bai kiem doi khang quan trong nhat cua tep nay.
   *
   * Neu dau van duoc ghep bang `[a, b].join('|')` thi mot dong co ten tram `A|B` se dung dau van
   * voi mot dong co ten tram `A` va tham chieu `B`. Nghia la mot cai ten tram do NHA CUNG CAP
   * viet ra — thu ta khong kiem soat — co the lam hai dong KHAC NHAU trong nhau, roi mot dong
   * that bi gan nhan `DUPLICATE_CANDIDATE` va bi nguoi doi soat loai.
   */
  it('mot ky tu phan cach nam TRONG du lieu khong lam hai dong khac nhau dung dau van', () => {
    const left = tollRowFingerprint({ ...base, stationLabel: 'A|B', providerRef: null });
    const right = tollRowFingerprint({ ...base, stationLabel: 'A', providerRef: '|B' });
    expect(left).not.toBe(right);
  });

  it('`null` va chuoi rong la HAI thu khac nhau', () => {
    expect(tollRowFingerprint({ ...base, providerRef: '' })).not.toBe(
      tollRowFingerprint({ ...base, providerRef: null }),
    );
  });

  it('dau van la mot chuoi hex sha-256 on dinh', () => {
    const value = tollRowFingerprint(base);
    expect(value).toMatch(/^[0-9a-f]{64}$/);
    expect(tollRowFingerprint(base)).toBe(value);
  });
});

describe('bam noi dung nguon', () => {
  it('cung bo byte cho cung mot bam; lech mot byte thi doi', () => {
    expect(tollSourceDigest(Buffer.from('a,b\n1,2\n'))).toBe(
      tollSourceDigest(Buffer.from('a,b\n1,2\n')),
    );
    expect(tollSourceDigest(Buffer.from('a,b\n1,3\n'))).not.toBe(
      tollSourceDigest(Buffer.from('a,b\n1,2\n')),
    );
    expect(tollSourceDigest(Buffer.from(''))).toMatch(/^[0-9a-f]{64}$/);
  });
});
