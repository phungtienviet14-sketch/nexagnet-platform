import { describe, expect, it } from 'vitest';
import { BusinessDateError, assertBusinessDate, toBusinessDate } from './business-date.js';

/**
 * BUSINESS-DATE-001 (T1 §17, `INV-25`, `GD-04`) — ngay nghiep vu tinh theo MUI GIO TENANT, ghi
 * ra mot cot rieng, KHONG suy nguoc tu timestamp UTC luc truy van.
 *
 * VN o UTC+7 nen moi su kien trong khung 17:00–23:59 UTC thuoc ve NGAY HOM SAU theo gio dia
 * phuong. Doc bang UTC se day toan bo cac phieu buoi sang som lui mot ngay — va vi ky cong no,
 * ky luong, ky quy deu cat theo ngay, mot phieu lui ngay o dau thang la mot phieu roi nham ky.
 * Loi nay khong bao gio hien ra trong gio hanh chinh; no chi hien ra quanh nua dem.
 */
describe('Ngay nghiep vu theo mui gio tenant — BUSINESS-DATE-001', () => {
  const TZ = 'Asia/Ho_Chi_Minh';

  it('2026-07-31T23:30Z -> Asia/Ho_Chi_Minh -> 2026-08-01', () => {
    expect(toBusinessDate(new Date('2026-07-31T23:30:00Z'), TZ)).toBe('2026-08-01');
  });

  it('bien nua dem dia phuong: 16:59:59Z van la 31/07, 17:00:00Z da la 01/08', () => {
    expect(toBusinessDate(new Date('2026-07-31T16:59:59Z'), TZ)).toBe('2026-07-31');
    expect(toBusinessDate(new Date('2026-07-31T17:00:00Z'), TZ)).toBe('2026-08-01');
  });

  it('KHAC hn ket qua doc bang UTC — bang chung la no khong suy tu UTC', () => {
    const instant = new Date('2026-07-31T23:30:00Z');
    expect(instant.toISOString().slice(0, 10)).toBe('2026-07-31');
    expect(toBusinessDate(instant, TZ)).not.toBe('2026-07-31');
  });

  it('mui gio khac cho ngay khac tu cung mot khoanh khac', () => {
    const instant = new Date('2026-07-31T23:30:00Z');
    expect(toBusinessDate(instant, 'UTC')).toBe('2026-07-31');
    expect(toBusinessDate(instant, 'America/New_York')).toBe('2026-07-31');
    expect(toBusinessDate(instant, TZ)).toBe('2026-08-01');
  });

  it('mui gio khong hop le thi NEM, khong lang le roi ve UTC', () => {
    expect(() => toBusinessDate(new Date(), 'Khong/Ton_Tai')).toThrow(BusinessDateError);
  });

  it('khoanh khac khong hop le thi NEM', () => {
    expect(() => toBusinessDate(new Date('khong-phai-ngay'), TZ)).toThrow(BusinessDateError);
  });

  it('assertBusinessDate chi nhan dung dang YYYY-MM-DD co that', () => {
    expect(assertBusinessDate('2026-08-01')).toBe('2026-08-01');
    expect(() => assertBusinessDate('01/08/2026')).toThrow(BusinessDateError);
    expect(() => assertBusinessDate('2026-8-1')).toThrow(BusinessDateError);
    expect(() => assertBusinessDate('2026-02-30')).toThrow(BusinessDateError);
  });
});
