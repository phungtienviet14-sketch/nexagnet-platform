import type { AuthRole } from '../../../lib/auth';
import {
  entityLabel,
  formatBusinessDate,
  formatDistance,
  formatInstant,
  formatMoney,
  TRIP_KIND_LABEL,
  TRIP_STATUS_LABEL,
  tripStatusTone,
  type StatusTone,
} from '../customer-view';
import { canPerform, type TransportAction } from '../transport-actions';
import type {
  BusinessDate,
  Driver,
  TransportCustomer,
  TransportPartner,
  Trip,
  TripAssignment,
  TripKind,
  TripStatus,
  Vehicle,
} from '../transport-types';

/**
 * MO HINH KHUNG NHIN cua man Chuyen xe — ham thuan, khong React, khong goi mang.
 *
 * Vi sao nhieu logic o day hon mong doi: API van tai KHONG co bo loc, KHONG co tim kiem, KHONG co
 * phan trang, va `Trip` chi tra ve KHOA NGOAI chu khong tra ten. Nen viec ghep
 * ten va loc buoc phai lam o phia man hinh. Do la mot khoang cach da duoc ghi so, khong phai mot
 * lua chon thiet ke — va no nam trong mot tep thuan de con do duoc bang test thay vi tan trong JSX.
 */

/* ------------------------------------------------------------------ *
 * Danh ba — bu cho viec API khong tra ten
 * ------------------------------------------------------------------ */

export interface TripDirectory {
  readonly customers: ReadonlyMap<string, string>;
  readonly partners: ReadonlyMap<string, string>;
  readonly vehicles: ReadonlyMap<string, string>;
  readonly drivers: ReadonlyMap<string, string>;
}

export const EMPTY_DIRECTORY: TripDirectory = {
  customers: new Map(),
  partners: new Map(),
  vehicles: new Map(),
  drivers: new Map(),
};

export const toDirectory = (input: {
  readonly customers?: readonly TransportCustomer[];
  readonly partners?: readonly TransportPartner[];
  readonly vehicles?: readonly Vehicle[];
  readonly drivers?: readonly Driver[];
}): TripDirectory => ({
  customers: new Map((input.customers ?? []).map((row) => [row.id, row.name])),
  partners: new Map((input.partners ?? []).map((row) => [row.id, row.name])),
  vehicles: new Map((input.vehicles ?? []).map((row) => [row.id, row.registrationPlate])),
  drivers: new Map((input.drivers ?? []).map((row) => [row.id, row.fullName])),
});

/**
 * Tra ten neu tra cuu duoc, con khong thi noi ro la CHUA DOC DUOC TEN.
 * Khong bao gio dan `id` len man hinh nhu the do la ten nghiep vu — #161 §7.
 */
const lookup = (
  index: ReadonlyMap<string, string>,
  id: string | null,
  kind: string,
): string | null => {
  if (id === null) return null;
  return index.get(id) ?? `${kind} chưa đọc được tên`;
};

/* ------------------------------------------------------------------ *
 * Dong danh sach
 * ------------------------------------------------------------------ */

export interface TripRow {
  readonly id: string;
  /** Dinh danh NGHIEP VU — cai nay len dia chi, khong phai `id`. */
  readonly code: string;
  readonly status: TripStatus;
  readonly statusLabel: string;
  readonly tone: StatusTone;
  readonly kind: TripKind;
  readonly kindLabel: string;
  readonly businessDate: BusinessDate;
  readonly businessDateLabel: string;
  readonly route: string;
  readonly customerLabel: string;
  readonly carrierLabel: string | null;
  readonly freightLabel: string;
  readonly distanceLabel: string;
  readonly isTerminal: boolean;
}

const TERMINAL_STATUSES: readonly TripStatus[] = ['RECONCILED', 'CANCELLED'];

export const isTerminalTrip = (status: TripStatus): boolean => TERMINAL_STATUSES.includes(status);

export const toTripRow = (trip: Trip, directory: TripDirectory): TripRow => ({
  id: trip.id,
  code: trip.code,
  status: trip.status,
  statusLabel: TRIP_STATUS_LABEL[trip.status],
  tone: tripStatusTone(trip.status),
  kind: trip.kind,
  kindLabel: TRIP_KIND_LABEL[trip.kind],
  businessDate: trip.businessDate,
  businessDateLabel: formatBusinessDate(trip.businessDate),
  route: `${trip.originLabel} → ${trip.destinationLabel}`,
  customerLabel: entityLabel(lookup(directory.customers, trip.customerId, 'Khách hàng'), 'Nội bộ'),
  carrierLabel: lookup(directory.partners, trip.carrierPartnerId, 'Nhà xe'),
  freightLabel: formatMoney(trip.freightAmount),
  distanceLabel: formatDistance(trip.distanceKm),
  isTerminal: isTerminalTrip(trip.status),
});

export const toTripRows = (trips: readonly Trip[], directory: TripDirectory): readonly TripRow[] =>
  trips.map((trip) => toTripRow(trip, directory));

/* ------------------------------------------------------------------ *
 * Loc phia man hinh
 * ------------------------------------------------------------------ */

export interface TripFilter {
  readonly search: string;
  readonly status: TripStatus | 'ALL';
  readonly kind: TripKind | 'ALL';
}

export const EMPTY_TRIP_FILTER: TripFilter = { search: '', status: 'ALL', kind: 'ALL' };

export const isFilterActive = (filter: TripFilter): boolean =>
  filter.search.trim().length > 0 || filter.status !== 'ALL' || filter.kind !== 'ALL';

const COMBINING_MARKS = /[̀-ͯ]/g;
/**
 * `Đ`/`đ` (U+0110/U+0111) la chu RIENG, khong phai `D` co dau, nen `normalize('NFD')` KHONG tach no
 * ra. Bo qua dieu nay thi go "dong anh" khong bao gio tim ra "Đông Anh" — va dia danh Viet Nam day
 * chu do: Đà Nẵng, Đắk Lắk, Đông Anh, Đồng Nai. Phai doi tay.
 */
const D_STROKE = /[Đđ]/g;

/**
 * Tim theo ma chuyen, hai dau tuyen, va mo ta hang — BO DAU truoc khi so.
 * Nguoi dieu hanh go nhanh va thuong khong bo dau; go "thai nguyen" phai tim ra "Thái Nguyên".
 */
const normalise = (value: string): string =>
  value.normalize('NFD').replace(COMBINING_MARKS, '').replace(D_STROKE, 'd').toLowerCase().trim();

export const filterTrips = (trips: readonly Trip[], filter: TripFilter): readonly Trip[] => {
  const needle = normalise(filter.search);
  return trips.filter((trip) => {
    if (filter.status !== 'ALL' && trip.status !== filter.status) return false;
    if (filter.kind !== 'ALL' && trip.kind !== filter.kind) return false;
    if (needle.length === 0) return true;
    const haystack = normalise(
      `${trip.code} ${trip.originLabel} ${trip.destinationLabel} ${trip.cargoDescription ?? ''}`,
    );
    return haystack.includes(needle);
  });
};

/**
 * Sap xep giong may chu (`businessDate desc, code asc`) de thu tu KHONG nhay khi doi giua che do
 * `PERSISTENCE=prisma` (co sap xep) va che do bo nho (khong sap xep gi).
 * `businessDate` la `YYYY-MM-DD` nen so sanh chuoi la dung — khong can dung `Date`.
 */
export const sortTrips = (trips: readonly Trip[]): readonly Trip[] =>
  [...trips].sort((left, right) =>
    left.businessDate === right.businessDate
      ? left.code.localeCompare(right.code)
      : right.businessDate.localeCompare(left.businessDate),
  );

/** Dia chi mang MA chuyen, nen phai doi nguoc ve `id` tren danh sach da tai ve. */
export const findTripByCode = (trips: readonly Trip[], code: string | null): Trip | null =>
  code === null ? null : (trips.find((trip) => trip.code === code) ?? null);

export const tripCodeOf = (trips: readonly Trip[], id: string | null): string | null =>
  id === null ? null : (trips.find((trip) => trip.id === id)?.code ?? null);

/* ------------------------------------------------------------------ *
 * Phan cong
 * ------------------------------------------------------------------ */

/** Dong dang hieu luc la dong co `effectiveTo === null`. */
export const activeAssignment = (assignments: readonly TripAssignment[]): TripAssignment | null =>
  assignments.find((row) => row.effectiveTo === null) ?? null;

export interface AssignmentRow {
  readonly id: string;
  readonly vehicleLabel: string;
  readonly driverLabel: string;
  readonly fromLabel: string;
  readonly toLabel: string;
  readonly isActive: boolean;
  readonly assignedBy: string;
}

export const toAssignmentRows = (
  assignments: readonly TripAssignment[],
  directory: TripDirectory,
): readonly AssignmentRow[] =>
  assignments.map((row) => ({
    id: row.id,
    vehicleLabel: lookup(directory.vehicles, row.vehicleId, 'Xe') ?? 'Chưa gán xe',
    driverLabel: lookup(directory.drivers, row.driverId, 'Lái xe') ?? 'Chưa gán lái xe',
    fromLabel: formatInstant(row.effectiveFrom),
    toLabel: row.effectiveTo === null ? 'đang hiệu lực' : formatInstant(row.effectiveTo),
    isActive: row.effectiveTo === null,
    assignedBy: row.assignedBy,
  }));

/* ------------------------------------------------------------------ *
 * Thao tac duoc phep — GOI Y, khong phai phan quyet
 * ------------------------------------------------------------------ */

/**
 * MAY CHU LA NGUOI QUYET DINH. Bang canh duoi day chi de chon NEN BAY NUT NAO, va do la mot van de
 * trinh bay: bay mot nut chac chan bi tu choi la lam kho nguoi dung, con tu ket luan thay may chu
 * la vuot quyen.
 *
 * Nen khi bi tu choi that, man hinh HIEN NGUYEN VAN cau cua may chu. `blockedReason` chi dung cho
 * dieu kien da ghi ro trong hop dong VA doc duoc tu chinh du lieu dang co tren tay.
 */
const ALLOWED_EDGES: Readonly<Record<TripStatus, readonly TripStatus[]>> = {
  PLANNED: ['IN_TRANSIT', 'CANCELLED'],
  IN_TRANSIT: ['DELIVERED', 'CANCELLED'],
  DELIVERED: ['RECONCILED', 'CANCELLED'],
  RECONCILED: [],
  CANCELLED: [],
};

export interface TripActionOffer {
  readonly id: 'start' | 'deliver' | 'reconcile' | 'cancel';
  readonly label: string;
  /** `null` voi huy — huy di duong rieng co ly do, khong qua `transition`. */
  readonly transitionTo: Exclude<TripStatus, 'CANCELLED'> | null;
  readonly requiredAction: TransportAction;
  readonly isPrimary: boolean;
  readonly isDestructive: boolean;
  /** Dieu kien doc duoc ngay tu du lieu dang co. `null` = khong thay gi chan. */
  readonly blockedReason: string | null;
}

/**
 * `PLANNED → IN_TRANSIT` doi xe + lai xe voi chuyen tu chay/chay ho, hoac doi tac nha xe voi chuyen
 * thue ngoai — hop dong mien §7.1. Dieu kien nay doc duoc ngay, nen noi truoc con hon de nguoi dung
 * bam roi nhan mot cau tu choi.
 */
const startBlockedReason = (trip: Trip, assignment: TripAssignment | null): string | null => {
  if (trip.kind === 'EXTERNAL_CARRIER') {
    return trip.carrierPartnerId === null
      ? 'Chuyến thuê ngoài cần chọn nhà xe trước khi chạy.'
      : null;
  }
  if (assignment === null || assignment.vehicleId === null || assignment.driverId === null) {
    return 'Cần phân công cả xe và lái xe trước khi cho chạy.';
  }
  return null;
};

export const tripActionOffers = (
  trip: Trip,
  assignment: TripAssignment | null,
  role: AuthRole | null,
): readonly TripActionOffer[] => {
  const reachable = ALLOWED_EDGES[trip.status];
  const offers: TripActionOffer[] = [];

  if (reachable.includes('IN_TRANSIT')) {
    offers.push({
      id: 'start',
      label: 'Cho chạy',
      transitionTo: 'IN_TRANSIT',
      requiredAction: 'transport.trip.transition',
      isPrimary: true,
      isDestructive: false,
      blockedReason: startBlockedReason(trip, assignment),
    });
  }
  if (reachable.includes('DELIVERED')) {
    offers.push({
      id: 'deliver',
      label: 'Đã giao',
      transitionTo: 'DELIVERED',
      requiredAction: 'transport.trip.transition',
      isPrimary: true,
      isDestructive: false,
      blockedReason: null,
    });
  }
  if (reachable.includes('RECONCILED')) {
    offers.push({
      id: 'reconcile',
      label: 'Chốt đối soát',
      transitionTo: 'RECONCILED',
      requiredAction: 'transport.trip.transition',
      isPrimary: true,
      isDestructive: false,
      blockedReason: null,
    });
  }
  if (reachable.includes('CANCELLED')) {
    offers.push({
      id: 'cancel',
      label: 'Huỷ chuyến',
      transitionTo: null,
      requiredAction: 'transport.trip.cancel',
      isPrimary: false,
      isDestructive: true,
      blockedReason: null,
    });
  }

  return offers.filter((offer) => canPerform(role, offer.requiredAction));
};

/**
 * MOT viec troi nhat, MOT thao tac chinh — #161 §7. Bang tren xep sao cho canh tien len dung mot
 * buoc luon dung truoc, nen lay `isPrimary` dau tien la du.
 */
export const primaryOffer = (offers: readonly TripActionOffer[]): TripActionOffer | null =>
  offers.find((offer) => offer.isPrimary) ?? null;

/* ------------------------------------------------------------------ *
 * Dong thoi gian
 * ------------------------------------------------------------------ */

export interface TripTimelineEntry {
  readonly at: string;
  readonly atLabel: string;
  readonly title: string;
  readonly detail: string | null;
}

/**
 * Dung tu nhung moc THAT co tren ban ghi. KHONG bia mot moc cho `IN_TRANSIT`/`DELIVERED`: API
 * khong luu thoi diem chuyen trang thai, chi luu `updatedAt`. Ve mot dong thoi gian "day du" bang
 * cach doan la ke mot cau chuyen khong co trong du lieu.
 */
export const toTripTimeline = (
  trip: Trip,
  assignments: readonly TripAssignment[],
  directory: TripDirectory,
): readonly TripTimelineEntry[] => {
  const entries: TripTimelineEntry[] = [
    {
      at: trip.createdAt,
      atLabel: formatInstant(trip.createdAt),
      title: 'Lập chuyến',
      detail: `${TRIP_KIND_LABEL[trip.kind]} · ngày nghiệp vụ ${formatBusinessDate(trip.businessDate)}`,
    },
  ];

  for (const row of assignments) {
    const vehicle = lookup(directory.vehicles, row.vehicleId, 'Xe') ?? 'chưa gán xe';
    const driver = lookup(directory.drivers, row.driverId, 'Lái xe') ?? 'chưa gán lái xe';
    entries.push({
      at: row.effectiveFrom,
      atLabel: formatInstant(row.effectiveFrom),
      title: row.effectiveTo === null ? 'Phân công hiện tại' : 'Phân công (đã thay)',
      detail: `${vehicle} · ${driver}`,
    });
  }

  if (trip.cancelledAt !== null) {
    entries.push({
      at: trip.cancelledAt,
      atLabel: formatInstant(trip.cancelledAt),
      title: 'Huỷ chuyến',
      detail: trip.cancellationReason,
    });
  }

  return entries.sort((left, right) => left.at.localeCompare(right.at));
};

/**
 * Mot chuyen `CANCELLED` ma khong co `cancelledAt`/`cancellationReason` la du lieu THAT co the gap:
 * duong `transition` tao ra duoc dung hinh dang do — `#168 B6` da dong duong di vong do.
 * Man hinh phai noi la khong ro ly do, chu khong duoc de trong nhu the khong co chuyen gi.
 */
export const cancellationNote = (trip: Trip): string | null => {
  if (trip.status !== 'CANCELLED') return null;
  return trip.cancellationReason ?? 'Chuyến đã huỷ nhưng không có lý do được ghi lại.';
};
