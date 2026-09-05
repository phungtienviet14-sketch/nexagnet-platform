import { defineDecisionVocabulary } from '../observability/decision-vocabulary.js';
import { TRIP_TRANSITION_DENIED_REASONS } from './trips/trip-lifecycle.js';

/**
 * TU VUNG QUYET DINH cua `transport-core`.
 *
 * Nam trong thu muc cua chinh mien, khong o `observability/`: xe, chuyen, phan cong va pham vi lai
 * xe la thuat ngu CUA MIEN NAY. Mot khach ban hang khong bao gio phat ra mot ma nao trong tep nay,
 * va `decision-vocabulary.spec.ts` khoa dieu do lai o phia nen tang.
 *
 * Ma o day tra loi dung nhung cau hoi ma doc log thuong khong tra loi duoc: "vi sao chuyen nay
 * khong lan banh duoc?", "ai da lai luc khoan chi do phat sinh?", "vi sao lai xe nay nhan 404?".
 */

/* ------------------------------------------------------------------ *
 * trip.lifecycle_transition — evaluateTripTransition() qua TripService
 * ------------------------------------------------------------------ */
export const TRIP_TRANSITION_REASONS = [
  'TRANSITION_ALLOWED',
  ...TRIP_TRANSITION_DENIED_REASONS,
] as const;
export type TripTransitionDecisionReason = (typeof TRIP_TRANSITION_REASONS)[number];

/* ------------------------------------------------------------------ *
 * trip.assignment_change — TripService.assign()
 *
 * Tach `ASSIGNMENT_CREATED` khoi `ASSIGNMENT_REPLACED` co chu y: lan phan cong dau va lan doi
 * giua chuyen la hai su kien nghiep vu khac nhau. Cai thu hai la thu `GD-06` sinh ra de bao ve,
 * va no phai dem duoc — neu gop chung thi khong ai tra loi duoc "thang nay doi lai xe may lan".
 * ------------------------------------------------------------------ */
export const TRIP_ASSIGNMENT_REASONS = [
  'ASSIGNMENT_CREATED',
  /** Ban cu duoc DONG LAI (`effectiveTo`), ban moi mo ra. Khong ban nao bi ghi de. */
  'ASSIGNMENT_REPLACED',
  /** Phan cong y het ban dang hieu luc — khong sinh ban ghi moi, khong lam ban toa lich su. */
  'ASSIGNMENT_UNCHANGED',
  /** Chuyen da o diem cuoi: khong phan cong lai duoc nua. */
  'ASSIGNMENT_TRIP_TERMINAL',
] as const;
export type TripAssignmentReason = (typeof TRIP_ASSIGNMENT_REASONS)[number];

/* ------------------------------------------------------------------ *
 * trip.cancel — TripService.cancel(), `GD-02`
 * ------------------------------------------------------------------ */
export const TRIP_CANCEL_REASONS = [
  'CANCEL_RECORDED',
  'CANCEL_ALREADY_CANCELLED',
  /** Chuyen da doi soat: `GD-02` khong mo duong huy o day. Sua = chung tu dieu chinh (T5). */
  'CANCEL_TRIP_RECONCILED',
] as const;
export type TripCancelReason = (typeof TRIP_CANCEL_REASONS)[number];

/* ------------------------------------------------------------------ *
 * driver.self_scope — CONG DUY NHAT cua be mat lai xe.
 *
 * Ba ma phan biet ba trang thai the gioi rat khac nhau, va gop lai thanh mot `403` se lam nguoi
 * ho tro khong biet phai sua o dau: cap tai khoan? phan cong chuyen? hay that su la mot nguoi
 * dang doi chuyen cua nguoi khac?
 * ------------------------------------------------------------------ */
export const DRIVER_SELF_SCOPE_REASONS = [
  'SELF_SCOPE_GRANTED',
  /** User dang dang nhap chua duoc noi voi ho so lai xe nao (`Driver.authUserId`). */
  'SELF_SCOPE_NO_DRIVER_BINDING',
  /** Co ho so lai xe, nhung chuyen nay chua bao gio duoc phan cong cho nguoi do. */
  'SELF_SCOPE_NOT_ASSIGNED',
] as const;
export type DriverSelfScopeReason = (typeof DRIVER_SELF_SCOPE_REASONS)[number];

export type TransportDecisionReason =
  | TripTransitionDecisionReason
  | TripAssignmentReason
  | TripCancelReason
  | DriverSelfScopeReason;

export const TRANSPORT_DECISIONS = defineDecisionVocabulary({
  owner: 'transport-core',
  points: [
    'trip.lifecycle_transition',
    'trip.assignment_change',
    'trip.cancel',
    'driver.self_scope',
  ],
  labels: {
    TRANSITION_ALLOWED: 'Cho phép chuyển trạng thái',
    TRIP_ALREADY_TERMINAL: 'Chuyến đã ở điểm cuối, không còn đường ra',
    TRIP_ALREADY_IN_STATE: 'Chuyến đã ở đúng trạng thái đó rồi',
    TRANSITION_NOT_PERMITTED: 'Máy trạng thái không có cạnh này',
    TRIP_RESOURCES_MISSING: 'Chuyến chạy xe công ty nhưng thiếu xe hoặc lái xe',
    TRIP_CARRIER_MISSING: 'Chuyến thuê xe ngoài nhưng chưa chỉ định nhà xe',

    ASSIGNMENT_CREATED: 'Phân công lần đầu cho chuyến',
    ASSIGNMENT_REPLACED: 'Đổi phân công giữa chuyến — bản cũ được đóng lại, không ghi đè',
    ASSIGNMENT_UNCHANGED: 'Phân công không đổi so với bản đang hiệu lực',
    ASSIGNMENT_TRIP_TERMINAL: 'Chuyến đã ở điểm cuối nên không phân công lại được',

    TRIP_CANCEL_REQUIRES_DEDICATED_PATH:
      'Huỷ chuyến phải đi qua đường huỷ riêng — đường chuyển trạng thái chung không huỷ được',

    CANCEL_RECORDED: 'Đã huỷ chuyến (huỷ thay cho xoá)',
    CANCEL_ALREADY_CANCELLED: 'Chuyến đã huỷ trước đó',
    CANCEL_TRIP_RECONCILED: 'Chuyến đã đối soát — không huỷ, phải dùng chứng từ điều chỉnh',

    SELF_SCOPE_GRANTED: 'Lái xe truy cập đúng chuyến của mình',
    SELF_SCOPE_NO_DRIVER_BINDING: 'Tài khoản đăng nhập chưa nối với hồ sơ lái xe nào',
    SELF_SCOPE_NOT_ASSIGNED: 'Chuyến này chưa từng phân công cho lái xe đó',
  } satisfies Record<TransportDecisionReason, string>,
});
