/**
 * BAN SAO TOI THIEU hop dong may chu cho van phong (giam doc + ke toan) — CHI nhung truong man hinh
 * dung. Nguon that: `apps/api/src/transport/**` (control-tower.types.ts, finance-summary.ts,
 * proof/location-health.ts, journey.types.ts, movement.types.ts). Khong import cheo tu `apps/web`:
 * web la mot ban chep tay khac va da LECH may chu o vai cho (thieu `FIELD_OPERATIONS`,
 * `AWAITING_FIRST`, hai ma hang viec). Nen moi enum o day de dang `string` o cho ma may chu co the
 * them gia tri: man hinh hien ma la mot cach phong thu thay vi vo khi gap gia tri moi.
 */

export type BusinessDate = string;

/* ------------------------------------------------------------------ *
 * THAP DIEU HANH — `GET /transport/control-tower`
 * ------------------------------------------------------------------ */

export type QueueSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

export interface QueueSubject {
  readonly kind: string;
  /** Id KY THUAT de goi API — khong bao gio hien cho nguoi doc. */
  readonly id: string;
  /** Ma nghiep vu (ma vong chay...), `null` khi ban ghi khong co ma doc duoc. */
  readonly reference: string | null;
}

export interface QueueItem {
  readonly kind: string;
  readonly severity: string;
  readonly subject: QueueSubject;
  readonly detail: Readonly<Record<string, number | string | null>>;
}

export interface PendingWorkEntry {
  readonly kind: string;
  readonly reason: string;
}

export interface BoardCurrentLeg {
  readonly legId: string;
  readonly sequence: number;
  readonly kind: 'LOADED' | 'EMPTY';
  readonly orderCode: string | null;
  readonly phase: string | null;
}

export interface BoardCard {
  readonly runId: string;
  readonly runCode: string;
  readonly vehicleId: string;
  readonly businessDate: BusinessDate;
  readonly driverId: string | null;
  readonly loadedLegs: number;
  readonly emptyLegs: number;
  /** `null` = con chang thieu km. KHONG BAO GIO hien thanh 0. */
  readonly totalKm: number | null;
  readonly emptyKm: number | null;
  readonly currentLeg: BoardCurrentLeg | null;
}

export interface BoardColumn {
  readonly column: string;
  readonly cards: readonly BoardCard[];
  readonly total: number;
  readonly unavailableReason: string | null;
}

/** Dem cua MAY CHU. `onTrip` dem XE, `runningRuns` dem VONG CHAY — hai don vi khac nhau. */
export interface FleetPresence {
  readonly total: number;
  readonly idle: number;
  readonly onTrip: number;
  readonly underMaintenance: number;
  readonly activeDrivers: number;
  readonly runningRuns: number;
}

export interface ControlTowerView {
  readonly generatedFor: BusinessDate;
  readonly board: readonly BoardColumn[];
  readonly fleet: FleetPresence;
  readonly queue: readonly QueueItem[];
  /** Tong THAT truoc khi cat — tieu de dem tu day, khong tu `queue.length`. */
  readonly queueTotal: number;
  readonly unavailableSources: readonly string[];
  readonly pendingWork: readonly PendingWorkEntry[];
}

/* ------------------------------------------------------------------ *
 * TAI CHINH — `GET /transport/finance/summary`
 * ------------------------------------------------------------------ */

export type SettlementFlow =
  'CUSTOMER_FREIGHT' | 'FUEL_SUPPLIER' | 'CARRIER_SERVICE' | 'PARTNER_COMMISSION';

export interface MarginBasis {
  readonly legacyTrips: { readonly counted: number; readonly skipped: number };
  readonly runFirstOrders: { readonly counted: number };
}

export interface DirectMarginRollup {
  readonly revenueAmount: number;
  readonly deductionAmount: number;
  readonly marginAmount: number;
  /** DIEM CO BAN (4000 = 40%). `null` khi doanh thu bang 0. */
  readonly marginBasisPoints: number | null;
  readonly tripCount: number;
  readonly skippedTripCount: number;
  readonly fixedCostsIncluded: false;
  /** Cau cong bo cua may chu — di CUNG con so, khong duoc bo, khong duoc thay chu. */
  readonly disclosure: string;
  readonly basis?: MarginBasis;
}

export interface FinanceSummaryView {
  readonly generatedFor: BusinessDate;
  readonly buckets: {
    readonly flows: Readonly<Record<SettlementFlow, number>>;
    readonly driverReimbursementOutstanding: number;
    readonly driverSettlementRemaining: number;
  };
  readonly directMargin: DirectMarginRollup;
  readonly receivable: { readonly outstandingTotal: number; readonly overdueTotal: number };
  readonly currency: { readonly codes: readonly string[]; readonly isSingle: boolean };
  readonly unavailableSources: readonly string[];
}

/* ------------------------------------------------------------------ *
 * DANH MUC — `/transport/vehicles`, `/transport/drivers`, `/transport/customers`
 * ------------------------------------------------------------------ */

export interface Vehicle {
  readonly id: string;
  readonly registrationPlate: string;
  readonly vehicleClass: string;
  /** Cot LUU; chi `UNDER_MAINTENANCE` con nghia (ON_TRIP da bi #336 bo). */
  readonly status: string;
}

export interface Driver {
  readonly id: string;
  readonly fullName: string;
  readonly phone: string;
  readonly status: string;
}

export interface Customer {
  readonly id: string;
  readonly name: string;
  readonly status: string;
}

/* ------------------------------------------------------------------ *
 * DON + CHANG — `/transport/orders`, `/transport/orders/:id/legs`
 * ------------------------------------------------------------------ */

export type OrderStatus = 'OPEN' | 'FULFILLED' | 'CANCELLED';

export interface TransportOrder {
  readonly id: string;
  readonly code: string;
  readonly status: string;
  readonly businessDate: BusinessDate;
  readonly customerId: string | null;
  readonly originLabel: string;
  readonly destinationLabel: string;
  readonly cargoDescription: string | null;
  /** Chi van phong thay (may chu tra cho ADMIN/ACCOUNTING). `null` = chua nhap cuoc. */
  readonly freightAmount: number | null;
  readonly currencyCode: string;
  readonly note: string | null;
  readonly cancelledAt: string | null;
  readonly cancellationReason: string | null;
}

export interface RunLeg {
  readonly id: string;
  readonly runId: string;
  readonly sequence: number;
  readonly kind: 'LOADED' | 'EMPTY';
  readonly status: string;
  readonly orderId: string | null;
  readonly originLabel: string;
  readonly destinationLabel: string;
  readonly businessDate: BusinessDate;
  readonly distanceKm: number | null;
  readonly plannedDistanceKm: number | null;
}

/* ------------------------------------------------------------------ *
 * SUC KHOE VI TRI — `GET /transport/vehicles/:id/location-health` (#297)
 * ------------------------------------------------------------------ */

export interface SourceFamilyHealth {
  readonly family: string;
  /** LIVE | DEGRADED | LOST | AWAITING_FIRST | NOT_CONFIGURED (+ gia tri moi -> hien phong thu). */
  readonly status: string;
  readonly source: string | null;
  readonly lastReceivedAt: string | null;
  readonly ageSeconds: number | null;
}

export interface LastKnownLocation {
  /** `null` khi nguoi goi khong co quyen xem toa do (ke toan) — CHE TRON, khong lam tron. */
  readonly point: { readonly latitude: number; readonly longitude: number } | null;
  readonly coordinatesRedacted: boolean;
  readonly source: string;
  readonly family: string;
  readonly accuracyMetres: number | null;
  readonly observedAt: string;
  readonly ageSeconds: number;
  readonly usableAsCurrent: boolean;
}

export interface VehicleLocationHealth {
  readonly vehicleId: string;
  readonly status: string;
  readonly reason: string;
  readonly currentSource: string | null;
  readonly lastReceivedAt: string | null;
  readonly ageSeconds: number | null;
  readonly sources: readonly SourceFamilyHealth[];
  readonly lastKnown: LastKnownLocation | null;
}

/* ------------------------------------------------------------------ *
 * HANH TRINH VONG CHAY — `GET /transport/journey/runs/:runRef`
 * ------------------------------------------------------------------ */

export interface JourneyLeg {
  readonly legId: string;
  readonly sequence: number;
  readonly kind: 'LOADED' | 'EMPTY';
  readonly status: string;
  readonly orderCode: string | null;
  readonly originLabel: string;
  readonly destinationLabel: string;
  readonly distanceKm: number | null;
  readonly phase: string | null;
}

export interface JourneyEvent {
  readonly kind: string;
  readonly code: string;
  readonly at: string;
  readonly legId: string | null;
  readonly hasLocationProof: boolean;
  readonly subjectId: string;
}

export interface RunJourneyView {
  readonly run: {
    readonly runCode: string;
    readonly vehiclePlate: string | null;
    readonly status: string;
    readonly businessDate: BusinessDate;
    readonly startedAt: string | null;
    readonly driverId: string | null;
  };
  readonly orderCodes: readonly string[];
  readonly legs: readonly JourneyLeg[];
  readonly timeline: readonly JourneyEvent[];
  readonly unavailableSources: readonly string[];
}

/* ------------------------------------------------------------------ *
 * VIEC TAI XE NHAN TRUC TIEP — `/transport/site-intakes/**` (#398, `site-intake-review.service.ts`)
 * ------------------------------------------------------------------ */

export type SiteIntakeCommercialStatus = 'PENDING' | 'ORDER_BOUND' | 'REJECTED';
export type SiteIntakeBindingMode = 'AUTO_CREATED' | 'OFFICE_COMPLETED' | 'OFFICE_EXISTING_ORDER';
export type SiteIntakeExceptionOutcome =
  | 'ORDER_CANCELLED_WORK_CANCELLED'
  | 'ORDER_CANCELLED_OPERATION_PRESERVED'
  | 'INTAKE_REJECTED_WORK_CANCELLED'
  | 'INTAKE_REJECTED_OPERATION_PRESERVED'
  | 'ANOMALY_RECORDED_ORDER_TERMINAL';
export type SiteIntakeLocationTrust = 'SERVER_BOUND' | 'DRIVER_REPORTED';
export type SiteMatch = 'UNIQUE_INSIDE' | 'CHOSEN_AMONG_SEVERAL' | 'NO_LOCATION';
export type SiteIntakeReadinessKind =
  'READY_TO_AUTO_CREATE' | 'NEEDS_REVIEW' | 'ALREADY_BOUND' | 'REJECTED';

export interface SiteIntakeException {
  readonly reason: string;
  readonly outcome: SiteIntakeExceptionOutcome;
  readonly at: string;
}

/** Mot viec tai xe nhan truc tiep nhin tu VAN PHONG — ma va so, khong mot cau chu nao. */
export interface SiteIntakeReviewView {
  readonly intakeId: string;
  readonly status: SiteIntakeCommercialStatus;
  readonly confirmedAt: string;
  readonly businessDate: BusinessDate;
  readonly driver: { readonly id: string; readonly name: string | null };
  readonly vehicle: { readonly id: string; readonly plate: string | null };
  readonly run: { readonly id: string; readonly code: string; readonly status: string };
  readonly leg: { readonly id: string; readonly status: string };
  readonly origin: {
    readonly siteId: string;
    readonly label: string;
    readonly siteName: string | null;
    readonly counterpartyName: string | null;
    readonly address: string | null;
    readonly active: boolean;
  };
  readonly location: {
    readonly trust: SiteIntakeLocationTrust;
    readonly siteMatch: SiteMatch | null;
    readonly distanceMetres: number | null;
  };
  readonly destination: {
    readonly label: string;
    readonly source: 'KNOWN_PLACE' | 'PLACE_SEARCH';
    readonly setByRole: 'DRIVER' | 'OFFICE';
    readonly setAt: string;
  } | null;
  readonly originAttestedAt: string | null;
  readonly readiness: {
    readonly kind: SiteIntakeReadinessKind;
    readonly reasons: readonly string[];
    readonly rejectedReason: string | null;
  };
  readonly order: {
    readonly id: string;
    readonly code: string;
    readonly status: string;
    readonly bindingMode: SiteIntakeBindingMode;
    readonly boundAt: string;
  } | null;
  readonly exception: SiteIntakeException | null;
  readonly movementStarted: boolean;
  /** Viec may chu CHO PHEP lam tiep — quyen nguoi goi van loc them o tang HTTP. */
  readonly actions: {
    readonly canSetDestination: boolean;
    readonly canAttestOrigin: boolean;
    readonly canBindExistingOrder: boolean;
    readonly canReportException: boolean;
  };
}

/** "ĐƠN MỚI TỪ TÀI XẾ" — ban tin, KHONG phai viec can quyet. */
export interface DriverOrderActivityView {
  readonly intakeId: string;
  readonly orderId: string;
  readonly orderCode: string;
  readonly orderStatus: string;
  readonly bindingMode: SiteIntakeBindingMode;
  readonly boundAt: string;
  readonly confirmedAt: string;
  readonly driverName: string | null;
  readonly vehiclePlate: string | null;
  readonly originLabel: string;
  readonly destinationLabel: string;
  readonly exceptionOutcome: SiteIntakeExceptionOutcome | null;
}

/** Nguon cua mot don: "Tạo từ xác nhận của tài xế". 404 khi don khong den tu duong nay. */
export interface OrderIntakeSourceView extends DriverOrderActivityView {
  readonly locationTrust: SiteIntakeLocationTrust;
  readonly siteMatch: SiteMatch | null;
  readonly movementStarted: boolean;
  readonly exception: SiteIntakeException | null;
  readonly canReportException: boolean;
}

export interface BindableOrderView {
  readonly id: string;
  readonly code: string;
  readonly businessDate: BusinessDate;
  readonly originLabel: string;
  readonly destinationLabel: string;
  readonly createdAt: string;
}

/** Ket cuc lenh HOAN THIEN / GAN DON — doc tu su that SAU lenh. `readiness` giu nguyen hinh dang may chu. */
export interface SiteIntakeCommercialOutcome {
  readonly intakeId: string;
  readonly status: SiteIntakeCommercialStatus;
  readonly readiness: {
    readonly kind: SiteIntakeReadinessKind;
    readonly reasons?: readonly string[];
    readonly orderId?: string;
    readonly reason?: string;
  };
  readonly orderId: string | null;
  readonly orderCode: string | null;
  readonly bindingMode: SiteIntakeBindingMode | null;
  readonly bound: boolean;
  readonly replayed: boolean;
}

export interface SiteIntakeExceptionResult {
  readonly intakeId: string;
  readonly outcome: SiteIntakeExceptionOutcome;
  readonly status: SiteIntakeCommercialStatus;
  readonly orderId: string | null;
  readonly operationPreserved: boolean;
  readonly replayed: boolean;
}

/** Moi lenh van phong tra ket cuc + khung nhin DA CAP NHAT cua chinh viec do. */
export interface SiteIntakeCommandResponse<T> {
  readonly outcome: T;
  readonly intake: SiteIntakeReviewView;
}

export interface KnownPlace {
  readonly id: string;
  readonly kind: string;
  readonly name: string;
  readonly detail: string | null;
  readonly point: { readonly latitude: number; readonly longitude: number };
  readonly radiusMetres: number;
}

export interface KnownPlacesResponse {
  readonly available: boolean;
  readonly places: readonly KnownPlace[];
}
