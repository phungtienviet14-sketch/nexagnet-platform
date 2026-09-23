import type { BusinessDate, FuelVerificationStatus } from './transport-types';

/**
 * BAN SAO KIEU cua SOAT CHUNG TU + DRILL-DOWN TIEU HAO — `#313`.
 *
 * ================================================================================================
 * VI SAO LA MOT TEP RIENG, KHONG NAM TRONG `transport-types.ts`
 * ================================================================================================
 *
 * Quy uoc cua web la mot ban sao kieu cua may chu, va noi thuong dat la `transport-types.ts`. Tep do
 * dang duoc mot PR khac (#308) sua dong thoi; lane nay khong cham tep cua lane do. Cac kieu o day la
 * nhung kieu MOI voi web (chua co ban sao nao), nen mot tep rieng khong tao ra hai su that — va
 * `__tests__/fuel-review-contract.spec.ts` doc CHINH tep nguon cua may chu de ban sao nay khong lech
 * trong im lang.
 *
 * DON VI giong het may chu: `litersUnits` mililit, `unitPriceUnits` mili-dong/lit, `amount` dong,
 * `consumptionUnits` mili-L/100km, muc tin tren thang `CONFIDENCE_SCALE`.
 */

/** Thang cua muc tin tung o — `fuel-receipt-extraction.ts`. */
export const CONFIDENCE_SCALE = 1000;

export const FUEL_DOCUMENT_KINDS = ['EINVOICE_XML', 'RECEIPT_IMAGE'] as const;
export type FuelDocumentKind = (typeof FUEL_DOCUMENT_KINDS)[number];

export const FUEL_DOCUMENT_STATUSES = ['PARSED', 'REJECTED', 'DUPLICATE'] as const;
export type FuelDocumentStatus = (typeof FUEL_DOCUMENT_STATUSES)[number];

export const FUEL_DOCUMENT_REJECT_REASONS = [
  'EMPTY',
  'TOO_LARGE',
  'MALFORMED_XML',
  'EXTERNAL_ENTITY_REJECTED',
  'NOT_AN_INVOICE',
  'MISSING_INVOICE_IDENTITY',
  'NO_LINE_ITEMS',
  'UNSUPPORTED_MEDIA_TYPE',
  'EXTRACTION_UNAVAILABLE',
  'EXTRACTION_MALFORMED_OUTPUT',
] as const;
export type FuelDocumentRejectReason = (typeof FUEL_DOCUMENT_REJECT_REASONS)[number];

export const FUEL_STATION_MATCHES = [
  'RESOLVED',
  'AMBIGUOUS',
  'SUPPLIER_MISMATCH',
  'NO_MATCH',
  'NO_INPUT',
] as const;
export type FuelStationMatch = (typeof FUEL_STATION_MATCHES)[number];

export const FUEL_CANDIDATE_FINDINGS = [
  'ARITHMETIC_MISMATCH',
  'QUANTITY_UNREADABLE',
  'UNIT_PRICE_UNREADABLE',
  'AMOUNT_UNREADABLE',
  'ISSUED_DATE_UNREADABLE',
  'ISSUED_DATE_IN_FUTURE',
  'UNIT_NOT_LITRES',
  'STATION_UNRESOLVED',
  'SUPPLIER_UNLINKED',
  'PLATE_HINT_ABSENT',
  'PLATE_HINT_UNKNOWN_VEHICLE',
  'FIELD_CONFIDENCE_BELOW_FLOOR',
] as const;
export type FuelCandidateFinding = (typeof FUEL_CANDIDATE_FINDINGS)[number];

/** Chi ba loai anh nay moi vao duoc bo doc (`fuel-receipt-image.ts`). PDF thi KHONG. */
export const FUEL_RECEIPT_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type FuelReceiptMediaType = (typeof FUEL_RECEIPT_MEDIA_TYPES)[number];

/** Ly do may chu gan cho mot phieu luc ghi — `fuel-lifecycle.ts`. */
export const FUEL_REVIEW_REASONS = [
  'ODOMETER_NOT_ADVANCED',
  'NO_PREVIOUS_ODOMETER',
  'CONSUMPTION_ABOVE_NORM',
] as const;
export type KnownFuelReviewReason = (typeof FUEL_REVIEW_REASONS)[number];

export interface FuelDocument {
  readonly id: string;
  readonly kind: FuelDocumentKind;
  readonly sourceRef: string;
  readonly contentDigest: string;
  readonly byteSize: number;
  readonly sellerTaxCodeRaw: string | null;
  readonly supplierId: string | null;
  readonly status: FuelDocumentStatus;
  readonly rejectReason: FuelDocumentRejectReason | null;
  readonly duplicateOfId: string | null;
  readonly candidateCount: number;
  readonly receivedAt: string;
  readonly receivedBy: string;
}

export interface FuelCandidate {
  readonly id: string;
  readonly documentId: string;
  readonly lineNumber: number;
  readonly sellerTaxCode: string;
  readonly invoiceSymbol: string;
  readonly invoiceNo: string;
  readonly invoiceTemplate: string | null;
  readonly sellerName: string | null;
  readonly stationLabelRaw: string | null;
  readonly stationId: string | null;
  readonly stationMatch: FuelStationMatch;
  readonly issuedDate: BusinessDate | null;
  readonly issuedTimeRaw: string | null;
  readonly litersUnits: number | null;
  readonly unitPriceUnits: number | null;
  readonly amount: number | null;
  readonly currencyCode: string;
  readonly itemName: string | null;
  readonly unitRaw: string | null;
  readonly plateHintRaw: string | null;
  readonly plateHintSource: 'EXTENSION_FIELD' | 'BUYER_NAME' | null;
  readonly odometerHintKm: number | null;
  /** `null` = nguon TAT DINH (XML) — khong co muc tin nao de noi, khong phai "tin tuyet doi". */
  readonly confidence: Readonly<Record<string, number>> | null;
  readonly createdAt: string;
}

export interface FuelDocumentDetail {
  readonly document: FuelDocument;
  readonly candidates: readonly FuelCandidate[];
}

export interface FuelCandidateFindingDetail {
  readonly finding: FuelCandidateFinding;
  readonly detail?: Readonly<Record<string, number | string>>;
}

export interface FuelCandidateAssessment {
  readonly outcome: 'NO_FINDINGS' | 'HAS_FINDINGS';
  readonly findings: readonly FuelCandidateFindingDetail[];
}

export interface FuelCandidateReview {
  readonly candidate: FuelCandidate;
  readonly assessment: FuelCandidateAssessment;
}

export interface FuelDocumentReview {
  readonly document: FuelDocument;
  readonly candidates: readonly FuelCandidateReview[];
}

export interface FuelDocumentListQuery {
  readonly status?: FuelDocumentStatus | null;
  readonly supplierId?: string | null;
  readonly limit?: number;
  readonly offset?: number;
}

/** Than `POST /transport/fuel/documents/image`. */
export interface IngestFuelReceiptImageInput {
  readonly sourceRef: string;
  readonly mediaType: FuelReceiptMediaType;
  readonly contentBase64: string;
}

/* ------------------------------------------------------------------ *
 * Drill-down tieu hao — `fuel-consumption-drilldown.ts`
 * ------------------------------------------------------------------ */

export const FUEL_CONSUMPTION_LINK_STATES = [
  'COMPUTED',
  'NO_PREVIOUS_ODOMETER',
  'ODOMETER_NOT_ADVANCED',
  'PREVIOUS_FILL_UNANCHORED',
  'EXCLUDED_REJECTED',
] as const;
export type FuelConsumptionLinkState = (typeof FUEL_CONSUMPTION_LINK_STATES)[number];

export const FUEL_CONSUMPTION_INSIGHTS = [
  'CONSUMPTION_ABOVE_NORM',
  'RECORDED_SNAPSHOT_DIFFERS',
] as const;
export type FuelConsumptionInsight = (typeof FUEL_CONSUMPTION_INSIGHTS)[number];

export interface FuelConsumptionAnchor {
  readonly entryId: string;
  readonly businessDate: BusinessDate;
  readonly occurredAt: string;
  readonly odometerKm: number;
}

export interface FuelConsumptionLink {
  readonly entryId: string;
  /** `#364` — chi hien thi; `null` o phieu khai theo vong xe. Chuoi km di theo XE, khong theo chuyen. */
  readonly tripId: string | null;
  readonly runId: string | null;
  readonly businessDate: BusinessDate;
  readonly occurredAt: string;
  readonly verificationStatus: FuelVerificationStatus;
  readonly litersUnits: number;
  readonly odometerKm: number;
  readonly previousEntryId: string | null;
  readonly previousOdometerKm: number | null;
  readonly distanceKm: number | null;
  readonly consumptionUnits: number | null;
  readonly state: FuelConsumptionLinkState;
  readonly insights: readonly FuelConsumptionInsight[];
  readonly recorded: {
    readonly previousOdometerKm: number | null;
    readonly consumptionUnits: number | null;
    readonly reviewReasons: readonly string[];
  };
}

export interface FuelConsumptionSummary {
  readonly entryCount: number;
  readonly computedCount: number;
  readonly reviewCount: number;
  readonly excludedCount: number;
  readonly unverifiedCount: number;
  readonly aboveNormCount: number;
  readonly totalLitersUnits: number;
  readonly totalDistanceKm: number;
  readonly consumptionUnits: number | null;
  readonly stateCounts: Readonly<Record<FuelConsumptionLinkState, number>>;
}

export interface FuelVehicleConsumption {
  readonly vehicle: {
    readonly id: string;
    readonly registrationPlate: string;
    readonly vehicleClass: string;
  };
  readonly period: { readonly from: BusinessDate; readonly to: BusinessDate };
  readonly norm: { readonly normL100km: number | null; readonly tolerancePercent: number };
  readonly leadIn: FuelConsumptionAnchor | null;
  readonly links: readonly FuelConsumptionLink[];
  readonly summary: FuelConsumptionSummary;
  readonly isTruncated: boolean;
}
