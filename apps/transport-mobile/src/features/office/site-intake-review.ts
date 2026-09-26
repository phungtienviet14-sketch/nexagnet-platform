import { ApiError } from '../../api/errors';
import { formatBusinessDate, formatClock } from '../../format';
import type { DecisionErrorPolicy } from './decision-errors';
import { checkText, normalizeSearch, type ParseResult } from './form-input';
import type {
  BindableOrderView,
  DriverOrderActivityView,
  KnownPlace,
  OrderIntakeSourceView,
  QueueItem,
  SiteIntakeCommercialOutcome,
  SiteIntakeExceptionOutcome,
  SiteIntakeLocationTrust,
  SiteIntakeReviewView,
  SiteMatch,
} from './types';

/**
 * VIEC TAI XE NHAN TRUC TIEP nhin tu VAN PHONG (`#398`) — HAM THUAN, dung chung giam doc + ke toan.
 *
 * ============================================================================================
 * TIN TUC != VIEC CAN QUYET
 * ============================================================================================
 *
 * Don tu tao binh thuong la TIN ("Đơn mới từ tài xế" o Hom nay): khong nut duyet, khong lam tang
 * so viec can quyet. Chi viec CHUA DU moi vao "Cần xử lý" (`SITE_INTAKE_NEEDS_REVIEW`).
 *
 * ============================================================================================
 * UNG DUNG KHONG TINH LAI "DU CHUA"
 * ============================================================================================
 *
 * Ly do con thieu, viec lam duoc tiep (`actions`) va ket cuc cua moi lenh deu la cua MAY CHU. Tep
 * nay chi DICH ma sang cau; khong co ban sao nao cua bang quyet dinh `evaluateCommercialReadiness`.
 */

/* ------------------------------------------------------------------ *
 * LY DO CON THIEU
 * ------------------------------------------------------------------ */

/**
 * Nhan cua `SITE_INTAKE_READINESS_REASONS` (`commercial-readiness.ts`) — doc sau "Thiếu:", cung
 * giong cau chu nguoi so huu da duyet. Ma la (may chu moi hon ung dung) hien nguyen ma.
 */
export const READINESS_REASON_LABEL: Readonly<Record<string, string>> = {
  DESTINATION_MISSING: 'điểm giao',
  DESTINATION_SAME_AS_ORIGIN: 'điểm giao trùng nơi lấy hàng',
  ORIGIN_LOCATION_UNVERIFIED: 'vị trí nơi lấy hàng chưa đối chiếu',
  SITE_MATCH_AMBIGUOUS: 'nơi lấy hàng chưa chắc',
  ORIGIN_POINT_UNKNOWN: 'nơi lấy hàng chưa có hàng rào (không có toạ độ)',
  ORIGIN_POINT_AMBIGUOUS: 'nơi lấy hàng có nhiều hàng rào (không rõ toạ độ)',
  SITE_INACTIVE: 'nơi lấy hàng đã ngừng hoạt động',
  DRIVER_INACTIVE: 'hồ sơ lái xe đã ngừng hoạt động',
  DRIVER_BINDING_CHANGED: 'chuyến đã giao cho lái xe khác',
  VEHICLE_BINDING_CHANGED: 'lái xe không còn giữ xe của chuyến',
  LEG_COMPLETED: 'chặng đã xong trước khi có đơn — chỉ còn báo bất thường',
  LEG_ORDER_CONFLICT: 'chặng đã mang đơn khác',
  RUN_PLAN_CONFLICT: 'vòng chạy đã có kế hoạch của đơn khác',
};

export const readinessReasonLabel = (code: string): string => READINESS_REASON_LABEL[code] ?? code;

export const READY_TO_COMPLETE_TEXT = 'Đủ điều kiện — bấm Hoàn thiện để tạo đơn';

/** "Thiếu: điểm giao, nơi lấy hàng chưa chắc" — rong nghia la DA DU, noi dung cau do. */
export function missingLine(reasons: readonly string[]): string {
  return reasons.length === 0
    ? READY_TO_COMPLETE_TEXT
    : `Thiếu: ${reasons.map(readinessReasonLabel).join(', ')}`;
}

/** `detail.reasons` cua muc hang viec la cac MA noi bang dau phay. */
export function queueReasons(item: QueueItem): readonly string[] {
  const raw = item.detail.reasons;
  if (typeof raw !== 'string') return [];
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

export const SITE_INTAKE_QUEUE_KIND = 'SITE_INTAKE_NEEDS_REVIEW';

/** Dong "Thiếu: …" tren the hang viec — chi cho viec tai xe nhan truc tiep. */
export function siteIntakeQueueNote(item: QueueItem): string | null {
  return item.kind === SITE_INTAKE_QUEUE_KIND ? missingLine(queueReasons(item)) : null;
}

/* ------------------------------------------------------------------ *
 * VI TRI
 * ------------------------------------------------------------------ */

const TRUST_LABEL: Readonly<Record<SiteIntakeLocationTrust, string>> = {
  SERVER_BOUND: 'Vị trí đã xác thực',
  DRIVER_REPORTED: 'Vị trí do máy lái xe báo',
};

const SITE_MATCH_LABEL: Readonly<Record<SiteMatch, string>> = {
  UNIQUE_INSIDE: 'một địa điểm, nằm trong hàng rào',
  CHOSEN_AMONG_SEVERAL: 'lái xe tự chọn giữa nhiều địa điểm',
  NO_LOCATION: 'bấm không kèm vị trí',
};

/** "Vị trí do máy lái xe báo · một địa điểm, nằm trong hàng rào · cách 42 m". */
export function locationLine(location: {
  readonly trust: SiteIntakeLocationTrust;
  readonly siteMatch: SiteMatch | null;
  readonly distanceMetres?: number | null;
}): string {
  const parts = [
    TRUST_LABEL[location.trust] ?? location.trust,
    location.siteMatch === null
      ? 'chưa rõ cách khớp địa điểm'
      : (SITE_MATCH_LABEL[location.siteMatch] ?? location.siteMatch),
  ];
  const metres = location.distanceMetres;
  if (typeof metres === 'number' && Number.isFinite(metres)) {
    parts.push(
      metres < 1_000
        ? `cách ${Math.round(metres)} m`
        : `cách ${(metres / 1_000).toFixed(1).replace('.', ',')} km`,
    );
  }
  return parts.join(' · ');
}

/** "Công ty A — Kho số 2"; khong co ten thi dung nhan cua may chu. */
export function originLine(origin: SiteIntakeReviewView['origin']): string {
  const parts = [origin.counterpartyName, origin.siteName].filter(
    (part): part is string => typeof part === 'string' && part.trim() !== '',
  );
  return parts.length === 0 ? origin.label : parts.join(' — ');
}

/* ------------------------------------------------------------------ *
 * VIEC LAM DUOC TIEP
 * ------------------------------------------------------------------ */

export const REVIEW_COMPLETE_ACTION = 'transport.site_intake.review.complete';
export const REVIEW_READ_ACTION = 'transport.site_intake.review.read';
export const EXCEPTION_ACTION = 'transport.site_intake.exception';
export const SITE_INTAKE_CAPABILITY = 'transport-site-intake';

export interface ReviewActions {
  readonly setDestination: boolean;
  readonly attestOrigin: boolean;
  readonly bindOrder: boolean;
  readonly complete: boolean;
  readonly reportException: boolean;
}

/**
 * Nut chi hien khi MAY CHU cho phep tren viec nay (`actions`) VA tai khoan co quyen. Ke toan khong co
 * `…exception` nen khong bao gio thay "Báo bất thường / Hủy" — khong can nhanh theo vai.
 */
export function reviewActions(
  view: SiteIntakeReviewView,
  can: (action: string) => boolean,
): ReviewActions {
  const mayComplete = can(REVIEW_COMPLETE_ACTION);
  return {
    setDestination: view.actions.canSetDestination && mayComplete,
    attestOrigin: view.actions.canAttestOrigin && mayComplete,
    bindOrder: view.actions.canBindExistingOrder && mayComplete,
    complete:
      view.status === 'PENDING' && view.readiness.kind === 'READY_TO_AUTO_CREATE' && mayComplete,
    reportException: view.actions.canReportException && can(EXCEPTION_ACTION),
  };
}

export const REVIEW_STATUS_LABEL: Readonly<Record<string, string>> = {
  PENDING: 'Chưa có đơn',
  ORDER_BOUND: 'Đã có đơn',
  REJECTED: 'Đã hủy',
};

/* ------------------------------------------------------------------ *
 * KET CUC LENH
 * ------------------------------------------------------------------ */

/** KET CUC bao bat thuong — noi THAT may chu da huy toi dau, va cai gi duoc giu. */
export const EXCEPTION_OUTCOME_TEXT: Readonly<Record<SiteIntakeExceptionOutcome, string>> = {
  ORDER_CANCELLED_WORK_CANCELLED:
    'Đã hủy đơn. Xe chưa chạy nên chuyến cũng đã hủy — không xoá dữ liệu nào.',
  ORDER_CANCELLED_OPERATION_PRESERVED:
    'Đã hủy đơn. Xe đã chạy nên hoạt động vận hành (vòng chạy, mốc, GPS) được giữ nguyên.',
  INTAKE_REJECTED_WORK_CANCELLED:
    'Đã hủy việc tài xế nhận (chưa có đơn nào). Xe chưa chạy nên chuyến cũng đã hủy — không xoá dữ liệu nào.',
  INTAKE_REJECTED_OPERATION_PRESERVED:
    'Đã hủy việc tài xế nhận (chưa có đơn nào). Xe đã chạy nên hoạt động vận hành (vòng chạy, mốc, GPS) được giữ nguyên.',
  ANOMALY_RECORDED_ORDER_TERMINAL:
    'Đơn đã ở trạng thái cuối — không hủy được; đã ghi nhận bất thường.',
};

const REPLAYED_SUFFIX = ' (Lệnh gửi lại — máy chủ trả đúng kết cục đã ghi, không làm gì thêm.)';

export function exceptionOutcomeText(result: {
  readonly outcome: SiteIntakeExceptionOutcome;
  readonly replayed?: boolean;
}): string {
  const text =
    EXCEPTION_OUTCOME_TEXT[result.outcome] ?? `Đã ghi nhận bất thường (${result.outcome}).`;
  return result.replayed ? `${text}${REPLAYED_SUFFIX}` : text;
}

/** Dong ngan tren the ban tin khi don da bi bao bat thuong sau khi tao. */
export function exceptionCaption(outcome: SiteIntakeExceptionOutcome | null): string | null {
  if (outcome === null) return null;
  if (outcome === 'ANOMALY_RECORDED_ORDER_TERMINAL') return 'Đã ghi nhận bất thường trên đơn này.';
  if (
    outcome === 'ORDER_CANCELLED_WORK_CANCELLED' ||
    outcome === 'ORDER_CANCELLED_OPERATION_PRESERVED'
  ) {
    return 'Đơn này đã bị hủy sau đó (báo bất thường).';
  }
  return 'Việc này đã bị hủy (báo bất thường).';
}

/** Ket cuc HOAN THIEN / GAN DON — doc tu su that SAU lenh, khong tu y dinh cua nguoi bam. */
export function commandOutcomeText(outcome: SiteIntakeCommercialOutcome): string {
  const suffix = outcome.replayed ? REPLAYED_SUFFIX : '';
  if (outcome.status === 'ORDER_BOUND' && outcome.orderCode !== null) {
    const verb = outcome.bindingMode === 'OFFICE_EXISTING_ORDER' ? 'Đã gắn vào đơn' : 'Đã tạo đơn';
    return `${verb} ${outcome.orderCode}${suffix}`;
  }
  if (outcome.status === 'REJECTED' || outcome.readiness.kind === 'REJECTED') {
    return `Việc này đã dừng — không tạo đơn được.${suffix}`;
  }
  if (outcome.readiness.kind === 'NEEDS_REVIEW') {
    return `Đã ghi. ${missingLine(outcome.readiness.reasons ?? [])}${suffix}`;
  }
  return `Đã ghi.${suffix}`;
}

/**
 * Noi TRUOC khi gui may chu se lam gi — doc tu su that may chu da tra (don, xe da lan banh chua).
 * Day chi la loi bao truoc; ket cuc THAT la cau may chu tra ve sau lenh (`exceptionOutcomeText`).
 */
export function exceptionConsequence(view: {
  readonly order: { readonly status: string } | null;
  readonly movementStarted: boolean;
}): string {
  const subject = view.order ? 'đơn' : 'việc tài xế nhận (chưa có đơn)';
  if (view.order && view.order.status !== 'OPEN') {
    return 'Đơn đã ở trạng thái cuối — máy chủ chỉ ghi nhận bất thường, không hủy được.';
  }
  return view.movementStarted
    ? `Xe đã lăn bánh: máy chủ chỉ hủy ${subject}; vòng chạy, mốc, GPS giữ nguyên.`
    : `Xe chưa lăn bánh: máy chủ hủy ${subject} và cả chuyến chưa chạy. Không xoá dữ liệu nào.`;
}

/** Mot lan bao bat thuong DA co (khong cung khoa) la "da xong", khong phai loi do. */
export const SITE_INTAKE_POLICY: DecisionErrorPolicy = {
  alreadyDone: ['SITE_INTAKE_EXCEPTION_ALREADY_RECORDED'],
};

/* ------------------------------------------------------------------ *
 * O NHAP
 * ------------------------------------------------------------------ */

export const EXCEPTION_REASON_MIN = 3;
export const EXCEPTION_REASON_MAX = 500;

export function checkExceptionReason(raw: string): ParseResult<string> {
  return checkText(raw, { label: 'Lý do', min: EXCEPTION_REASON_MIN, max: EXCEPTION_REASON_MAX });
}

/** Nut gui TAT cho toi khi ly do du dai — ly do la BAT BUOC, khong phai mot o tuy chon. */
export function exceptionReasonReady(raw: string): boolean {
  return checkExceptionReason(raw).ok;
}

/** Dia diem da biet cho van phong chon diem giao — loc khong dau, giu thu tu may chu. */
export function filterKnownPlaces(
  places: readonly KnownPlace[],
  filter: string,
): readonly KnownPlace[] {
  const needle = normalizeSearch(filter);
  if (needle === '') return places;
  return places.filter((place) =>
    normalizeSearch(`${place.name} ${place.detail ?? ''}`).includes(needle),
  );
}

export function bindableOrderLine(order: BindableOrderView): string {
  return `${order.originLabel} → ${order.destinationLabel} · ${formatBusinessDate(order.businessDate)}`;
}

/* ------------------------------------------------------------------ *
 * BAN TIN "ĐƠN MỚI TỪ TÀI XẾ" + NGUON TREN CHI TIET DON
 * ------------------------------------------------------------------ */

export const DRIVER_ORDERS_TITLE = 'Đơn mới từ tài xế';
export const DRIVER_ORDER_OVERLINE = 'ĐƠN MỚI TỪ TÀI XẾ';
export const ORDER_SOURCE_TITLE = 'Tạo từ xác nhận của tài xế';

export interface DriverOrderCard {
  readonly key: string;
  readonly testID: string;
  readonly overline: string;
  readonly who: string;
  readonly route: string;
  readonly when: string;
  readonly orderCode: string;
  readonly orderId: string;
  readonly exceptionNote: string | null;
}

const whoLine = (view: {
  readonly driverName: string | null;
  readonly vehiclePlate: string | null;
}): string =>
  `${view.driverName ?? 'Lái xe chưa đọc được tên'} · ${view.vehiclePlate ?? 'xe chưa đọc được biển'}`;

export function driverOrderCard(view: DriverOrderActivityView, timeZone: string): DriverOrderCard {
  return {
    key: view.intakeId,
    testID: `director-driver-order-${view.orderCode}`,
    overline: DRIVER_ORDER_OVERLINE,
    who: whoLine(view),
    route: `${view.originLabel} → ${view.destinationLabel}`,
    when: `Tạo đơn lúc ${formatClock(view.boundAt, timeZone)}`,
    orderCode: view.orderCode,
    orderId: view.orderId,
    exceptionNote: exceptionCaption(view.exceptionOutcome),
  };
}

export interface SourceLine {
  readonly label: string;
  readonly value: string;
}

export function orderSourceLines(
  view: OrderIntakeSourceView,
  timeZone: string,
): readonly SourceLine[] {
  return [
    { label: 'Lái xe', value: view.driverName ?? 'Lái xe chưa đọc được tên' },
    { label: 'Xe', value: view.vehiclePlate ?? 'Xe chưa đọc được biển' },
    { label: 'Lấy hàng', value: view.originLabel },
    { label: 'Giao hàng', value: view.destinationLabel },
    { label: 'Tài xế xác nhận lúc', value: formatClock(view.confirmedAt, timeZone) },
    {
      label: 'Vị trí lúc xác nhận',
      value: locationLine({ trust: view.locationTrust, siteMatch: view.siteMatch }),
    },
  ];
}

/**
 * 404 cua `by-order` = don KHONG den tu duong nay (hoac nang luc chua bat) — khong phai loi, khong ve
 * gi ca. Moi loi khac van la loi.
 */
export function isNotDriverDirect(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}
