import { describe, expect, it } from 'vitest';
import { declaredZipExpansion } from './toll-zip-guard.js';

/**
 * Dung MOT tep ZIP toi thieu, chi gom BANG THU MUC TRUNG TAM va ban ghi ket thuc.
 *
 * `declaredZipExpansion` co y chi doc hai phan do — no khong giai nen gi ca — nen mot tep dung du
 * hai phan nay la du de kiem, va no cho phep KHAI mot kich thuoc giai nen bat ky ma khong phai tao
 * ra mot tep hang giga that.
 */
function zipDeclaring(uncompressedSizes: readonly number[]): Buffer {
  const name = Buffer.from('xl/worksheets/sheet1.xml', 'utf8');
  const entries = uncompressedSizes.map((size) => {
    const entry = Buffer.alloc(46 + name.length);
    entry.writeUInt32LE(0x0201_4b50, 0);
    entry.writeUInt32LE(size, 24);
    entry.writeUInt16LE(name.length, 28);
    name.copy(entry, 46);
    return entry;
  });
  const directory = Buffer.concat(entries);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x0605_4b50, 0);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(directory.length, 12);
  eocd.writeUInt32LE(0, 16);
  return Buffer.concat([directory, eocd]);
}

describe('do kich thuoc giai nen MA KHONG giai nen', () => {
  it('cong kich thuoc khai bao cua moi muc', () => {
    expect(declaredZipExpansion(zipDeclaring([1_000, 2_500]))).toEqual({
      declaredBytes: 3_500,
      entries: 2,
      unreadable: false,
    });
  });

  /**
   * DAY LA BAI QUAN TRONG NHAT CUA TEP NAY.
   *
   * Mot tep vai KB khai giai nen ra 4 GB. Phep do phai thay con so 4 GB do MA KHONG cap phat mot
   * byte nao — vi neu no chi thay duoc sau khi giai nen thi tien trinh da chet truoc do roi.
   */
  it('thay duoc mot tep vai KB khai bung ra hang GB', () => {
    const bomb = zipDeclaring([4_000_000_000]);
    expect(bomb.byteLength).toBeLessThan(100);
    expect(declaredZipExpansion(bomb).declaredBytes).toBe(4_000_000_000);
  });

  /**
   * KHONG DOC DUOC khong phai "an toan".
   *
   * Mot tep khong co bang thu muc thi cung khong phai mot `.xlsx` hop le, nen nguoi goi phai tu
   * choi no — chu khong duoc coi `declaredBytes: 0` la "tep nay nho".
   */
  it('bao KHONG DOC DUOC khi thieu ban ghi ket thuc', () => {
    expect(declaredZipExpansion(Buffer.from('khong phai zip', 'utf8'))).toEqual({
      declaredBytes: 0,
      entries: 0,
      unreadable: true,
    });
  });

  it('bao KHONG DOC DUOC khi bang thu muc bi cat cut', () => {
    const truncated = zipDeclaring([1_000, 2_000]).subarray(30);
    expect(declaredZipExpansion(truncated).unreadable).toBe(true);
  });
});
