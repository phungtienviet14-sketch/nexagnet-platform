import type { BusinessDate } from '../business-date.js';
import type { EInvoiceProvenance } from './fuel-einvoice-parse.js';

/**
 * CHUNG TU NGUON + UNG VIEN — hinh dang du lieu doc len tu kho (Lane C / C2).
 *
 * ---------------------------------------------------------------------------
 * QUY UOC DON VI, giong het `fuel.types.ts`:
 *
 *   `amount`          so nguyen DONG
 *   `litersUnits`     so nguyen MILILIT (ty le 3)
 *   `unitPriceUnits`  so nguyen MILI-DONG moi lit (ty le 3)
 *   `issuedDate`      chuoi `YYYY-MM-DD`
 *
 * KHONG truong nao mang so thuc.
 *
 * ---------------------------------------------------------------------------
 * `INV-C2-NOMONEY` — KHONG KIEU NAO O DAY DUOC MOT DUONG TINH TIEN DOC.
 *
 * Mot ung vien la thu MAY doc ra duoc, khong phai thu KE TOAN da tin. No khong co chan gia thanh
 * (`costExpenseId`), khong co truc duyet, khong co truc doi soat — ba thu ma `FuelEntry` co. Bo
 * test cua C2 doc thang ma nguon cac tep tinh tien va do neu mot trong nhung ten kieu nay xuat
 * hien o do.
 */

export const FUEL_DOCUMENT_KINDS = ['EINVOICE_XML'] as const;
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
] as const;
export type FuelDocumentRejectReason = (typeof FUEL_DOCUMENT_REJECT_REASONS)[number];

/** NAM ket cuc cua `resolveFuelStation()`, luu lai nguyen ven tren tung ung vien. */
export const FUEL_STATION_MATCHES = [
  'RESOLVED',
  'AMBIGUOUS',
  'SUPPLIER_MISMATCH',
  'NO_MATCH',
  'NO_INPUT',
] as const;
export type FuelStationMatch = (typeof FUEL_STATION_MATCHES)[number];

/** NOI mot goi y duoc doc ra. Mot goi y khong ghi nguon la mot goi y khong kiem lai duoc. */
export const FUEL_HINT_SOURCES = ['EXTENSION_FIELD', 'BUYER_NAME'] as const;
export type FuelHintSource = (typeof FUEL_HINT_SOURCES)[number];

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
  /** Chung tu DA NHAP truoc do mang cung hoa don nay. Chi co gia tri khi `status = DUPLICATE`. */
  readonly duplicateOfId: string | null;
  readonly candidateCount: number;
  readonly receivedAt: string;
  readonly receivedBy: string;
}

/**
 * MOT UNG VIEN — mot dong hang da chuan hoa, chua ai xac nhan.
 *
 * `plateHintRaw`/`odometerHintKm` mang hau to `Hint` trong CHINH TEN cua chung, va do la co y: ND
 * 123/2020 Dieu 10 khong co truong bien so trong noi dung bat buoc cua hoa don dien tu, nen moi
 * bien so doc duoc tu mot hoa don deu den tu mot cho ma khong quy dinh nao rang buoc. Ten truong
 * la cho re nhat de noi dieu do voi moi nguoi se doc code nay.
 */
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
  /** Chi co gia tri khi `stationMatch = 'RESOLVED'` — DB giu bat bien do bang mot `CHECK`. */
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
  readonly plateHintSource: FuelHintSource | null;
  readonly odometerHintKm: number | null;
  readonly provenance: EInvoiceProvenance;
  readonly createdAt: string;
}

/** Mot chung tu kem cac ung vien cua no — khung nhin cua man hinh chi tiet. */
export interface FuelDocumentDetail {
  readonly document: FuelDocument;
  readonly candidates: readonly FuelCandidate[];
}
