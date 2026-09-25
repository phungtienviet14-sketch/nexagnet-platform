import { DEFAULT_TIME_ZONE } from '../../api/platform';

/**
 * NGAY NGHIEP VU va GIO theo MUI GIO DOANH NGHIEP — khong theo mui gio cua may.
 *
 * May chu tinh "hom nay" bang `Intl` `en-CA` trong mui gio doanh nghiep (`business-date.ts`). Dien
 * thoai cua ke toan di cong tac nuoc ngoai van phai ghi DUNG ngay nghiep vu cua cong ty, nen moi phep
 * doi o day nhan `timeZone` tu `useBranding()`. Mui gio hong -> roi ve mac dinh nen tang.
 */

function safeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone }).format(0);
    return timeZone;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

interface WallClock {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

function wallClockIn(instant: Date, timeZone: string): WallClock {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: safeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const pick = (type: string): number => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: pick('year'),
    month: pick('month'),
    day: pick('day'),
    hour: pick('hour'),
    minute: pick('minute'),
    second: pick('second'),
  };
}

const pad = (value: number, width = 2): string => String(value).padStart(width, '0');

/** "Hom nay" YYYY-MM-DD theo mui gio doanh nghiep. */
export function businessTodayIn(timeZone: string, now: Date = new Date()): string {
  const clock = wallClockIn(now, timeZone);
  return `${pad(clock.year, 4)}-${pad(clock.month)}-${pad(clock.day)}`;
}

/** "HH:mm" hien tai theo mui gio doanh nghiep. */
export function clockNowIn(timeZone: string, now: Date = new Date()): string {
  const clock = wallClockIn(now, timeZone);
  return `${pad(clock.hour)}:${pad(clock.minute)}`;
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const CLOCK = /^(\d{1,2}):(\d{2})$/;

/** Ngay CO THAT tren lich (khong nhan 2026-02-30). */
export function isBusinessDate(value: string): boolean {
  const match = DATE.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value;
}

export function isClock(value: string): boolean {
  const match = CLOCK.exec(value);
  return match !== null && Number(match[1]) < 24 && Number(match[2]) < 60;
}

/** Do lech (phut) cua mui gio tai mot thoi diem — tinh bang Intl, dung ca khi co gio mua he. */
function offsetMinutesAt(instant: Date, timeZone: string): number {
  const clock = wallClockIn(instant, timeZone);
  const asUtc = Date.UTC(
    clock.year,
    clock.month - 1,
    clock.day,
    clock.hour,
    clock.minute,
    clock.second,
  );
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000);
}

function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/**
 * Gio TREN DONG HO cua doanh nghiep -> ISO CO do lech ("2026-09-25T14:30:00+07:00") — dang may chu
 * doi cho `receivedAt` (`z.string().datetime({ offset: true })`). `null` khi ngay/gio khong hop le.
 */
export function zonedIsoWithOffset(date: string, clock: string, timeZone: string): string | null {
  if (!isBusinessDate(date) || !isClock(clock)) return null;
  const [hour, minute] = clock.split(':').map(Number) as [number, number];
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute);
  // Hai vong: lan dau doan do lech tai gio "ngay tho", lan hai sua cho gio sat moc doi gio.
  const first = offsetMinutesAt(new Date(naiveUtc), timeZone);
  const offset = offsetMinutesAt(new Date(naiveUtc - first * 60_000), timeZone);
  return `${date}T${pad(hour)}:${pad(minute)}:00${formatOffset(offset)}`;
}
