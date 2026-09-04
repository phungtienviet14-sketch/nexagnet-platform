/**
 * Khoa idempotency — cung mot y dinh phat hai lan thi hanh dong chi xay ra MOT lan.
 *
 * Nam khoa dau la khoa BAT BUOC cua hop dong #153, giu nguyen tung ky tu. Ba khoa sau la phan
 * mo rong V0 de moi loai thong diep deu co khoa (khong co loai nao "phat bao nhieu lan cung duoc").
 *
 *   build:<issue>
 *   review-request:<pr>:<head_sha>
 *   review-verdict:<pr>:<head_sha>:<verdict>
 *   runtime:<release_sha>:<env>
 *   done:<issue>:<merge_sha>
 *   task-ready:<issue>
 *   build-ready:<pr>:<head_sha>
 *   ci-fail:<pr>:<head_sha>:<ci_run>
 */
import { MESSAGE_TYPES } from './constants.mjs';

/** @type {Record<string, (m: Record<string, unknown>) => string>} */
const KEY_BUILDERS = Object.freeze({
  [MESSAGE_TYPES.TASK_READY]: (m) => `task-ready:${m.issue}`,
  [MESSAGE_TYPES.BUILD_STARTED]: (m) => `build:${m.issue}`,
  [MESSAGE_TYPES.BUILD_READY]: (m) => `build-ready:${m.pr}:${m.head_sha}`,
  [MESSAGE_TYPES.CI_FAIL]: (m) => `ci-fail:${m.pr}:${m.head_sha}:${m.ci_run}`,
  [MESSAGE_TYPES.REVIEW_REQUEST]: (m) => `review-request:${m.pr}:${m.head_sha}`,
  [MESSAGE_TYPES.REVIEW_PASS]: (m) => `review-verdict:${m.pr}:${m.head_sha}:${m.type}`,
  [MESSAGE_TYPES.REVIEW_BLOCK]: (m) => `review-verdict:${m.pr}:${m.head_sha}:${m.type}`,
  [MESSAGE_TYPES.RUNTIME_PROOF]: (m) => `runtime:${m.release_sha}:${m.env}`,
  [MESSAGE_TYPES.TASK_DONE]: (m) => `done:${m.issue}:${m.merge_sha}`,
});

/**
 * Khoa cua mot thong diep DA QUA schema. Goi tren thong diep chua kiem la loi lap trinh.
 * @param {Record<string, unknown>} message
 */
export function idempotencyKeyFor(message) {
  const build = KEY_BUILDERS[/** @type {string} */ (message.type)];
  if (!build)
    throw new Error(`Khong co khoa idempotency cho loai thong diep: ${String(message.type)}`);
  return build(message);
}

/**
 * So khoa da thay. BAT BIEN: claimKey tra ve so moi, khong sua so cu.
 * @typedef {{ readonly keys: ReadonlyArray<string> }} IdempotencyLedger
 */

/** @returns {IdempotencyLedger} */
export const createLedger = () => Object.freeze({ keys: Object.freeze([]) });

/**
 * @param {IdempotencyLedger} ledger
 * @param {string} key
 * @returns {{ ledger: IdempotencyLedger, duplicate: boolean }}
 */
export function claimKey(ledger, key) {
  if (ledger.keys.includes(key)) return { ledger, duplicate: true };
  return {
    ledger: Object.freeze({ keys: Object.freeze([...ledger.keys, key]) }),
    duplicate: false,
  };
}
