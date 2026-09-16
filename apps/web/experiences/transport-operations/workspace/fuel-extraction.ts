import {
  FUEL_CANDIDATE_FINDING_LABEL,
  FUEL_DOCUMENT_REJECT_REASON_LABEL,
  FUEL_DOCUMENT_STATUS_LABEL,
  FUEL_STATION_MATCH_LABEL,
  formatBusinessDate,
  formatCount,
  formatInstant,
  formatLiters,
  formatMoney,
  formatOdometer,
  fuelDocumentStatusTone,
  type StatusTone,
} from '../customer-view';
import {
  FUEL_EVIDENCE_SOURCE_PREFIX,
  type StoredEvidenceExtraction,
} from '../fuel-evidence-extraction';
import {
  CONFIDENCE_SCALE,
  type FuelCandidate,
  type FuelCandidateFinding,
  type FuelCandidateFindingDetail,
  type FuelCandidateReview,
  type FuelDocument,
  type FuelStationMatch,
} from '../fuel-review-types';

/**
 * MO HINH SOAT UNG VIEN MAY DOC — `#313`.
 *
 * ================================================================================================
 * KHONG CO MOT DUONG NAO TU UNG VIEN SANG PHIEU
 * ================================================================================================
 *
 * Mo hinh nay chi TRINH BAY: muc tin tung o, o nao may chu noi la yeu, phat hien co ma, va tung
 * truong cua ung vien dat canh to khai. No khong tao mot `amendEntry`, khong goi `verify`, khong de
 * xuat "ap dung". Nguoi soat nhin ANH GOC va tu quyet bang nhung nut da co cua phieu.
 *
 * O yeu la cau tra loi CUA MAY CHU (`FIELD_CONFIDENCE_BELOW_FLOOR.detail.fields`), khong phai mot
 * san thu hai tinh o day: hai san se troi khoi nhau, va man hinh se noi "chac" o dung o may chu vua
 * noi "khong chac".
 */

export const CANDIDATE_ONLY_NOTICE =
  'Đây là số liệu máy đọc từ ảnh — chỉ là đề xuất. Máy không sửa phiếu, không xác thực phiếu và không tạo công nợ; kế toán đối chiếu với ảnh gốc rồi tự quyết.';

/** Nhung gi to khai da ghi — de dat canh ung vien. */
export interface DeclaredFuelFacts {
  readonly litersUnits: number;
  readonly amount: number;
  readonly invoiceNo: string | null;
  readonly businessDate: string;
  readonly odometerKm: number | null;
  readonly vehiclePlate: string | null;
}

export type ComparisonVerdict = 'MATCH' | 'DIFFERENT' | 'NOT_ON_DECLARATION' | 'NOT_ON_RECEIPT';

export interface CandidateFieldRow {
  readonly key: string;
  readonly label: string;
  readonly valueLabel: string;
  /** `null` = khong co muc tin de noi (hoa don dien tu, hoac o khong do bo doc bao). */
  readonly confidenceLabel: string | null;
  readonly isWeak: boolean;
}

export interface CandidateComparisonRow {
  readonly key: 'liters' | 'amount' | 'invoiceNo' | 'date' | 'plate' | 'odometer';
  readonly label: string;
  readonly declaredLabel: string;
  readonly receiptLabel: string;
  readonly verdict: ComparisonVerdict;
  readonly verdictLabel: string;
  readonly tone: StatusTone;
}

export interface CandidateFindingRow {
  readonly finding: FuelCandidateFinding;
  readonly label: string;
  readonly detailLabel: string | null;
}

export interface CandidateReviewCard {
  readonly id: string;
  readonly title: string;
  readonly sellerLabel: string;
  readonly stationLabel: string;
  readonly stationMatchLabel: string;
  readonly fields: readonly CandidateFieldRow[];
  readonly findings: readonly CandidateFindingRow[];
  readonly comparisons: readonly CandidateComparisonRow[];
  readonly attentionCount: number;
}

export interface ExtractionReviewModel {
  readonly documentId: string;
  readonly statusLabel: string;
  readonly statusTone: StatusTone;
  readonly rejectLabel: string | null;
  readonly duplicateNote: string | null;
  readonly notice: string;
  readonly cards: readonly CandidateReviewCard[];
  readonly attentionCount: number;
  readonly headline: string;
}

/** Nhan cua tung khoa muc tin ma bo doc anh bao (`fuel-receipt-extraction.stub.ts`). */
const CONFIDENCE_FIELD_LABEL: Readonly<Record<string, string>> = {
  invoiceNo: 'Số hoá đơn',
  invoiceSymbol: 'Ký hiệu',
  sellerTaxCode: 'MST người bán',
  issuedAt: 'Ngày lập',
  litersMilli: 'Số lít',
  unitPriceMilli: 'Đơn giá',
  amountVnd: 'Thành tiền',
};

const confidenceKeyLabel = (key: string): string =>
  CONFIDENCE_FIELD_LABEL[key.split('.').at(-1) ?? key] ?? key;

/** LAM TRON XUONG: 899 hien "89%" — mot o duoi san khong duoc hien dung con so cua san. */
const percentOf = (value: number): string => `${Math.floor((value * 100) / CONFIDENCE_SCALE)}%`;

const weakKeysOf = (findings: readonly FuelCandidateFindingDetail[]): ReadonlySet<string> => {
  const weak = findings.find((row) => row.finding === 'FIELD_CONFIDENCE_BELOW_FLOOR');
  const fields = weak?.detail?.fields;
  return new Set(typeof fields === 'string' ? fields.split(',').map((field) => field.trim()) : []);
};

const formatUnitPrice = (units: number | null): string =>
  units === null ? '—' : `${formatCount(units / 1000)} đ/L`;

function fieldRows(candidate: FuelCandidate, weak: ReadonlySet<string>): CandidateFieldRow[] {
  const line = `line.${candidate.lineNumber}`;
  const row = (key: string, label: string, valueLabel: string, confidenceKey: string | null) => {
    const value = confidenceKey === null ? undefined : candidate.confidence?.[confidenceKey];
    return {
      key,
      label,
      valueLabel,
      confidenceLabel: value === undefined ? null : percentOf(value),
      isWeak: confidenceKey !== null && candidate.confidence !== null && weak.has(confidenceKey),
    };
  };
  return [
    row('invoiceNo', 'Số hoá đơn', candidate.invoiceNo || '—', 'invoiceNo'),
    row('invoiceSymbol', 'Ký hiệu', candidate.invoiceSymbol || '—', 'invoiceSymbol'),
    row('sellerTaxCode', 'MST người bán', candidate.sellerTaxCode || '—', 'sellerTaxCode'),
    row('issuedDate', 'Ngày lập', formatBusinessDate(candidate.issuedDate), 'issuedAt'),
    row('liters', 'Số lít', formatLiters(candidate.litersUnits), `${line}.litersMilli`),
    row(
      'unitPrice',
      'Đơn giá',
      formatUnitPrice(candidate.unitPriceUnits),
      `${line}.unitPriceMilli`,
    ),
    row('amount', 'Thành tiền', formatMoney(candidate.amount), `${line}.amountVnd`),
    row('plateHint', 'Biển số trên hoá đơn', candidate.plateHintRaw ?? '—', null),
    row('odometerHint', 'Km trên hoá đơn', formatOdometer(candidate.odometerHintKm), null),
  ];
}

function findingDetailLabel(row: FuelCandidateFindingDetail): string | null {
  const detail = row.detail ?? {};
  switch (row.finding) {
    case 'ARITHMETIC_MISMATCH':
      return `Tính ra ${formatMoney(Number(detail.expectedVnd))}, hoá đơn ghi ${formatMoney(Number(detail.actualVnd))}`;
    case 'ISSUED_DATE_IN_FUTURE':
      return `Ngày lập ${formatBusinessDate(String(detail.issuedDate ?? ''))}`;
    case 'UNIT_NOT_LITRES':
      return `Đơn vị ghi: ${String(detail.unit ?? '—')}`;
    case 'STATION_UNRESOLVED':
      return FUEL_STATION_MATCH_LABEL[String(detail.stationMatch) as FuelStationMatch] ?? null;
    case 'PLATE_HINT_UNKNOWN_VEHICLE':
      return `Biển số đọc được: ${String(detail.plateHint ?? '—')}`;
    case 'FIELD_CONFIDENCE_BELOW_FLOOR':
      return `Ô cần nhìn lại: ${[...weakKeysOf([row])].map(confidenceKeyLabel).join(', ')}`;
    default:
      return null;
  }
}

/* -------------------------- Doi chieu voi to khai -------------------------- */

const VERDICT_LABEL: Readonly<Record<ComparisonVerdict, string>> = {
  MATCH: 'Khớp',
  DIFFERENT: 'Lệch',
  NOT_ON_DECLARATION: 'Tờ khai chưa ghi',
  NOT_ON_RECEIPT: 'Hoá đơn không đọc được',
};

const VERDICT_TONE: Readonly<Record<ComparisonVerdict, StatusTone>> = {
  MATCH: 'done',
  // Lech la mot DIEU CAN SOAT, khong phai mot loi cua ai — sac thai cho, khong phai do.
  DIFFERENT: 'wait',
  NOT_ON_DECLARATION: 'flat',
  NOT_ON_RECEIPT: 'flat',
};

/** Bo khoang trang + chu hoa + so 0 dau: `0001234` va `1234` la cung mot so hoa don. */
const normalizeInvoiceNo = (value: string): string =>
  value
    .replace(/\s+/g, '')
    .toUpperCase()
    .replace(/^0+(?=.)/, '');

const normalizePlate = (value: string): string => value.replace(/[^0-9a-z]/gi, '').toUpperCase();

function comparison(
  key: CandidateComparisonRow['key'],
  label: string,
  declared: { readonly present: boolean; readonly label: string },
  receipt: { readonly present: boolean; readonly label: string },
  isSame: () => boolean,
): CandidateComparisonRow {
  const verdict: ComparisonVerdict = !declared.present
    ? 'NOT_ON_DECLARATION'
    : !receipt.present
      ? 'NOT_ON_RECEIPT'
      : isSame()
        ? 'MATCH'
        : 'DIFFERENT';
  return {
    key,
    label,
    declaredLabel: declared.label,
    receiptLabel: receipt.label,
    verdict,
    verdictLabel: VERDICT_LABEL[verdict],
    tone: VERDICT_TONE[verdict],
  };
}

function comparisonRows(
  candidate: FuelCandidate,
  declared: DeclaredFuelFacts,
): CandidateComparisonRow[] {
  const rows = [
    comparison(
      'liters',
      'Số lít',
      { present: true, label: formatLiters(declared.litersUnits) },
      { present: candidate.litersUnits !== null, label: formatLiters(candidate.litersUnits) },
      () => candidate.litersUnits === declared.litersUnits,
    ),
    comparison(
      'amount',
      'Số tiền',
      { present: true, label: formatMoney(declared.amount) },
      { present: candidate.amount !== null, label: formatMoney(candidate.amount) },
      () => candidate.amount === declared.amount,
    ),
    comparison(
      'invoiceNo',
      'Số hoá đơn',
      { present: declared.invoiceNo !== null, label: declared.invoiceNo ?? '—' },
      {
        present: candidate.invoiceNo.trim() !== '',
        label: `${candidate.invoiceSymbol} ${candidate.invoiceNo}`.trim(),
      },
      () =>
        normalizeInvoiceNo(declared.invoiceNo ?? '') === normalizeInvoiceNo(candidate.invoiceNo),
    ),
    comparison(
      'date',
      'Ngày',
      { present: true, label: formatBusinessDate(declared.businessDate) },
      { present: candidate.issuedDate !== null, label: formatBusinessDate(candidate.issuedDate) },
      () => candidate.issuedDate === declared.businessDate,
    ),
  ];
  // Bien so va km CHI doi chieu khi CA HAI ben deu co: hoa don khong bat buoc ghi bien so (ND
  // 123/2020 Dieu 10) va hiem khi ghi km, nen "khong co" o day la chuyen thuong, khong phai mot dong.
  if (declared.vehiclePlate !== null && candidate.plateHintRaw !== null) {
    rows.push(
      comparison(
        'plate',
        'Biển số',
        { present: true, label: declared.vehiclePlate },
        { present: true, label: candidate.plateHintRaw },
        () =>
          normalizePlate(declared.vehiclePlate ?? '') ===
          normalizePlate(candidate.plateHintRaw ?? ''),
      ),
    );
  }
  if (declared.odometerKm !== null && candidate.odometerHintKm !== null) {
    rows.push(
      comparison(
        'odometer',
        'Số km',
        { present: true, label: formatOdometer(declared.odometerKm) },
        { present: true, label: formatOdometer(candidate.odometerHintKm) },
        () => candidate.odometerHintKm === declared.odometerKm,
      ),
    );
  }
  return rows;
}

function toCard(
  review: FuelCandidateReview,
  declared: DeclaredFuelFacts | null,
): CandidateReviewCard {
  const { candidate, assessment } = review;
  const weak = weakKeysOf(assessment.findings);
  const findings = assessment.findings.map((row) => ({
    finding: row.finding,
    label: FUEL_CANDIDATE_FINDING_LABEL[row.finding],
    detailLabel: findingDetailLabel(row),
  }));
  const comparisons = declared === null ? [] : comparisonRows(candidate, declared);
  return {
    id: candidate.id,
    title: `Dòng ${candidate.lineNumber} · ${candidate.itemName ?? 'Nhiên liệu'}`,
    sellerLabel: candidate.sellerName ?? candidate.sellerTaxCode,
    stationLabel: candidate.stationLabelRaw ?? '—',
    stationMatchLabel: FUEL_STATION_MATCH_LABEL[candidate.stationMatch],
    fields: fieldRows(candidate, weak),
    findings,
    comparisons,
    attentionCount:
      findings.length + comparisons.filter((row) => row.verdict === 'DIFFERENT').length,
  };
}

export function toExtractionReviewModel(
  extraction: StoredEvidenceExtraction,
  declared: DeclaredFuelFacts | null,
): ExtractionReviewModel {
  const { document } = extraction.review;
  const source =
    document.status === 'DUPLICATE' && extraction.originalReview !== null
      ? extraction.originalReview
      : extraction.review;
  const cards = source.candidates.map((row) => toCard(row, declared));
  const rejectLabel =
    document.status === 'REJECTED' && document.rejectReason !== null
      ? FUEL_DOCUMENT_REJECT_REASON_LABEL[document.rejectReason]
      : null;
  const attentionCount =
    (rejectLabel === null ? 0 : 1) + cards.reduce((sum, card) => sum + card.attentionCount, 0);

  return {
    documentId: document.id,
    statusLabel: FUEL_DOCUMENT_STATUS_LABEL[document.status],
    statusTone: fuelDocumentStatusTone(document.status),
    rejectLabel,
    duplicateNote:
      document.status === 'DUPLICATE'
        ? 'Hoá đơn này đã có trong hệ thống từ một chứng từ khác — dưới đây là ứng viên của chứng từ gốc.'
        : null,
    notice: CANDIDATE_ONLY_NOTICE,
    cards,
    attentionCount,
    headline:
      attentionCount > 0
        ? `Cần soát ${formatCount(attentionCount)} điểm trước khi tin số liệu này.`
        : 'Không thấy điểm lệch — vẫn chỉ là đề xuất, kế toán xác thực phiếu theo ảnh gốc.',
  };
}

/* ----------------------------- Hang soat chung tu ----------------------------- */

export interface DocumentQueueRow {
  readonly id: string;
  readonly kindLabel: string;
  readonly sourceLabel: string;
  readonly receivedAtLabel: string;
  readonly statusLabel: string;
  readonly statusTone: StatusTone;
  readonly candidateCountLabel: string;
  readonly rejectLabel: string | null;
}

/**
 * `sourceRef` cua anh DA LUU la `fuel-evidence:<id>` — mot khoa ky thuat, khong phai mot ten nguoi
 * doc duoc. Hien mot cau mo ta thay vi mot UUID.
 */
export const toDocumentQueueRows = (documents: readonly FuelDocument[]): DocumentQueueRow[] =>
  documents.map((document) => ({
    id: document.id,
    kindLabel: document.kind === 'RECEIPT_IMAGE' ? 'Ảnh phiếu đổ' : 'Hoá đơn điện tử',
    sourceLabel: document.sourceRef.startsWith(FUEL_EVIDENCE_SOURCE_PREFIX)
      ? 'Ảnh chứng từ đã lưu của một phiếu'
      : document.sourceRef,
    receivedAtLabel: formatInstant(document.receivedAt),
    statusLabel: FUEL_DOCUMENT_STATUS_LABEL[document.status],
    statusTone: fuelDocumentStatusTone(document.status),
    candidateCountLabel: formatCount(document.candidateCount),
    rejectLabel:
      document.rejectReason === null
        ? null
        : FUEL_DOCUMENT_REJECT_REASON_LABEL[document.rejectReason],
  }));
