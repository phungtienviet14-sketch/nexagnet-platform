import type { FuelHintSource, FuelStationMatch } from './fuel-document.types.js';
import type { ExtractionConfidence } from './fuel-receipt-extraction.js';
import type { EInvoiceProvenance, ParsedInvoice } from './fuel-einvoice-parse.js';
import type { FuelStationResolution } from './fuel-station-identity.js';
import { normalizePlate } from './fuel-statement-mapping.js';

/**
 * MOT HOA DON DA DOC -> CAC UNG VIEN — ham THUAN, khong cham DB, khong biet Nest.
 *
 * ===========================================================================
 * BIEN SO XE KHONG CO CHO TREN MOT HOA DON XANG DAU
 *
 * ND 123/2020 Dieu 10 liet ke noi dung BAT BUOC cua hoa don dien tu, va bien so xe khong nam trong
 * do; ND 70/2025 — van ban buoc moi cua hang ban le phat hoa don tung lan ban — cung khong them
 * truong nao nhu vay. Nen khi mot bien so xuat hien tren hoa don, no o mot trong hai cho ma KHONG
 * quy dinh nao rang buoc:
 *
 *   · mot truong mo rong `TTKhac` do nha cung cap TU DAT TEN (`BienSoXe`, `BKS`, `VehiclePlate`…);
 *   · hoac lan trong ten nguoi mua, tren hoa don ban le cho khach le.
 *
 * He qua thang, va no la ly do ca tep nay ton tai: **hoa don khong noi duoc xe nao**. Mot ung vien
 * KHONG BAO GIO tu tro thanh phieu do dau duoc, vi `TransportFuelEntry.vehicleId` la `NOT NULL`.
 * Cai ta doc ra chi la mot GOI Y, va no mang ca NOI no duoc doc ra de nguoi kiem lai duoc.
 *
 * ===========================================================================
 * HAI DUONG TIM BIEN SO, VA MOT DUONG BI TU CHOI CO CHU DICH
 *
 *   1. TEN TRUONG MO RONG khop mot danh sach da biet — day khong phai doan: mot NGUOI da dat ten
 *      truong do la "bien so xe", va ta tin cai ten do. Gia tri duoc giu NGUYEN BAN, ke ca khi no
 *      trong khong giong mot bien so; viec doi chieu voi doi xe la cua tang kiem tat dinh.
 *
 *   2. TEN NGUOI MUA khi CA CHUOI la mot bien so sau khi chuan hoa.
 *
 *   3. KHONG quet tim chuoi con trong van ban tu do. `CONG TY 29 TAN` chua `29`, mot dia chi chua
 *      `51D` cua mot so nha; mot bo quet chuoi con se lay ra nhung manh do va goi chung la bien so.
 *      Mot goi y SAI ton hon khong co goi y nao: nguoi doi soat se tin no, va lan do dau se duoc
 *      gan cho nham xe.
 */

/**
 * TEN TRUONG MO RONG co the mang bien so — so sanh SAU khi chuan hoa (bo dau cach, chu hoa).
 *
 * Danh sach MO va se dai them khi gap nha cung cap moi. Do la mot danh sach TEN, khong phai mot bo
 * doan: them mot ten vao day la mot lan sua co y thuc, co nguoi doc, va co test.
 */
export const PLATE_HINT_FIELD_NAMES: readonly string[] = [
  'BIENSOXE',
  'BIENSO',
  'BIENKIEMSOAT',
  'BKS',
  'SOXE',
  'VEHICLEPLATE',
  'LICENSEPLATE',
  'PLATE',
];

/** Nhu tren, cho so odo. Gia tri phai la mot so nguyen khong am — neu khong, khong co goi y. */
export const ODOMETER_HINT_FIELD_NAMES: readonly string[] = [
  'ODO',
  'SOODO',
  'CHISOODO',
  'SOKM',
  'ODOMETER',
];

/** Nhu tren, cho ma cua hang cua chinh nha cung cap. */
export const STATION_CODE_HINT_FIELD_NAMES: readonly string[] = [
  'MACUAHANG',
  'MACH',
  'MACAYXANG',
  'MATRAM',
  'STORECODE',
  'STATIONCODE',
];

/**
 * KHUON BIEN SO Viet Nam sau khi chuan hoa (`29C-123.45` -> `29C12345`).
 *
 * Hai chu so tinh (ma tinh/thanh), mot hoac hai chu cai seri, mot chu so tuy chon (bien hai banh
 * nhu `29H1`), roi bon den nam chu so. NEO HAI DAU — mot khuon khong neo se tim thay "bien so"
 * trong moi chuoi du dai, va do la kieu hong ma ca tep nay duoc viet de tranh.
 */
const VIETNAM_PLATE_SHAPE = /^\d{2}[A-Z]{1,2}\d?\d{4,5}$/;

export const looksLikeVietnamesePlate = (value: string): boolean =>
  VIETNAM_PLATE_SHAPE.test(normalizePlate(value));

/** Ten truong -> khoa so sanh. Cung phep chuan hoa voi cac danh sach ten o tren. */
const fieldKey = (name: string): string => name.toUpperCase().replace(/[^0-9A-Z]/g, '');

function findExtension(
  extensions: Readonly<Record<string, string>>,
  names: readonly string[],
): string | null {
  for (const [name, value] of Object.entries(extensions)) {
    if (names.includes(fieldKey(name))) return value;
  }
  return null;
}

export interface PlateHint {
  readonly raw: string;
  readonly source: FuelHintSource;
}

/**
 * GOI Y BIEN SO, hoac `null`.
 *
 * Thu tu uu tien la co chu dich: mot truong DUOC DAT TEN thang chac chan hon mot chuoi tinh co
 * trong nhu bien so. Neu ca hai cung co va khac nhau, ta lay cai co ten — va `plateHintSource` ghi
 * lai lua chon do de nguoi doc kiem duoc.
 */
export function findPlateHint(invoice: ParsedInvoice): PlateHint | null {
  const named = findExtension(invoice.extensions, PLATE_HINT_FIELD_NAMES);
  if (named !== null) return { raw: named, source: 'EXTENSION_FIELD' };

  const buyer = invoice.buyerName;
  if (buyer !== null && looksLikeVietnamesePlate(buyer)) {
    return { raw: buyer, source: 'BUYER_NAME' };
  }
  return null;
}

/**
 * GOI Y SO ODO, hoac `null`.
 *
 * CHI doc tu truong mo rong co ten, va CHI khi gia tri la mot so nguyen khong am viet lien. Mot
 * chuoi nhu `123.456 km` bi tu choi thay vi doc thanh `123` — odo la mau so cua phep tinh tieu
 * hao, va mot con so sai o do cho ra mot dinh muc vo ly ma khong ai truy nguoc duoc.
 */
export function findOdometerHint(invoice: ParsedInvoice): number | null {
  const raw = findExtension(invoice.extensions, ODOMETER_HINT_FIELD_NAMES);
  if (raw === null || !/^\d+$/.test(raw.trim())) return null;

  const value = Number(raw.trim());
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** MA CUA HANG doc tu truong mo rong — dau vao cua phep nhan dang cay xang. */
export const findStationCodeHint = (invoice: ParsedInvoice): string | null =>
  findExtension(invoice.extensions, STATION_CODE_HINT_FIELD_NAMES);

/**
 * NHAN CAY XANG bang gi: TEN NGUOI BAN.
 *
 * KHONG dung dia chi: hai cua hang cua cung mot chuoi rat hay trung mot phan dia chi, va mot bi
 * danh dat theo dia chi se tro toi nham tram. Ten nguoi ban tren hoa don xang dau thuong da chua
 * ten cua hang (`Cong ty X — Cua hang so 5`), va do la chuoi dung de so.
 */
export const stationLabelOf = (invoice: ParsedInvoice): string | null => invoice.sellerName;

/** Mot ung vien TRUOC khi co `id`/`documentId`/`createdAt` — do la viec cua tang kho. */
export interface NormalizedCandidate {
  readonly lineNumber: number;
  readonly sellerTaxCode: string;
  readonly invoiceSymbol: string;
  readonly invoiceNo: string;
  readonly invoiceTemplate: string | null;
  readonly sellerName: string | null;
  readonly stationLabelRaw: string | null;
  readonly stationId: string | null;
  readonly stationMatch: FuelStationMatch;
  readonly issuedDate: string | null;
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
  /** `null` khi hoa don den tu mot nguon TAT DINH; mot bang muc tin khi no den tu mot buc anh. */
  readonly confidence: ExtractionConfidence | null;
}

export interface NormalizeInvoiceInput {
  readonly invoice: ParsedInvoice;
  /** Ket qua nhan dang cay xang cho CA hoa don — moi dong cua mot hoa don deu o cung mot tram. */
  readonly station: FuelStationResolution;
  /** Chi co o duong ANH (C3). Vang mat = nguon tat dinh, va moi ung vien mang `confidence = null`. */
  readonly confidence?: ExtractionConfidence;
}

/**
 * MUC TIN CUA MOT DONG = cac khoa CHUNG + cac khoa CUA CHINH DONG DO.
 *
 * Doi xung y het cach `provenance` duoc gop (`{...invoice.provenance, ...line.provenance}`), va vi
 * mot ly do thuc te: moi hang ung vien phai TU DU. Neu de ca bang muc tin cua toan hoa don tren
 * moi dong, thi mot nguoi nhin dong 2 se thay muc tin cua dong 1 va tuong dong minh dang xem bi mo.
 */
export function confidenceForLine(
  confidence: ExtractionConfidence,
  lineNumber: number,
): ExtractionConfidence {
  const mine = `line.${lineNumber}.`;
  return Object.fromEntries(
    Object.entries(confidence).filter(([key]) => !key.startsWith('line.') || key.startsWith(mine)),
  );
}

/**
 * MOT HOA DON -> N UNG VIEN, mot cho moi dong hang.
 *
 * `stationId` CHI duoc dien khi ket cuc la `RESOLVED`. Bon ket cuc con lai la loi moi mot nguoi
 * vao quyet, va dien mot `stationId` o do se la mot lan "chon dai mot cai" — dung viec ma
 * `resolveFuelStation()` ton tai de tu choi lam. DB giu bat bien nay bang `CHECK
 * TransportFuelCandidate_station_match_paired`, nen mot lan lo tay o day se do o tang luu tru.
 *
 * XUAT XU cua tung dong = xuat xu CUA HOA DON tron voi xuat xu CUA DONG. Nguoi doi soat mo mot ung
 * vien ra phai thay ca hai — ma so thue doc o dau, va so lit doc o dong nao.
 */
export function normalizeInvoiceCandidates(
  input: NormalizeInvoiceInput,
): readonly NormalizedCandidate[] {
  const { invoice, station, confidence } = input;
  const plate = findPlateHint(invoice);
  const odometer = findOdometerHint(invoice);
  const resolved = station.outcome === 'RESOLVED' ? station.stationId : null;

  return invoice.lines.map((line) => ({
    lineNumber: line.lineNumber,
    sellerTaxCode: invoice.sellerTaxCode,
    invoiceSymbol: invoice.symbol,
    invoiceNo: invoice.number,
    invoiceTemplate: invoice.template,
    sellerName: invoice.sellerName,
    stationLabelRaw: stationLabelOf(invoice),
    stationId: resolved,
    stationMatch: station.outcome,
    issuedDate: invoice.issuedDate,
    issuedTimeRaw: invoice.issuedTimeRaw,
    litersUnits: line.litersUnits,
    unitPriceUnits: line.unitPriceUnits,
    amount: line.amount,
    currencyCode: invoice.currencyCode,
    itemName: line.itemName,
    unitRaw: line.unit,
    plateHintRaw: plate?.raw ?? null,
    plateHintSource: plate?.source ?? null,
    odometerHintKm: odometer,
    provenance: { ...invoice.provenance, ...line.provenance },
    confidence: confidence ? confidenceForLine(confidence, line.lineNumber) : null,
  }));
}
