import { describe, expect, it } from 'vitest';
import { compareFuelInvoiceNumbers, normalizeFuelInvoiceNo } from './fuel-invoice-number.js';

/**
 * `#317` G4 — SO HOA DON la BO PHAN BIET TUY CHON, khong phai khoa so khop.
 *
 * Bo bai nay khoa CHINH SACH CHUAN HOA. Moi phep chuan hoa la mot phep LAM MO: lam mo qua tay thi
 * hai hoa don khac nhau thanh "trung", va mot dong bang ke se khop nham phieu. Nen moi quy tac o day
 * duoc viet ra thanh mot bai, ke ca nhung quy tac noi "KHONG coi la trung".
 */
describe('normalizeFuelInvoiceNo — chuan hoa tat dinh', () => {
  it('khong khai (null / undefined / chuoi rong / toan khoang trang) -> null', () => {
    expect(normalizeFuelInvoiceNo(null)).toBeNull();
    expect(normalizeFuelInvoiceNo(undefined)).toBeNull();
    expect(normalizeFuelInvoiceNo('')).toBeNull();
    expect(normalizeFuelInvoiceNo('   ')).toBeNull();
    expect(normalizeFuelInvoiceNo(' - / . ')).toBeNull();
  });

  it('cat khoang trang hai dau, doi chu hoa, bo dau phan cach', () => {
    expect(normalizeFuelInvoiceNo('  hd-123 ')).toBe('HD123');
    expect(normalizeFuelInvoiceNo('HD 123')).toBe('HD123');
    expect(normalizeFuelInvoiceNo('hd_12/3')).toBe('HD123');
    expect(normalizeFuelInvoiceNo('HD.123#')).toBe('HD123');
  });

  it('chuoi TOAN SO bo so 0 dau — may tinh tien in `0000123`, lai xe go `123`', () => {
    expect(normalizeFuelInvoiceNo('0000123')).toBe('123');
    expect(normalizeFuelInvoiceNo('00-00123')).toBe('123');
    expect(normalizeFuelInvoiceNo('0')).toBe('0');
    expect(normalizeFuelInvoiceNo('0000')).toBe('0');
  });

  /**
   * Chuoi CO CHU giu nguyen so 0: trong ma co chu, so 0 co the la mot ky tu that cua ma (`A0123` va
   * `A123` la hai ma khac nhau). Bo no di la doan.
   */
  it('chuoi co chu KHONG bo so 0 — `A0123` khac `A123`', () => {
    expect(normalizeFuelInvoiceNo('A0123')).toBe('A0123');
    expect(normalizeFuelInvoiceNo('1C25TAA-0000123')).toBe('1C25TAA0000123');
  });

  it('chu so toan goc (NFKC) doc nhu chu so thuong', () => {
    expect(normalizeFuelInvoiceNo('１２３')).toBe('123');
  });
});

describe('compareFuelInvoiceNumbers — ba ket cuc, khong co "gan giong"', () => {
  it('ca hai co va trung sau chuan hoa -> EQUAL', () => {
    expect(compareFuelInvoiceNumbers('0000123', '123')).toBe('EQUAL');
    expect(compareFuelInvoiceNumbers(' hd-00123', 'HD00123')).toBe('EQUAL');
  });

  it('ca hai co va KHAC nhau -> CONFLICT', () => {
    expect(compareFuelInvoiceNumbers('123', '124')).toBe('CONFLICT');
    expect(compareFuelInvoiceNumbers('A0123', 'A123')).toBe('CONFLICT');
  });

  /**
   * KHONG fuzzy: mot ky tu lech la xung dot, khong phai "gan dung". Do la ca noi dung cua "tat dinh,
   * khong AI" trong quyet dinh chu so huu.
   */
  it('lech MOT ky tu van la CONFLICT — khong co khoang cach chinh sua nao', () => {
    expect(compareFuelInvoiceNumbers('HD12345', 'HD12346')).toBe('CONFLICT');
    expect(compareFuelInvoiceNumbers('HD12345', 'HD1234')).toBe('CONFLICT');
  });

  it('mot ben thieu (hoac chi co khoang trang) -> ABSENT, khong phai CONFLICT', () => {
    expect(compareFuelInvoiceNumbers(null, '123')).toBe('ABSENT');
    expect(compareFuelInvoiceNumbers('123', null)).toBe('ABSENT');
    expect(compareFuelInvoiceNumbers('   ', '123')).toBe('ABSENT');
    expect(compareFuelInvoiceNumbers(null, null)).toBe('ABSENT');
  });
});
