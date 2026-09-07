import { EMPTY_VALUE, formatBusinessDate, formatCount, formatDistance } from '../customer-view';
import type { TransportSectionId } from '../navigation';
import type {
  ActionQueueItem,
  ActionQueueKind,
  ActionQueueSeverity,
  ControlTowerSource,
  ControlTowerView,
  OperationsBoardColumn,
  PendingActionQueueEntry,
} from '../transport-types';

/**
 * THAP DIEU HANH — tang doc cua man hinh, HAM THUAN.
 *
 * Cung khuon `dashboard.ts`: vao la payload API, ra la chuoi da san sang hien thi. Khong hook,
 * khong fetch, khong React — nen moi luat o day kiem duoc bang mot bai `.ts`, con
 * `ControlTowerView.tsx` chi con viec sap xep the.
 *
 * ===========================================================================
 * HAI LUAT KHONG DUOC PHA
 *
 * 1. `null` KHONG bao gio thanh `0`. `?? 0` doc len rat tu nhien va no bien mot vong chay chua nhap
 *    km thanh mot vong chay dai 0 km — dung kieu sai ma `run-distance.ts` da chan o tang doc, va
 *    de tuot lai ngay tai day.
 * 2. `id` KY THUAT khong bao gio len dia chi. Khi may chu noi `reference: null`, dong do mat duong
 *    dan sau, va do la cau tra loi dung — quy uoc `SELECTION_QUERY_PARAM` doi mot dinh danh nghiep
 *    vu, khong phai mot UUID.
 */

/** Thu tu QUY TRINH, khong phai thu tu bang chu cai — bang doc theo chieu mot chuyen hang di. */
export const OPERATIONS_BOARD_ORDER = [
  'PLANNED',
  'PICKUP',
  'LOADING',
  'IN_TRANSIT',
  'ARRIVED',
  'WAITING',
  'DELIVERED',
] as const satisfies readonly OperationsBoardColumn[];

const COLUMN_LABEL: Readonly<Record<OperationsBoardColumn, string>> = {
  PLANNED: 'Đã lên kế hoạch',
  PICKUP: 'Vào lấy hàng',
  LOADING: 'Đang xếp hàng',
  IN_TRANSIT: 'Đang chạy',
  ARRIVED: 'Đã đến nơi giao',
  WAITING: 'Chờ người nhận',
  DELIVERED: 'Đã giao xong',
};

const CHECKPOINT_COLUMN_NOTE =
  'Cột này cần mốc hiện trường (vào cổng, xếp hàng, bấm đã đến, chờ nhận) — hệ thống chưa ghi ' +
  'nhận các mốc đó, nên cột để trống thay vì đoán từ trạng thái chặng.';

const SOURCE_LABEL: Readonly<Record<ControlTowerSource, string>> = {
  EXPENSE_CLAIMS: 'Duyệt chi lái xe',
  FUEL: 'Nhiên liệu',
  OPERATIONAL_ALERTS: 'Bảo dưỡng & giấy tờ',
};

const QUEUE_LABEL: Readonly<Record<ActionQueueKind, string>> = {
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
};

/**
 * MOI MA VIEC DAN VE MOT MUC CO THAT.
 *
 * `Record` day du chu khong phai mot `switch` co nhanh mac dinh: them mot ma o tang doc ma quen dan
 * duong o day thi tep nay KHONG BIEN DICH — thay vi lang le do ve mot muc mac dinh nao do.
 */
const QUEUE_SECTION: Readonly<Record<ActionQueueKind, TransportSectionId>> = {
  RUN_ACTIVE_WITHOUT_DRIVER: 'movement',
  RUN_LEG_MISSING_DISTANCE: 'movement',
  EXPENSE_CLAIM_AWAITING_REVIEW: 'expense-claims',
  DRIVER_FUND_BALANCE_UNUSUAL: 'driver-fund',
  FUEL_ENTRY_AWAITING_VERIFICATION: 'fuel',
  FUEL_RECONCILIATION_OPEN: 'fuel',
  FUEL_CONSUMPTION_ABNORMAL: 'fuel',
  COMPLIANCE_DOCUMENT_EXPIRED: 'maintenance',
  COMPLIANCE_DOCUMENT_EXPIRING: 'maintenance',
  COMPLIANCE_DOCUMENT_MISSING: 'maintenance',
  MAINTENANCE_OVERDUE: 'maintenance',
  MAINTENANCE_DUE_SOON: 'maintenance',
  VEHICLE_STATE_INCONSISTENT: 'maintenance',
};

const PENDING_LABEL: Readonly<Record<PendingActionQueueEntry['kind'], string>> = {
  RECEIVER_WAITING_ABOVE_THRESHOLD: 'Chờ người nhận quá ngưỡng',
  DELIVERY_PROOF_DOCUMENT_MISSING: 'Thiếu chứng từ giao hàng',
  DRIVER_WAITING_ALLOWANCE_AWAITING_APPROVAL: 'Phụ cấp chờ của lái xe đang chờ duyệt',
  CUSTOMER_AR_OVERDUE: 'Công nợ khách quá hạn',
  LOCATION_PROOF_REVIEW: 'Bằng chứng vị trí cần người xem',
};

const PENDING_REASON: Readonly<Record<PendingActionQueueEntry['reason'], string>> = {
  AWAITING_CHECKPOINT_SOURCE: 'chưa có mốc hiện trường',
  AWAITING_RECEIVABLE_DUE_DATE_SOURCE: 'chưa có đường đọc công nợ theo hạn',
  AWAITING_FLEET_WIDE_PROOF_QUERY: 'chưa có đường đọc bằng chứng vị trí cho cả đội xe',
};

export type SeverityTone = 'danger' | 'warn' | 'muted';

const SEVERITY_TONE: Readonly<Record<ActionQueueSeverity, SeverityTone>> = {
  CRITICAL: 'danger',
  WARNING: 'warn',
  INFO: 'muted',
};

export interface ControlTowerCard {
  readonly key: string;
  readonly runCode: string;
  readonly businessDate: string;
  readonly legs: string;
  /** Da dinh dang. `'—'` khi con mot chang thieu km — KHONG bao gio la `'0'`. */
  readonly totalKm: string;
}

export interface ControlTowerColumn {
  readonly column: OperationsBoardColumn;
  readonly label: string;
  readonly total: string;
  readonly cards: readonly ControlTowerCard[];
  readonly isAvailable: boolean;
  /** `null` khi cot co nguon. Mot cau tieng Viet khi cot ton tai ma chua co du lieu. */
  readonly note: string | null;
}

export interface ControlTowerQueueRow {
  readonly key: string;
  readonly title: string;
  readonly tone: SeverityTone;
  readonly section: TransportSectionId;
  /** MA nghiep vu, hoac `null`. KHONG BAO GIO la `subject.id`. */
  readonly selection: string | null;
}

export interface ControlTowerStat {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly section: TransportSectionId | null;
}

export interface ControlTowerModel {
  readonly generatedFor: string;
  readonly columns: readonly ControlTowerColumn[];
  readonly stats: readonly ControlTowerStat[];
  readonly queue: readonly ControlTowerQueueRow[];
  readonly queueTotal: number;
  readonly hasWork: boolean;
  readonly headline: string;
  readonly disabledSourceNotes: readonly string[];
  readonly pendingWorkNotes: readonly string[];
}

/** Cat danh sach de bang doc duoc; `queueTotal` van la con so THAT. */
export const QUEUE_LIMIT = 12;

const toCard = (
  card: ControlTowerView['board'][number]['cards'][number],
  column: OperationsBoardColumn,
): ControlTowerCard => ({
  key: `${column}:${card.runId}`,
  runCode: card.runCode,
  businessDate: formatBusinessDate(card.businessDate),
  legs: `${formatCount(card.loadedLegs)} có hàng · ${formatCount(card.emptyLegs)} rỗng`,
  /*
   * `null` -> `EMPTY_VALUE`, KHONG `?? 0`. `formatDistance` cua `customer-view` da lam dung viec
   * nay cho `null`, nen o day chi can khong chen mot gia tri mac dinh vao truoc no.
   */
  totalKm: card.totalKm === null ? EMPTY_VALUE : formatDistance(card.totalKm),
});

export function toControlTower(view: ControlTowerView): ControlTowerModel {
  const byColumn = new Map(view.board.map((entry) => [entry.column, entry]));

  const columns = OPERATIONS_BOARD_ORDER.map((column): ControlTowerColumn => {
    const source = byColumn.get(column);
    const isAvailable = source?.unavailableReason == null;
    return {
      column,
      label: COLUMN_LABEL[column],
      total: formatCount(source?.total ?? 0),
      cards: (source?.cards ?? []).map((card) => toCard(card, column)),
      isAvailable,
      note: isAvailable ? null : CHECKPOINT_COLUMN_NOTE,
    };
  });

  const queue = view.queue
    .slice(0, QUEUE_LIMIT)
    .map((entry: ActionQueueItem, index): ControlTowerQueueRow => ({
      key: `${entry.kind}:${entry.subject.id}:${index}`,
      title: QUEUE_LABEL[entry.kind],
      tone: SEVERITY_TONE[entry.severity],
      section: QUEUE_SECTION[entry.kind],
      selection: entry.subject.reference,
    }));

  const stats: readonly ControlTowerStat[] = [
    { key: 'fleet', label: 'Xe trong đội', value: formatCount(view.fleet.total), section: 'fleet' },
    { key: 'on-trip', label: 'Đang chạy', value: formatCount(view.fleet.onTrip), section: 'fleet' },
    { key: 'idle', label: 'Đang rảnh', value: formatCount(view.fleet.idle), section: 'fleet' },
    {
      key: 'maintenance',
      label: 'Đang sửa chữa',
      value: formatCount(view.fleet.underMaintenance),
      section: 'fleet',
    },
    {
      key: 'drivers',
      label: 'Lái xe đang hoạt động',
      value: formatCount(view.fleet.activeDrivers),
      section: 'fleet',
    },
    {
      key: 'queue',
      label: 'Việc đang chờ xử lý',
      value: formatCount(view.queueTotal),
      section: null,
    },
  ];

  return {
    generatedFor: formatBusinessDate(view.generatedFor),
    columns,
    stats,
    queue,
    queueTotal: view.queueTotal,
    hasWork: view.queueTotal > 0,
    headline: headlineFor(view.queueTotal, queue.length),
    disabledSourceNotes: view.unavailableSources.map(
      (source) =>
        `${SOURCE_LABEL[source]}: khách chưa bật nghiệp vụ này, nên bảng không có mục đó.`,
    ),
    pendingWorkNotes: view.pendingWork.map(
      (entry) => `${PENDING_LABEL[entry.kind]}: ${PENDING_REASON[entry.reason]}.`,
    ),
  };
}

/**
 * BA NHANH, cung khuon `dashboard.ts`.
 *
 * Con so lay tu `queueTotal` chu KHONG tu `queue.length`: danh sach da bi cat o `QUEUE_LIMIT`, va
 * mot tieu de dem tren danh sach da cat se bao THIEU viec — dung loai sai lam nguoi ta yen tam.
 */
const headlineFor = (total: number, shown: number): string => {
  if (total === 0) return 'Không có việc nào đang chờ xử lý.';
  if (shown < total) {
    return `${formatCount(total)} việc đang chờ — bảng đang hiện ${formatCount(shown)} việc đầu.`;
  }
  return `${formatCount(total)} việc đang chờ xử lý.`;
};
