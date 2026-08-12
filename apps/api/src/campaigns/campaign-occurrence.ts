import { TZDate } from '@date-fns/tz';
import type { CampaignRecurrence } from '@netviet/shared';
import rrulePackage from 'rrule';

const { RRule } = rrulePackage;

export interface OccurrenceTarget {
  id: string;
  metadata: Record<string, unknown>;
}

export interface CampaignOccurrencePlan {
  /** Natural, stable occurrence key used for idempotent materialization. */
  key: string;
  targetIds: readonly string[];
  windowStart: Date;
  windowEnd: Date;
}

export function planCampaignOccurrences(
  recurrence: CampaignRecurrence,
  targets: readonly OccurrenceTarget[],
  rangeStart: string,
  rangeEnd: string,
): CampaignOccurrencePlan[] {
  const start = parseDateParts(rangeStart);
  const end = parseDateParts(rangeEnd);
  if (dateKey(start) > dateKey(end)) throw new Error('Khoang occurrence khong hop le');
  if (recurrence.type === 'birthday') {
    return birthdayPlans(recurrence, targets, start, end);
  }
  // Nhanh lunar dung `z.enum([...])` nen discriminant cua no la MOT UNION hai literal. TypeScript
  // khong loai duoc mot thanh vien nhu vay bang phep loai tru (`!== 'lunar_month_start' && ...`),
  // vi vay phai narrow THUAN theo 'recurring' — nhanh con lai chinh la hai loai lunar.
  if (recurrence.type !== 'recurring') {
    throw new Error('Lunar calendar provider chua duoc bat cho tenant');
  }
  const first = parseDateParts(recurrence.startDate);
  let options;
  try {
    options = RRule.parseString(recurrence.rrule);
  } catch {
    throw new Error('RRULE khong hop le');
  }
  const rule = new RRule({
    ...options,
    dtstart: new Date(Date.UTC(first.year, first.month - 1, first.day)),
  });
  const dates = rule.between(
    new Date(Date.UTC(start.year, start.month - 1, start.day)),
    new Date(Date.UTC(end.year, end.month - 1, end.day, 23, 59, 59, 999)),
    true,
  );
  return dates.map((date) => {
    const parts = { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
    return occurrence(parts, recurrence.timezone, recurrence.windowStart, recurrence.windowEnd, targets.map((target) => target.id));
  });
}

/** Re-running a materializer over an overlapping horizon does not duplicate an occurrence. */
export function materializeOccurrencePlans(
  plans: readonly CampaignOccurrencePlan[],
  existingKeys: ReadonlySet<string>,
): CampaignOccurrencePlan[] {
  return plans.filter((plan) => !existingKeys.has(plan.key));
}

function birthdayPlans(
  recurrence: Extract<CampaignRecurrence, { type: 'birthday' }>,
  targets: readonly OccurrenceTarget[],
  start: DateParts,
  end: DateParts,
): CampaignOccurrencePlan[] {
  const grouped = new Map<string, string[]>();
  for (const target of targets) {
    const birthday = birthdayMonthDay(target.metadata.birthday);
    if (!birthday) continue;
    for (let year = start.year; year <= end.year; year += 1) {
      if (!isCalendarDate(year, birthday.month, birthday.day)) continue;
      const key = dateKey({ year, ...birthday });
      if (key < dateKey(start) || key > dateKey(end)) continue;
      grouped.set(key, [...(grouped.get(key) ?? []), target.id]);
    }
  }
  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, targetIds]) =>
      occurrence(parseDateParts(key), recurrence.timezone, recurrence.windowStart, recurrence.windowEnd, targetIds),
    );
}

function occurrence(
  parts: DateParts,
  timezone: string,
  windowStart: string,
  windowEnd: string,
  targetIds: readonly string[],
): CampaignOccurrencePlan {
  const [startHour, startMinute] = timeParts(windowStart);
  const [endHour, endMinute] = timeParts(windowEnd);
  const start = TZDate.tz(timezone, parts.year, parts.month - 1, parts.day, startHour, startMinute);
  const end = TZDate.tz(timezone, parts.year, parts.month - 1, parts.day, endHour, endMinute);
  return {
    key: dateKey(parts),
    targetIds: [...targetIds],
    windowStart: new Date(start.getTime()),
    windowEnd: new Date(end.getTime()),
  };
}

interface DateParts { year: number; month: number; day: number }

function parseDateParts(value: string): DateParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error('Ngay phai co dang YYYY-MM-DD');
  const parts = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  if (!isCalendarDate(parts.year, parts.month, parts.day)) throw new Error('Ngay khong hop le');
  return parts;
}

function birthdayMonthDay(value: unknown): { month: number; day: number } | undefined {
  if (typeof value !== 'string') return undefined;
  const match = /^(?:\d{4}-)?(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const month = Number(match[1]);
  const day = Number(match[2]);
  return month >= 1 && month <= 12 && day >= 1 && day <= 31 ? { month, day } : undefined;
}

function isCalendarDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function dateKey(parts: DateParts): string {
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function timeParts(value: string): [number, number] {
  const [hour, minute] = value.split(':').map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) throw new Error('Gio khong hop le');
  return [hour!, minute!];
}

