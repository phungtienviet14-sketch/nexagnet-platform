import type { BusinessDate } from '../business-date.js';
import type {
  FuelReconciliationState,
  FuelReconciliationStatus,
  FuelReviewReason,
  FuelVerificationStatus,
} from './fuel-lifecycle.js';
import type { FuelDiscrepancyKind } from './fuel-matching.js';

/**
 * `TX-04 Fuel` — hinh dang du lieu doc len tu kho.
 *
 * Tach khoi `costing.types.ts` cung ly le voi viec do da tach khoi `transport.types.ts`: mot khach
 * van tai co the bat `transport-costing` ma khong bat `transport-fuel`. Tron chung se lam kieu cua
 * bang ke cay xang co mat trong ban build cua mot khach khong he do dau qua he thong nay.
 *
 * ---------------------------------------------------------------------------
 * QUY UOC DON VI cua ca tep — doc mot lan, dung o moi truong:
 *
 *   `amount`, `amountDeltaVnd`   so nguyen DONG (`money.ts`)
 *   `litersUnits`                so nguyen MILILIT (`fuel-quantity.ts`, ty le 3)
 *   `consumptionUnits`           so nguyen MILI-L/100km (ty le 3) — `40000` = 40,000 L/100km
 *   `businessDate`               chuoi `YYYY-MM-DD` theo mui gio tenant (`INV-25`)
 *
 * KHONG truong nao o day mang so thuc. Neu mot truong moi can thap phan, no phai di theo dung
 * duong nay — mot so nguyen co ty le, va ten don vi nam trong chinh ten truong.
 */

export const FUEL_PAYMENT_METHODS = ['DRIVER_CASH', 'SUPPLIER_ACCOUNT'] as const;
export type FuelPaymentMethod = (typeof FUEL_PAYMENT_METHODS)[number];

/** CAY XANG. Xem chu thich dau muc Fuel trong `schema.prisma` ve vi sao khong la mot vai doi tac. */
export interface FuelSupplier {
  readonly id: string;
  readonly name: string;
  readonly code: string | null;
  readonly phone: string | null;
  readonly address: string | null;
  readonly taxCode: string | null;
  readonly status: 'ACTIVE' | 'INACTIVE';
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** PHIEU DO DAU — aggregate root cua `TX-04`, hai truc trang thai doc lap (T1 §7.4). */
export interface FuelEntry {
  readonly id: string;
  readonly tripId: string;
  readonly vehicleId: string;
  readonly driverId: string;
  readonly supplierId: string;
  readonly businessDate: BusinessDate;
  /** Khoanh khac tren phieu. Ngay nghiep vu KHONG suy tu truong nay (`INV-25`). */
  readonly occurredAt: string;
  readonly litersUnits: number;
  readonly amount: number;
  readonly currencyCode: string;
  readonly odometerKm: number;
  readonly previousOdometerKm: number | null;
  /** `null` = KHONG tinh duoc (`INV-06`). Khong bao gio `0` thay cho "khong biet". */
  readonly consumptionUnits: number | null;
  readonly reviewReasons: readonly FuelReviewReason[];
  readonly paymentMethod: FuelPaymentMethod;
  readonly verificationStatus: FuelVerificationStatus;
  readonly reconciliationStatus: FuelReconciliationStatus;
  /** `INV-26` — bang ke da de ra phieu nay. */
  readonly sourceStatementId: string | null;
  /** Chan gia thanh o `TX-03`. Co gia tri = chi phi da vao gia thanh chuyen dung mot lan. */
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

export const FUEL_STATEMENT_FORMATS = ['CSV', 'XLSX'] as const;
export type FuelStatementFormat = (typeof FUEL_STATEMENT_FORMATS)[number];

export interface FuelSupplierStatement {
  readonly id: string;
  readonly supplierId: string;
  readonly periodStart: BusinessDate;
  readonly periodEnd: BusinessDate;
  readonly format: FuelStatementFormat;
  readonly sourceRef: string;
  readonly sourceDigest: string;
  readonly rowCount: number;
  readonly acceptedCount: number;
  readonly rejectedCount: number;
  readonly importedAt: string;
  readonly importedBy: string;
}

export const FUEL_STATEMENT_LINE_STATUSES = ['ACCEPTED', 'REJECTED'] as const;
export type FuelStatementLineStatus = (typeof FUEL_STATEMENT_LINE_STATUSES)[number];

export const FUEL_STATEMENT_REJECT_REASONS = [
  'MISSING_REQUIRED_FIELD',
  'MALFORMED_DATE',
  'MALFORMED_AMOUNT',
  'MALFORMED_LITERS',
  'UNKNOWN_VEHICLE',
  'DUPLICATE_ROW',
] as const;
export type FuelStatementRejectReason = (typeof FUEL_STATEMENT_REJECT_REASONS)[number];

/**
 * MOT DONG bang ke. Dong bi TU CHOI van duoc luu, va bon truong so lieu cua no van `null`.
 *
 * Do la ca noi dung cua "khong doan ngam": mot dong co ngay hong khong duoc mang mot ngay bia dat
 * vao cho do, vi con so bia se di tiep vao vong so khop nhu mot du kien that.
 */
export interface FuelStatementLine {
  readonly id: string;
  readonly statementId: string;
  readonly rowNumber: number;
  readonly status: FuelStatementLineStatus;
  readonly rejectReason: FuelStatementRejectReason | null;
  readonly vehiclePlateRaw: string;
  readonly vehicleId: string | null;
  readonly businessDate: BusinessDate | null;
  readonly litersUnits: number | null;
  readonly amount: number | null;
  readonly currencyCode: string;
  readonly invoiceNo: string | null;
  readonly note: string | null;
  /** Dong nguyen ban, de doi chieu khi ai do nghi anh xa cot dang doc sai file. */
  readonly rawValues: Readonly<Record<string, string>>;
  readonly reconciliationStatus: FuelReconciliationStatus;
  readonly createdAt: string;
}

export interface FuelReconciliation {
  readonly id: string;
  readonly supplierId: string;
  readonly statementId: string;
  readonly periodStart: BusinessDate;
  readonly periodEnd: BusinessDate;
  readonly state: FuelReconciliationState;
  readonly lastMatchedAt: string | null;
  readonly closedAt: string | null;
  readonly closedBy: string | null;
  readonly reopenedAt: string | null;
  readonly reopenedBy: string | null;
  readonly reopenReason: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const FUEL_MATCH_ORIGINS = ['AUTO', 'MANUAL'] as const;
export type FuelMatchOrigin = (typeof FUEL_MATCH_ORIGINS)[number];

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

export const FUEL_DISCREPANCY_STATUSES = ['PENDING', 'RESOLVED'] as const;
export type FuelDiscrepancyStatus = (typeof FUEL_DISCREPANCY_STATUSES)[number];

/**
 * QUYET DINH duoc phep ve mot chenh lech — danh sach DONG.
 *
 * `INV-07`/`INV-27`: khong gia tri nao o day sinh ra mot khoan no cua lai xe hay mot khoan tru
 * luong. Duy nhat `ACCEPT_SUPPLIER_AMOUNT` cho phep so tien di tiep sang ban giao cong no cua T5 —
 * va do la mot NGUOI bam, khong phai ket qua cua mot phep so.
 */
export const FUEL_DISCREPANCY_RESOLUTIONS = [
  'ACCEPT_SUPPLIER_AMOUNT',
  'REJECT_SUPPLIER_LINE',
  'MATCH_CONFIRMED',
  'IGNORE_WITH_REASON',
  'ENTRY_CORRECTION_REQUIRED',
] as const;
export type FuelDiscrepancyResolution = (typeof FUEL_DISCREPANCY_RESOLUTIONS)[number];

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

/**
 * BAN GIAO SANG T5 — payload CO KIEU, mot CHUOI BAN chi-them theo ky doi soat.
 *
 * T4 khong ghi bang cua T5. Day la mot HOP THU DI: `acceptedAmount` la tong cua nhung dong bang ke
 * DA CO NGUOI CHAP NHAN, va T5 se doc no de tao mot `PayableDocument` nguon `FUEL` (T1 §9.1).
 *
 * ===========================================================================
 * VI SAO LA MOT CHUOI chu khong MOT HANG (Issue #103 §2).
 *
 * Ban dau `reconciliationId` la UNIQUE, va lan dong thu hai tra lai dung hang cu. Dieu do chi
 * idempotent khi KET QUA KINH TE khong doi — va no thoi dung ngay khi mot nguoi mo lai ky de SUA:
 *
 * ```text
 * dong lan 1  -> ban giao 10.000.000d
 * mo lai, sua mot quyet dinh
 * dong lan 2  -> ket qua that la 12.000.000d, nhung hang cu van ghi 10.000.000d
 * ```
 *
 * T5 doc mot con so DA CHET, va khong co gi bao cho no biet. Ghi de hang cu cung khong phai duong
 * ra: ban giao la thu DA PHAT RA NGOAI, va sua lang le mot con so da phat di la dung dieu `GD-11`
 * cam. Nen: CHI THEM. Dong lai ma ket qua GIONG HET -> phat lai ban cu (`revision` khong tang);
 * ket qua KHAC -> mot `revision` moi, tro nguoc ve ban truoc bang `supersedesHandoffId`.
 */
export interface FuelSettlementHandoff {
  readonly id: string;
  readonly reconciliationId: string;
  /** Dem tu 1, tang DUY NHAT khi mot lan dong lai cho ra ket qua kinh te KHAC ban gan nhat. */
  readonly revision: number;
  /** Ban ma `revision` nay thay the. `null` o ban dau tien. */
  readonly supersedesHandoffId: string | null;
  readonly supplierId: string;
  readonly periodStart: BusinessDate;
  readonly periodEnd: BusinessDate;
  readonly acceptedAmount: number;
  readonly currencyCode: string;
  readonly acceptedLineCount: number;
  readonly emittedAt: string;
  readonly emittedBy: string;
}

/* ------------------------------------------------------------------ *
 * KHUNG NHIN — khong phai bang
 * ------------------------------------------------------------------ */

/** Mot phieu kem bang chung cua no, cho man hinh chi tiet. */
export interface FuelEntryDetail {
  readonly entry: FuelEntry;
  readonly evidence: readonly FuelReceiptEvidence[];
}

/**
 * BAN LAM VIEC DOI SOAT — moi thu mot nguoi doi soat can tren MOT man hinh.
 *
 * Gop o tang doc chu khong de giao dien tu goi bon endpoint roi tu ghep: thu tu ghep se quyet dinh
 * con so tong, va hai man hinh ghep hai kieu se cho hai con so khac nhau cho cung mot ky.
 */
export interface FuelReconciliationWorkspace {
  readonly reconciliation: FuelReconciliation;
  readonly statement: FuelSupplierStatement;
  readonly lines: readonly FuelStatementLine[];
  readonly matches: readonly FuelMatch[];
  readonly discrepancies: readonly FuelDiscrepancy[];
  /** Con bao nhieu chenh lech chua ai quyet — con so chan `FUEL-RECON-004`. */
  readonly pendingDiscrepancyCount: number;
  readonly handoff: FuelSettlementHandoff | null;
}
