import type { BusinessDate } from '../business-date.js';

/**
 * THAP DIEU HANH — mot READ MODEL, khong phai mot nguon su that thu hai (#241 §5, #244 G1/G2/G3).
 *
 * ===========================================================================
 * KHONG PHAI MOT CAPABILITY.
 *
 * `operational-alerts.ts` da ghi cau nay mot lan va no van dung o day: T1 §10.1 cam tao capability
 * cho `Reporting` — bao cao la read model cua cac capability DA BAT. Nen thap dieu hanh song trong
 * `transport-core` (chu so huu vong chay, chang, xe, chuyen — phan lon cac o tren bang), va MOI
 * nguon khac den qua mot cong TUY CHON. Khach tat `transport-fuel` thi khong co muc nhien lieu, va
 * bang NOI RA dieu do qua `unavailableSources` thay vi tra ve mot danh sach ngan hon trong im lang.
 *
 * ===========================================================================
 * KHONG MOT CAU CHU NAO O DAY.
 *
 * Cung luat voi `operational-alerts.ts`: moi dong mang mot MA va cac con so cua no. Cau tieng Viet
 * hien tren man hinh la viec cua tang experience. Nhet cau chu vao day se lam mot nen tang da khach
 * chi noi duoc mot thu tieng.
 *
 * ===========================================================================
 * MOI CON SO PHAI LAN NGUOC VE BAN GHI GOC.
 *
 * #244 G1: *"every headline KPI must be drillable/reconcilable to source records"*. Nen khong mot
 * o nao tren bang nay chi la mot so nguyen: moi o mang theo `subject` — loai ban ghi + `id` ky
 * thuat de goi API, va `reference` la DINH DANH NGHIEP VU de dat len dia chi (quy uoc da co cua
 * `navigation.ts` — ma chuyen, bien so, khong bao gio mot `id`).
 */

/* ------------------------------------------------------------------ *
 * BANG DIEU HANH — cac cot
 * ------------------------------------------------------------------ */

/**
 * BAY COT ma #244 G3 yeu cau, khai DAY DU ngay tu dau.
 *
 * Day la mot PHEP CHIEU, khong phai mot vong doi thu hai (#244 G3: *"a projection, not a new
 * lifecycle truth"*). Khong mot ham nao trong thu muc nay duoc DOI trang thai cua mot vong chay;
 * bang chi doc `VehicleRunStatus`/`RunLegStatus` da duoc `transport-core` quyet.
 */
export const OPERATIONS_BOARD_COLUMNS = [
  'PLANNED',
  'PICKUP',
  'LOADING',
  'IN_TRANSIT',
  'ARRIVED',
  'WAITING',
  'DELIVERED',
] as const;
export type OperationsBoardColumn = (typeof OPERATIONS_BOARD_COLUMNS)[number];

/**
 * BON COT CHUA CO NGUON — va do la mot su that duoc CONG BO, khong phai mot cho trong.
 *
 * `PICKUP`, `LOADING`, `ARRIVED`, `WAITING` chi ton tai khi co mo hinh CHECKPOINT cua Lane F
 * (#243): cong vao bai, phieu xuong hang, lai xe bam DA DEN, va khoang cho nguoi nhan. Mo hinh do
 * chua vao `main`.
 *
 * Hai duong SAI ma khai bao nay chan:
 *
 *   1. suy bon cot do tu `RunLegStatus` — `IN_TRANSIT` khong phan biet duoc "dang cho o kho nguoi
 *      nhan" voi "dang chay tren duong", nen mot cot `WAITING` dung tu do se la mot con so BIA;
 *   2. bo han bon cot khoi bang — nguoi dung se doc bang nhu the quy trinh that chi co ba buoc.
 *
 * Nen chung nam tren bang, RONG, kem mot ma ly do doc duoc. Khi Lane F vao `main`, cho nay noi
 * `[]` va phep chieu doc checkpoint that.
 */
export const CHECKPOINT_DERIVED_COLUMNS: readonly OperationsBoardColumn[] = [
  'PICKUP',
  'LOADING',
  'ARRIVED',
  'WAITING',
];

export const BOARD_COLUMN_UNAVAILABLE_REASONS = ['AWAITING_CHECKPOINT_SOURCE'] as const;
export type BoardColumnUnavailableReason = (typeof BOARD_COLUMN_UNAVAILABLE_REASONS)[number];

/** Mot the tren bang — LUON tro ve mot vong chay that. */
export interface OperationsBoardCard {
  readonly runId: string;
  /** DINH DANH NGHIEP VU — ma vong chay. Cai duoc phep dat len dia chi. */
  readonly runCode: string;
  readonly vehicleId: string;
  readonly businessDate: BusinessDate;
  /** `null` khi vong chay chua co ban phan cong dang hieu luc. */
  readonly driverId: string | null;
  readonly loadedLegs: number;
  readonly emptyLegs: number;
  /** `null` khi con mot chang thieu km — xem `summariseRunDistance`. Khong bao gio doan bang 0. */
  readonly totalKm: number | null;
}

export interface OperationsBoardColumnView {
  readonly column: OperationsBoardColumn;
  readonly cards: readonly OperationsBoardCard[];
  readonly total: number;
  /**
   * `null` khi cot co nguon that. Mot ma khi cot ton tai tren bang nhung chua co du lieu de dien —
   * doc duoc, khong phai mot cot rong khong giai thich.
   */
  readonly unavailableReason: BoardColumnUnavailableReason | null;
}

/* ------------------------------------------------------------------ *
 * HANG VIEC — muc can nguoi xu ly
 * ------------------------------------------------------------------ */

/**
 * LOAI BAN GHI mot muc hang viec tro toi. #244 G2: *"Action queue must link to the exact
 * underlying record/workflow."*
 */
export const ACTION_QUEUE_SUBJECTS = [
  'RUN',
  'RUN_LEG',
  'TRIP',
  'VEHICLE',
  'DRIVER',
  'EXPENSE_CLAIM',
  'FUEL_ENTRY',
  'FUEL_RECONCILIATION',
  'TRACKING_SESSION',
  'COMPANY',
] as const;
export type ActionQueueSubjectKind = (typeof ACTION_QUEUE_SUBJECTS)[number];

export interface ActionQueueSubject {
  readonly kind: ActionQueueSubjectKind;
  /** `id` KY THUAT — de goi API doc ban ghi goc. */
  readonly id: string;
  /**
   * DINH DANH NGHIEP VU de dat len dia chi (ma vong chay, ma chuyen, bien so). `null` khi ban ghi
   * khong co mot ma nguoi doc duoc — luc do man hinh phai tu tra cuu, chu KHONG duoc dat `id` ky
   * thuat len URL (quy uoc `navigation.ts` `SELECTION_QUERY_PARAM`).
   */
  readonly reference: string | null;
}

/**
 * MA VIEC — chi nhung ma CO THE PHAT duoc tu du lieu da vao `main`.
 *
 * Danh sach nay co y KHONG chua cac muc cua Lane E/F (cho nguoi nhan qua nguong, thieu chung tu
 * giao hang, phu cap cho cua lai xe). Khac voi `ProofRiskCode` — noi khai truoc la de tranh mot
 * migration enum Postgres — o day khai truoc mot ma khong bao gio phat se lam nguoi doc tuong
 * rang bang CO theo doi viec do. Chung nam o `PENDING_ACTION_QUEUE_KINDS` ben duoi, mot danh sach
 * TACH ROI, va bang cong bo chung nhu viec CHUA THEO DOI DUOC.
 */
export const ACTION_QUEUE_KINDS = [
  /* --- transport-core --- */
  /** Vong chay dang chay ma khong ai duoc phan cong lai. */
  'RUN_ACTIVE_WITHOUT_DRIVER',
  /** Chang da xong nhung chua nhap km — chan moi ty le km rong cua chinh vong chay do. */
  'RUN_LEG_MISSING_DISTANCE',
  /* --- transport-costing --- */
  'EXPENSE_CLAIM_AWAITING_REVIEW',
  'DRIVER_FUND_BALANCE_UNUSUAL',
  /* --- transport-fuel --- */
  'FUEL_ENTRY_AWAITING_VERIFICATION',
  /**
   * Mot KY doi soat bang ke con DANG MO.
   *
   * "Dang mo" dung DUNG dinh nghia da co o `workspace/dashboard.ts` (`DRAFT`, `MATCHING`,
   * `RESOLVED`, `REOPENED`) chu khong dat mot dinh nghia thu hai. Mot mien co hai cau tra loi cho
   * "ky nay con mo khong" la mot mien khong tra loi duoc cau do.
   *
   * KHONG phai `MISMATCHED`: do la trang thai cua mot DONG bang ke (`FUEL_RECONCILIATION_STATUSES`),
   * doc duoc qua `listDiscrepancies(reconciliationId)` — tuc mot vong lap theo tung ky. Bang nay
   * dem KY, va nguoi truc mo ky ra de xem dong nao lech.
   */
  'FUEL_RECONCILIATION_OPEN',
  'FUEL_CONSUMPTION_ABNORMAL',
  /* --- transport-asset-compliance --- */
  'COMPLIANCE_DOCUMENT_EXPIRED',
  'COMPLIANCE_DOCUMENT_EXPIRING',
  'COMPLIANCE_DOCUMENT_MISSING',
  'MAINTENANCE_OVERDUE',
  'MAINTENANCE_DUE_SOON',
  'VEHICLE_STATE_INCONSISTENT',
] as const;
export type ActionQueueKind = (typeof ACTION_QUEUE_KINDS)[number];

/**
 * VIEC BANG NAY CHUA THEO DOI DUOC, va ly do cua tung cai.
 *
 * Cong bo thay vi im lang, cung ly le voi `unavailableSources`: mot hang viec khong co dong "cho
 * nguoi nhan 9 tieng" doc giong het mot ngay khong ai phai cho.
 */
export const PENDING_ACTION_QUEUE_KINDS = [
  'RECEIVER_WAITING_ABOVE_THRESHOLD',
  'DELIVERY_PROOF_DOCUMENT_MISSING',
  'DRIVER_WAITING_ALLOWANCE_AWAITING_APPROVAL',
  'CUSTOMER_AR_OVERDUE',
  'LOCATION_PROOF_REVIEW',
] as const;
export type PendingActionQueueKind = (typeof PENDING_ACTION_QUEUE_KINDS)[number];

export const PENDING_ACTION_QUEUE_REASONS = [
  /** Doi mo hinh checkpoint/dwell/chung tu cua Lane F (#243). */
  'AWAITING_CHECKPOINT_SOURCE',
  /**
   * Doi mot duong doc no phai thu THEO NGAY.
   *
   * `arAging(asOf)` co that va tinh dung `overdueTotal`, nhung no doi mot `asOf` va tra ve mot bao
   * cao theo KHACH — con hang viec can mot danh sach chung tu qua han de xep uu tien. Muc nay mo
   * lai khi co mot duong doc nhu vay, khong phai bang cach goi `arAging` mot lan cho moi khach.
   */
  'AWAITING_RECEIVABLE_DUE_DATE_SOURCE',
  /**
   * `transport-proof` hom nay CHI doc duoc theo chuyen / theo lai xe / theo phien
   * (`TrackingRepository.listSessionsForTrip|listSessionsForDriver|listRiskFlagsForSession`).
   * Khong co duong doc CA DOI XE, nen mot muc "co rui ro vi tri dang cho nguoi nhin" se phai duyet
   * tung chuyen mot — tuc mot vong lap N+1 doi lot mot canh bao.
   *
   * Duong dung la mot phuong thuc doc moi TRONG `transport-proof`, va no thuoc ve capability do.
   * Thap dieu hanh khong duoc tu mo mot duong doc trong kho cua mien khac (T1 §4.1 luat 4).
   */
  'AWAITING_FLEET_WIDE_PROOF_QUERY',
] as const;
export type PendingActionQueueReason = (typeof PENDING_ACTION_QUEUE_REASONS)[number];

export interface PendingActionQueueEntry {
  readonly kind: PendingActionQueueKind;
  readonly reason: PendingActionQueueReason;
}

export const ACTION_QUEUE_SEVERITIES = ['INFO', 'WARNING', 'CRITICAL'] as const;
export type ActionQueueSeverity = (typeof ACTION_QUEUE_SEVERITIES)[number];

export interface ActionQueueItem {
  readonly kind: ActionQueueKind;
  readonly severity: ActionQueueSeverity;
  readonly subject: ActionQueueSubject;
  /** Con so di kem — vo huong, khong bao gio noi dung nhay cam (luat cua `OperationalAlert`). */
  readonly detail: Readonly<Record<string, number | string | null>>;
}

/* ------------------------------------------------------------------ *
 * NGUON
 * ------------------------------------------------------------------ */

/**
 * NGUON NAM NGOAI `transport-core`. Moi cai thuoc mot capability co the dang tat.
 *
 * `transport-core` khong co mat trong danh sach nay va do la co y: thap dieu hanh SONG trong
 * `transport-core`, nen nguon do khong bao gio vang mat. Mot enum co mot gia tri khong bao gio
 * duoc dung la mot enum noi doi.
 */
export const CONTROL_TOWER_SOURCES = ['EXPENSE_CLAIMS', 'FUEL', 'OPERATIONAL_ALERTS'] as const;
export type ControlTowerSource = (typeof CONTROL_TOWER_SOURCES)[number];

/* ------------------------------------------------------------------ *
 * DOI XE
 * ------------------------------------------------------------------ */

/**
 * DOI XE nhin tu thap dieu hanh — DEM, khong phai ho so.
 *
 * `underMaintenance` doc thang tu `VehicleStatus`, KHONG tu `effectiveFleetStatus()` cua
 * `transport-asset-compliance`: cai sau la mot phep hop thanh thuoc capability khac va co the dang
 * tat. Khi capability do BAT, mau thuan giua hai cach doc se hien ra o hang viec duoi ma
 * `VEHICLE_STATE_INCONSISTENT` — tuc bang khong giau mau thuan, no phoi mau thuan ra.
 */
export interface FleetPresenceView {
  readonly total: number;
  readonly idle: number;
  readonly onTrip: number;
  readonly underMaintenance: number;
  readonly activeDrivers: number;
}

/* ------------------------------------------------------------------ *
 * KHUNG NHIN
 * ------------------------------------------------------------------ */

export interface ControlTowerView {
  readonly generatedFor: BusinessDate;
  readonly board: readonly OperationsBoardColumnView[];
  readonly fleet: FleetPresenceView;
  readonly queue: readonly ActionQueueItem[];
  /** Tong so muc hang viec TRUOC khi cat — man hinh khong duoc suy con so nay tu `queue.length`. */
  readonly queueTotal: number;
  readonly unavailableSources: readonly ControlTowerSource[];
  readonly pendingWork: readonly PendingActionQueueEntry[];
}
