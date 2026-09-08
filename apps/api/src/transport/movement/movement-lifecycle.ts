import type {
  OrderCancelReason,
  OrderTransitionReason,
  RunCancelReason,
  RunLegCancelReason,
  RunLegTransitionReason,
  RunTransitionReason,
} from './movement-decisions.js';
import type { OrderStatus, RunLegStatus, VehicleRunStatus } from './movement.types.js';

/**
 * HAI MAY TRANG THAI, HAI TRUC.
 *
 * ```text
 * NGHIA VU THUONG MAI          VONG CHAY VAT LY
 *
 * OPEN --> FULFILLED           PLANNED --> ACTIVE --> COMPLETED
 *   |                             |           |
 *   +--> CANCELLED                +-----------+--> CANCELLED
 * ```
 *
 * Ca hai la HAM THUAN, khong phai mot cot ai cung ghi duoc -- cung ly do da ghi o
 * `trip-lifecycle.ts`: neu controller hay repository tu gan `status` thi may trang thai chi con
 * la mot loi khuyen trong tai lieu.
 *
 * THU TU KIEM la mot phan cua hop dong, khong phai chi tiet thi cong. Doi thu tu se cho ra mot ma
 * ly do DUNG VE KET QUA nhung SAI VE NGUYEN NHAN, va nguoi doc trace se di sua nham cho.
 */

export const INITIAL_ORDER_STATUS: OrderStatus = 'OPEN';
export const INITIAL_RUN_STATUS: VehicleRunStatus = 'PLANNED';

export const isTerminalOrderStatus = (status: OrderStatus): boolean =>
  status === 'FULFILLED' || status === 'CANCELLED';

export const isTerminalRunStatus = (status: VehicleRunStatus): boolean =>
  status === 'COMPLETED' || status === 'CANCELLED';

const ORDER_EDGES: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  OPEN: ['FULFILLED', 'CANCELLED'],
  FULFILLED: [],
  CANCELLED: [],
};

const RUN_EDGES: Readonly<Record<VehicleRunStatus, readonly VehicleRunStatus[]>> = {
  PLANNED: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export interface TransitionDecision<Reason extends string> {
  readonly allowed: boolean;
  readonly reason: Reason;
}

const allow = <R extends string>(reason: R): TransitionDecision<R> => ({ allowed: true, reason });
const deny = <R extends string>(reason: R): TransitionDecision<R> => ({ allowed: false, reason });

/**
 * Buoc chuyen cua mot NGHIA VU THUONG MAI.
 *
 * `CANCELLED` co duong rieng (`cancelOrder`) vi no doi mot ly do bang chu -- ep no qua duong
 * chung se lam mat ly do do, va mot don huy khong ly do la mot don khong giai trinh duoc.
 */
export function evaluateOrderTransition(
  from: OrderStatus,
  to: OrderStatus,
): TransitionDecision<OrderTransitionReason> {
  if (isTerminalOrderStatus(from)) return deny('ORDER_ALREADY_TERMINAL');
  if (from === to) return deny('ORDER_ALREADY_IN_STATE');
  if (to === 'CANCELLED') return deny('ORDER_CANCEL_REQUIRES_DEDICATED_PATH');
  if (!ORDER_EDGES[from].includes(to)) return deny('ORDER_TRANSITION_NOT_PERMITTED');
  return allow('ORDER_TRANSITION_APPLIED');
}

export function evaluateOrderCancel(from: OrderStatus): TransitionDecision<OrderCancelReason> {
  if (from === 'CANCELLED') return deny('ORDER_CANCEL_ALREADY_CANCELLED');
  if (from === 'FULFILLED') return deny('ORDER_CANCEL_ALREADY_FULFILLED');
  return allow('ORDER_CANCEL_RECORDED');
}

export interface RunTransitionContext {
  /** Mot vong chay khong co chang nao thi khong co gi de chay -- chan o buoc vao `ACTIVE`. */
  readonly legCount: number;
}

export function evaluateRunTransition(
  from: VehicleRunStatus,
  to: VehicleRunStatus,
  context: RunTransitionContext,
): TransitionDecision<RunTransitionReason> {
  if (isTerminalRunStatus(from)) return deny('RUN_ALREADY_TERMINAL');
  if (from === to) return deny('RUN_ALREADY_IN_STATE');
  if (to === 'CANCELLED') return deny('RUN_CANCEL_REQUIRES_DEDICATED_PATH');
  if (!RUN_EDGES[from].includes(to)) return deny('RUN_TRANSITION_NOT_PERMITTED');
  if (to === 'ACTIVE' && context.legCount === 0) return deny('RUN_HAS_NO_LEG');
  return allow('RUN_TRANSITION_APPLIED');
}

export function evaluateRunCancel(from: VehicleRunStatus): TransitionDecision<RunCancelReason> {
  if (from === 'CANCELLED') return deny('RUN_CANCEL_ALREADY_CANCELLED');
  if (from === 'COMPLETED') return deny('RUN_CANCEL_ALREADY_COMPLETED');
  return allow('RUN_CANCEL_RECORDED');
}

/* ------------------------------------------------------------------ *
 * MAY TRANG THAI THU BA: CHANG (#276 Lane L)
 * ------------------------------------------------------------------ */

/**
 * ```text
 * PLANNED --> IN_TRANSIT --> COMPLETED
 *    |
 *    +--> CANCELLED
 * ```
 *
 * ============================================================================================
 * VI SAO KHONG CO CANH `PLANNED --> COMPLETED`
 * ============================================================================================
 *
 * Mot chang chua bao gio bat dau ma "hoan thanh" duoc thi `startedAt` se mai mai `null`, va moi
 * phep do thoi gian chay sau nay se phai doan xem cot do vang vi chang khong chay hay vi ai do
 * bam tat. Bat di qua `IN_TRANSIT` la mot lan bam them cho van hanh, doi lai mot cot khong bao gio
 * noi doi.
 *
 * ============================================================================================
 * VI SAO KHONG CO CANH `IN_TRANSIT --> CANCELLED`
 * ============================================================================================
 *
 * Chang da lan banh la mot di chuyen CO THAT. Huy no di se lam quang duong do bien mat khoi moi
 * bao cao — `summariseRunMovement()` khong dem chang huy — tuc bien mot lan bam thanh mot cach
 * xoa km rong. `#276` L3 chi cho phep sua *"future operational legs"*, va mot chang dang chay
 * khong con la tuong lai. Chang do phai duoc DONG LAI voi su that cua no.
 *
 * `COMPLETED` con duoc khoa them mot lan nua o tang kho bang trigger
 * `transport_run_leg_completed_is_immutable` — mot cau `UPDATE` viet tay cung khong doi duoc.
 */
const LEG_EDGES: Readonly<Record<RunLegStatus, readonly RunLegStatus[]>> = {
  PLANNED: ['IN_TRANSIT', 'CANCELLED'],
  IN_TRANSIT: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

export const isTerminalLegStatus = (status: RunLegStatus): boolean =>
  status === 'COMPLETED' || status === 'CANCELLED';

export function evaluateLegTransition(
  from: RunLegStatus,
  to: RunLegStatus,
): TransitionDecision<RunLegTransitionReason> {
  if (isTerminalLegStatus(from)) return deny('LEG_ALREADY_TERMINAL');
  if (from === to) return deny('LEG_ALREADY_IN_STATE');
  if (to === 'CANCELLED') return deny('LEG_CANCEL_REQUIRES_DEDICATED_PATH');
  if (!LEG_EDGES[from].includes(to)) return deny('LEG_TRANSITION_NOT_PERMITTED');
  return allow('LEG_TRANSITION_APPLIED');
}

/**
 * Huy mot chang di duong RIENG, cung ly le voi don va vong chay: no doi mot ly do bang chu.
 *
 * Khac hai duong kia o mot cho — chi `PLANNED` moi huy duoc. Xem khoi chu thich cua `LEG_EDGES`.
 */
export function evaluateLegCancel(from: RunLegStatus): TransitionDecision<RunLegCancelReason> {
  if (from === 'CANCELLED') return deny('LEG_CANCEL_ALREADY_CANCELLED');
  if (from === 'COMPLETED') return deny('LEG_CANCEL_ALREADY_COMPLETED');
  if (from === 'IN_TRANSIT') return deny('LEG_CANCEL_ALREADY_STARTED');
  return allow('LEG_CANCEL_RECORDED');
}
