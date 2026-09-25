import { describe, expect, it } from 'vitest';
import {
  DASH,
  formatAge,
  formatBasisPoints,
  formatBusinessDate,
  formatClock,
  formatDuration,
  formatKm,
  formatLiters,
  formatVnd,
  formatVndCompact,
} from './format';

describe('format', () => {
  it('null KHONG BAO GIO thanh 0', () => {
    for (const fn of [formatVnd, formatKm, formatLiters, formatAge, formatBasisPoints]) {
      expect(fn(null)).toBe(DASH);
      expect(fn(undefined)).toBe(DASH);
    }
    expect(formatKm(0)).toBe('0 km');
  });

  it('tien VND kieu Viet', () => {
    expect(formatVnd(11_500_000)).toBe('11.500.000 ₫');
    expect(formatVnd(-250_000)).toBe('-250.000 ₫');
    expect(formatVndCompact(12_500_000)).toBe('12,5 tr ₫');
    expect(formatVndCompact(-1_230_000_000)).toBe('−1,2 tỷ ₫');
    expect(formatVndCompact(950_000)).toBe('950.000 ₫');
  });

  it('lit nhan ca chuoi thap phan cua may chu', () => {
    expect(formatLiters('120.500')).toBe('120,5 lít');
    expect(formatLiters(80)).toBe('80 lít');
  });

  it('tuoi va thoi luong', () => {
    expect(formatAge(30)).toBe('vừa xong');
    expect(formatAge(125)).toBe('2 phút trước');
    expect(formatAge(3_600)).toBe('1 giờ trước');
    expect(formatAge(3_900)).toBe('1 giờ 5 phút trước');
    expect(formatDuration(3_900)).toBe('1 giờ 05 phút');
    expect(formatDuration(600)).toBe('10 phút');
  });

  it('ngay nghiep vu khong qua Date (khong lech mui gio)', () => {
    expect(formatBusinessDate('2026-09-25')).toBe('25/09/2026');
  });

  it('gio theo mui gio Viet Nam bat ke mui gio may', () => {
    expect(formatClock('2026-09-25T00:05:00.000Z')).toBe('07:05 25/09');
    expect(formatBasisPoints(1_250)).toBe('12,5%');
  });
});
