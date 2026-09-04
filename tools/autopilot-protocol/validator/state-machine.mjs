/**
 * May trang thai tho cua mot task. BANG CHUYEN duoi day la toan bo giao thoc: khong co trong
 * bang = khong hop le = tu choi. Khong co "mac dinh cho qua".
 *
 *   (khong co) --TASK_READY--> READY
 *   READY      --BUILD_STARTED--> RUNNING
 *   RUNNING    --BUILD_READY--> CI
 *   CI         --BUILD_READY--> CI            (HEAD moi truoc khi CI ket luan)
 *   CI         --CI_FAIL--> FIXING            (con luot sua; het luot => BLOCKED, xem gates)
 *   CI         --REVIEW_REQUEST--> REVIEWING  (chi khi required CI xanh tren dung HEAD)
 *   FIXING     --BUILD_READY--> CI
 *   REVIEWING  --BUILD_READY--> CI            (commit moi => phan xet cu het hieu luc, CI lai)
 *   REVIEWING  --REVIEW_BLOCK--> FIXING       (con luot sua; het luot => BLOCKED)
 *   REVIEWING  --REVIEW_PASS--> REVIEWING     (ghi phan xet, cho merge)
 *   REVIEWING  --MERGED--> RUNTIME_PROOF      (cong merge: REVIEW_PASS hien hanh + rui ro)
 *   RUNTIME_PROOF --RUNTIME_PROOF--> RUNTIME_PROOF  (ghi bang chung; FAIL => BLOCKED, xem gates)
 *   RUNTIME_PROOF --TASK_DONE--> DONE         (cong dong: proof PASS neu hop dong doi)
 *   <moi trang thai song> --EXCEPTION--> BLOCKED
 *
 * MERGED la su kien, khong phai trang thai. DONE va BLOCKED la trang thai cuoi.
 */
import { EVENTS, STATES, TERMINAL_STATES } from './constants.mjs';
import { REASONS, deny } from './reasons.mjs';

/** Trang thai "khong co task" — chi TASK_READY duoc di tu day. */
export const NO_STATE = null;

const ALL_STATES = /** @type {ReadonlyArray<string>} */ (Object.values(STATES));
const ALL_EVENTS = /** @type {ReadonlyArray<string>} */ (Object.values(EVENTS));
const ACTIVE_STATES = ALL_STATES.filter((s) => !TERMINAL_STATES.includes(s));

/** @type {ReadonlyArray<{ from: string | null, event: string, to: string }>} */
export const TRANSITIONS = Object.freeze([
  { from: NO_STATE, event: EVENTS.TASK_READY, to: STATES.READY },
  { from: STATES.READY, event: EVENTS.BUILD_STARTED, to: STATES.RUNNING },
  { from: STATES.RUNNING, event: EVENTS.BUILD_READY, to: STATES.CI },
  { from: STATES.CI, event: EVENTS.BUILD_READY, to: STATES.CI },
  { from: STATES.CI, event: EVENTS.CI_FAIL, to: STATES.FIXING },
  { from: STATES.CI, event: EVENTS.REVIEW_REQUEST, to: STATES.REVIEWING },
  { from: STATES.FIXING, event: EVENTS.BUILD_READY, to: STATES.CI },
  { from: STATES.REVIEWING, event: EVENTS.BUILD_READY, to: STATES.CI },
  { from: STATES.REVIEWING, event: EVENTS.REVIEW_BLOCK, to: STATES.FIXING },
  { from: STATES.REVIEWING, event: EVENTS.REVIEW_PASS, to: STATES.REVIEWING },
  { from: STATES.REVIEWING, event: EVENTS.MERGED, to: STATES.RUNTIME_PROOF },
  { from: STATES.RUNTIME_PROOF, event: EVENTS.RUNTIME_PROOF, to: STATES.RUNTIME_PROOF },
  { from: STATES.RUNTIME_PROOF, event: EVENTS.TASK_DONE, to: STATES.DONE },
  ...ACTIVE_STATES.map((from) => ({ from, event: EVENTS.EXCEPTION, to: STATES.BLOCKED })),
]);

/** @param {unknown} state */
export const isTerminal = (state) => TERMINAL_STATES.includes(/** @type {string} */ (state));

/**
 * Tra trang thai ke tiep, hoac tu choi co ma. THUAN — khong dung den cong nghiep vu (gates.mjs).
 * @param {string | null} from
 * @param {string} event
 * @returns {{ ok: true, to: string } | import('./reasons.mjs').Denied}
 */
export function nextState(from, event) {
  if (from !== NO_STATE && !ALL_STATES.includes(from)) return deny(REASONS.UNKNOWN_STATE, { from });
  if (!ALL_EVENTS.includes(event)) return deny(REASONS.UNKNOWN_EVENT, { event });
  if (isTerminal(from)) return deny(REASONS.TERMINAL_STATE, { from, event });
  const hit = TRANSITIONS.find((t) => t.from === from && t.event === event);
  if (!hit) return deny(REASONS.ILLEGAL_TRANSITION, { from, event });
  return { ok: true, to: hit.to };
}

/** Moi su kien hop le tu mot trang thai — de tai lieu va test tinh day du cua bang. */
export const legalEventsFrom = (/** @type {string | null} */ from) =>
  TRANSITIONS.filter((t) => t.from === from).map((t) => t.event);
