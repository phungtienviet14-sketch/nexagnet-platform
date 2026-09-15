/**
 * DOC carrier REVIEW_REQUEST — bang CHINH validator cua Giao thuc V0, khong phai mot ban regex thu hai.
 *
 * Hop dong #204 §2.5 va §17.8 doi hoi dung cho nay: neu cau noi tu tach `HEAD_SHA=` bang regex thi
 * repo co HAI ngu phap carrier, va chung se troi khoi nhau — im lang, theo dung kieu ma khong cong
 * nao bat duoc. Nen o day chi lam DUNG hai viec ma giao thuc khong lam:
 *
 *   1. THU HEP ve dung mot loai: cau noi chi thuc day REVIEW_REQUEST. Mot REVIEW_PASS hop le
 *      cung bi tu choi o day — hop le khong co nghia la "danh cho cau noi nay".
 *   2. DICH ma tu choi cua giao thuc sang tu vung trang thai cua cau noi (`states.mjs`), giu ma
 *      goc trong `detail.protocolReason` de van lan nguoc ve duoc.
 *
 * KHONG lam o day: doc than comment, giu lai van ban tu do, hay mang bat ky truong nao ngoai bon
 * truong may doc sang buoc sau. Xem `wake-message.mjs` — do la noi bat bien do duoc cuong che.
 */
import { MESSAGE_TYPES, readMessage } from '@netviet/autopilot-protocol/validator/index.mjs';
import { BRIDGE_REASONS, rejected } from '../extension/shared/states.js';

/**
 * @typedef {object} ReviewRequestCarrier
 * @property {number} issue
 * @property {number} pr
 * @property {string} headSha  40 hex chu thuong — schema cua giao thuc da ep, khong kiem lai bang tay.
 * @property {number} ciRun
 * @property {string} risk     LOW | MEDIUM | HIGH
 */

/**
 * @param {string} text Than mot comment GitHub. KHONG TIN CAY.
 * @returns {{ ok: true, carrier: ReviewRequestCarrier } | import('../extension/shared/states.js').Rejection}
 */
export function readReviewRequestCarrier(text) {
  const read = readMessage(text);
  if (!read.ok) {
    return rejected(BRIDGE_REASONS.PROTOCOL_REJECTED, { protocolReason: read.reason });
  }
  const message = read.message;
  if (message.type !== MESSAGE_TYPES.REVIEW_REQUEST) {
    return rejected(BRIDGE_REASONS.WRONG_MESSAGE_TYPE, { type: String(message.type) });
  }
  // Ep kieu tai day la AN TOAN chu khong phai la mot loi hua: `readMessage` da cho payload di qua
  // `review-request.schema.json`, ma schema do khai `required` du bon truong nay va
  // `additionalProperties: false`. Khong con hinh dang nao khac lot toi day duoc.
  return {
    ok: true,
    carrier: Object.freeze({
      issue: /** @type {number} */ (message.issue),
      pr: /** @type {number} */ (message.pr),
      headSha: /** @type {string} */ (message.head_sha),
      ciRun: /** @type {number} */ (message.ci_run),
      risk: /** @type {string} */ (message.risk),
    }),
  };
}
