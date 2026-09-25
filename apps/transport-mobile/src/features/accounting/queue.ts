import { formatBusinessDate, formatLiters, formatVnd } from '../../format';
import { formatCount } from '../office/control-tower';
import type { ExpenseClaim, WaitingAllowance } from '../office/decision-types';
import { fuelContextLabel, PAYMENT_METHOD_LABEL } from './fuel';
import type { FuelEntryPage, FuelEntryRow } from './types';

/**
 * HANG "CẦN DUYỆT" CUA KE TOAN — mot danh sach tu BA nguon, HAM THUAN.
 *
 *   · de nghi chi  `GET /transport/expense-claims?status=PENDING_REVIEW`
 *   · phieu dau    `GET /transport/fuel/entries?verification=DECLARED&limit=50`
 *   · phu cap cho  `GET /transport/waiting-allowances/pending`
 *
 * Thu tu TRONG moi nguon la cua may chu (khong xep lai); giua cac nguon la mot thu tu co dinh. So
 * tren chip phieu dau la `pendingVerificationCount` cua MAY CHU — danh sach co the chi hien 50 dau,
 * va chip noi ro "50/73" thay vi de nguoi doc tuong chi con 50.
 */
export type QueueType = 'CLAIM' | 'FUEL' | 'ALLOWANCE';
export type QueueFilter = 'ALL' | QueueType;

export type QueueEntry =
  | { readonly type: 'CLAIM'; readonly id: string; readonly claim: ExpenseClaim }
  | { readonly type: 'FUEL'; readonly id: string; readonly fuel: FuelEntryRow }
  | { readonly type: 'ALLOWANCE'; readonly id: string; readonly allowance: WaitingAllowance };

export const QUEUE_FILTERS: readonly QueueFilter[] = ['ALL', 'CLAIM', 'FUEL', 'ALLOWANCE'];

export const QUEUE_FILTER_LABEL: Readonly<Record<QueueFilter, string>> = {
  ALL: 'Tất cả',
  CLAIM: 'Đề nghị chi',
  FUEL: 'Phiếu dầu',
  ALLOWANCE: 'Phụ cấp chờ',
};

export interface QueueSources {
  readonly claims?: readonly ExpenseClaim[];
  readonly fuel?: FuelEntryPage;
  readonly allowances?: readonly WaitingAllowance[];
}

export const entryKey = (entry: Pick<QueueEntry, 'type' | 'id'>): string =>
  `${entry.type}:${entry.id}`;

/** Nguon chua doc xong / da tat thi vang mat — khong thanh "khong co viec". */
export function buildQueue(sources: QueueSources): readonly QueueEntry[] {
  return [
    ...(sources.claims ?? []).map((claim): QueueEntry => ({ type: 'CLAIM', id: claim.id, claim })),
    ...(sources.fuel?.rows ?? []).map((fuel): QueueEntry => ({ type: 'FUEL', id: fuel.id, fuel })),
    ...(sources.allowances ?? []).map((allowance): QueueEntry => ({
      type: 'ALLOWANCE',
      id: allowance.id,
      allowance,
    })),
  ];
}

export function filterQueue(
  entries: readonly QueueEntry[],
  filter: QueueFilter,
): readonly QueueEntry[] {
  return filter === 'ALL' ? entries : entries.filter((entry) => entry.type === filter);
}

export interface QueueCount {
  /** `null` = nguon chua co du lieu (dang doc / tat / loi). */
  readonly total: number | null;
  readonly shown: number;
}

export function queueCounts(sources: QueueSources): Readonly<Record<QueueFilter, QueueCount>> {
  const claim: QueueCount = {
    total: sources.claims ? sources.claims.length : null,
    shown: sources.claims?.length ?? 0,
  };
  const fuel: QueueCount = {
    total: sources.fuel ? sources.fuel.pendingVerificationCount : null,
    shown: sources.fuel?.rows.length ?? 0,
  };
  const allowance: QueueCount = {
    total: sources.allowances ? sources.allowances.length : null,
    shown: sources.allowances?.length ?? 0,
  };
  const known = [claim, fuel, allowance].filter((count) => count.total !== null);
  return {
    CLAIM: claim,
    FUEL: fuel,
    ALLOWANCE: allowance,
    ALL: {
      total: known.length === 0 ? null : known.reduce((sum, count) => sum + (count.total ?? 0), 0),
      shown: claim.shown + fuel.shown + allowance.shown,
    },
  };
}

/** "12" / "50/73" (danh sach bi cat) / `null` (chua biet — khong in 0). */
export function chipCount(count: QueueCount): string | null {
  if (count.total === null) return null;
  return count.shown < count.total
    ? `${formatCount(count.shown)}/${formatCount(count.total)}`
    : formatCount(count.total);
}

/**
 * VIEC KE TIEP sau khi quyet xong `key` — nhip "inbox zero": muc ngay SAU trong danh sach dang xem,
 * het thi muc ngay truoc, khong con gi thi `null`.
 */
export function nextAfter(entries: readonly QueueEntry[], key: string): QueueEntry | null {
  const index = entries.findIndex((entry) => entryKey(entry) === key);
  if (index === -1) return entries[0] ?? null;
  return entries[index + 1] ?? entries[index - 1] ?? null;
}

export interface QueueCardModel {
  readonly title: string;
  readonly amount: string;
  readonly subline: string;
  readonly warnings: readonly string[];
  readonly typeLabel: string;
}

export function cardModel(
  entry: QueueEntry,
  driverNameOf: (driverId: string) => string,
): QueueCardModel {
  switch (entry.type) {
    case 'CLAIM':
      return {
        typeLabel: 'Đề nghị chi',
        title: driverNameOf(entry.claim.driverId),
        amount: formatVnd(entry.claim.claimedAmount),
        subline: `${entry.claim.categoryCode === 'FUEL' ? 'Nhiên liệu' : entry.claim.categoryCode} · ${formatBusinessDate(entry.claim.businessDate)}`,
        warnings: entry.claim.tripId === null ? ['Chưa gắn chuyến'] : [],
      };
    case 'FUEL':
      return {
        typeLabel: 'Phiếu dầu',
        title: entry.fuel.driverName ?? 'Lái xe chưa đọc được tên',
        amount: formatVnd(entry.fuel.amount),
        subline: `${entry.fuel.vehiclePlate ?? 'Xe chưa đọc được biển'} · ${fuelContextLabel(entry.fuel)} · ${formatLiters(entry.fuel.litersUnits)}`,
        warnings: [
          PAYMENT_METHOD_LABEL[entry.fuel.paymentMethod] ?? entry.fuel.paymentMethod,
          ...(entry.fuel.reviewReasons.length > 0
            ? [`${entry.fuel.reviewReasons.length} điểm cần soát`]
            : []),
          ...(entry.fuel.evidenceCount === 0 ? ['Không kèm ảnh'] : []),
        ],
      };
    case 'ALLOWANCE':
      return {
        typeLabel: 'Phụ cấp chờ',
        title: driverNameOf(entry.allowance.driverId),
        amount: formatVnd(entry.allowance.candidateAmount),
        subline: `${formatBusinessDate(entry.allowance.businessDate)} · ${entry.allowance.reason}`,
        warnings: [],
      };
  }
}
