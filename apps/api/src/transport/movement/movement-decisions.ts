import { defineDecisionVocabulary } from '../../observability/decision-vocabulary.js';

/* ------------------------------------------------------------------ *
 * order.lifecycle_transition -- MovementService.transitionOrder()
 * ------------------------------------------------------------------ */
export const ORDER_TRANSITION_REASONS = [
  'ORDER_TRANSITION_APPLIED',
  'ORDER_ALREADY_TERMINAL',
  'ORDER_ALREADY_IN_STATE',
  'ORDER_TRANSITION_NOT_PERMITTED',
  'ORDER_CANCEL_REQUIRES_DEDICATED_PATH',
] as const;
export type OrderTransitionReason = (typeof ORDER_TRANSITION_REASONS)[number];

/* ------------------------------------------------------------------ *
 * order.cancel -- MovementService.cancelOrder()
 * ------------------------------------------------------------------ */
export const ORDER_CANCEL_REASONS = [
  'ORDER_CANCEL_RECORDED',
  'ORDER_CANCEL_ALREADY_CANCELLED',
  /**
   * Mot nghia vu DA HOAN THANH khong huy nguoc duoc o day. Dieu chinh mot viec da giao la mot
   * chung tu dieu chinh cong no, khong phai mot lan doi trang thai am tham tren don goc.
   */
  'ORDER_CANCEL_ALREADY_FULFILLED',
] as const;
export type OrderCancelReason = (typeof ORDER_CANCEL_REASONS)[number];

/* ------------------------------------------------------------------ *
 * run.lifecycle_transition -- MovementService.transitionRun()
 * ------------------------------------------------------------------ */
export const RUN_TRANSITION_REASONS = [
  'RUN_TRANSITION_APPLIED',
  'RUN_ALREADY_TERMINAL',
  'RUN_ALREADY_IN_STATE',
  'RUN_TRANSITION_NOT_PERMITTED',
  'RUN_CANCEL_REQUIRES_DEDICATED_PATH',
  /** Mot vong chay khong co chang nao thi khong co gi de chay. */
  'RUN_HAS_NO_LEG',
] as const;
export type RunTransitionReason = (typeof RUN_TRANSITION_REASONS)[number];

/* ------------------------------------------------------------------ *
 * run.cancel -- MovementService.cancelRun()
 * ------------------------------------------------------------------ */
export const RUN_CANCEL_REASONS = [
  'RUN_CANCEL_RECORDED',
  'RUN_CANCEL_ALREADY_CANCELLED',
  'RUN_CANCEL_ALREADY_COMPLETED',
] as const;
export type RunCancelReason = (typeof RUN_CANCEL_REASONS)[number];

/* ------------------------------------------------------------------ *
 * run.assignment_change -- MovementService.assignRun()
 * ------------------------------------------------------------------ */
export const RUN_ASSIGNMENT_REASONS = [
  'RUN_ASSIGNMENT_CREATED',
  'RUN_ASSIGNMENT_REPLACED',
  /** Phan cong lai dung nguoi dang cam lai: khong ghi ban thu hai, va noi ro vi sao. */
  'RUN_ASSIGNMENT_UNCHANGED',
  'RUN_ASSIGNMENT_RUN_TERMINAL',
] as const;
export type RunAssignmentReason = (typeof RUN_ASSIGNMENT_REASONS)[number];

/* ------------------------------------------------------------------ *
 * run.leg_change -- MovementService.addLeg()
 * ------------------------------------------------------------------ */
export const RUN_LEG_REASONS = [
  'LEG_ADDED',
  /**
   * BAT BIEN TRUNG TAM cua tranche. Mot chang chay rong khong mang nghia vu thuong mai -- neu no
   * mang duoc thi moi con so km rong sau do deu sai ma khong ai biet.
   */
  'LEG_EMPTY_CANNOT_CARRY_ORDER',
  'LEG_ORDER_NOT_FOUND',
  'LEG_ORDER_CANCELLED',
  'LEG_RUN_TERMINAL',
] as const;
export type RunLegReason = (typeof RUN_LEG_REASONS)[number];

/* ------------------------------------------------------------------ *
 * run.trip_projection -- MovementService.projectTrip()
 * ------------------------------------------------------------------ */
export const TRIP_PROJECTION_REASONS = [
  'PROJECTION_CREATED',
  /** Chay lai phep chieu tren cung mot chuyen: TAT DINH, khong sinh ban thu hai. */
  'PROJECTION_UNCHANGED',
  /**
   * Chuyen thue xe ngoai KHONG co vong chay cua xe minh. Chieu no ra mot `VehicleRun` la bia ra
   * mot vong chay vat ly chua bao gio ton tai, va lam km cua doi xe phong len.
   */
  'PROJECTION_TRIP_OUTSOURCED',
  /** Chua phan cong xe thi chua biet vong chay do la cua chiec nao. */
  'PROJECTION_TRIP_HAS_NO_VEHICLE',
] as const;
export type TripProjectionReason = (typeof TRIP_PROJECTION_REASONS)[number];

export type TransportMovementDecisionReason =
  | OrderTransitionReason
  | OrderCancelReason
  | RunTransitionReason
  | RunCancelReason
  | RunAssignmentReason
  | RunLegReason
  | TripProjectionReason;

export const TRANSPORT_MOVEMENT_DECISIONS = defineDecisionVocabulary({
  owner: 'transport-core',
  points: [
    'order.lifecycle_transition',
    'order.cancel',
    'run.lifecycle_transition',
    'run.cancel',
    'run.assignment_change',
    'run.leg_change',
    'run.trip_projection',
  ],
  labels: {
    ORDER_TRANSITION_APPLIED: 'Da doi trang thai nghia vu thuong mai',
    ORDER_ALREADY_TERMINAL: 'Nghia vu da o trang thai cuoi',
    ORDER_ALREADY_IN_STATE: 'Nghia vu da o dung trang thai nay',
    ORDER_TRANSITION_NOT_PERMITTED: 'May trang thai khong cho phep buoc chuyen nay',
    ORDER_CANCEL_REQUIRES_DEDICATED_PATH: 'Huy nghia vu phai di duong huy rieng',
    ORDER_CANCEL_RECORDED: 'Da huy nghia vu thuong mai',
    ORDER_CANCEL_ALREADY_CANCELLED: 'Nghia vu da huy tu truoc',
    ORDER_CANCEL_ALREADY_FULFILLED:
      'Nghia vu da hoan thanh: dieu chinh bang chung tu cong no, khong huy nguoc',
    RUN_TRANSITION_APPLIED: 'Da doi trang thai vong chay',
    RUN_ALREADY_TERMINAL: 'Vong chay da o trang thai cuoi',
    RUN_ALREADY_IN_STATE: 'Vong chay da o dung trang thai nay',
    RUN_TRANSITION_NOT_PERMITTED: 'May trang thai khong cho phep buoc chuyen nay',
    RUN_CANCEL_REQUIRES_DEDICATED_PATH: 'Huy vong chay phai di duong huy rieng',
    RUN_HAS_NO_LEG: 'Vong chay chua co chang nao de chay',
    RUN_CANCEL_RECORDED: 'Da huy vong chay',
    RUN_CANCEL_ALREADY_CANCELLED: 'Vong chay da huy tu truoc',
    RUN_CANCEL_ALREADY_COMPLETED: 'Vong chay da hoan thanh, khong huy nguoc',
    RUN_ASSIGNMENT_CREATED: 'Da giao lai xe cam vong chay',
    RUN_ASSIGNMENT_REPLACED: 'Da doi lai xe, ban phan cong cu duoc dong lai',
    RUN_ASSIGNMENT_UNCHANGED: 'Van dung lai xe do, khong ghi them ban phan cong',
    RUN_ASSIGNMENT_RUN_TERMINAL: 'Vong chay da o trang thai cuoi, khong doi lai xe duoc',
    LEG_ADDED: 'Da them chang vao vong chay',
    LEG_EMPTY_CANNOT_CARRY_ORDER: 'Chang chay rong khong duoc mang nghia vu thuong mai',
    LEG_ORDER_NOT_FOUND: 'Khong tim thay nghia vu thuong mai de gan vao chang',
    LEG_ORDER_CANCELLED: 'Nghia vu do da huy, khong gan vao chang duoc',
    LEG_RUN_TERMINAL: 'Vong chay da o trang thai cuoi, khong them chang duoc',
    PROJECTION_CREATED: 'Da chieu chuyen v1 sang vong chay v2',
    PROJECTION_UNCHANGED: 'Chuyen nay da duoc chieu tu truoc, khong sinh ban thu hai',
    PROJECTION_TRIP_OUTSOURCED: 'Chuyen thue xe ngoai khong co vong chay cua xe minh',
    PROJECTION_TRIP_HAS_NO_VEHICLE: 'Chuyen chua phan cong xe nen chua biet vong chay cua xe nao',
  } satisfies Record<TransportMovementDecisionReason, string>,
});
