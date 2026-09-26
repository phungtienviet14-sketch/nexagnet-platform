import { formatBusinessDate, formatKm, formatVnd } from '../../format';
import type { CloseOutOutcome, OperationalDocument } from '../office/decision-types';
import { checkText, type ParseResult } from '../office/form-input';
import type { QueueItem } from '../office/types';

/**
 * HOP THU "CẦN XỬ LÝ" cua giam doc — HAM THUAN.
 *
 * Moi ma hang viec dan toi DUNG MOT kieu to truot. Ma khong co thao tac tren dien thoai (nhien lieu,
 * giay to, bao duong, thieu km...) mo mot to CHI DOC kem "Xử lý trên máy tính" — khong gia vo lam
 * duoc. Ma la cung roi vao chi doc, khong vo.
 */
export type DecisionSheetKind =
  'CLAIM' | 'ASSIGN_DRIVER' | 'ALLOWANCE' | 'SITE_INTAKE' | 'READ_ONLY';

export function decisionSheetFor(kind: string): DecisionSheetKind {
  switch (kind) {
    case 'EXPENSE_CLAIM_AWAITING_REVIEW':
      return 'CLAIM';
    case 'RUN_ACTIVE_WITHOUT_DRIVER':
      return 'ASSIGN_DRIVER';
    case 'DRIVER_WAITING_ALLOWANCE_AWAITING_APPROVAL':
      return 'ALLOWANCE';
    // #398: viec tai xe nhan truc tiep CHUA DU — cung to truot voi ke toan (`SiteIntakeReviewSheet`).
    case 'SITE_INTAKE_NEEDS_REVIEW':
      return 'SITE_INTAKE';
    default:
      return 'READ_ONLY';
  }
}

/** Nhan nut tren the — dong tu theo VIEC, khong phai "Xem". */
export function actionLabelFor(kind: string): string {
  switch (decisionSheetFor(kind)) {
    case 'CLAIM':
      return 'Duyệt hoặc từ chối';
    case 'ASSIGN_DRIVER':
      return 'Phân công lái xe';
    case 'ALLOWANCE':
      return 'Quyết phụ cấp';
    case 'SITE_INTAKE':
      return 'Bổ sung hoặc báo bất thường';
    case 'READ_ONLY':
      return 'Xem chi tiết';
  }
}

/** Dong phu cua the: ma nghiep vu (khong bao gio id ky thuat) va so luong neu co. */
export function queueItemSubline(item: QueueItem): string | null {
  const parts: string[] = [];
  const site = item.detail.siteName;
  if (typeof site === 'string' && site.trim() !== '') parts.push(site);
  if (item.subject.reference) parts.push(item.subject.reference);
  const count = item.detail.count;
  if (typeof count === 'number') parts.push(`${count} khoản`);
  const date = item.detail.businessDate;
  if (typeof date === 'string') parts.push(formatBusinessDate(date));
  return parts.length === 0 ? null : parts.join(' · ');
}

type Formatter = (value: number | string) => string | null;

const asText: Formatter = (value) => String(value);
const asDate: Formatter = (value) => (typeof value === 'string' ? formatBusinessDate(value) : null);
const asDays: Formatter = (value) => (typeof value === 'number' ? `${value} ngày` : null);
const asKm: Formatter = (value) => (typeof value === 'number' ? formatKm(value) : null);
const asMoney: Formatter = (value) => (typeof value === 'number' ? formatVnd(value) : null);

/**
 * CHI nhung khoa `detail` da biet nghia moi len man. Khoa la (hoac id ky thuat: `driverId`,
 * `vehicleId`, `runId`, `planId`...) KHONG hien: mot chuoi cuid tren man hinh la vo nghia, va mot
 * con so khong nhan de bi doc sai.
 */
const DETAIL_FIELDS: ReadonlyArray<readonly [string, string, Formatter]> = [
  ['businessDate', 'Ngày nghiệp vụ', asDate],
  ['sequence', 'Chặng số', asText],
  ['legKind', 'Loại chặng', (value) => (value === 'EMPTY' ? 'RỖNG' : 'Có hàng')],
  ['count', 'Số khoản đang chờ', asText],
  ['periodStart', 'Kỳ từ', asDate],
  ['periodEnd', 'Kỳ đến', asDate],
  ['documentType', 'Loại giấy tờ', asText],
  ['validTo', 'Hiệu lực đến', asDate],
  ['daysUntilExpiry', 'Còn', asDays],
  ['daysRemaining', 'Còn', asDays],
  ['odoRemainingKm', 'Còn', asKm],
  ['openWorkOrders', 'Lệnh sửa đang mở', asText],
  ['inTransitTrips', 'Chuyến đang trên đường', asText],
  ['balance', 'Số dư quỹ', asMoney],
  ['consumptionUnits', 'Tiêu hao ghi nhận', asText],
];

export interface DetailLine {
  readonly key: string;
  readonly label: string;
  readonly value: string;
}

export function queueDetailLines(item: QueueItem): readonly DetailLine[] {
  return DETAIL_FIELDS.flatMap(([key, label, format]) => {
    const raw = item.detail[key];
    if (raw === null || raw === undefined) return [];
    const value = format(raw);
    return value === null ? [] : [{ key, label, value }];
  });
}

/* ------------------------------------------------------------------ *
 * KET THUC DON — `POST /transport/commercial-acceptance/orders/:orderId/decisions`
 * ------------------------------------------------------------------ */

/** MA ly do di kem HANH DONG (web `OrderCompletionView`), nguoi dung khong phai go ma. */
export const CLOSE_OUT_REASON: Readonly<Record<CloseOutOutcome, string>> = {
  APPROVED: 'DOCUMENT_RECEIVED',
  NEEDS_CORRECTION: 'DOCUMENT_INCOMPLETE',
  REJECTED: 'DOCUMENT_NOT_ACCEPTED',
};

export const CLOSE_OUT_LABEL: Readonly<Record<CloseOutOutcome, string>> = {
  APPROVED: 'Đã kết thúc',
  NEEDS_CORRECTION: 'Cần bổ sung',
  REJECTED: 'Từ chối',
};

export const COMPLETION_STATE_LABEL: Readonly<Record<string, string>> = {
  PENDING: 'Chờ kết thúc',
  APPROVED: 'Đã kết thúc',
  REJECTED: 'Từ chối',
  NEEDS_CORRECTION: 'Cần bổ sung',
};

export interface CloseOutBody {
  readonly outcome: CloseOutOutcome;
  readonly reasonCode: string;
  readonly basis: 'DOCUMENT' | 'EXTERNAL_PHYSICAL_CONFIRMATION';
  readonly evidenceRefs: readonly string[];
  readonly externalNote: string | null;
  readonly supersedesId: string | null;
  readonly idempotencyKey: string;
}

/**
 * Co chung tu so duoc chon -> `DOCUMENT`; khong -> `EXTERNAL_PHYSICAL_CONFIRMATION` va CAU van bat
 * buoc ke lai ben nhan da xac nhan gi (may chu doi `ACCEPTANCE_EXTERNAL_BASIS_NOTE_REQUIRED`).
 * `supersedesId` doc luc MO to truot (ban moi nhat) — nguoi quyet sau nhan `…STALE` thay vi ghi de.
 */
export function buildCloseOut(input: {
  readonly outcome: CloseOutOutcome;
  readonly evidence: readonly string[];
  readonly note: string;
  readonly supersedesId: string | null;
  readonly idempotencyKey: string;
}): ParseResult<CloseOutBody> {
  const evidenceRefs = input.evidence.slice(0, 20);
  const basis = evidenceRefs.length > 0 ? 'DOCUMENT' : 'EXTERNAL_PHYSICAL_CONFIRMATION';
  let externalNote: string | null = null;
  if (basis === 'EXTERNAL_PHYSICAL_CONFIRMATION') {
    const note = checkText(input.note, {
      label: 'căn cứ (bên nhận đã nhận/xác nhận gì)',
      min: 1,
      max: 2000,
    });
    if (!note.ok) return note;
    externalNote = note.value;
  }
  return {
    ok: true,
    value: {
      outcome: input.outcome,
      reasonCode: CLOSE_OUT_REASON[input.outcome],
      basis,
      evidenceRefs,
      externalNote,
      supersedesId: input.supersedesId,
      idempotencyKey: input.idempotencyKey,
    },
  };
}

const DOCUMENT_TYPE_LABEL: Readonly<Record<string, string>> = {
  GATE_PASS: 'Phiếu vào cổng',
  LOADING_SLIP: 'Phiếu xếp hàng',
  WEIGH_TICKET: 'Phiếu cân',
  DELIVERY_RECEIPT: 'Biên bản giao hàng',
  OTHER: 'Chứng từ khác',
};

/** Chi chung tu con HIEU LUC moi chon duoc lam can cu. */
export function activeDocuments(
  documents: readonly OperationalDocument[],
): readonly OperationalDocument[] {
  return documents.filter((document) => document.status === 'ACTIVE');
}

export function documentLabel(document: OperationalDocument): string {
  const type = DOCUMENT_TYPE_LABEL[document.type] ?? document.type;
  const paper = document.fileId === null ? ' · bản giấy' : '';
  return document.label ? `${document.label} (${type})${paper}` : `${type}${paper}`;
}
