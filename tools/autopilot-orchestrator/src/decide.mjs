/**
 * QUYET DINH THUAN: mot su kien GitHub + bang chung da lay => mo ta viec phai lam.
 *
 * Tep nay khong goi mang va khong ghi gi. `main.mjs` moi la cho thuc hien. Tach nhu vay vi mot
 * orchestrator "read-only" ma tron quyet dinh voi thao tac thi khong ai kiem duoc rang no read-only.
 *
 * V0 chi xu ly MOT duong: `BUILD_READY` -> cong CI -> `CI_FAIL` hoac `REVIEW_REQUEST`. Dung dung
 * pham vi §17 cua tai lieu canonical. Moi thong diep hop le khac duoc ghi nhan roi bo qua, khong
 * bi coi la loi.
 */
import {
  MESSAGE_TYPES,
  PROTOCOL_VERSION,
  REASONS,
  STATES,
  STATE_LABELS,
  authorizeProducer,
  evaluateCiGreen,
  formatMessage,
  idempotencyKeyFor,
  principalFromGithubEvent,
  readMessage,
} from '@netviet/autopilot-protocol/validator/index.mjs';

import { ORCHESTRATOR_REASONS } from './reasons.mjs';

/** Viec orchestrator duoc phep lam. `IGNORE` khong ghi gi ca. */
export const ACTIONS = Object.freeze({
  IGNORE: 'IGNORE',
  POST_CI_FAIL: 'POST_CI_FAIL',
  POST_REVIEW_REQUEST: 'POST_REVIEW_REQUEST',
  POST_REJECTION: 'POST_REJECTION',
});

/** Marker rieng cua tang orchestrator — khong phai mot loai thong diep cua giao thuc. */
export const ORCHESTRATOR_MARKER = 'AUTOPILOT_ORCHESTRATOR_V0';

const MARKER_LINE = /^\s*<!--\s*[A-Z0-9_]+_V0\s*-->/;

/** Moi nhan trang thai — go het truoc khi dat cai dung, de mot task chi mang dung mot nhan. */
const ALL_STATE_LABELS = Object.freeze(Object.values(STATE_LABELS));

const noLabels = () => ({
  add: /** @type {string[]} */ ([]),
  remove: /** @type {string[]} */ ([]),
});

/**
 * @param {string} reason
 * @param {Record<string, unknown>} [detail]
 */
const ignore = (reason, detail) => ({
  action: ACTIONS.IGNORE,
  reason,
  detail: detail ?? {},
  body: /** @type {string | null} */ (null),
  labels: noLabels(),
  idempotencyKey: /** @type {string | null} */ (null),
});

/**
 * Mot tu choi duoc DANG RA, khong im lang. Ly do luon la MOT MA, khong phai cau van tu do — de
 * loc duoc, va de hai nguoi khong viet hai cau khac nhau cho cung mot duong.
 *
 * @param {string} reason
 * @param {Record<string, unknown>} detail
 */
function rejection(reason, detail) {
  const lines = [
    `<!-- ${ORCHESTRATOR_MARKER} -->`,
    'ORCHESTRATOR_REJECTED',
    `REASON=${reason}`,
    ...Object.entries(detail).map(([key, value]) => `${key.toUpperCase()}=${String(value)}`),
  ];
  return {
    action: ACTIONS.POST_REJECTION,
    reason,
    detail,
    body: /** @type {string | null} */ (lines.join('\n')),
    labels: noLabels(),
    idempotencyKey: /** @type {string | null} */ (null),
  };
}

/**
 * @typedef {object} CommentEvent
 * @property {{ login?: string }} [user]
 * @property {{ slug?: string } | null} [performed_via_github_app]
 * @property {string} [body]
 */

/**
 * @typedef {object} Evidence
 * @property {string} headSha HEAD hien tai cua PR, lay tu API.
 * @property {Array<{ name: string, conclusion: string | null, head_sha: string }>} checkRuns
 * @property {string[]} requiredChecks
 * @property {number} ciRunId Lan chay CI tren dung HEAD do — BANG CHUNG, khong phai loi khai.
 *   Ca `CI_FAIL` lan `REVIEW_REQUEST` deu BAT BUOC truong nay trong schema.
 */

/**
 * @param {Record<string, unknown>} message
 * @returns {string}
 */
const renderMessage = (message) => formatMessage({ protocol: PROTOCOL_VERSION, ...message });

/**
 * @param {object} input
 * @param {CommentEvent} input.comment Payload comment tu webhook.
 * @param {Evidence} input.evidence
 * @param {never} [input.registry] `PrincipalRegistry` da dung xong.
 * @param {number} input.issue So Issue mang hop dong.
 * @param {number} input.pr So PR.
 * @param {string} input.risk Lop rui ro LAY TU HOP DONG TASK trong than Issue — khong phai do
 *   orchestrator dat. `REVIEW_REQUEST` bat buoc truong nay, va no quyet dinh cong merge sau nay.
 */
export function decideOnComment({ comment, evidence, registry, issue, pr, risk }) {
  const body = typeof comment?.body === 'string' ? comment.body : '';
  const parsed = readMessage(body);
  if (!parsed.ok) {
    // Mot comment nguoi thuong khong phai loi. Nhung mot comment CO marker ma hong thi phai bao —
    // do dung la truong hop `REVIEW_PASS` cua PR #155 (thua dong `REVIEWER=chatgpt`).
    if (!MARKER_LINE.test(body)) return ignore(ORCHESTRATOR_REASONS.NOT_A_PROTOCOL_MESSAGE);
    return rejection(parsed.reason, { source: 'message' });
  }

  const message = /** @type {Record<string, unknown>} */ (parsed.message);
  const type = /** @type {string} */ (message.type);
  const principal = principalFromGithubEvent(comment);
  if (!principal) return rejection(REASONS.PRINCIPAL_UNKNOWN, { type });

  const authorized = authorizeProducer({ principal, registry, type });
  if (!authorized.ok) {
    return rejection(authorized.reason, {
      type,
      principal: `${principal.kind}:${principal.id}`,
    });
  }

  if (type !== MESSAGE_TYPES.BUILD_READY) {
    return ignore(ORCHESTRATOR_REASONS.EVENT_NOT_HANDLED, { type });
  }
  if (message.issue !== issue || message.pr !== pr) {
    return rejection(message.issue !== issue ? REASONS.ISSUE_MISMATCH : REASONS.PR_MISMATCH, {
      claimed_issue: message.issue,
      claimed_pr: message.pr,
      actual_issue: issue,
      actual_pr: pr,
    });
  }

  // CONG EXACT-SHA. Thong diep KHAI mot HEAD; `evidence.headSha` doc doc lap tu API. Chi khi hai
  // cai do gap nhau thi loi khai bao moi co nghia.
  if (message.head_sha !== evidence.headSha) {
    return rejection(REASONS.HEAD_MISMATCH, {
      claimed: message.head_sha,
      actual: evidence.headSha,
    });
  }

  const green = evaluateCiGreen({
    headSha: evidence.headSha,
    checkRuns: evidence.checkRuns,
    requiredChecks: evidence.requiredChecks,
  });

  const outgoingType = green.ok ? MESSAGE_TYPES.REVIEW_REQUEST : MESSAGE_TYPES.CI_FAIL;
  const idempotencyKey = idempotencyKeyFor({
    type: outgoingType,
    pr,
    head_sha: evidence.headSha,
  });

  if (!green.ok) {
    // Schema `CI_FAIL` la `additionalProperties: false` va KHONG co truong `reason`. Ma ly do di
    // vao log cua orchestrator; thu di vao comment la ten cac check do — dung truong ma schema
    // khai (`failed_checks`), chu khong phai mot truong tu nghi ra.
    const detail = /** @type {{ missing?: string[], notGreen?: string[] }} */ (green.detail ?? {});
    const failed = detail.missing ?? detail.notGreen ?? [];
    return {
      action: ACTIONS.POST_CI_FAIL,
      reason: green.reason,
      detail: green.detail ?? {},
      body: /** @type {string | null} */ (
        renderMessage({
          marker: 'AUTOPILOT_CI_FAIL_V0',
          type: MESSAGE_TYPES.CI_FAIL,
          issue,
          pr,
          head_sha: evidence.headSha,
          ci_run: evidence.ciRunId,
          ...(failed.length > 0 ? { failed_checks: failed } : {}),
        })
      ),
      labels: { add: [STATE_LABELS[STATES.CI]], remove: [...ALL_STATE_LABELS] },
      idempotencyKey,
    };
  }

  return {
    action: ACTIONS.POST_REVIEW_REQUEST,
    reason: 'CI_GREEN',
    detail: { requiredChecks: evidence.requiredChecks },
    body: /** @type {string | null} */ (
      renderMessage({
        marker: 'AUTOPILOT_REVIEW_REQUEST_V0',
        type: MESSAGE_TYPES.REVIEW_REQUEST,
        issue,
        pr,
        head_sha: evidence.headSha,
        ci_run: evidence.ciRunId,
        risk,
      })
    ),
    labels: { add: [STATE_LABELS[STATES.REVIEWING]], remove: [...ALL_STATE_LABELS] },
    idempotencyKey,
  };
}
