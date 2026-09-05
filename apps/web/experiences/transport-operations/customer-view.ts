import { formatVnd } from '../../lib/format';
import type {
  BusinessDate,
  DriverFundEntryKind,
  DriverStatus,
  ExpenseFundingSource,
  FuelDiscrepancyKind,
  FuelDiscrepancyResolution,
  FuelPaymentMethod,
  FuelReconciliationState,
  FuelReconciliationStatus,
  FuelStatementRejectReason,
  FuelVerificationStatus,
  FundBalanceStance,
  FundPeriodStatus,
  PartnerRoleKind,
  PartyStatus,
  TripKind,
  TripStatus,
  VehicleStatus,
} from './transport-types';

/**
 * TRINH BAY, khong co tham quyen nghiep vu.
 *
 * Tep nay duoc phep: doi ma may thanh chu tieng Viet, chia don vi ty le, dinh dang ngay/tien, chon
 * sac thai cho mot phu hieu. Tep nay KHONG duoc phep: quyet mot chuyen co gui duoc khong, tinh mot
 * so tien, suy ra mot trang thai. Nhung viec do thuoc may chu — xem hop dong mien §5.
 *
 * Phep thu khi phan van: neu bo tep nay di thi so lieu co SAI khong, hay chi kho doc hon? Neu sai
 * thi logic dang nam sai cho.
 */

/** Khi khong co so lieu. KHONG duoc thay bang `0` — thieu chi phi khac han chi phi bang khong. */
export const EMPTY_VALUE = '—';

/* ------------------------------------------------------------------ *
 * Don vi
 * ------------------------------------------------------------------ */

const plainNumber = new Intl.NumberFormat('vi-VN');
const scaledNumber = new Intl.NumberFormat('vi-VN', {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});

/**
 * Tien: so nguyen DONG. Dung lai `formatVnd` cua `lib/format` thay vi viet ban thu tu — nhung boc
 * them mot lop chiu `null`, vi `formatVnd` NEM `TypeError` voi gia tri khong huu han, va so lieu
 * van tai co nhieu truong tien nullable that (`freightAmount`, `amount` cua dong bang ke).
 */
export const formatMoney = (value: number | null | undefined): string =>
  typeof value === 'number' && Number.isFinite(value) ? formatVnd(value) : EMPTY_VALUE;

/** Ty le 3: `litersUnits` la MILILIT. Chia 1000 truoc khi cho nguoi doc thay. */
export const formatLiters = (units: number | null | undefined): string =>
  typeof units === 'number' && Number.isFinite(units)
    ? `${scaledNumber.format(units / 1000)} L`
    : EMPTY_VALUE;

/** Ty le 3: `consumptionUnits` la MILI-L/100km. */
export const formatConsumption = (units: number | null | undefined): string =>
  typeof units === 'number' && Number.isFinite(units)
    ? `${scaledNumber.format(units / 1000)} L/100km`
    : EMPTY_VALUE;

export const formatOdometer = (km: number | null | undefined): string =>
  typeof km === 'number' && Number.isFinite(km) ? `${plainNumber.format(km)} km` : EMPTY_VALUE;

export const formatDistance = formatOdometer;

export const formatCount = (value: number | null | undefined): string =>
  typeof value === 'number' && Number.isFinite(value) ? plainNumber.format(value) : EMPTY_VALUE;

const percentFormatter = new Intl.NumberFormat('vi-VN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Diem co ban → phan tram: `1250` ⇒ `"12,50%"`. */
export const formatBasisPoints = (basisPoints: number | null | undefined): string =>
  typeof basisPoints === 'number' && Number.isFinite(basisPoints)
    ? `${percentFormatter.format(basisPoints / 100)}%`
    : EMPTY_VALUE;

/* ------------------------------------------------------------------ *
 * Thoi gian — hai khai niem, hai ham, khong dung lan
 * ------------------------------------------------------------------ */

const BUSINESS_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * `businessDate` la NGAY NGHIEP VU theo lich tenant, khong phai mot moc thoi gian.
 *
 * Tach chuoi, KHONG dung `new Date(...)`: `new Date('2026-09-04')` duoc doc la nua dem UTC, va o
 * mui gio Viet Nam mot phan cua nam se nhay ve ngay hom truoc. Day dung la loi ma cot rieng
 * `businessDate` duoc tao ra de tranh (`business-date.ts:1-8`) — hien thi lai bang `Date` la nem di
 * ca thiet ke do.
 */
export const formatBusinessDate = (date: BusinessDate | null | undefined): string => {
  if (typeof date !== 'string') return EMPTY_VALUE;
  const parts = BUSINESS_DATE_PATTERN.exec(date);
  return parts === null ? EMPTY_VALUE : `${parts[3]}/${parts[2]}/${parts[1]}`;
};

/** Khoang ngay nghiep vu, vd `01/09/2026 – 30/09/2026`. */
export const formatBusinessDateRange = (
  from: BusinessDate | null | undefined,
  to: BusinessDate | null | undefined,
): string => `${formatBusinessDate(from)} – ${formatBusinessDate(to)}`;

const instantFormatter = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** Moc thoi gian ISO — `createdAt`, `occurredAt`, `closedAt`, … */
export const formatInstant = (iso: string | null | undefined): string => {
  if (typeof iso !== 'string' || iso.length === 0) return EMPTY_VALUE;
  const value = new Date(iso);
  return Number.isNaN(value.getTime()) ? EMPTY_VALUE : instantFormatter.format(value);
};

/* ------------------------------------------------------------------ *
 * Nhan nghiep vu
 * ------------------------------------------------------------------ */

export const TRIP_STATUS_LABEL = {
  PLANNED: 'Đã lên kế hoạch',
  IN_TRANSIT: 'Đang chạy',
  DELIVERED: 'Đã giao',
  RECONCILED: 'Đã đối soát',
  CANCELLED: 'Đã huỷ',
} as const satisfies Record<TripStatus, string>;

export const TRIP_KIND_LABEL = {
  OWN_DIRECT: 'Xe nhà tự chạy',
  EXTERNAL_CARRIER: 'Thuê xe ngoài',
  PARTNER_REFERRED_INTERNAL_RUN: 'Nhận chạy hộ',
} as const satisfies Record<TripKind, string>;

export const VEHICLE_STATUS_LABEL = {
  IDLE: 'Đang rỗi',
  ON_TRIP: 'Đang trên chuyến',
  UNDER_MAINTENANCE: 'Đang bảo dưỡng',
} as const satisfies Record<VehicleStatus, string>;

export const DRIVER_STATUS_LABEL = {
  ACTIVE: 'Đang làm',
  INACTIVE: 'Đã nghỉ',
} as const satisfies Record<DriverStatus, string>;

export const PARTY_STATUS_LABEL = {
  ACTIVE: 'Đang hoạt động',
  INACTIVE: 'Đã dừng',
} as const satisfies Record<PartyStatus, string>;

export const PARTNER_ROLE_LABEL = {
  CARRIER: 'Nhà xe',
  ORDER_REFERRER: 'Nguồn đơn',
} as const satisfies Record<PartnerRoleKind, string>;

export const FUND_ENTRY_KIND_LABEL = {
  ADVANCE: 'Tạm ứng',
  RETURN: 'Hoàn quỹ',
  TRIP_EXPENSE: 'Chi phí chuyến',
  ADJUSTMENT: 'Điều chỉnh',
  REVERSAL: 'Đảo bút toán',
} as const satisfies Record<DriverFundEntryKind, string>;

/**
 * The dung cua so du quy. Ba cau nay la cach DUY NHAT dung de doc dau cua so du.
 * `COMPANY_OWES_DRIVER` KHONG phai "lai xe dang no" — doc nguoc la doi chieu sai ca ky.
 */
export const FUND_BALANCE_STANCE_LABEL = {
  DRIVER_HOLDS_COMPANY_CASH: 'Lái xe đang giữ tiền của công ty',
  SETTLED: 'Đã cân bằng',
  COMPANY_OWES_DRIVER: 'Công ty đang nợ lái xe',
} as const satisfies Record<FundBalanceStance, string>;

export const FUND_PERIOD_STATUS_LABEL = {
  OPEN: 'Đang mở',
  CLOSING: 'Đang chốt',
  CLOSED: 'Đã chốt',
  REOPENED: 'Đã mở lại',
} as const satisfies Record<FundPeriodStatus, string>;

export const EXPENSE_FUNDING_LABEL = {
  DRIVER_FUND: 'Lấy từ quỹ lái xe',
  COMPANY_DIRECT: 'Công ty trả trực tiếp',
} as const satisfies Record<ExpenseFundingSource, string>;

export const FUEL_VERIFICATION_LABEL = {
  DECLARED: 'Mới khai',
  VERIFIED: 'Đã xác thực',
  REJECTED: 'Bị từ chối',
} as const satisfies Record<FuelVerificationStatus, string>;

export const FUEL_RECONCILIATION_STATUS_LABEL = {
  UNMATCHED: 'Chưa khớp',
  MATCHED: 'Đã khớp',
  MISMATCHED: 'Lệch',
  SETTLED: 'Đã quyết toán',
  IGNORED: 'Đã bỏ qua',
} as const satisfies Record<FuelReconciliationStatus, string>;

export const FUEL_RECONCILIATION_STATE_LABEL = {
  DRAFT: 'Nháp',
  MATCHING: 'Đang so khớp',
  RESOLVED: 'Đã xử lý lệch',
  CLOSED: 'Đã đóng',
  REOPENED: 'Đã mở lại',
} as const satisfies Record<FuelReconciliationState, string>;

export const FUEL_PAYMENT_METHOD_LABEL = {
  DRIVER_CASH: 'Lái xe trả tiền mặt',
  SUPPLIER_ACCOUNT: 'Ghi nợ cây xăng',
} as const satisfies Record<FuelPaymentMethod, string>;

export const FUEL_DISCREPANCY_KIND_LABEL = {
  AMBIGUOUS_CANDIDATES: 'Nhiều ứng viên khớp',
  STATEMENT_LINE_ONLY: 'Chỉ có trên bảng kê',
  FUEL_ENTRY_ONLY: 'Chỉ có phiếu nội bộ',
  OUT_OF_TOLERANCE: 'Lệch quá dung sai',
  SELF_SOURCED_BLOCKED: 'Phiếu sinh từ chính bảng kê',
} as const satisfies Record<FuelDiscrepancyKind, string>;

export const FUEL_DISCREPANCY_RESOLUTION_LABEL = {
  ACCEPT_SUPPLIER_AMOUNT: 'Chấp nhận số của cây xăng',
  REJECT_SUPPLIER_LINE: 'Từ chối dòng bảng kê',
  MATCH_CONFIRMED: 'Xác nhận cặp khớp',
  IGNORE_WITH_REASON: 'Bỏ qua có lý do',
  ENTRY_CORRECTION_REQUIRED: 'Yêu cầu sửa phiếu',
} as const satisfies Record<FuelDiscrepancyResolution, string>;

export const FUEL_STATEMENT_REJECT_REASON_LABEL = {
  MISSING_REQUIRED_FIELD: 'Thiếu trường bắt buộc',
  MALFORMED_DATE: 'Ngày sai định dạng',
  MALFORMED_AMOUNT: 'Số tiền sai định dạng',
  MALFORMED_LITERS: 'Số lít sai định dạng',
  UNKNOWN_VEHICLE: 'Không nhận ra biển số',
  DUPLICATE_ROW: 'Dòng trùng',
} as const satisfies Record<FuelStatementRejectReason, string>;

/** Ma la chuoi mo phia API, nen tra lai chinh ma khi chua co nhan. */
export const rejectReasonLabel = (reason: string | null): string => {
  if (reason === null) return EMPTY_VALUE;
  const labels: Readonly<Record<string, string>> = FUEL_STATEMENT_REJECT_REASON_LABEL;
  return labels[reason] ?? reason;
};

/* ------------------------------------------------------------------ *
 * Sac thai phu hieu
 * ------------------------------------------------------------------ */

/**
 * `go` dang chay · `wait` dang cho nguoi · `done` da khep · `stop` da dung/lech · `flat` trung tinh.
 * Chi de nhin; khong mot quyet dinh nao doc gia tri nay.
 */
export type StatusTone = 'flat' | 'go' | 'wait' | 'done' | 'stop';

export const tripStatusTone = (status: TripStatus): StatusTone => {
  switch (status) {
    case 'PLANNED':
      return 'wait';
    case 'IN_TRANSIT':
      return 'go';
    case 'DELIVERED':
      return 'wait';
    case 'RECONCILED':
      return 'done';
    case 'CANCELLED':
      return 'stop';
  }
};

export const vehicleStatusTone = (status: VehicleStatus): StatusTone => {
  switch (status) {
    case 'IDLE':
      return 'flat';
    case 'ON_TRIP':
      return 'go';
    case 'UNDER_MAINTENANCE':
      return 'stop';
  }
};

export const fuelVerificationTone = (status: FuelVerificationStatus): StatusTone => {
  switch (status) {
    case 'DECLARED':
      return 'wait';
    case 'VERIFIED':
      return 'done';
    case 'REJECTED':
      return 'stop';
  }
};

export const fuelReconciliationStatusTone = (status: FuelReconciliationStatus): StatusTone => {
  switch (status) {
    case 'UNMATCHED':
      return 'wait';
    case 'MATCHED':
      return 'go';
    case 'MISMATCHED':
      return 'stop';
    case 'SETTLED':
      return 'done';
    case 'IGNORED':
      return 'flat';
  }
};

export const fuelReconciliationStateTone = (state: FuelReconciliationState): StatusTone => {
  switch (state) {
    case 'DRAFT':
      return 'flat';
    case 'MATCHING':
      return 'go';
    case 'RESOLVED':
      return 'wait';
    case 'CLOSED':
      return 'done';
    case 'REOPENED':
      return 'stop';
  }
};

export const fundPeriodStatusTone = (status: FundPeriodStatus): StatusTone => {
  switch (status) {
    case 'OPEN':
      return 'go';
    case 'CLOSING':
      return 'wait';
    case 'CLOSED':
      return 'done';
    case 'REOPENED':
      return 'stop';
  }
};

export const fundBalanceStanceTone = (stance: FundBalanceStance): StatusTone => {
  switch (stance) {
    case 'DRIVER_HOLDS_COMPANY_CASH':
      return 'wait';
    case 'SETTLED':
      return 'done';
    case 'COMPANY_OWES_DRIVER':
      return 'stop';
  }
};

/* ------------------------------------------------------------------ *
 * Cau noi that
 * ------------------------------------------------------------------ */

/**
 * `direct-margin.ts:10-16` cam man hinh bo cau nay hoac goi con so la "loi nhuan". Giu nguyen van
 * chu cua may chu, khong dien dat lai.
 */
export const DIRECT_MARGIN_DISCLOSURE = 'Chưa gồm chi phí cố định';

/** Nhan cho mot thuc the ma nguoi doc nhan ra — KHONG bao gio la `id` ky thuat. */
export const entityLabel = (name: string | null | undefined, fallback: string): string => {
  const trimmed = name?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : fallback;
};

/**
 * Khi chi con `id` trong tay. Noi ro la chua doc duoc ten, thay vi dan mot `uuid` len man hinh nhu
 * the do la ten nghiep vu — #161 §7 cam lay `id` noi bo lam nhan chinh.
 */
export const unresolvedReference = (kind: string): string => `${kind} chưa đọc được tên`;
