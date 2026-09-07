import type {
  OrderCancelReason,
  OrderTransitionReason,
  RunCancelReason,
  RunTransitionReason,
} from './movement-decisions.js';
import type { OrderStatus, VehicleRunStatus } from './movement.types.js';

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
