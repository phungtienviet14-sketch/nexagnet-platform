/**
 * HOP DONG DAY DAY cua `/transport/me/**` — BAN SAO TOI THIEU, khong phai nguon su that.
 *
 * Nguon su that la controller/view cua API (`apps/api/src/transport/**`). Tep nay chep DUNG nhung
 * truong man lai xe doc, tu ban sao tay cua web (`transport-types.ts`) cong hai truong moi cua may
 * chu (`pickupPoint`/`deliveryPoint`). Khong import cheo ung dung: mot lan sua o web khong duoc lam
 * vo ban dung dien thoai dang nam tren may lai xe.
 *
 * HAI QUY UOC DON VI de doc sai la sai gap nghin lan (xem web `transport-types.ts:8-15`):
 *   · tien          — so nguyen DONG, khong co don vi phu;
 *   · `litersUnits` — so nguyen MILILIT: `200000` = 200 lit, CHIA 1000 truoc khi hien.
 */

/** Chuoi `YYYY-MM-DD` theo lich cua doanh nghiep — khong bao gio doc qua `Date`. */
export type BusinessDate = string;

export interface GeoPoint {
  readonly latitude: number;
  readonly longitude: number;
}

/* ------------------------------------------------------------------ *
 * Viec hien truong — GET /transport/me/field-work (`field.types.ts`)
 * ------------------------------------------------------------------ */

export type RunLegKind = 'LOADED' | 'EMPTY';

export type RunLegPhase =
  'PLANNED' | 'AT_PICKUP' | 'LOADING' | 'IN_TRANSIT' | 'ARRIVED' | 'DELIVERED';

export type RunCheckpointType =
  | 'ASSIGNED'
  | 'DEPARTED'
  | 'PICKUP_ARRIVAL'
  | 'GATE_ENTRY'
  | 'LOADING'
  | 'PICKUP_DEPARTURE'
  | 'DELIVERY_ARRIVAL'
  | 'DELIVERY_ACCEPTED'
  | 'COMPLETED';

export type OperationalDocumentType =
  'GATE_PASS' | 'LOADING_SLIP' | 'WEIGH_TICKET' | 'DELIVERY_RECEIPT' | 'OTHER';

export type ReceiptHandoverState =
  'WITH_DRIVER' | 'RETURNED_TO_OFFICE' | 'SUBMITTED_FOR_CONFIRMATION';

export type DriverFieldActionKind =
  'CHECKPOINT' | 'WAITING_START' | 'DOCUMENT' | 'RECEIPT_HANDOVER';

/** MOT NUT may chu da tinh — `label` la tieng Viet co dau, di thang len man hinh. */
export interface DriverFieldAction {
  readonly kind: DriverFieldActionKind;
  readonly label: string;
  readonly checkpointType?: RunCheckpointType;
  readonly documentType?: OperationalDocumentType;
  readonly requiresLocation: boolean;
  readonly required: boolean;
}

export interface DriverFieldDocument {
  readonly id: string;
  readonly type: OperationalDocumentType;
  readonly basis: 'DIGITAL_FILE' | 'EXTERNAL_PHYSICAL';
  readonly status: 'ACTIVE' | 'WITHDRAWN';
  readonly receivedAt: string;
}

/** Phien cho dang mo — `elapsedSeconds` do MAY CHU tinh, `startedAt` la gio may chu NHAN lenh. */
export interface DriverFieldWaiting {
  readonly sessionId: string;
  readonly reason: string;
  readonly startedAt: string;
  readonly elapsedSeconds: number;
}

export interface DriverFieldLeg {
  readonly legId: string;
  readonly sequence: number;
  readonly kind: RunLegKind;
  readonly originLabel: string;
  readonly destinationLabel: string;
  readonly orderCode: string | null;
  readonly orderId: string | null;
  /** `null` o chang rong va o don chua co toa do — ban do KHONG ve diem doan. */
  readonly pickupPoint?: GeoPoint | null;
  readonly deliveryPoint?: GeoPoint | null;
  readonly phase: RunLegPhase;
  readonly recordedTypes: readonly RunCheckpointType[];
  readonly arrivalCheckpointId: string | null;
  readonly waiting: DriverFieldWaiting | null;
  readonly documents: readonly DriverFieldDocument[];
  readonly missingDocumentTypes: readonly OperationalDocumentType[];
  readonly receiptHandover: ReceiptHandoverState | null;
  readonly nextActions: readonly DriverFieldAction[];
}

export interface DriverFieldRun {
  readonly runId: string;
  readonly runCode: string;
  readonly legs: readonly DriverFieldLeg[];
}

export interface DriverFieldWork {
  readonly serverNow: string;
  readonly runs: readonly DriverFieldRun[];
}

export type WaitingReason =
  'RECEIVER_NOT_READY' | 'NO_UNLOADING_DOCK' | 'QUEUE_AHEAD' | 'DOCUMENT_ISSUE' | 'OTHER';

/* ------------------------------------------------------------------ *
 * Chuyen cu — GET /transport/me/trips (`driver-trip.view.ts`)
 * ------------------------------------------------------------------ */

export type TripStatus = 'PLANNED' | 'IN_TRANSIT' | 'DELIVERED' | 'RECONCILED' | 'CANCELLED';

export interface DriverTripView {
  readonly id: string;
  readonly code: string;
  readonly status: TripStatus;
  readonly businessDate: BusinessDate;
  readonly originLabel: string;
  readonly destinationLabel: string;
  readonly cargoDescription: string | null;
  readonly distanceKm: number | null;
  readonly customerName: string | null;
  readonly vehicleId: string | null;
  readonly vehicleRegistrationPlate: string | null;
  readonly isCurrentAssignee: boolean;
}

/* ------------------------------------------------------------------ *
 * Nhien lieu — /transport/me/fuel/** (`driver-fuel.view.ts`)
 * ------------------------------------------------------------------ */

export type FuelVerificationStatus = 'DECLARED' | 'VERIFIED' | 'REJECTED';
export type FuelReconciliationStatus =
  'UNMATCHED' | 'MATCHED' | 'MISMATCHED' | 'SETTLED' | 'IGNORED';
export type FuelPaymentMethod = 'DRIVER_CASH' | 'SUPPLIER_ACCOUNT';
export const FUEL_PAYMENT_METHODS: readonly FuelPaymentMethod[] = [
  'DRIVER_CASH',
  'SUPPLIER_ACCOUNT',
];

export interface DriverFuelSlipView {
  readonly id: string;
  readonly tripId: string | null;
  readonly tripCode: string | null;
  readonly runId: string | null;
  readonly runCode: string | null;
  readonly legId: string | null;
  readonly legSequence: number | null;
  readonly vehicleId: string;
  readonly vehiclePlate: string | null;
  readonly supplierId: string;
  readonly stationId: string | null;
  readonly stationName: string | null;
  readonly businessDate: BusinessDate;
  readonly occurredAt: string;
  readonly litersUnits: number;
  readonly amount: number;
  readonly currencyCode: string;
  readonly odometerKm: number;
  readonly consumptionUnits: number | null;
  readonly reviewReasons: readonly string[];
  readonly paymentMethod: FuelPaymentMethod;
  readonly verificationStatus: FuelVerificationStatus;
  readonly reconciliationStatus: FuelReconciliationStatus;
  readonly invoiceNo: string | null;
  readonly reviewNote: string | null;
  readonly evidenceCount: number;
  readonly createdAt: string;
}

export interface DriverFuelLegView {
  readonly legId: string;
  readonly sequence: number;
  readonly kind: string;
  readonly status: string;
  readonly originLabel: string;
  readonly destinationLabel: string;
}

export interface DriverFuelRunView {
  readonly runId: string;
  readonly runCode: string;
  readonly runStatus: string;
  readonly vehicleId: string;
  readonly vehiclePlate: string | null;
  readonly legs: readonly DriverFuelLegView[];
}

export interface DriverFuelSupplierView {
  readonly id: string;
  readonly name: string;
}

export interface DriverFuelStationView {
  readonly id: string;
  readonly supplierId: string;
  readonly name: string;
  readonly code: string | null;
  readonly address: string | null;
}

/* ------------------------------------------------------------------ *
 * Tien — quy, quyet toan, phieu luong, khoan chi
 * ------------------------------------------------------------------ */

export type DriverFundEntryKind =
  | 'ADVANCE'
  | 'RETURN'
  | 'TRIP_EXPENSE'
  | 'ADJUSTMENT'
  | 'REVERSAL'
  | 'REIMBURSEMENT'
  | 'RUN_EXPENSE';

export type FundBalanceStance = 'DRIVER_HOLDS_COMPANY_CASH' | 'SETTLED' | 'COMPANY_OWES_DRIVER';

export interface DriverFundEntry {
  readonly id: string;
  readonly kind: DriverFundEntryKind;
  readonly signedAmount: number;
  readonly businessDate: BusinessDate;
  readonly reversalOfId: string | null;
  readonly note: string | null;
  readonly createdAt: string;
}

export interface DriverFundStatement {
  readonly account: { readonly id: string } | null;
  readonly balance: number;
  readonly balanceStance: FundBalanceStance;
  readonly currencyCode: string;
  readonly entries: readonly DriverFundEntry[];
}

export interface DriverSettlementSelfStatement {
  readonly currencyCode: string;
  readonly wageCredited: number;
  readonly wageCashedOut: number;
  readonly wageRemaining: number;
  readonly reimbursementOutstanding: number;
  readonly reimbursementCashedOut: number;
}

export type PayslipStatus = 'APPROVED' | 'PAID' | 'REVERSED';
export type PayslipKind = 'ORIGINAL' | 'SUPPLEMENTAL' | 'REVERSAL';
export type PayslipComponentSource =
  'BASE_SALARY' | 'PER_TRIP' | 'PER_KM' | 'FUEL_SAVING_BONUS' | 'MANUAL_BONUS' | 'MANUAL_DEDUCTION';

export interface DriverPayslipComponentView {
  readonly kind: 'EARNING' | 'DEDUCTION';
  readonly source: PayslipComponentSource;
  readonly label: string;
  readonly amount: number;
  readonly quantity: number | null;
  readonly unitAmount: number | null;
  readonly note: string | null;
}

/** May chu KHONG BAO GIO tra phieu `DRAFT` cho lai xe — khong loc lai lan hai o day. */
export interface DriverPayslipView {
  readonly id: string;
  readonly period: {
    readonly label: string;
    readonly startDate: BusinessDate;
    readonly endDate: BusinessDate;
  };
  readonly kind: PayslipKind;
  readonly status: PayslipStatus;
  readonly grossEarnings: number;
  readonly totalDeductions: number;
  readonly netAmount: number;
  readonly tripCount: number;
  readonly distanceKm: number;
  readonly correctionReason: string | null;
  readonly components: readonly DriverPayslipComponentView[];
  readonly approvedAt: string | null;
  readonly paidAt: string | null;
}

/** `unrestricted` TUONG MINH: `[]` + `true` = go tu do, KHONG phai "cam het". */
export interface ExpenseCatalogue {
  readonly categories: readonly string[];
  readonly unrestricted: boolean;
}

/* ------------------------------------------------------------------ *
 * Nhan viec tai diem — /transport/me/site-intake/*
 * ------------------------------------------------------------------ */

export type SiteIntakeLocationTrust = 'SERVER_BOUND' | 'DRIVER_REPORTED';
export type SiteIntakeLocationUnusableReason =
  'COORDINATE_INVALID' | 'ACCURACY_UNUSABLE' | 'LOCATION_STALE';

export interface SiteCandidateView {
  readonly siteId: string;
  readonly siteName: string;
  readonly address: string | null;
  readonly counterpartyName: string;
  readonly distanceMetres: number;
  readonly confidence: 'INSIDE' | 'NEAR';
}

export interface SiteIntakeOpenRunView {
  readonly runId: string;
  readonly code: string;
  readonly status: string;
}

export interface SiteIntakeProposal {
  readonly outcome: 'UNIQUE' | 'AMBIGUOUS' | 'NO_MATCH' | 'LOCATION_UNUSABLE';
  readonly locationUnusable: SiteIntakeLocationUnusableReason | null;
  readonly candidates: readonly SiteCandidateView[];
  readonly truncated: boolean;
  readonly locationTrust: SiteIntakeLocationTrust;
  readonly openRuns: readonly SiteIntakeOpenRunView[];
  readonly canCreate: boolean;
}

/** KET QUA `POST confirmations` (`site-intake.types.ts` `SiteIntakeResult`). */
export interface SiteIntakeResult {
  readonly intakeId: string;
  readonly runId: string;
  readonly runCode: string;
  readonly legId: string;
  readonly siteId: string;
  readonly siteName: string;
  readonly counterpartyName: string;
  readonly locationTrust: SiteIntakeLocationTrust;
  readonly distanceMetres: number | null;
  readonly destinationPending: boolean;
  readonly businessDate: BusinessDate;
  readonly replayed: boolean;
}

/** Ba hinh dang DUY NHAT may chu nhan: toa do (ca hai), hoac khong gi ca. */
export interface SiteIntakeLocationInput {
  readonly latitude?: number;
  readonly longitude?: number;
  readonly accuracyMetres?: number | null;
}

/* ------------------------------------------------------------------ *
 * `#398` — "Giao toi dau?" (`site-intake-review.service.ts` `DriverIntakeView`)
 * ------------------------------------------------------------------ */

/**
 * `NEEDS_DESTINATION` — chua co diem giao, lai xe chon duoc;
 * `CONFIRMED`         — da nhan chuyen day du;
 * `OFFICE_FOLLOW_UP`  — da nhan chuyen, van phong bo sung phan con thieu;
 * `CLOSED`            — viec da bi huy / khong tiep tuc.
 */
export type DriverIntakeStage = 'NEEDS_DESTINATION' | 'CONFIRMED' | 'OFFICE_FOLLOW_UP' | 'CLOSED';

/** Lan nhan viec nhin tu LAI XE — KHONG ma don, KHONG tien. `runCode` khong bao gio hien. */
export interface DriverIntakeView {
  readonly intakeId: string;
  readonly runId: string;
  readonly runCode: string;
  readonly siteName: string | null;
  readonly counterpartyName: string | null;
  readonly confirmedAt: string;
  readonly destinationLabel: string | null;
  readonly stage: DriverIntakeStage;
  readonly canChooseDestination: boolean;
}

/** `POST :intakeId/destination` — `replayed` = lan GUI LAI, khong ghi gi them. */
export interface DriverDestinationResponse {
  readonly intake: DriverIntakeView;
  readonly replayed: boolean;
}

/** Dia diem DA BIET (`place-search.types.ts` `KnownPlace`) — hang rao LA dia diem. */
export type KnownPlaceKind = 'DEPOT' | 'COUNTERPARTY_SITE' | 'CUSTOMER';

export interface KnownPlace {
  readonly id: string;
  readonly kind: KnownPlaceKind;
  readonly name: string;
  readonly detail: string | null;
  readonly point: GeoPoint;
  readonly radiusMetres: number;
}

/** `GET destinations` (lai xe) va `GET /transport/places/known` (van phong). */
export interface KnownPlacesResponse {
  readonly available: boolean;
  readonly places: readonly KnownPlace[];
}

export interface PlaceCandidate {
  readonly label: string;
  readonly address: string | null;
  readonly point: GeoPoint;
}

export type PlaceLookupStatus = 'OK' | 'DISABLED' | 'BUSY' | 'UNAVAILABLE';

/** `POST destinations/search` — LUON 200, trang thai nam trong than. */
export interface PlaceSearchResponse {
  readonly status: PlaceLookupStatus;
  readonly reason: string | null;
  readonly results: readonly PlaceCandidate[];
  readonly attribution: string | null;
  readonly fromCache: boolean;
}

/** Hai hinh dang lua chon diem giao — KHONG co "mot cap so tu do". */
export type DestinationChoice =
  | { readonly kind: 'KNOWN_PLACE'; readonly placeId: string }
  | {
      readonly kind: 'PLACE_SEARCH';
      readonly query: string;
      readonly label: string;
      readonly latitude: number;
      readonly longitude: number;
    };
