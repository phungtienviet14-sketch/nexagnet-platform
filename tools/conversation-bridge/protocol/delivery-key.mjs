/**
 * KHOA GIAO — "cung mot y dinh danh thuc" duoc dinh nghia la gi.
 *
 * Dang canonical cua hop dong #204 §6:
 *
 *   conversation-bridge:<repo>:<pr>:<head_sha>
 *
 * Ba dieu deu la co y:
 *
 *   · co `<repo>` — cau noi la mot tien trinh CUC BO tren may nguoi dung, va mot ngay nao do no co
 *     the theo doi nhieu kho. Khoa cua giao thuc (`review-request:<pr>:<head_sha>`) khong co truong
 *     kho, nen PR #7 cua kho A va PR #7 cua kho B se dung chung mot khoa. Do la mot vu MAT tin
 *     nhan im lang, khong phai mot va cham on ao.
 *   · khong co `<issue>` — mot PR co the doi Issue, nhung "danh thuc reviewer cho DUNG commit nay
 *     cua DUNG PR nay" van la cung mot y dinh.
 *   · lay `<pr>:<head_sha>` tu CHINH `idempotencyKeyFor` cua giao thuc chu khong ghep tay, de neu
 *     giao thuc doi dinh nghia "cung mot lan review" thi cau noi doi theo, khong troi mat.
 */
import {
  idempotencyKeyFor,
  MESSAGE_TYPES,
  PROTOCOL_VERSION,
} from '@netviet/autopilot-protocol/validator/index.mjs';
import { createHash } from 'node:crypto';

export const DELIVERY_KEY_NAMESPACE = 'conversation-bridge';

/** `owner/name` — hinh dang kho GitHub. Khong chap nhan URL, khong chap nhan duong dan sau. */
const REPO_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

/**
 * @param {{ repo: string, pr: number, headSha: string }} input
 * @returns {string}
 */
export function deliveryKeyFor({ repo, pr, headSha }) {
  if (typeof repo !== 'string' || !REPO_PATTERN.test(repo)) {
    throw new Error(`Ten kho khong hop le cho khoa giao: ${String(repo)}`);
  }
  const protocolKey = idempotencyKeyFor({
    protocol: PROTOCOL_VERSION,
    type: MESSAGE_TYPES.REVIEW_REQUEST,
    pr,
    head_sha: headSha,
  });
  // `review-request:` la tien to cua giao thuc. Cat no ra roi dat tien to cua cau noi vao, de mot
  // khoa cua cau noi khong bao gio bi nham voi mot khoa cua orchestrator trong log chung.
  const suffix = protocolKey.slice('review-request:'.length);
  return `${DELIVERY_KEY_NAMESPACE}:${repo}:${suffix}`;
}

/**
 * Bam khoa de ghi log. §11 cho phep `idempotency_key_hash`, khong cho phep khoa tho —
 * khoa tho mang so PR + SHA, tuc la mang thong tin ve cong viec chua cong bo.
 * @param {string} key
 */
export const hashDeliveryKey = (key) => createHash('sha256').update(key).digest('hex').slice(0, 16);
