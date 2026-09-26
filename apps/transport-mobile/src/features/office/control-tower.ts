import type { ControlTowerView, FleetPresence, PendingWorkEntry, QueueItem } from './types';

/**
 * THAP DIEU HANH tren dien thoai — HAM THUAN, test tren Node.
 *
 * Ba luat ke thua tu web (`workspace/control-tower.ts`) va tu may chu, vi chung la NGHIEP VU:
 *   1. Moi con so den tu may chu. "Dang chay" KHONG dem lai tu trang thai: `onTrip` dem XE,
 *      `runningRuns` dem VONG CHAY, va ca hai luon di kem don vi (#336).
 *   2. Tieu de dem tu `queueTotal`, khong tu `queue.length` (danh sach co the bi cat).
 *   3. `unavailableSources` (khach tat nghiep vu) va `pendingWork` (nen tang chua theo doi duoc)
 *      la HAI danh sach rieng va khong bao gio gop thanh "khong co viec".
 *
 * `IN_TRANSIT` la "Trên đường" — KHONG BAO GIO "Đang chạy" (chu do chi danh cho vong chay ACTIVE).
 */

export const SEVERITY_ORDER = ['CRITICAL', 'WARNING', 'INFO'] as const;

export const SEVERITY_LABEL: Readonly<Record<string, string>> = {
  CRITICAL: 'Khẩn — cần quyết ngay',
  WARNING: 'Cần xem hôm nay',
  INFO: 'Để biết',
};

export type SeverityTone = 'danger' | 'caution' | 'neutral';

/** Mau theo MUC — do chi cho CRITICAL; muc la (may chu them) roi ve trung tinh, khong bao dong. */
export function severityTone(severity: string): SeverityTone {
  if (severity === 'CRITICAL') return 'danger';
  if (severity === 'WARNING') return 'caution';
  return 'neutral';
}

const QUEUE_LABEL: Readonly<Record<string, string>> = {
  RUN_ACTIVE_WITHOUT_DRIVER: 'Vòng chạy đang chạy mà chưa phân công lái xe',
  RUN_LEG_MISSING_DISTANCE: 'Chặng đã xong nhưng chưa nhập số km',
  EXPENSE_CLAIM_AWAITING_REVIEW: 'Đề nghị chi lái xe đang chờ duyệt',
  DRIVER_FUND_BALANCE_UNUSUAL: 'Quỹ lái xe đang âm — công ty còn nợ lái xe',
  FUEL_ENTRY_AWAITING_VERIFICATION: 'Phiếu đổ dầu đang chờ xác thực',
  FUEL_RECONCILIATION_OPEN: 'Kỳ đối soát bảng kê còn đang mở',
  FUEL_CONSUMPTION_ABNORMAL: 'Tiêu hao dầu bất thường',
  COMPLIANCE_DOCUMENT_EXPIRED: 'Giấy tờ đã hết hạn',
  COMPLIANCE_DOCUMENT_EXPIRING: 'Giấy tờ sắp hết hạn',
  COMPLIANCE_DOCUMENT_MISSING: 'Thiếu giấy tờ bắt buộc',
  MAINTENANCE_OVERDUE: 'Bảo dưỡng đã quá hạn',
  MAINTENANCE_DUE_SOON: 'Bảo dưỡng sắp đến hạn',
  VEHICLE_STATE_INCONSISTENT: 'Xe vừa đang sửa vừa đang chạy chuyến',
  CHECKPOINT_LOCATION_PROOF_MISSING: 'Mốc hiện trường không kèm bằng chứng vị trí',
  // Hai ma may chu DA phat nhung web chua co nhan — chu lay tu nhan "viec chua theo doi" cua web.
  DRIVER_WAITING_ALLOWANCE_AWAITING_APPROVAL: 'Phụ cấp chờ của lái xe đang chờ duyệt',
  DELIVERY_PROOF_DOCUMENT_MISSING: 'Chặng đã giao xong nhưng thiếu chứng từ giao hàng',
  // #398: CHI viec tai xe nhan truc tiep CHUA DU — don tu tao binh thuong khong vao hang nay.
  SITE_INTAKE_NEEDS_REVIEW: 'Việc tài xế nhận trực tiếp chưa đủ thông tin',
};

/** Ma la (may chu moi hon ung dung) van hien — kem chinh ma, khong nuot mat mot viec. */
export function queueKindLabel(kind: string): string {
  return QUEUE_LABEL[kind] ?? `Việc chưa có nhãn trên điện thoại (${kind})`;
}

/** Khoa on dinh cua mot muc — `kind` + id ky thuat (chi dung lam khoa, khong hien). */
export function queueItemKey(item: Pick<QueueItem, 'kind' | 'subject'>): string {
  return `${item.kind}:${item.subject.id}`;
}

export interface SeverityGroup {
  readonly severity: string;
  readonly label: string;
  readonly tone: SeverityTone;
  readonly items: readonly QueueItem[];
}

/**
 * Nhom theo MUC, GIU thu tu may chu trong tung nhom (may chu da xep CRITICAL > WARNING > INFO roi
 * theo ma). Muc la duoc them vao CUOI, khong bi bo.
 */
export function groupQueueBySeverity(queue: readonly QueueItem[]): readonly SeverityGroup[] {
  const known: readonly string[] = SEVERITY_ORDER;
  const extra = queue
    .map((item) => item.severity)
    .filter((severity, index, all) => !known.includes(severity) && all.indexOf(severity) === index);
  return [...known, ...extra]
    .map((severity) => ({
      severity,
      label: SEVERITY_LABEL[severity] ?? `Mức ${severity}`,
      tone: severityTone(severity),
      items: queue.filter((item) => item.severity === severity),
    }))
    .filter((group) => group.items.length > 0);
}

/** Ba viec dau — DUNG thu tu may chu (CRITICAL truoc), khong xep lai o may khach. */
export function topDecisions(queue: readonly QueueItem[], count = 3): readonly QueueItem[] {
  return queue.slice(0, Math.max(0, count));
}

const COUNT = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
export const formatCount = (value: number): string => COUNT.format(value);

/**
 * CAU MO DAU buoi sang — ghep TU SO CUA MAY CHU: "3 việc cần quyết · 4/6 xe đang chạy".
 * "xe đang chạy" la `fleet.onTrip` (dem XE), tren `fleet.total`.
 */
export function composeHeadline(view: Pick<ControlTowerView, 'queueTotal' | 'fleet'>): string {
  const work =
    view.queueTotal === 0
      ? 'Không có việc cần quyết'
      : `${formatCount(view.queueTotal)} việc cần quyết`;
  return `${work} · ${fleetPhrase(view.fleet)}`;
}

/** "4/6 xe đang chạy" — XE (`onTrip`) tren tong xe (`total`), ca hai cua may chu. */
export function fleetPhrase(fleet: Pick<FleetPresence, 'onTrip' | 'total'>): string {
  return fleet.total === 0
    ? 'chưa có xe trong đội'
    : `${formatCount(fleet.onTrip)}/${formatCount(fleet.total)} xe đang chạy`;
}

/** "Vòng chạy đang chạy: 3 trên 2 xe" — `runningRuns` cua MAY CHU, luon kem so xe. */
export function runningSummary(fleet: FleetPresence): string {
  if (fleet.runningRuns === 0) return 'Không có vòng chạy nào đang chạy.';
  return `Vòng chạy đang chạy: ${formatCount(fleet.runningRuns)} trên ${formatCount(fleet.onTrip)} xe.`;
}

export interface FleetStat {
  readonly key: string;
  readonly label: string;
  readonly value: string;
}

/** Nhan cua web (`workspace/control-tower.ts`) — "Xe đang chạy" dem XE, co don vi. */
export function fleetStats(fleet: FleetPresence): readonly FleetStat[] {
  return [
    { key: 'fleet', label: 'Xe trong đội', value: formatCount(fleet.total) },
    { key: 'on-trip', label: 'Xe đang chạy', value: formatCount(fleet.onTrip) },
    { key: 'idle', label: 'Đang rảnh', value: formatCount(fleet.idle) },
    { key: 'maintenance', label: 'Đang sửa chữa', value: formatCount(fleet.underMaintenance) },
    { key: 'drivers', label: 'Lái xe đang hoạt động', value: formatCount(fleet.activeDrivers) },
  ];
}

const SOURCE_LABEL: Readonly<Record<string, string>> = {
  EXPENSE_CLAIMS: 'Duyệt chi lái xe',
  FUEL: 'Nhiên liệu',
  OPERATIONAL_ALERTS: 'Bảo dưỡng & giấy tờ',
  CHECKPOINT: 'Mốc hiện trường',
  FIELD_OPERATIONS: 'Chờ người nhận, phụ cấp chờ, chứng từ hiện trường',
  SITE_INTAKE: 'Việc tài xế nhận trực tiếp',
};

/** Nguon khach CHUA BAT — mot cau cho moi nguon; nguon la hien ma. */
export function unavailableSourceNotes(sources: readonly string[]): readonly string[] {
  return sources.map(
    (source) =>
      `${SOURCE_LABEL[source] ?? source}: doanh nghiệp chưa bật nghiệp vụ này, nên hàng việc không có mục đó.`,
  );
}

const PENDING_LABEL: Readonly<Record<string, string>> = {
  RECEIVER_WAITING_ABOVE_THRESHOLD: 'Chờ người nhận quá ngưỡng',
  DELIVERY_PROOF_DOCUMENT_MISSING: 'Thiếu chứng từ giao hàng',
  DRIVER_WAITING_ALLOWANCE_AWAITING_APPROVAL: 'Phụ cấp chờ của lái xe đang chờ duyệt',
  CUSTOMER_AR_OVERDUE: 'Công nợ khách quá hạn',
  LOCATION_PROOF_REVIEW: 'Bằng chứng vị trí cần người xem',
};

const PENDING_REASON: Readonly<Record<string, string>> = {
  AWAITING_WAITING_SESSION_SOURCE: 'chưa có phiên chờ người nhận (giờ mở, giờ đóng)',
  AWAITING_WAITING_THRESHOLD_POLICY:
    'chưa có ngưỡng “chờ bao lâu thì cảnh báo” — doanh nghiệp chưa quyết con số này',
  AWAITING_OPERATIONAL_DOCUMENT_SOURCE: 'chưa có tài liệu vận hành (biên bản giao, phiếu ký nhận)',
  AWAITING_CHECKPOINT_SOURCE: 'chưa có mốc hiện trường',
  AWAITING_RECEIVABLE_DUE_DATE_SOURCE: 'chưa có đường đọc công nợ theo hạn',
  AWAITING_FLEET_WIDE_PROOF_QUERY: 'chưa có đường đọc bằng chứng vị trí cho cả đội xe',
};

/** Viec NEN TANG chua theo doi duoc — khac han "khach chua bat". */
export function pendingWorkNotes(entries: readonly PendingWorkEntry[]): readonly string[] {
  return entries.map(
    (entry) =>
      `${PENDING_LABEL[entry.kind] ?? entry.kind}: hệ thống ${PENDING_REASON[entry.reason] ?? `chưa theo dõi được (${entry.reason})`}.`,
  );
}

export const COLUMN_LABEL: Readonly<Record<string, string>> = {
  PLANNED: 'Đã lên kế hoạch',
  PICKUP: 'Vào lấy hàng',
  LOADING: 'Đang xếp hàng',
  IN_TRANSIT: 'Trên đường',
  ARRIVED: 'Đã đến nơi giao',
  WAITING: 'Chờ người nhận',
  DELIVERED: 'Đã giao xong',
};

/** Thu tu QUY TRINH cua bang (chieu mot chuyen hang di), khong phai bang chu cai. */
export const COLUMN_ORDER: readonly string[] = [
  'PLANNED',
  'PICKUP',
  'LOADING',
  'IN_TRANSIT',
  'ARRIVED',
  'WAITING',
  'DELIVERED',
];

export const columnLabel = (column: string): string => COLUMN_LABEL[column] ?? column;

/** Giai doan chang (tu moc hien truong). `IN_TRANSIT` = "Trên đường", khong phai "Đang chạy". */
const PHASE_LABEL: Readonly<Record<string, string>> = {
  PLANNED: 'Chưa bấm mốc nào',
  AT_PICKUP: 'Đã vào lấy hàng',
  LOADING: 'Đang xếp hàng',
  IN_TRANSIT: 'Trên đường',
  ARRIVED: 'Đã đến nơi giao',
  DELIVERED: 'Đã giao xong',
};

/** `null` = khong co nguon moc / chua co moc — hien "—", KHONG doan giai doan. */
export const phaseLabel = (phase: string | null): string =>
  phase === null ? '—' : (PHASE_LABEL[phase] ?? phase);
