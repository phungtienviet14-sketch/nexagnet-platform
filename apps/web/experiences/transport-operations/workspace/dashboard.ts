import type { CapabilityId } from '@netviet/tenant';
import type { AuthRole } from '../../../lib/auth';
import { formatCount } from '../customer-view';
import type { TransportSectionId } from '../navigation';
import type { Driver, FuelReconciliation, Trip, Vehicle } from '../transport-types';

/**
 * MO HINH KHUNG NHIN cua man Tong quan.
 *
 * LUAT CUA CA TEP, tu #161 §4.B: *"khong bia the bao duong/tuan thu/luong truoc khi TX-06/TX-07 co
 * san"*, va trang thai doi xe chi lay *"tu du lieu truoc T6 o cho nao noi that duoc"*.
 *
 * Nen bang dieu khien nay tra ve HAI danh sach, khong phai mot:
 *
 *   · `stats` — con so DEM DUOC tu du lieu that dang co tren tay;
 *   · `unavailable` — the KHONG dung duoc, kem LY DO cu the.
 *
 * Danh sach thu hai la phan quan trong hon. Mot bang dieu khien day so trong do vai con so la
 * uoc doan thi te hon mot bang thua so nhung moi so deu dung, vi khong ai biet phai tin cai nao.
 */

export interface DashboardStat {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly hint: string | null;
  /** Bam vao thi di dau — de con so tren bang la mot loi vao viec, khong phai mot trang tri. */
  readonly section: TransportSectionId | null;
}

export interface DashboardWorkItem {
  readonly key: string;
  readonly title: string;
  readonly detail: string;
  readonly section: TransportSectionId;
  /** Dinh danh NGHIEP VU de mo dung dong — ma chuyen, khong phai `id`. */
  readonly selection: string | null;
}

export interface UnavailableCard {
  readonly label: string;
  readonly reason: string;
}

export interface DashboardModel {
  readonly stats: readonly DashboardStat[];
  readonly work: readonly DashboardWorkItem[];
  readonly hasWork: boolean;
  readonly headline: string;
  readonly unavailable: readonly UnavailableCard[];
}

export interface DashboardInput {
  readonly trips: readonly Trip[];
  readonly vehicles: readonly Vehicle[];
  readonly drivers: readonly Driver[];
  readonly reconciliations: readonly FuelReconciliation[];
  readonly capabilities: readonly CapabilityId[];
  readonly role: AuthRole | null;
}

/** Bao nhieu viec bay ra tren bang truoc khi chuyen sang "mo danh sach day du". */
export const WORK_LIMIT = 6;

const countBy = <T, K extends string>(
  rows: readonly T[],
  key: (row: T) => K,
): Partial<Record<K, number>> => {
  const counts: Partial<Record<K, number>> = {};
  for (const row of rows) {
    const bucket = key(row);
    counts[bucket] = (counts[bucket] ?? 0) + 1;
  }
  return counts;
};

/**
 * Danh sach the KHONG dung duoc. Moi dong tro ve mot khoang cach da do trong `api-gaps.ts`, va
 * cau `reason` la cau se hien tren man hinh — nen no phai doc len duoc cho nguoi khong lam ky thuat.
 */
const unavailableCards = (capabilities: readonly CapabilityId[]): readonly UnavailableCard[] => {
  const enabled = new Set<string>(capabilities);
  const cards: UnavailableCard[] = [
    {
      label: 'Số dư quỹ toàn đội',
      reason:
        'Máy chủ chỉ trả số dư của từng lái xe một, chưa có đường đọc tổng cả đội. Mở mục Quỹ lái ' +
        'xe để xem theo từng người.',
    },
    {
      label: 'Phiếu dầu chờ xác thực',
      reason:
        'Phiếu dầu chỉ đọc được theo từng chuyến, chưa có đường đọc phiếu của cả đội. Con số toàn ' +
        'đội vì vậy chưa đếm được.',
    },
    {
      label: 'Chênh lệch chờ xử lý',
      reason:
        'Danh sách kỳ đối soát không kèm số chênh lệch còn treo, nên con số này chỉ đúng khi mở ' +
        'từng kỳ.',
    },
  ];

  // Chi noi ve AR/AP va bien khi khach DA bat nghiep vu quyet toan — con khong thi day khong phai
  // mot khoang cach, ma la mot nghiep vu ho chua mua.
  if (enabled.has('transport-settlement')) {
    cards.push(
      {
        label: 'Công nợ phải thu / phải trả',
        reason:
          'Nghiệp vụ quyết toán đã bật nhưng máy chủ chưa mở đường HTTP nào cho nó, nên số liệu ' +
          'công nợ chưa lấy ra được.',
      },
      {
        label: 'Biên trực tiếp',
        reason: 'Cùng lý do với công nợ: phần tính biên đã chạy ở máy chủ nhưng chưa có đường đọc.',
      },
    );
  }

  return cards;
};

const OPEN_RECONCILIATION_STATES = new Set(['DRAFT', 'MATCHING', 'RESOLVED', 'REOPENED']);

export const toDashboard = (input: DashboardInput): DashboardModel => {
  const byStatus = countBy(input.trips, (trip) => trip.status);
  const byVehicleStatus = countBy(input.vehicles, (vehicle) => vehicle.status);
  const activeDrivers = input.drivers.filter((driver) => driver.status === 'ACTIVE').length;
  const openReconciliations = input.reconciliations.filter((row) =>
    OPEN_RECONCILIATION_STATES.has(row.state),
  ).length;

  const stats: DashboardStat[] = [
    {
      key: 'in-transit',
      label: 'Chuyến đang chạy',
      value: formatCount(byStatus.IN_TRANSIT ?? 0),
      hint: null,
      section: 'trips',
    },
    {
      key: 'planned',
      label: 'Chuyến đã lên kế hoạch',
      value: formatCount(byStatus.PLANNED ?? 0),
      hint: 'Chưa cho chạy.',
      section: 'trips',
    },
    {
      key: 'delivered',
      label: 'Đã giao, chờ đối soát',
      value: formatCount(byStatus.DELIVERED ?? 0),
      hint: 'Chốt đối soát sẽ khoá chuyến khỏi mọi khoản chi mới.',
      section: 'trips',
    },
    {
      key: 'vehicles-idle',
      label: 'Xe đang rỗi',
      value: formatCount(byVehicleStatus.IDLE ?? 0),
      hint: null,
      section: 'fleet',
    },
    {
      key: 'vehicles-maintenance',
      label: 'Xe đang bảo dưỡng',
      value: formatCount(byVehicleStatus.UNDER_MAINTENANCE ?? 0),
      hint: 'Đọc từ trạng thái xe, chưa phải từ lịch bảo dưỡng.',
      section: 'fleet',
    },
    {
      key: 'drivers-active',
      label: 'Lái xe đang làm',
      value: formatCount(activeDrivers),
      hint: null,
      section: 'fleet',
    },
  ];

  if (input.reconciliations.length > 0) {
    stats.push({
      key: 'reconciliations-open',
      label: 'Kỳ đối soát đang mở',
      value: formatCount(openReconciliations),
      hint: null,
      section: 'fuel',
    });
  }

  const work: DashboardWorkItem[] = [];
  for (const trip of input.trips) {
    if (work.length >= WORK_LIMIT) break;
    if (trip.status === 'PLANNED') {
      work.push({
        key: `plan-${trip.id}`,
        title: `Chuyến ${trip.code} chưa cho chạy`,
        detail: `${trip.originLabel} → ${trip.destinationLabel}`,
        section: 'trips',
        selection: trip.code,
      });
    } else if (trip.status === 'DELIVERED') {
      work.push({
        key: `reconcile-${trip.id}`,
        title: `Chuyến ${trip.code} đã giao, chờ chốt đối soát`,
        detail: `${trip.originLabel} → ${trip.destinationLabel}`,
        section: 'trips',
        selection: trip.code,
      });
    }
  }

  return {
    stats,
    work,
    hasWork: work.length > 0,
    // KHONG noi "moi thu deu on" khi khong co viec — chi noi la khong co viec CAN NGUOI.
    headline:
      work.length > 0
        ? `${formatCount(work.length)} việc đang chờ người xử lý.`
        : 'Không có chuyến nào đang chờ người xử lý.',
    unavailable: unavailableCards(input.capabilities),
  };
};
