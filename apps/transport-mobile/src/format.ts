/**
 * DINH DANG SO/TIEN/THOI GIAN — thuan, test tren Node.
 *
 * Hai quy uoc ke thua tu web (`apps/web/experiences/transport-operations/workspace/*`), vi chung la
 * QUY TAC NGHIEP VU chu khong phai tham my:
 *   · gia tri `null` (km chua nhap, chua co du lieu) hien "—", KHONG BAO GIO hien 0;
 *   · tien la so nguyen VND, co dau cham ngan cach kieu Viet ("1.150.000 ₫").
 */
export const DASH = '—';

const VND = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
const DECIMAL = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 });

export function formatVnd(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return DASH;
  return `${VND.format(Math.round(amount))} ₫`;
}

/** Dang rut gon cho o so lon: 12,5 tr ₫ / 1,2 tỷ ₫. Chi dung o the tom tat, khong o chung tu. */
export function formatVndCompact(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return DASH;
  const sign = amount < 0 ? '−' : '';
  const value = Math.abs(amount);
  if (value >= 1_000_000_000) return `${sign}${DECIMAL.format(round1(value / 1_000_000_000))} tỷ ₫`;
  if (value >= 1_000_000) return `${sign}${DECIMAL.format(round1(value / 1_000_000))} tr ₫`;
  return `${sign}${VND.format(Math.round(value))} ₫`;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function formatKm(km: number | null | undefined): string {
  if (km === null || km === undefined || !Number.isFinite(km)) return DASH;
  return `${DECIMAL.format(round1(km))} km`;
}

export function formatLiters(liters: number | string | null | undefined): string {
  if (liters === null || liters === undefined || liters === '') return DASH;
  const value = typeof liters === 'string' ? Number(liters) : liters;
  if (!Number.isFinite(value)) return DASH;
  return `${DECIMAL.format(value)} lít`;
}

/** Phan tram tu basis points (1% = 100 bp) — `marginBasisPoints` cua may chu. */
export function formatBasisPoints(bp: number | null | undefined): string {
  if (bp === null || bp === undefined || !Number.isFinite(bp)) return DASH;
  return `${DECIMAL.format(round1(bp / 100))}%`;
}

/** "3 phút trước", "2 giờ 5 phút trước" — tu so giay may chu tinh (`ageSeconds`). */
export function formatAge(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return DASH;
  if (seconds < 60) return 'vừa xong';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest === 0 ? `${hours} giờ trước` : `${hours} giờ ${rest} phút trước`;
  return `${Math.floor(hours / 24)} ngày trước`;
}

/** Thoi luong cho: "12 phút" / "1 giờ 05 phút" (dung dang web dung cho `elapsedSeconds`). */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0)
    return DASH;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  return `${hours} giờ ${String(minutes % 60).padStart(2, '0')} phút`;
}

/** Ngay nghiep vu YYYY-MM-DD cua may chu -> "25/09/2026". Khong qua `Date` de khong lech mui gio. */
export function formatBusinessDate(value: string | null | undefined): string {
  if (!value) return DASH;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

/** Thoi diem ISO -> "07:05 25/09" theo mui gio chi dinh (mac dinh Viet Nam). */
export function formatClock(iso: string | null | undefined, timeZone = 'Asia/Ho_Chi_Minh'): string {
  if (!iso) return DASH;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return DASH;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const pick = (type: string): string => parts.find((part) => part.type === type)?.value ?? '';
  return `${pick('hour')}:${pick('minute')} ${pick('day')}/${pick('month')}`;
}
