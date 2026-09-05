/**
 * HOP DONG DAY DAY cua `/transport/*` — ban SAO CO CHU DICH.
 *
 * `apps/api/src/transport/transport.schemas.ts:11-17` co y KHONG dua cac kieu nay vao
 * `packages/shared`. Nen `apps/web` phai tu giu mot ban sao, va ban sao do phai noi ro no la ban
 * sao — khong phai nguon su that. Nguon su that la controller cua API.
 *
 * BA quy uoc don vi de doc sai la ra so lieu sai tren man hinh khach, ghi o day mot lan:
 *
 *   · tien      — so nguyen DONG (`money.ts:17`, `GD-03`). KHONG co don vi phu, khong co cent.
 *   · `litersUnits`      — so nguyen MILILIT (ty le 3). `200000` = 200 lit — CHIA 1000.
 *   · `consumptionUnits` — so nguyen MILI-L/100km (ty le 3). `40000` = 40 L/100km — CHIA 1000.
 *
 * Hai dong tren la cho de doc sai nhat trong ca tep: `formatLiters` cua API in `200000` thanh
 * `"200.000"`, va trong dinh dang Viet Nam chuoi do TRONG GIONG mot phan nghin. No la 200 lit voi
 * ba so thap phan. Hien thi thang `litersUnits` len man hinh la sai gap mot nghin lan.
 *
 * Va HAI khai niem thoi gian khong bao gio thay nhau duoc (`business-date.ts:1-8`):
 *
 *   · `BusinessDate`  — chuoi `YYYY-MM-DD` theo lich TENANT. So sanh bang chuoi la dung.
 *   · moi truong `*At` — moc thoi gian ISO-8601.
 *
 * Doc `businessDate` nhu mot moc UTC de hien thi la loi da co ten: mot phieu 06:30 ngay 01/08 duoc
 * luu `2026-07-31T23:30Z`, va hien thi theo UTC se xep no sang THANG TRUOC.
 */

/** Chuoi `YYYY-MM-DD` theo lich dia phuong cua tenant. So sanh truc tiep bang chuoi. */
export type BusinessDate = string;

/* ------------------------------------------------------------------ *
 * TX-01 Fleet · TX-02 Trip Operations
 * ------------------------------------------------------------------ */

export const TRIP_STATUSES = [
  'PLANNED',
  'IN_TRANSIT',
  'DELIVERED',
  'RECONCILED',
  'CANCELLED',
] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];

export const TRIP_KINDS = [
  'OWN_DIRECT',
  'EXTERNAL_CARRIER',
  'PARTNER_REFERRED_INTERNAL_RUN',
] as const;
export type TripKind = (typeof TRIP_KINDS)[number];

export const VEHICLE_STATUSES = ['IDLE', 'ON_TRIP', 'UNDER_MAINTENANCE'] as const;
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

export const DRIVER_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type DriverStatus = (typeof DRIVER_STATUSES)[number];

export const PARTY_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type PartyStatus = (typeof PARTY_STATUSES)[number];

export const PARTNER_ROLE_KINDS = ['CARRIER', 'ORDER_REFERRER'] as const;
export type PartnerRoleKind = (typeof PARTNER_ROLE_KINDS)[number];

export interface Trip {
  readonly id: string;
  readonly code: string;
  readonly kind: TripKind;
  readonly status: TripStatus;
  readonly businessDate: BusinessDate;
  readonly originLabel: string;
  readonly destinationLabel: string;
  readonly cargoDescription: string | null;
  readonly customerId: string | null;
  readonly carrierPartnerId: string | null;
  readonly referrerPartnerId: string | null;
  readonly freightAmount: number | null;
  readonly currencyCode: string;
  readonly distanceKm: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly cancelledAt: string | null;
  readonly cancellationReason: string | null;
}

/** Mot dong LICH SU phan cong cua chuyen. `effectiveTo === null` la dong dang hieu luc. */
export interface TripAssignment {
  readonly id: string;
  readonly tripId: string;
  readonly vehicleId: string | null;
  readonly driverId: string | null;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly assignedBy: string;
  readonly createdAt: string;
}

export interface Vehicle {
  readonly id: string;
  readonly registrationPlate: string;
  readonly vehicleClass: string;
  readonly allowedPayloadKg: number | null;
  readonly currentOdoKm: number;
  readonly status: VehicleStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface Driver {
  readonly id: string;
  readonly fullName: string;
  readonly phone: string;
  readonly licenceClass: string;
  readonly licenceExpiry: BusinessDate;
  readonly status: DriverStatus;
  readonly authUserId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Lich su lai xe phu trach mot XE — kieu KHAC voi `TripAssignment`. */
export interface VehicleDriverAssignment {
  readonly id: string;
  readonly vehicleId: string;
  readonly driverId: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly createdAt: string;
}

export interface TransportCustomer {
  readonly id: string;
  readonly name: string;
  readonly phone: string | null;
  readonly address: string | null;
  readonly taxCode: string | null;
  readonly status: PartyStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TransportPartner {
  readonly id: string;
  readonly name: string;
  readonly phone: string | null;
  readonly roles: readonly PartnerRoleKind[];
  readonly status: PartyStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Khung nhin cua LAI XE — `INV-09`.
 *
 * KHONG co `freightAmount`, KHONG co `currencyCode`. Do la mot BAT BIEN CAU TRUC, khong phai mot
 * bo loc: `apps/api/src/transport/trips/driver-trip.view.ts` la mot kieu rieng, nen lan them truong
 * doanh thu sau nay khong the lam no ro ra. Web giu dung hinh dang do va khong bao gio hop nhat
 * kieu nay voi `Trip`.
 */
export interface DriverTripView {
  readonly id: string;
  readonly code: string;
  readonly kind: TripKind;
  readonly status: TripStatus;
  readonly businessDate: BusinessDate;
  readonly originLabel: string;
  readonly destinationLabel: string;
  readonly cargoDescription: string | null;
  readonly distanceKm: number | null;
  readonly customerName: string | null;
  readonly vehicleRegistrationPlate: string | null;
  readonly assignedAt: string | null;
  readonly isCurrentAssignee: boolean;
}

/* ------------------------------------------------------------------ *
 * TX-03 Costing + Driver Fund
 * ------------------------------------------------------------------ */

export const DRIVER_FUND_ENTRY_KINDS = [
  'ADVANCE',
  'RETURN',
  'TRIP_EXPENSE',
  'ADJUSTMENT',
  'REVERSAL',
] as const;
export type DriverFundEntryKind = (typeof DRIVER_FUND_ENTRY_KINDS)[number];

/**
 * The dung cua so du quy — `driver-fund-ledger.ts:186`.
 *
 * SO AM KHONG PHAI "lai xe dang no cong ty". Man hinh phai doc truong nay, KHONG duoc tu suy tu
 * dau cua `balance`, vi hai huong am/duong mang hai nghia nghiep vu khac han.
 */
export const FUND_BALANCE_STANCES = [
  'DRIVER_HOLDS_COMPANY_CASH',
  'SETTLED',
  'COMPANY_OWES_DRIVER',
] as const;
export type FundBalanceStance = (typeof FUND_BALANCE_STANCES)[number];

export const FUND_PERIOD_STATUSES = ['OPEN', 'CLOSING', 'CLOSED', 'REOPENED'] as const;
export type FundPeriodStatus = (typeof FUND_PERIOD_STATUSES)[number];

export const EXPENSE_FUNDING_SOURCES = ['DRIVER_FUND', 'COMPANY_DIRECT'] as const;
export type ExpenseFundingSource = (typeof EXPENSE_FUNDING_SOURCES)[number];

export const TRIP_EXPENSE_KINDS = ['EXPENSE', 'REVERSAL'] as const;
export type TripExpenseKind = (typeof TRIP_EXPENSE_KINDS)[number];

export interface DriverFundAccount {
  readonly id: string;
  readonly driverId: string;
  readonly currencyCode: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DriverFundEntry {
  readonly id: string;
  readonly accountId: string;
  readonly kind: DriverFundEntryKind;
  readonly signedAmount: number;
  readonly currencyCode: string;
  readonly businessDate: BusinessDate;
  readonly tripId: string | null;
  readonly correlationKey: string;
  readonly reversalOfId: string | null;
  readonly note: string | null;
  readonly recordedBy: string;
  readonly createdAt: string;
}

export interface DriverFundStatement {
  readonly account: DriverFundAccount | null;
  readonly driverId: string;
  readonly balance: number;
  readonly balanceStance: FundBalanceStance;
  readonly currencyCode: string;
  readonly entries: readonly DriverFundEntry[];
}

export interface DriverFundPeriod {
  readonly id: string;
  readonly accountId: string;
  readonly startDate: BusinessDate;
  readonly endDate: BusinessDate;
  readonly status: FundPeriodStatus;
  readonly closedAt: string | null;
  readonly closedBy: string | null;
  readonly reopenedAt: string | null;
  readonly reopenedBy: string | null;
  readonly reopenReason: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface FundPeriodSnapshot {
  readonly id: string;
  readonly periodId: string;
  readonly sequence: number;
  readonly openingBalance: number;
  readonly periodNet: number;
  readonly closingBalance: number;
  readonly entryCount: number;
  readonly currencyCode: string;
  readonly takenAt: string;
  readonly takenBy: string;
}

export interface ClosedFundPeriod {
  readonly period: DriverFundPeriod;
  readonly snapshot: FundPeriodSnapshot;
}

export interface TripExpense {
  readonly id: string;
  readonly tripId: string;
  readonly kind: TripExpenseKind;
  readonly categoryCode: string;
  readonly signedAmount: number;
  readonly currencyCode: string;
  readonly businessDate: BusinessDate;
  readonly fundedBy: ExpenseFundingSource;
  readonly driverFundEntryId: string | null;
  readonly driverId: string | null;
  readonly correlationKey: string;
  readonly reversalOfId: string | null;
  readonly evidenceLocator: string | null;
  readonly note: string | null;
  readonly recordedBy: string;
  readonly createdAt: string;
}

export interface TripCostBreakdown {
  readonly tripId: string;
  readonly currencyCode: string;
  readonly directCost: number;
  readonly expenses: readonly TripExpense[];
}

/** CA HAI chan deu nullable: chi `COMPANY_DIRECT` tra `entry: null`. */
export interface CorrelatedPosting {
  readonly entry: DriverFundEntry | null;
  readonly expense: TripExpense | null;
}

/* ------------------------------------------------------------------ *
 * TX-04 Fuel
 * ------------------------------------------------------------------ */

export const FUEL_VERIFICATION_STATUSES = ['DECLARED', 'VERIFIED', 'REJECTED'] as const;
export type FuelVerificationStatus = (typeof FUEL_VERIFICATION_STATUSES)[number];

export const FUEL_RECONCILIATION_STATUSES = [
  'UNMATCHED',
  'MATCHED',
  'MISMATCHED',
  'SETTLED',
  'IGNORED',
] as const;
export type FuelReconciliationStatus = (typeof FUEL_RECONCILIATION_STATUSES)[number];

export const FUEL_RECONCILIATION_STATES = [
  'DRAFT',
  'MATCHING',
  'RESOLVED',
  'CLOSED',
  'REOPENED',
] as const;
export type FuelReconciliationState = (typeof FUEL_RECONCILIATION_STATES)[number];

export const FUEL_PAYMENT_METHODS = ['DRIVER_CASH', 'SUPPLIER_ACCOUNT'] as const;
export type FuelPaymentMethod = (typeof FUEL_PAYMENT_METHODS)[number];

export const FUEL_STATEMENT_FORMATS = ['CSV', 'XLSX'] as const;
export type FuelStatementFormat = (typeof FUEL_STATEMENT_FORMATS)[number];

export const FUEL_STATEMENT_REJECT_REASONS = [
  'MISSING_REQUIRED_FIELD',
  'MALFORMED_DATE',
  'MALFORMED_AMOUNT',
  'MALFORMED_LITERS',
  'UNKNOWN_VEHICLE',
  'DUPLICATE_ROW',
] as const;
export type FuelStatementRejectReason = (typeof FUEL_STATEMENT_REJECT_REASONS)[number];

export const FUEL_DISCREPANCY_KINDS = [
  'AMBIGUOUS_CANDIDATES',
  'STATEMENT_LINE_ONLY',
  'FUEL_ENTRY_ONLY',
  'OUT_OF_TOLERANCE',
  'SELF_SOURCED_BLOCKED',
] as const;
export type FuelDiscrepancyKind = (typeof FUEL_DISCREPANCY_KINDS)[number];

export const FUEL_DISCREPANCY_STATUSES = ['PENDING', 'RESOLVED'] as const;
export type FuelDiscrepancyStatus = (typeof FUEL_DISCREPANCY_STATUSES)[number];

export const FUEL_DISCREPANCY_RESOLUTIONS = [
  'ACCEPT_SUPPLIER_AMOUNT',
  'REJECT_SUPPLIER_LINE',
  'MATCH_CONFIRMED',
  'IGNORE_WITH_REASON',
  'ENTRY_CORRECTION_REQUIRED',
] as const;
export type FuelDiscrepancyResolution = (typeof FUEL_DISCREPANCY_RESOLUTIONS)[number];

export const FUEL_MATCH_ORIGINS = ['AUTO', 'MANUAL'] as const;
export type FuelMatchOrigin = (typeof FUEL_MATCH_ORIGINS)[number];

/** Ly do can nguoi soi lai mot phieu. Danh sach mo phia API — giu chuoi tho. */
export type FuelReviewReason = string;

export interface FuelSupplier {
  readonly id: string;
  readonly name: string;
  readonly status?: PartyStatus;
}

export interface FuelEntry {
  readonly id: string;
  readonly tripId: string;
  readonly vehicleId: string;
  readonly driverId: string;
  readonly supplierId: string;
  readonly businessDate: BusinessDate;
  readonly occurredAt: string;
  readonly litersUnits: number;
  readonly amount: number;
  readonly currencyCode: string;
  readonly odometerKm: number;
  readonly previousOdometerKm: number | null;
  readonly consumptionUnits: number | null;
  readonly reviewReasons: readonly FuelReviewReason[];
  readonly paymentMethod: FuelPaymentMethod;
  readonly verificationStatus: FuelVerificationStatus;
  readonly reconciliationStatus: FuelReconciliationStatus;
  readonly sourceStatementId: string | null;
  readonly costExpenseId: string | null;
  readonly correlationKey: string;
  readonly invoiceNo: string | null;
  readonly note: string | null;
  readonly declaredBy: string;
  readonly verifiedAt: string | null;
  readonly verifiedBy: string | null;
  readonly rejectedAt: string | null;
  readonly rejectedBy: string | null;
  readonly reviewNote: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface FuelReceiptEvidence {
  readonly id: string;
  readonly fuelEntryId: string;
  readonly locator: string;
  readonly contentType: string | null;
  readonly byteSize: number | null;
  readonly capturedAt: string | null;
  readonly uploadedBy: string;
  readonly createdAt: string;
}

export interface FuelEntryDetail {
  readonly entry: FuelEntry;
  readonly evidence: readonly FuelReceiptEvidence[];
}

/**
 * Khung nhin cua LAI XE cho phieu dau — kieu RIENG, khong phai `FuelEntry` da loc.
 * Bang chung chi lo ra mot con SO DEM: lai xe khong liet ke lai duoc anh vua gui.
 */
export interface DriverFuelSlipView {
  readonly id: string;
  readonly tripId: string;
  readonly vehicleId: string;
  readonly supplierId: string;
  readonly businessDate: BusinessDate;
  readonly occurredAt: string;
  readonly litersUnits: number;
  readonly amount: number;
  readonly currencyCode: string;
  readonly odometerKm: number;
  readonly previousOdometerKm: number | null;
  readonly consumptionUnits: number | null;
  readonly reviewReasons: readonly FuelReviewReason[];
  readonly paymentMethod: FuelPaymentMethod;
  readonly verificationStatus: FuelVerificationStatus;
  readonly reconciliationStatus: FuelReconciliationStatus;
  readonly invoiceNo: string | null;
  readonly note: string | null;
  readonly reviewNote: string | null;
  readonly evidenceCount: number;
  readonly createdAt: string;
}

export interface FuelSupplierStatement {
  readonly id: string;
  readonly supplierId: string;
  readonly periodStart: BusinessDate;
  readonly periodEnd: BusinessDate;
  readonly filename: string;
  readonly format: FuelStatementFormat;
  readonly sourceDigest: string;
  readonly importedAt: string;
  readonly importedBy: string;
}

export interface FuelStatementLine {
  readonly id: string;
  readonly statementId: string;
  readonly rowNumber: number;
  readonly status: 'ACCEPTED' | 'REJECTED';
  readonly rejectReason: FuelStatementRejectReason | null;
  readonly vehiclePlateRaw: string;
  readonly vehicleId: string | null;
  readonly businessDate: BusinessDate | null;
  readonly litersUnits: number | null;
  readonly amount: number | null;
  readonly currencyCode: string;
  readonly reconciliationStatus: FuelReconciliationStatus;
  readonly invoiceNo: string | null;
  readonly note: string | null;
  readonly createdAt: string;
}

/** Dong cua BAN XEM TRUOC — chua co `id`, chi co `rowNumber`. */
export interface MappedStatementLine {
  readonly rowNumber: number;
  readonly status: 'ACCEPTED' | 'REJECTED';
  readonly rejectReason: FuelStatementRejectReason | null;
  readonly vehiclePlateRaw: string;
  readonly vehicleId: string | null;
  readonly businessDate: BusinessDate | null;
  readonly litersUnits: number | null;
  readonly amount: number | null;
  readonly invoiceNo: string | null;
  readonly note: string | null;
  readonly rawValues: Readonly<Record<string, string>>;
}

export interface StatementImportPreview {
  readonly headers: readonly string[];
  readonly rowCount: number;
  readonly acceptedCount: number;
  readonly rejectedCount: number;
  readonly rejectionsByReason: Readonly<Record<string, number>>;
  readonly lines: readonly MappedStatementLine[];
  readonly sourceDigest: string;
}

export interface FuelReconciliation {
  readonly id: string;
  readonly supplierId: string;
  readonly statementId: string | null;
  readonly periodStart: BusinessDate;
  readonly periodEnd: BusinessDate;
  readonly state: FuelReconciliationState;
  readonly closedAt: string | null;
  readonly closedBy: string | null;
  readonly reopenedAt: string | null;
  readonly reopenedBy: string | null;
  readonly reopenReason: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface FuelMatch {
  readonly id: string;
  readonly reconciliationId: string;
  readonly statementLineId: string;
  readonly fuelEntryId: string;
  readonly amountDeltaVnd: number;
  readonly businessDateDeltaDays: number;
  readonly origin: FuelMatchOrigin;
  readonly matchedAt: string;
  readonly matchedBy: string;
}

export interface FuelDiscrepancy {
  readonly id: string;
  readonly reconciliationId: string;
  readonly kind: FuelDiscrepancyKind;
  readonly status: FuelDiscrepancyStatus;
  readonly statementLineId: string | null;
  readonly fuelEntryId: string | null;
  readonly candidateEntryIds: readonly string[];
  readonly candidateLineIds: readonly string[];
  readonly resolution: FuelDiscrepancyResolution | null;
  readonly resolutionNote: string | null;
  readonly resolvedAt: string | null;
  readonly resolvedBy: string | null;
  readonly createdAt: string;
}

export interface FuelSettlementHandoff {
  readonly id: string;
  readonly reconciliationId: string;
  readonly revision: number;
  readonly supersedesId: string | null;
  readonly acceptedAmount: number;
  readonly acceptedLineCount: number;
  readonly acceptedLineIds: readonly string[];
  readonly emittedAt: string;
}

export interface FuelReconciliationWorkspace {
  readonly reconciliation: FuelReconciliation;
  readonly statement: FuelSupplierStatement;
  readonly lines: readonly FuelStatementLine[];
  readonly matches: readonly FuelMatch[];
  readonly discrepancies: readonly FuelDiscrepancy[];
  readonly pendingDiscrepancyCount: number;
  readonly handoff: FuelSettlementHandoff | null;
}

/** `POST .../match` KHONG tra ve trang thai moi cua ky — man hinh phai doc lai workspace. */
export interface MatchingRunResult {
  readonly matches: readonly FuelMatch[];
  readonly discrepancies: readonly FuelDiscrepancy[];
}

export interface ImportedStatement {
  readonly statement: FuelSupplierStatement;
  readonly lines: readonly FuelStatementLine[];
  readonly reconciliation: FuelReconciliation;
  readonly preview: StatementImportPreview;
}

export interface ClosedReconciliationResult {
  readonly reconciliation: FuelReconciliation;
  readonly handoff: FuelSettlementHandoff;
}
