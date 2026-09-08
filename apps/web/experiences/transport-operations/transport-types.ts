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

/**
 * AI DIEU HANH mot xe (`TX-08`) — TRUC DOC LAP voi quyen so huu.
 *
 * Mot xe dong so huu ma B van dieu hanh la `INTERNAL_OPERATED`. Man hinh KHONG duoc suy
 * "co ben huu quan => xe nha ngoai": hai truc do tra loi hai cau hoi khac nhau.
 */
export const VEHICLE_OPERATIONAL_CONTROLS = ['INTERNAL_OPERATED', 'EXTERNAL_CARRIER'] as const;
export type VehicleOperationalControl = (typeof VEHICLE_OPERATIONAL_CONTROLS)[number];

export interface Vehicle {
  readonly id: string;
  readonly registrationPlate: string;
  readonly vehicleClass: string;
  readonly allowedPayloadKg: number | null;
  readonly currentOdoKm: number;
  readonly status: VehicleStatus;
  /** `TX-08` — chi DOC o day; duong ghi di qua man So huu tai san. */
  readonly operationalControl: VehicleOperationalControl;
  readonly ownershipRegisterComplete: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/* ------------------------------------------------------------------ *
 * `TX-08` SO HUU TAI SAN (#242 Lane E)
 * ------------------------------------------------------------------ */

export const ASSET_STAKEHOLDER_KINDS = ['PERSON', 'ORGANIZATION'] as const;
export type AssetStakeholderKind = (typeof ASSET_STAKEHOLDER_KINDS)[number];

/** Toan bo mot chiec xe = 10000 diem co ban. KHONG phai `100`, va khong phai `1.0`. */
export const OWNERSHIP_BASIS_POINTS_TOTAL = 10_000;

/**
 * BEN HUU QUAN. `hasAccount` noi CO tai khoan hay khong — may chu KHONG tra ve la tai khoan nao,
 * va man hinh khong duoc doi hoi dieu do.
 */
export interface AssetStakeholder {
  readonly id: string;
  readonly kind: AssetStakeholderKind;
  readonly displayName: string;
  readonly status: PartyStatus;
  readonly note: string | null;
  readonly hasAccount: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface VehicleOwnershipInterest {
  readonly id: string;
  readonly vehicleId: string;
  readonly stakeholderId: string;
  readonly stakeholderName: string;
  readonly stakeholderKind: AssetStakeholderKind;
  readonly ownershipBasisPoints: number;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly recordedBy: string;
  readonly recordedNote: string | null;
  readonly closedBy: string | null;
  readonly closedNote: string | null;
  readonly createdAt: string;
}

export interface VehicleOwnershipRegister {
  readonly vehicleId: string;
  readonly registrationPlate: string;
  readonly operationalControl: VehicleOperationalControl;
  readonly registerComplete: boolean;
  readonly current: readonly VehicleOwnershipInterest[];
  readonly currentBasisPointsTotal: number;
  readonly unattributedBasisPoints: number;
  readonly history: readonly VehicleOwnershipInterest[];
}

export interface StakeholderOwnershipPeriod {
  readonly ownershipBasisPoints: number;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
}

/** Khung nhin "Xe toi co co phan". Danh sach truong la mot QUYET DINH BAO MAT — xem #242 E3. */
export interface StakeholderVehicleView {
  readonly vehicleId: string;
  readonly registrationPlate: string;
  readonly vehicleClass: string;
  readonly status: string;
  readonly operationalControl: VehicleOperationalControl;
  readonly currentOdoKm: number;
  readonly myBasisPoints: number;
  readonly myEffectiveFrom: string;
  readonly myHistory: readonly StakeholderOwnershipPeriod[];
  readonly driverName: string | null;
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
  /**
   * MA XE cua chinh phan cong nay (`#168 B2`).
   *
   * `POST /transport/me/fuel/slips` doi `vehicleId`, va truoc B2 be mat lai xe chi doc duoc
   * BIEN SO — nen lai xe khong nop noi phieu dau dau tien tu dien thoai. Day la duong duy nhat
   * ho hoc duoc ma xe, va no chi ra ma xe cua CHINH phan cong cua ho.
   */
  readonly vehicleId: string | null;
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
  /** `TX-07b` — cong ty tra lai lai xe khoan ho da bo tui. KHONG phai luong, khong phai tam ung. */
  'REIMBURSEMENT',
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

/* ------------------------------------------------------------------ *
 * HOP THU PHIEU NHIEN LIEU cua CA DOI — #222 P1-B
 * ------------------------------------------------------------------ */

/** Mot anh cua phieu o dang hop thu duoc phep biet — KHONG co `locator`. */
export interface FuelInboxEvidenceRef {
  readonly id: string;
  readonly contentType: string | null;
}

/**
 * MOT DONG HOP THU — kieu RIENG, khong phai `FuelEntry` co gan them nhan.
 *
 * May chu da doi `tripId`/`driverId`/`vehicleId`/`supplierId` ra CHU truoc khi tra ve. Do la ca ly
 * do hop thu ton tai: neu man hinh phai tu ghep bon bang tra, no se lai roi vao dung kieu N+1 ma
 * #222 cam — va do la ly do man Nhien lieu truoc day khong co danh sach phieu nao.
 */
export interface FuelEntryInboxRow {
  readonly id: string;
  readonly tripId: string;
  readonly tripCode: string;
  readonly driverId: string;
  readonly driverName: string | null;
  readonly vehicleId: string;
  readonly vehiclePlate: string | null;
  readonly supplierId: string;
  readonly supplierName: string | null;
  readonly businessDate: BusinessDate;
  readonly occurredAt: string;
  readonly litersUnits: number;
  readonly amount: number;
  readonly currencyCode: string;
  readonly invoiceNo: string | null;
  readonly paymentMethod: FuelPaymentMethod;
  readonly verificationStatus: FuelVerificationStatus;
  readonly reconciliationStatus: FuelReconciliationStatus;
  readonly reviewReasons: readonly FuelReviewReason[];
  readonly reviewNote: string | null;
  readonly evidenceCount: number;
  readonly evidence: readonly FuelInboxEvidenceRef[];
}

export interface FuelEntryInboxPage {
  readonly rows: readonly FuelEntryInboxRow[];
  readonly total: number;
  /** CO Y khong chay theo bo loc trang thai — xem hop dong cua may chu. */
  readonly pendingVerificationCount: number;
  readonly limit: number;
  readonly offset: number;
}

/** Bo loc gui len duoi dang query string. `null`/vang mat = khong loc theo truc do. */
export interface FuelEntryInboxQuery {
  readonly verification?: FuelVerificationStatus | null;
  readonly reconciliation?: FuelReconciliationStatus | null;
  /** MA CHUYEN doc duoc (`UAT-VIET-01`), khong phai `tripId`. */
  readonly tripCode?: string | null;
  readonly driverId?: string | null;
  readonly vehicleId?: string | null;
  readonly supplierId?: string | null;
  readonly from?: BusinessDate | null;
  readonly to?: BusinessDate | null;
  readonly limit?: number;
  readonly offset?: number;
}

/**
 * Khung nhin cua LAI XE cho phieu dau — kieu RIENG, khong phai `FuelEntry` da loc.
 * Bang chung chi lo ra mot con SO DEM: lai xe khong liet ke lai duoc anh vua gui.
 */
/**
 * CAY XANG tren BE MAT LAI XE — kieu RIENG, hep hon `FuelSupplier`.
 *
 * `taxCode` va cac truong ke toan khac co y vang mat: lai xe chon cay xang bang TEN tren bien
 * hieu. Mot truong khong duoc gui di la mot truong khong the ro ri.
 */
export interface DriverFuelSupplier {
  readonly id: string;
  readonly name: string;
}

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
  /**
   * ANH cua chinh phieu nay — chi `id` va loai noi dung.
   *
   * `locator` va `uploadedBy` CO Y khong co: cai dau la khoa trong kho anh, cai sau la danh
   * tinh nguoi van hanh. Man hinh dung `id` de dung dia chi doc byte qua route co xac thuc.
   */
  readonly evidence: readonly DriverFuelEvidenceView[];
  readonly createdAt: string;
}

export interface DriverFuelEvidenceView {
  readonly id: string;
  readonly contentType: string | null;
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

/* ------------------------------------------------------------------ *
 * `TX-05` — quyet toan (T7D: da co duong HTTP, xem `SettlementReportsController`)
 * ------------------------------------------------------------------ */

export const AGING_BUCKETS = ['CURRENT', 'D1_30', 'D31_60', 'D60_PLUS'] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

/**
 * NAM DONG TIEN GIU RIENG (`GD-15`) — khong co ban "tat ca cac dong".
 *
 * Duong HTTP bat buoc tham so `flow`, va do la co y: gop bon dong phai tra vao mot bang se lam ke
 * toan doc ra mot con so khong tra loi duoc cau hoi nao — "cong ty no ai bao nhieu" chi co nghia
 * khi biet no AI.
 */
export const SETTLEMENT_FLOWS = [
  'CUSTOMER_FREIGHT',
  'FUEL_SUPPLIER',
  'CARRIER_SERVICE',
  'PARTNER_COMMISSION',
] as const;
export type SettlementFlow = (typeof SETTLEMENT_FLOWS)[number];

export const SETTLEMENT_DIRECTIONS = ['RECEIVABLE', 'PAYABLE'] as const;
export type SettlementDirection = (typeof SETTLEMENT_DIRECTIONS)[number];

export const SETTLEMENT_DOCUMENT_KINDS = ['ORIGINAL', 'ADJUSTMENT', 'REVERSAL'] as const;
export type SettlementDocumentKind = (typeof SETTLEMENT_DOCUMENT_KINDS)[number];

export const SETTLEMENT_DOCUMENT_STATUSES = ['OPEN', 'SETTLED', 'VOID'] as const;
export type SettlementDocumentStatus = (typeof SETTLEMENT_DOCUMENT_STATUSES)[number];

export interface ArAgingRow {
  readonly documentId: string;
  readonly counterpartyId: string;
  readonly businessDate: BusinessDate;
  readonly dueDate: BusinessDate | null;
  readonly outstandingAmount: number;
  readonly daysOverdue: number;
  readonly bucket: AgingBucket;
  readonly currencyCode: string;
}

export interface ArAgingReport {
  /** Moc do BAT BUOC — khong co mac dinh "hom nay". Xem chu thich cua route. */
  readonly asOf: BusinessDate;
  readonly rows: readonly ArAgingRow[];
  readonly totalsByBucket: Readonly<Record<AgingBucket, number>>;
  readonly outstandingTotal: number;
  readonly overdueTotal: number;
}

export interface ApByCounterpartyRow {
  readonly counterpartyId: string;
  readonly flow: SettlementFlow;
  readonly documentCount: number;
  /** DUONG — so tien cong ty con no. Da doi dau san o may chu de bao cao doc thuan. */
  readonly outstandingAmount: number;
  readonly currencyCode: string;
}

/**
 * HAI CHIEU cua MOT doi tac, canh nhau. `netDisplay` CHI de hien thi (`GD-15`) — no khong ton tai
 * trong bang nao va khong ai tra tien theo no. Ba con so goc luon phai hien cung no.
 */
export interface PartnerPosition {
  readonly partnerId: string;
  readonly receivableAmount: number;
  readonly carrierPayableAmount: number;
  readonly commissionPayableAmount: number;
  readonly netDisplay: number;
  readonly currencyCode: string;
}

export interface DirectMargin {
  readonly tripId: string;
  readonly tripKind: TripKind;
  /** `null` = CHUA NHAP gia cuoc — khac han `0`. */
  readonly revenueAmount: number | null;
  readonly directCostAmount: number;
  readonly carrierPayableAmount: number;
  readonly commissionAmount: number;
  readonly deductionAmount: number;
  readonly marginAmount: number | null;
  /** DIEM CO BAN (1% = 100). `null` khi khong tinh duoc hoac doanh thu = 0. */
  readonly marginBasisPoints: number | null;
  readonly currencyCode: string;
  /** `GD-13` — LUON `false`. Mot hang so co ten de man hinh khong phai tu doan. */
  readonly fixedCostsIncluded: false;
  /** Cau phai hien CANH con so. Khong duoc bo, khong duoc dien dat lai. */
  readonly disclosure: string;
  /** MAU THUAN DU LIEU (`INV-04`), khong phai mot con so: chuyen thue ngoai co chi phi noi bo. */
  readonly unexpectedInternalCost: boolean;
}

export interface DirectMarginRollup {
  readonly revenueAmount: number;
  readonly deductionAmount: number;
  readonly marginAmount: number;
  readonly marginBasisPoints: number | null;
  readonly tripCount: number;
  /** Chuyen CHUA co gia cuoc bi BO QUA chu khong coi la 0 — con so nay noi ra bao nhieu. */
  readonly skippedTripCount: number;
  readonly fixedCostsIncluded: false;
  readonly disclosure: string;
}

export interface SettlementDocument {
  readonly id: string;
  readonly direction: SettlementDirection;
  readonly flow: SettlementFlow;
  readonly counterpartyKind: string;
  readonly counterpartyId: string;
  readonly kind: SettlementDocumentKind;
  readonly status: SettlementDocumentStatus;
  readonly signedAmount: number;
  readonly currencyCode: string;
  readonly businessDate: BusinessDate;
  readonly dueDate: BusinessDate | null;
  readonly tripId: string | null;
  readonly invoiceRef: string | null;
  readonly note: string | null;
  readonly createdAt: string;
}

export interface SettlementAllocation {
  readonly id: string;
  readonly documentId: string;
  readonly amount: number;
  readonly businessDate: BusinessDate;
  readonly method: string;
  readonly note: string | null;
  readonly createdAt: string;
}

/** So du cua mot chung tu doc qua CA CHUOI, khong doc tren ban goc. */
export interface SettlementDocumentChain {
  readonly original: SettlementDocument;
  readonly corrections: readonly SettlementDocument[];
  readonly allocations: readonly SettlementAllocation[];
  readonly grossAmount: number;
  readonly outstandingAmount: number;
}

/* ------------------------------------------------------------------ *
 * `TX-06` — bao duong, giay to, trang thai hieu luc
 * ------------------------------------------------------------------ */

export const MAINTENANCE_TRIGGER_KINDS = ['ODOMETER', 'CALENDAR', 'ODOMETER_OR_CALENDAR'] as const;
export type MaintenanceTriggerKind = (typeof MAINTENANCE_TRIGGER_KINDS)[number];

export const MAINTENANCE_PLAN_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type MaintenancePlanStatus = (typeof MAINTENANCE_PLAN_STATUSES)[number];

export const MAINTENANCE_WORK_ORDER_STATUSES = ['OPEN', 'COMPLETED', 'CANCELLED'] as const;
export type MaintenanceWorkOrderStatus = (typeof MAINTENANCE_WORK_ORDER_STATUSES)[number];

export const MAINTENANCE_DUE_STATES = ['OK', 'DUE_SOON', 'OVERDUE'] as const;
export type MaintenanceDueState = (typeof MAINTENANCE_DUE_STATES)[number];

export const MAINTENANCE_DUE_TRIGGERS = ['ODOMETER', 'CALENDAR'] as const;
export type MaintenanceDueTrigger = (typeof MAINTENANCE_DUE_TRIGGERS)[number];

export const COMPLIANCE_DOCUMENT_TYPES = [
  'VEHICLE_INSPECTION',
  'VEHICLE_INSURANCE',
  'VEHICLE_TRANSPORT_BADGE',
  'DRIVER_LICENCE',
  'COMPANY_TRANSPORT_LICENSE',
  'CONDITIONAL_CARGO_PERMIT',
] as const;
export type ComplianceDocumentType = (typeof COMPLIANCE_DOCUMENT_TYPES)[number];

export const COMPLIANCE_SUBJECT_KINDS = ['VEHICLE', 'DRIVER', 'COMPANY'] as const;
export type ComplianceSubjectKind = (typeof COMPLIANCE_SUBJECT_KINDS)[number];

export const COMPLIANCE_DOCUMENT_STATUSES = ['ACTIVE', 'SUPERSEDED', 'REVOKED'] as const;
export type ComplianceDocumentStatus = (typeof COMPLIANCE_DOCUMENT_STATUSES)[number];

export const COMPLIANCE_HEALTHS = ['HEALTHY', 'DUE_SOON', 'EXPIRED'] as const;
export type ComplianceHealth = (typeof COMPLIANCE_HEALTHS)[number];

export interface MaintenancePlan {
  readonly id: string;
  readonly vehicleId: string;
  readonly name: string;
  readonly triggerKind: MaintenanceTriggerKind;
  readonly intervalKm: number | null;
  readonly intervalDays: number | null;
  readonly baselineOdoKm: number;
  readonly baselineDate: BusinessDate;
  readonly status: MaintenancePlanStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MaintenanceWorkOrder {
  readonly id: string;
  readonly vehicleId: string;
  readonly planId: string | null;
  readonly status: MaintenanceWorkOrderStatus;
  readonly description: string;
  readonly openedDate: BusinessDate;
  readonly openedOdoKm: number;
  readonly openedAt: string;
  readonly completedDate: BusinessDate | null;
  readonly completedOdoKm: number | null;
  readonly completedAt: string | null;
  readonly cancelledAt: string | null;
  readonly cancellationReason: string | null;
  readonly costAmount: number | null;
  readonly currencyCode: string;
  readonly note: string | null;
  readonly updatedAt: string;
}

/** MOT KE HOACH DEN HAN — may chu tinh, man hinh KHONG duoc tinh lai (`#170 §4.B`). */
export interface MaintenanceDue {
  readonly planId: string;
  readonly vehicleId: string;
  readonly planName: string;
  readonly triggerKind: MaintenanceTriggerKind;
  readonly state: MaintenanceDueState;
  readonly dueAtOdoKm: number | null;
  readonly dueOnDate: BusinessDate | null;
  readonly odoRemainingKm: number | null;
  readonly daysRemaining: number | null;
  readonly reachedBy: MaintenanceDueTrigger | null;
  readonly currentOdoKm: number;
  readonly lastServicedDate: BusinessDate;
  readonly lastServicedOdoKm: number;
}

export interface ComplianceDocument {
  readonly id: string;
  readonly subjectKind: ComplianceSubjectKind;
  readonly subjectId: string | null;
  readonly documentType: ComplianceDocumentType;
  readonly documentNo: string | null;
  readonly validFrom: BusinessDate;
  readonly validTo: BusinessDate;
  readonly status: ComplianceDocumentStatus;
  readonly evidenceRef: string | null;
  readonly note: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ComplianceAlert {
  readonly documentId: string;
  readonly subjectKind: ComplianceSubjectKind;
  readonly subjectId: string | null;
  readonly documentType: ComplianceDocumentType;
  readonly validTo: BusinessDate;
  readonly health: ComplianceHealth;
  readonly daysUntilExpiry: number;
  readonly thresholdDays: number;
}

export const VEHICLE_STATE_INCONSISTENCIES = [
  'MAINTENANCE_WHILE_IN_TRANSIT',
  'RECORDED_STATUS_STALE',
] as const;
export type VehicleStateInconsistency = (typeof VEHICLE_STATE_INCONSISTENCIES)[number];

export const EFFECTIVE_VEHICLE_STATE_REASONS = [
  'MAINTENANCE_LOCK',
  'ACTIVE_IN_TRANSIT_TRIP',
  'NO_ACTIVE_WORK',
] as const;
export type EffectiveVehicleStateReason = (typeof EFFECTIVE_VEHICLE_STATE_REASONS)[number];

/**
 * TRANG THAI HIEU LUC cua mot xe — may chu la nguon, man hinh KHONG suy lai.
 *
 * `recordedStatus` di kem co chu dich: khi hai gia tri lech nhau thi do la mot MAU THUAN VAN HANH
 * doc duoc (`inconsistencies`), khong phai mot con so de chon cai nao dep hon.
 */
export interface EffectiveVehicleState {
  readonly vehicleId: string;
  readonly registrationPlate: string;
  readonly effectiveStatus: VehicleStatus;
  readonly reason: EffectiveVehicleStateReason;
  readonly recordedStatus: VehicleStatus;
  readonly openWorkOrderIds: readonly string[];
  readonly inTransitTripIds: readonly string[];
  readonly inconsistencies: readonly VehicleStateInconsistency[];
}

export const OPERATIONAL_ALERT_KINDS = [
  'COMPLIANCE_DOCUMENT_EXPIRED',
  'COMPLIANCE_DOCUMENT_EXPIRING',
  'COMPLIANCE_DOCUMENT_MISSING',
  'MAINTENANCE_OVERDUE',
  'MAINTENANCE_DUE_SOON',
  'FUEL_CONSUMPTION_ABNORMAL',
  'DRIVER_FUND_BALANCE_UNUSUAL',
  'VEHICLE_STATE_INCONSISTENT',
] as const;
export type OperationalAlertKind = (typeof OPERATIONAL_ALERT_KINDS)[number];

export const OPERATIONAL_ALERT_SEVERITIES = ['INFO', 'WARNING', 'CRITICAL'] as const;
export type OperationalAlertSeverity = (typeof OPERATIONAL_ALERT_SEVERITIES)[number];

export const OPERATIONAL_ALERT_SOURCES = ['FUEL_CONSUMPTION', 'DRIVER_FUND'] as const;
export type OperationalAlertSource = (typeof OPERATIONAL_ALERT_SOURCES)[number];

export interface OperationalAlert {
  readonly kind: OperationalAlertKind;
  readonly severity: OperationalAlertSeverity;
  readonly subjectKind: ComplianceSubjectKind;
  readonly subjectId: string | null;
  readonly detail: Readonly<Record<string, number | string | null>>;
}

/**
 * `unavailableSources` KHONG phai mot loi — no la cau tra loi that khi khach khong bat nghiep vu
 * nguon. Man hinh phai noi ra thay vi hien mot bang canh bao rong nhu the moi thu deu on.
 */
export interface OperationalAlertFeed {
  readonly generatedFor: BusinessDate;
  readonly alerts: readonly OperationalAlert[];
  readonly unavailableSources: readonly OperationalAlertSource[];
}

/* ------------------------------------------------------------------ *
 * `TX-07` — ky luong, phieu luong
 * ------------------------------------------------------------------ */

export const PAYROLL_PERIOD_STATUSES = ['OPEN', 'CLOSED'] as const;
export type PayrollPeriodStatus = (typeof PAYROLL_PERIOD_STATUSES)[number];

export const PAYSLIP_STATUSES = ['DRAFT', 'APPROVED', 'PAID', 'REVERSED'] as const;
export type PayslipStatus = (typeof PAYSLIP_STATUSES)[number];

export const PAYSLIP_KINDS = ['ORIGINAL', 'SUPPLEMENTAL', 'REVERSAL'] as const;
export type PayslipKind = (typeof PAYSLIP_KINDS)[number];

export const PAYSLIP_COMPONENT_KINDS = ['EARNING', 'DEDUCTION'] as const;
export type PayslipComponentKind = (typeof PAYSLIP_COMPONENT_KINDS)[number];

export const PAYSLIP_COMPONENT_SOURCES = [
  'BASE_SALARY',
  'PER_TRIP',
  'PER_KM',
  'FUEL_SAVING_BONUS',
  'MANUAL_BONUS',
  'MANUAL_DEDUCTION',
] as const;
export type PayslipComponentSource = (typeof PAYSLIP_COMPONENT_SOURCES)[number];

export const PAYROLL_MISSING_INPUTS = [
  'FUEL_SAVING_UNAVAILABLE',
  'DRIVER_FUND_UNAVAILABLE',
] as const;
export type PayrollMissingInput = (typeof PAYROLL_MISSING_INPUTS)[number];

export interface PayrollPeriod {
  readonly id: string;
  readonly label: string;
  readonly startDate: BusinessDate;
  readonly endDate: BusinessDate;
  readonly status: PayrollPeriodStatus;
  readonly closedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PayrollPolicySnapshot {
  readonly baseSalaryVnd: number;
  readonly perTripVnd: number;
  readonly perKmVnd: number;
  readonly fuelSavingBonusVndPerLiter: number;
}

/**
 * `missingInputs` phai HIEN RA. Mot lan chay thieu du lieu tiet kiem dau van cho ra phieu luong —
 * chi la thieu mot khoan thuong. Giau di se lam ke toan duyet mot bang luong khong day du ma khong
 * biet minh dang duyet cai gi.
 */
export interface PayrollRun {
  readonly id: string;
  readonly periodId: string;
  readonly sequence: number;
  readonly policySnapshot: PayrollPolicySnapshot;
  readonly policyVersion: string;
  readonly missingInputs: readonly PayrollMissingInput[];
  readonly runAt: string;
}

export interface PayslipComponent {
  readonly id: string;
  readonly payslipId: string;
  readonly kind: PayslipComponentKind;
  readonly source: PayslipComponentSource;
  readonly label: string;
  readonly amount: number;
  readonly quantity: number | null;
  readonly unitAmount: number | null;
  readonly note: string | null;
  readonly createdAt: string;
}

export interface Payslip {
  readonly id: string;
  readonly runId: string;
  readonly driverId: string;
  readonly kind: PayslipKind;
  readonly status: PayslipStatus;
  readonly grossEarnings: number;
  readonly totalDeductions: number;
  readonly netAmount: number;
  readonly currencyCode: string;
  readonly driverFundBalanceSnapshot: number | null;
  readonly tripCount: number;
  readonly distanceKm: number;
  readonly correctsId: string | null;
  readonly correctionReason: string | null;
  readonly approvedAt: string | null;
  readonly paidAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PayslipDetail {
  readonly payslip: Payslip;
  readonly components: readonly PayslipComponent[];
}

/* ------------------------------------------------------------------ *
 * Be mat LAI XE — phieu luong cua chinh minh (`#168 B8`)
 * ------------------------------------------------------------------ */

export interface DriverPayslipPeriodView {
  readonly id: string;
  readonly label: string;
  readonly startDate: BusinessDate;
  readonly endDate: BusinessDate;
}

export interface DriverPayslipComponentView {
  readonly kind: PayslipComponentKind;
  readonly source: PayslipComponentSource;
  readonly label: string;
  readonly amount: number;
  readonly quantity: number | null;
  readonly unitAmount: number | null;
  readonly note: string | null;
}

/**
 * KHUNG NHIN RIENG, khong phai `Payslip` cat bot.
 *
 * `status` KHONG BAO GIO la `DRAFT`: may chu tra `null` cho phieu nhap ngay o ham dung khung nhin,
 * nen mot phieu tam tinh khong the ra toi day. Va bon danh tinh nguoi van hanh (`runBy`,
 * `approvedBy`, `paidBy`, `recordedBy`) co y VANG MAT — xem `#168 B8 §3`.
 */
export interface DriverPayslipView {
  readonly id: string;
  readonly period: DriverPayslipPeriodView;
  readonly kind: PayslipKind;
  readonly status: Exclude<PayslipStatus, 'DRAFT'>;
  readonly grossEarnings: number;
  readonly totalDeductions: number;
  readonly netAmount: number;
  readonly currencyCode: string;
  readonly tripCount: number;
  readonly distanceKm: number;
  readonly correctsId: string | null;
  readonly correctionReason: string | null;
  readonly components: readonly DriverPayslipComponentView[];
  readonly approvedAt: string | null;
  readonly paidAt: string | null;
  readonly createdAt: string;
}

/** `#168 B4` — `unrestricted` la mot truong TUONG MINH: `[]` = nhap tu do, khong phai "cam het". */
export interface ExpenseCatalogue {
  readonly categories: readonly string[];
  readonly unrestricted: boolean;
}

/* ------------------------------------------------------------------ *
 * TX-07b Quyet toan lai xe (Lane D, Issue #237)
 * ------------------------------------------------------------------ */

export const CASHOUT_ALLOCATION_SOURCES = ['WAGE', 'REIMBURSEMENT'] as const;
export type CashoutAllocationSource = (typeof CASHOUT_ALLOCATION_SOURCES)[number];

export const CASHOUT_KINDS = ['ORIGINAL', 'REVERSAL'] as const;
export type CashoutKind = (typeof CASHOUT_KINDS)[number];

export const CASHOUT_STATUSES = ['POSTED', 'REVERSED'] as const;
export type CashoutStatus = (typeof CASHOUT_STATUSES)[number];

export interface DriverCashout {
  readonly id: string;
  readonly driverId: string;
  readonly kind: CashoutKind;
  readonly status: CashoutStatus;
  readonly businessDate: BusinessDate;
  readonly currencyCode: string;
  readonly method: string;
  readonly reference: string | null;
  readonly reversesId: string | null;
  readonly reversalReason: string | null;
  readonly note: string | null;
  readonly recordedBy: string;
  readonly createdAt: string;
}

export interface DriverCashoutAllocation {
  readonly id: string;
  readonly cashoutId: string;
  readonly source: CashoutAllocationSource;
  /** CO DAU. Am tren mot phieu dao — man hinh KHONG duoc lay tri tuyet doi. */
  readonly amount: number;
  readonly payslipId: string | null;
  readonly driverFundEntryId: string | null;
  readonly note: string | null;
  readonly createdAt: string;
}

export interface DriverCashoutDetail {
  readonly cashout: DriverCashout;
  readonly allocations: readonly DriverCashoutAllocation[];
}

/** MOT THANG luong — nguon goc ky, so da ghi nhan, so da rut, so con lai. */
export interface WageMonth {
  readonly periodId: string;
  readonly periodLabel: string;
  readonly startDate: BusinessDate;
  readonly endDate: BusinessDate;
  readonly credited: number;
  readonly cashedOut: number;
  readonly remaining: number;
  readonly payslips: readonly WageMonthPayslip[];
}

/** MOT PHIEU trong mot ky, kem phan da rut va phan con lai cua chinh no. */
export interface WageMonthPayslip {
  readonly payslipId: string;
  readonly netAmount: number;
  readonly cashedOut: number;
  readonly remaining: number;
}

export interface UnsettledWageMonth {
  readonly periodId: string;
  readonly periodLabel: string;
  readonly endDate: BusinessDate;
  readonly remaining: number;
  readonly ageDays: number;
}

/**
 * SO DU QUYET TOAN — BON con so, va man hinh KHONG duoc gop chung.
 *
 * `reimbursementCashedOut` la LICH SU. No KHONG duoc tru vao `reimbursementOutstanding`: so du quy
 * da phan anh moi lan chi hoan ung roi, nen tru lan nua la dem hai lan.
 */
export interface DriverSettlementBalance {
  readonly driverId: string;
  readonly currencyCode: string;
  readonly wageCredited: number;
  readonly wageCashedOut: number;
  readonly wageRemaining: number;
  readonly fundBalance: number;
  readonly fundStance: FundBalanceStance;
  readonly reimbursementOutstanding: number;
  readonly reimbursementCashedOut: number;
}

export interface DriverSettlementStatement {
  readonly balance: DriverSettlementBalance;
  readonly months: readonly WageMonth[];
  readonly cashouts: readonly DriverCashoutDetail[];
  readonly unsettled: readonly UnsettledWageMonth[];
  readonly settlementWindowDays: number;
}

/**
 * BE MAT LAI XE — KHONG co `fundBalance` tho.
 *
 * Mot lai xe doc "so du quy: -1.500.000" se hieu la minh dang no, dung cai ma `DA-T3-01` canh bao.
 * Con so ho nhan la `reimbursementOutstanding`, luon duong, kem mot cau noi ro do la tien cong ty
 * tra lai ho.
 */
export interface DriverSettlementSelfStatement {
  readonly driverId: string;
  readonly driverName: string;
  readonly currencyCode: string;
  readonly wageCredited: number;
  readonly wageCashedOut: number;
  readonly wageRemaining: number;
  readonly reimbursementOutstanding: number;
  readonly reimbursementCashedOut: number;
  readonly months: readonly WageMonth[];
  readonly cashouts: readonly DriverCashoutDetail[];
}

export interface RecordCashoutLineInput {
  readonly source: CashoutAllocationSource;
  readonly amount: number;
  readonly payslipId?: string | null;
  readonly note?: string | null;
}

export interface RecordCashoutInput {
  readonly driverId: string;
  readonly businessDate?: BusinessDate;
  readonly method: string;
  readonly reference?: string | null;
  readonly note?: string | null;
  readonly correlationKey?: string;
  readonly lines: readonly RecordCashoutLineInput[];
}

/* ------------------------------------------------------------------ *
 * MO HINH VAN CHUYEN v2 — HAI TRUC DOC LAP (#232 `D-01`, #234 A1)
 *
 * Ban guong cua `apps/api/src/transport/movement/movement.types.ts`. Hai truc doc lap: mot don
 * ton tai truoc khi biet xe nao chay no.
 * ------------------------------------------------------------------ */

export type TransportOrderStatus = 'OPEN' | 'FULFILLED' | 'CANCELLED';
export type VehicleRunStatus = 'PLANNED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
export type RunLegKind = 'LOADED' | 'EMPTY';
export type RunLegStatus = 'PLANNED' | 'IN_TRANSIT' | 'COMPLETED' | 'CANCELLED';

export interface TransportOrder {
  readonly id: string;
  readonly code: string;
  readonly status: TransportOrderStatus;
  readonly businessDate: BusinessDate;
  readonly customerId: string | null;
  readonly originLabel: string;
  readonly destinationLabel: string;
  readonly cargoDescription: string | null;
  readonly freightAmount: number | null;
  readonly currencyCode: string;
  readonly note: string | null;
  readonly cancelledAt: string | null;
  readonly cancellationReason: string | null;
}

export interface VehicleRun {
  readonly id: string;
  readonly code: string;
  readonly vehicleId: string;
  readonly status: VehicleRunStatus;
  readonly businessDate: BusinessDate;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly note: string | null;
  readonly cancelledAt: string | null;
  readonly cancellationReason: string | null;
}

export interface RunLeg {
  readonly id: string;
  readonly runId: string;
  readonly sequence: number;
  readonly kind: RunLegKind;
  readonly status: RunLegStatus;
  readonly orderId: string | null;
  readonly originLabel: string;
  readonly destinationLabel: string;
  readonly businessDate: BusinessDate;
  /** `null` = CHUA BIET, khong phai 0. Man hinh phai noi ra dieu do. */
  readonly distanceKm: number | null;
  /**
   * #276 L6 — km DU KIEN. Tach khoi `distanceKm` de mot uoc luong khong bao gio trong y het mot
   * quang duong da di. `null` = chua biet, khong phai 0.
   */
  readonly plannedDistanceKm: number | null;
  readonly note: string | null;
}

export interface RunAssignment {
  readonly id: string;
  readonly runId: string;
  readonly driverId: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly assignedBy: string;
}

export interface VehicleRunDetail {
  readonly run: VehicleRun;
  readonly legs: readonly RunLeg[];
  readonly activeAssignment: RunAssignment | null;
}

/**
 * KM CO HANG vs KM RONG.
 *
 * `complete = false` nghia la con chang thieu km — va khi do `emptyRatio` la `null`. Man hinh
 * KHONG duoc tu dien 0 vao cho trong: mot ty le tinh tren du lieu khuyet trong y het mot ty le
 * that.
 */
export interface RunDistanceSummary {
  readonly loadedKm: number;
  readonly emptyKm: number;
  readonly totalKm: number;
  readonly emptyRatio: number | null;
  readonly complete: boolean;
  readonly legsMissingDistance: { readonly loaded: number; readonly empty: number };
  readonly countedLegs: number;
}

/* ------------------------------------------------------------------ *
 * LAP KE HOACH VONG CHAY DO HE THONG QUAN (#276 Lane L)
 * ------------------------------------------------------------------ */

/**
 * DA DI vs DU DINH — `#276` L6.
 *
 * Hai o, va man hinh KHONG duoc cong chung lai: mot chang chua chay xong la mot KE HOACH, va gop
 * no vao km da di se lam bao cao noi rang xe da di mot quang duong no chua di.
 */
export interface RunMovementSummary {
  readonly actual: RunDistanceSummary;
  readonly planned: RunDistanceSummary;
  readonly cancelledLegs: number;
}

export type RunGrouping = 'ONE_ORDER_PER_RUN' | 'MULTI_ORDER_RUN';
export type RunPlanOutcome = 'NEW_RUN' | 'APPENDED';

/** Lan lap ke hoach da gan mot don vao mot vong chay. */
export interface OrderRunPlan {
  readonly id: string;
  readonly orderId: string;
  readonly runId: string;
  readonly vehicleId: string;
  readonly loadedLegId: string;
  readonly emptyLegId: string | null;
  readonly grouping: RunGrouping;
  readonly outcome: RunPlanOutcome;
  readonly businessDate: BusinessDate;
  readonly createdAt: string;
  readonly cancelledAt: string | null;
  readonly cancellationReason: string | null;
}

export type PlanStartSource = 'DEPOT' | 'PREVIOUS_LEG_DESTINATION' | 'ORDER_ORIGIN';

export interface PlannedLeg {
  readonly sequence: number;
  readonly kind: RunLegKind;
  readonly orderId: string | null;
  readonly originLabel: string;
  readonly destinationLabel: string;
  readonly plannedDistanceKm: number | null;
}

/** Ket qua XEM TRUOC — khong mot hang nao duoc ghi khi doc no. */
export interface RunPlanProposal {
  readonly orderId: string;
  readonly vehicleId: string;
  readonly grouping: RunGrouping;
  readonly outcome: RunPlanOutcome;
  readonly runId: string | null;
  readonly runCode: string | null;
  readonly startsFrom: string;
  readonly startSource: PlanStartSource;
  readonly legs: readonly PlannedLeg[];
  readonly emptyLegRequired: boolean;
}

export type RunClosureBlocker =
  | 'RUN_NOT_ACTIVE'
  | 'LEG_STILL_OPEN'
  | 'PLAN_STILL_OPEN'
  | 'NO_COMPLETED_WORK'
  | 'CARGO_STILL_CARRIED'
  | 'OPEN_WAITING_SESSION';

export interface RunClosureVerdict {
  readonly closable: boolean;
  readonly trigger: 'DEPOT_RETURN' | 'IDLE_TIMEOUT' | null;
  readonly blockers: readonly RunClosureBlocker[];
  /** Het viec nhung chua den dieu kien dong. KHONG phai loi. */
  readonly holding: boolean;
}

/* ------------------------------------------------------------------ *
 * DE NGHI CHI + CONG DUYET (#232 `D-06`, #234 A2)
 * ------------------------------------------------------------------ */

export type ExpenseClaimStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';

export interface ExpenseClaim {
  readonly id: string;
  readonly driverId: string;
  readonly status: ExpenseClaimStatus;
  readonly categoryCode: string;
  /** SO LAI XE DE NGHI — khong bao gio bi ghi de boi so duyet. */
  readonly claimedAmount: number;
  /** SO DUOC DUYET — `null` cho toi khi co mot quyet dinh `APPROVED`. */
  readonly approvedAmount: number | null;
  readonly currencyCode: string;
  readonly businessDate: BusinessDate;
  readonly note: string | null;
  readonly evidenceLocator: string | null;
  readonly tripId: string | null;
  readonly runId: string | null;
  readonly legId: string | null;
  readonly submittedBy: string;
  readonly submittedAt: string;
  readonly decidedAt: string | null;
  /** `null` khi da duyet ma CHUA vao gia thanh (de nghi chua gan chuyen). */
  readonly settlementExpenseId: string | null;
}

export interface ExpenseClaimDecision {
  readonly id: string;
  readonly claimId: string;
  readonly sequence: number;
  readonly outcome: 'APPROVED' | 'REJECTED';
  readonly approvedAmount: number | null;
  readonly reasonCode: string;
  readonly note: string | null;
  readonly decidedBy: string;
  readonly decidedAt: string;
}

export interface ExpenseClaimDetail {
  readonly claim: ExpenseClaim;
  readonly decisions: readonly ExpenseClaimDecision[];
}

/* ------------------------------------------------------------------ *
 * THAP DIEU HANH — `GET /transport/control-tower` (Lane G, #244)
 * ------------------------------------------------------------------ */

/**
 * Ban SAO cua `apps/api/src/transport/control-tower/control-tower.types.ts`.
 *
 * BA truong o cuoi `ControlTowerView` la phan de bo sot nhat khi doc, va bo sot chung se lam man
 * hinh noi doi theo huong de chiu nhat:
 *
 *   · `unavailableSources` — khach TAT capability so huu muc do;
 *   · `pendingWork`        — nen tang CHUA CO nguon cho viec do;
 *   · `unavailableReason`  — cot ton tai tren bang nhung chua co du lieu de dien.
 *
 * Bo qua ca ba, man hinh se ve mot bang rong trong y het mot ngay khong co viec gi phai lam.
 */
export type OperationsBoardColumn =
  'PLANNED' | 'PICKUP' | 'LOADING' | 'IN_TRANSIT' | 'ARRIVED' | 'WAITING' | 'DELIVERED';

export type BoardColumnUnavailableReason = 'AWAITING_CHECKPOINT_SOURCE';

export interface OperationsBoardCard {
  readonly runId: string;
  /** MA vong chay — dinh danh nghiep vu, thu duy nhat duoc phep dat len dia chi. */
  readonly runCode: string;
  readonly vehicleId: string;
  readonly businessDate: BusinessDate;
  readonly driverId: string | null;
  readonly loadedLegs: number;
  readonly emptyLegs: number;
  /** `null` = con mot chang thieu km. KHONG duoc hien thi thanh `0`. */
  readonly totalKm: number | null;
}

export interface OperationsBoardColumnView {
  readonly column: OperationsBoardColumn;
  readonly cards: readonly OperationsBoardCard[];
  readonly total: number;
  readonly unavailableReason: BoardColumnUnavailableReason | null;
}

export type ActionQueueSubjectKind =
  | 'RUN'
  | 'RUN_LEG'
  | 'TRIP'
  | 'VEHICLE'
  | 'DRIVER'
  | 'EXPENSE_CLAIM'
  | 'FUEL_ENTRY'
  | 'FUEL_RECONCILIATION'
  | 'TRACKING_SESSION'
  | 'COMPANY';

export interface ActionQueueSubject {
  readonly kind: ActionQueueSubjectKind;
  readonly id: string;
  /** `null` khi ban ghi khong co ma nguoi doc duoc — luc do KHONG duoc dat `id` len dia chi. */
  readonly reference: string | null;
}

export type ActionQueueKind =
  | 'RUN_ACTIVE_WITHOUT_DRIVER'
  | 'RUN_LEG_MISSING_DISTANCE'
  | 'EXPENSE_CLAIM_AWAITING_REVIEW'
  | 'DRIVER_FUND_BALANCE_UNUSUAL'
  | 'FUEL_ENTRY_AWAITING_VERIFICATION'
  | 'FUEL_RECONCILIATION_OPEN'
  | 'FUEL_CONSUMPTION_ABNORMAL'
  | 'COMPLIANCE_DOCUMENT_EXPIRED'
  | 'COMPLIANCE_DOCUMENT_EXPIRING'
  | 'COMPLIANCE_DOCUMENT_MISSING'
  | 'MAINTENANCE_OVERDUE'
  | 'MAINTENANCE_DUE_SOON'
  | 'VEHICLE_STATE_INCONSISTENT';

export type PendingActionQueueKind =
  | 'RECEIVER_WAITING_ABOVE_THRESHOLD'
  | 'DELIVERY_PROOF_DOCUMENT_MISSING'
  | 'DRIVER_WAITING_ALLOWANCE_AWAITING_APPROVAL'
  | 'CUSTOMER_AR_OVERDUE'
  | 'LOCATION_PROOF_REVIEW';

export type PendingActionQueueReason =
  | 'AWAITING_CHECKPOINT_SOURCE'
  | 'AWAITING_RECEIVABLE_DUE_DATE_SOURCE'
  | 'AWAITING_FLEET_WIDE_PROOF_QUERY';

export interface PendingActionQueueEntry {
  readonly kind: PendingActionQueueKind;
  readonly reason: PendingActionQueueReason;
}

export type ActionQueueSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface ActionQueueItem {
  readonly kind: ActionQueueKind;
  readonly severity: ActionQueueSeverity;
  readonly subject: ActionQueueSubject;
  readonly detail: Readonly<Record<string, number | string | null>>;
}

export type ControlTowerSource = 'EXPENSE_CLAIMS' | 'FUEL' | 'OPERATIONAL_ALERTS';

export interface FleetPresenceView {
  readonly total: number;
  readonly idle: number;
  readonly onTrip: number;
  readonly underMaintenance: number;
  readonly activeDrivers: number;
}

export interface ControlTowerView {
  readonly generatedFor: BusinessDate;
  readonly board: readonly OperationsBoardColumnView[];
  readonly fleet: FleetPresenceView;
  readonly queue: readonly ActionQueueItem[];
  readonly queueTotal: number;
  readonly unavailableSources: readonly ControlTowerSource[];
  readonly pendingWork: readonly PendingActionQueueEntry[];
}

/* ------------------------------------------------------------------ *
 * BANG TAI CHINH — `GET /transport/finance/summary` (Lane G, #244 G5)
 * ------------------------------------------------------------------ */

/**
 * Ban SAO cua `apps/api/src/transport/finance/finance-summary.ts`.
 *
 * BA thu de doc sai o day, ghi ra mot lan:
 *
 *   · `flows` co BON khoa va KHONG BAO GIO duoc cong lai (`GD-15`, `INV-23`). `CUSTOMER_FREIGHT`
 *     la mot khoan PHAI THU; ba khoa con lai la PHAI TRA. Cong chung cho ra mot con so khong ai
 *     nợ ai cả.
 *   · `driverReimbursementOutstanding` (cong ty no lai xe, `TX-03`) va `driverSettlementRemaining`
 *     (luong da ghi nhan chua rut, `TX-07b`) la HAI khoan khac nhau. Gop chung se lam mot lan chi
 *     hoan ung trong nhu mot lan tra luong.
 *   · `marginBasisPoints` la DIEM CO BAN: `4000` = 40%. Hien thi thang se ra "4000%".
 */
export type SettlementFlowAmounts = Readonly<Record<SettlementFlow, number>>;

export interface SettlementBuckets {
  readonly flows: SettlementFlowAmounts;
  readonly driverReimbursementOutstanding: number;
  readonly driverSettlementRemaining: number;
}

/**
 * BIEN TRUC TIEP — hai truong cuoi la mot HOP DONG, khong phai sieu du lieu.
 *
 * `GD-13` doi cau "chua gom chi phi co dinh" di kem con so, va #244 G5 cam goi day la lai rong.
 * Man hinh phai hien `disclosure` canh `marginAmount`, khong duoc bo di cho gon.
 */
export interface DirectMarginRollup {
  readonly revenueAmount: number;
  readonly deductionAmount: number;
  readonly marginAmount: number;
  /** DIEM CO BAN. `null` khi doanh thu bang 0 — khong chia duoc. */
  readonly marginBasisPoints: number | null;
  readonly tripCount: number;
  /** Chuyen chua co gia cuoc, bi BO QUA chu khong coi la 0. */
  readonly skippedTripCount: number;
  readonly fixedCostsIncluded: false;
  readonly disclosure: string;
}

export interface FinanceCurrencyCoverage {
  readonly codes: readonly string[];
  /** `false` = du lieu co nhieu hon mot ma tien, cac tong KHONG doc thang duoc. */
  readonly isSingle: boolean;
}

export interface FinanceReceivableSummary {
  readonly outstandingTotal: number;
  readonly overdueTotal: number;
}

export type FinanceSource = 'DRIVER_SETTLEMENT';

export interface FinanceSummaryView {
  readonly generatedFor: BusinessDate;
  readonly buckets: SettlementBuckets;
  readonly directMargin: DirectMarginRollup;
  readonly receivable: FinanceReceivableSummary;
  readonly currency: FinanceCurrencyCoverage;
  readonly unavailableSources: readonly FinanceSource[];
}

/* ------------------------------------------------------------------ *
 * NHAN VIEC TAI DIA DIEM A (`#267` Lane H)
 * ------------------------------------------------------------------ */

/**
 * MUC DO TIN cua vi tri da de nghi ra mot lan nhan viec.
 *
 * `SERVER_BOUND` la ban dinh vi da qua duong chung cu cua Lane B; `DRIVER_REPORTED` la cap so may
 * khach doc len, hoac khong co gi ca. Man hinh NOI RA nhan nay thay vi giau: mot lan nhan viec
 * khong co ban dinh vi la mot su that ma nguoi doi soat sau nay can doc duoc.
 */
export type SiteIntakeLocationTrust = 'SERVER_BOUND' | 'DRIVER_REPORTED';

export type SiteCandidateConfidence = 'INSIDE' | 'NEAR';

export type SiteIntakeLocationUnusableReason =
  'COORDINATE_INVALID' | 'ACCURACY_UNUSABLE' | 'LOCATION_STALE';

export interface SiteCandidateView {
  readonly siteId: string;
  readonly siteName: string;
  readonly address: string | null;
  readonly counterpartyId: string;
  readonly counterpartyName: string;
  readonly distanceMetres: number;
  readonly confidence: SiteCandidateConfidence;
}

export interface SiteIntakeOpenRunView {
  readonly runId: string;
  readonly code: string;
  readonly status: VehicleRunStatus;
}

/** DE NGHI cua may chu. `canCreate` la thu man hinh doc de biet hien nut nao. */
export interface SiteIntakeProposal {
  readonly outcome: 'UNIQUE' | 'AMBIGUOUS' | 'NO_MATCH' | 'LOCATION_UNUSABLE';
  readonly locationUnusable: SiteIntakeLocationUnusableReason | null;
  readonly candidates: readonly SiteCandidateView[];
  readonly truncated: boolean;
  readonly locationTrust: SiteIntakeLocationTrust;
  readonly openRuns: readonly SiteIntakeOpenRunView[];
  readonly canCreate: boolean;
}

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

/**
 * VI TRI gui kem — BA hinh dang, va may chu tu choi hinh dang thu tu.
 *
 * Hoac `observationId` mot minh, hoac `latitude` + `longitude`, hoac khong gi ca. Gui ca hai nguon
 * bi tu choi thay vi lang le uu tien mot ben.
 */
export interface SiteIntakeLocationInput {
  readonly latitude?: number;
  readonly longitude?: number;
  readonly accuracyMetres?: number | null;
  readonly observationId?: string;
}

export interface ConfirmSiteIntakeInput extends SiteIntakeLocationInput {
  readonly siteId: string;
  readonly clientEventId: string;
  readonly destinationLabel?: string;
}

/* ------------------------------------------------------------------ *
 * KET THUC DON — `#275` Lane K
 * ------------------------------------------------------------------ */

/**
 * TRANG THAI ket thuc thuong mai cua mot don.
 *
 * `PENDING` la SU VANG MAT cua mot quyet dinh, khong phai mot gia tri duoc ghi — nen mot don chua
 * ai dung toi doc len la `PENDING` chu khong phai `null`. Man hinh khong phai xu ly hai cach bieu
 * dien cho cung mot y.
 */
export type OrderCompletionState = 'PENDING' | 'APPROVED' | 'REJECTED' | 'NEEDS_CORRECTION';

export type OrderCompletionOutcome = Exclude<OrderCompletionState, 'PENDING'>;

export type OrderCompletionBasis = 'DOCUMENT' | 'EXTERNAL_PHYSICAL_CONFIRMATION';

/**
 * MOT DONG cua hang cho `Cho ket thuc` — `#275` K4.
 *
 * `runCode`/`vehicleId` la NGU CANH dieu hanh va CO THE `null`: `#275` K4 noi *"Run may be visible
 * only as advanced/debug context, not required input"*. Mot don thue nha xe ngoai khong co vong
 * chay nao, va no van ket thuc duoc.
 */
export interface OrderCompletionRow {
  readonly acceptanceId: string | null;
  readonly orderId: string;
  readonly orderCode: string;
  readonly orderStatus: TransportOrderStatus;
  readonly customerId: string | null;
  readonly originLabel: string;
  readonly destinationLabel: string;
  readonly state: OrderCompletionState;
  readonly counterpartyId: string | null;
  readonly businessDate: BusinessDate;
  readonly evidenceCount: number;
  readonly settlementEligible: boolean;
  readonly runCode: string | null;
  readonly vehicleId: string | null;
  readonly latestDecidedAt: string | null;
  readonly latestDecidedBy: string | null;
}

export interface OrderCompletionDecision {
  readonly id: string;
  readonly acceptanceId: string;
  readonly sequence: number;
  readonly outcome: OrderCompletionOutcome;
  readonly reasonCode: string;
  readonly basis: OrderCompletionBasis;
  readonly evidenceRefs: readonly string[];
  readonly externalNote: string | null;
  readonly supersedesId: string | null;
  readonly idempotencyKey: string;
  readonly decidedBy: string;
  readonly decidedAt: string;
}

export interface OrderCompletionRecord {
  readonly id: string;
  readonly orderId: string;
  readonly state: OrderCompletionState;
  readonly counterpartyId: string | null;
  readonly businessDate: BusinessDate;
  readonly latestDecisionId: string | null;
  readonly openedBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Ho so kem CA lich su — `#275` K4 doi hien `actor/time/history after decision`. */
export interface OrderCompletionDetail {
  readonly acceptance: OrderCompletionRecord;
  readonly decisions: readonly OrderCompletionDecision[];
}
