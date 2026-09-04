/**
 * BA TRIGGER CUA HOP DONG #165 -> MOT MUC TIEU DUY NHAT.
 *
 * Hop dong khai ba su kien: `issue_comment`, `pull_request`, `check_suite`. Chung KHONG phai ba
 * duong xu ly khac nhau — chung la BA CACH mot bo dieu kien tro nen day du, va sau do di chung
 * dung mot loi quyet dinh (`decide.mjs`).
 *
 *   thong diep BUILD_READY den sau cung  -> `issue_comment` la cai kich hoat
 *   CI xong sau cung                     -> `check_suite` la cai kich hoat
 *   HEAD dung yen sau cung (mo lai PR)   -> `pull_request` la cai kich hoat
 *
 * Khac biet DUY NHAT giua ba duong nam o day: `issue_comment` mang thong diep NGAY TRONG payload,
 * hai su kien kia thi khong — chung chi noi "dieu kien vua doi", con thong diep phai TRA CUU tu
 * danh sach comment cua PR (`inbox.mjs`).
 *
 * Su khac biet do co hau qua ve NGU NGHIA, khong chi ve ky thuat:
 *
 *   - Mot thong diep VUA DEN thi duoc PHAN XET: hong thi tu choi va dang ly do ra.
 *   - Mot thong diep TRA CUU DUOC thi chi duoc DUNG khi no buoc vao HEAD hien tai. Khong ai vua
 *     phat no ca, nen bat mot comment cu ra tu choi lai la tu san sinh tieng on.
 *
 * Tep nay THUAN: nhan payload da doc, tra ve mo ta muc tieu. Khong goi mang.
 */
import { ORCHESTRATOR_REASONS } from './reasons.mjs';

/** Ba su kien hop dong #165 khai. Bat ky ten khac deu di ra duong STOP. */
export const EVENT_NAMES = Object.freeze({
  ISSUE_COMMENT: 'issue_comment',
  PULL_REQUEST: 'pull_request',
  CHECK_SUITE: 'check_suite',
});

/**
 * Ba ket cuc, va chung KHAC NHAU ve hau qua:
 *
 *   TARGET — co viec de lam.
 *   STOP   — khong phai viec cua orchestrator. Job XANH. Bo qua khong phai loi.
 *   ABORT  — su kien co hinh dang cua loai da khai nhung hong. Job DO. Khong duoc doan tiep.
 */
export const RESOLUTIONS = Object.freeze({
  TARGET: 'TARGET',
  STOP: 'STOP',
  ABORT: 'ABORT',
});

/** `pull_request` chi duoc xu ly o ba action nay — ba luc HEAD hoac su ton tai cua PR vua doi. */
const PULL_REQUEST_ACTIONS = Object.freeze(['opened', 'reopened', 'synchronize']);

/**
 * @typedef {object} EventTarget
 * @property {string} trigger Ten su kien GitHub da kich hoat lan chay nay.
 * @property {number} pr So PR se lam viec tren do.
 * @property {Record<string, unknown> | null} inbandComment Thong diep di KEM su kien, neu co.
 *   `null` nghia la phai tra cuu — va khi do ap dung luat "chi dung neu buoc vao HEAD".
 * @property {string | null} claimedHeadSha HEAD ma su kien NOI toi. Khong phai bang chung: HEAD
 *   that van doc doc lap tu `/pulls/{n}`. Dung de phat hien su kien den muon (`check_suite` cua
 *   mot HEAD da bi day qua).
 */

/**
 * @typedef {object} Resolution
 * @property {string} resolution
 * @property {string | null} reason
 * @property {Record<string, unknown>} detail
 * @property {EventTarget | null} target
 */

/**
 * @param {string} reason
 * @param {Record<string, unknown>} [detail]
 * @returns {Resolution}
 */
const stop = (reason, detail) => ({
  resolution: RESOLUTIONS.STOP,
  reason,
  detail: detail ?? {},
  target: null,
});

/**
 * @param {string} reason
 * @param {Record<string, unknown>} [detail]
 * @returns {Resolution}
 */
const abort = (reason, detail) => ({
  resolution: RESOLUTIONS.ABORT,
  reason,
  detail: detail ?? {},
  target: null,
});

/**
 * @param {EventTarget} value
 * @returns {Resolution}
 */
const found = (value) => ({
  resolution: RESOLUTIONS.TARGET,
  reason: null,
  detail: {},
  target: value,
});

/** @param {unknown} value */
const asPrNumber = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/**
 * @param {string} trigger
 * @param {Record<string, any>} payload
 * @returns {Resolution}
 */
function fromIssueComment(trigger, payload) {
  const comment = payload?.comment;
  const issueLike = payload?.issue;
  if (!comment || !issueLike) return abort(ORCHESTRATOR_REASONS.EVENT_SHAPE_UNKNOWN, { trigger });
  // Comment tren Issue thuong khong co HEAD de buoc bang chung vao — khong phai loi, chi la khong
  // xu ly duoc.
  if (!issueLike.pull_request) return stop(ORCHESTRATOR_REASONS.EVENT_NOT_HANDLED, { on: 'issue' });
  const pr = asPrNumber(issueLike.number);
  if (pr === null) {
    return abort(ORCHESTRATOR_REASONS.EVENT_TARGET_UNRESOLVED, {
      trigger,
      received: issueLike.number ?? null,
    });
  }
  return found({ trigger, pr, inbandComment: comment, claimedHeadSha: null });
}

/**
 * @param {string} trigger
 * @param {Record<string, any>} payload
 * @returns {Resolution}
 */
function fromPullRequest(trigger, payload) {
  const pull = payload?.pull_request;
  if (!pull) return abort(ORCHESTRATOR_REASONS.EVENT_SHAPE_UNKNOWN, { trigger });
  // Loc lai trong MA, khong chi trong `on:` cua workflow: mot lan noi long bo loc YAML khong duoc
  // lang le mo them duong xu ly.
  const action = String(payload.action ?? '');
  if (!PULL_REQUEST_ACTIONS.includes(action)) {
    return stop(ORCHESTRATOR_REASONS.EVENT_NOT_HANDLED, { trigger, action });
  }
  const pr = asPrNumber(pull.number);
  if (pr === null) {
    return abort(ORCHESTRATOR_REASONS.EVENT_TARGET_UNRESOLVED, {
      trigger,
      received: pull.number ?? null,
    });
  }
  const claimed = pull.head?.sha;
  return found({
    trigger,
    pr,
    inbandComment: null,
    claimedHeadSha: typeof claimed === 'string' ? claimed : null,
  });
}

/**
 * @param {string} trigger
 * @param {Record<string, any>} payload
 * @returns {Resolution}
 */
function fromCheckSuite(trigger, payload) {
  const suite = payload?.check_suite;
  if (!suite) return abort(ORCHESTRATOR_REASONS.EVENT_SHAPE_UNKNOWN, { trigger });
  if (String(payload.action ?? '') !== 'completed') {
    return stop(ORCHESTRATOR_REASONS.EVENT_NOT_HANDLED, { trigger, action: payload.action ?? null });
  }
  const pulls = Array.isArray(suite.pull_requests) ? suite.pull_requests : [];
  // Mot check-suite cua push thang len `main` khong buoc vao PR nao. Do la truong hop THUONG,
  // khong phai loi.
  if (pulls.length === 0) {
    return stop(ORCHESTRATOR_REASONS.EVENT_NOT_HANDLED, { trigger, pullRequests: 0 });
  }
  // Nhieu PR cung mot HEAD la hinh dang HOP LE cua GitHub, khong phai payload hong. Nhung chon
  // dai cai dau tien la DOAN — va V0 read-only thi tu choi, khong doan.
  if (pulls.length > 1) {
    return stop(ORCHESTRATOR_REASONS.EVENT_TARGET_UNRESOLVED, {
      trigger,
      pullRequests: pulls.map((/** @type {{ number?: unknown }} */ entry) => entry?.number ?? null),
    });
  }
  const pr = asPrNumber(pulls[0]?.number);
  if (pr === null) {
    return abort(ORCHESTRATOR_REASONS.EVENT_TARGET_UNRESOLVED, {
      trigger,
      received: pulls[0]?.number ?? null,
    });
  }
  const claimed = suite.head_sha;
  return found({
    trigger,
    pr,
    inbandComment: null,
    claimedHeadSha: typeof claimed === 'string' ? claimed : null,
  });
}

/**
 * Su kien GitHub -> muc tieu, hoac mot ly do CO MA de dung.
 *
 * @param {object} input
 * @param {string | undefined} input.eventName Gia tri `GITHUB_EVENT_NAME`.
 * @param {unknown} input.payload Than webhook da doc tu `GITHUB_EVENT_PATH`.
 * @returns {Resolution}
 */
export function resolveEventTarget({ eventName, payload }) {
  const body = /** @type {Record<string, any>} */ (
    payload !== null && typeof payload === 'object' ? payload : {}
  );
  switch (eventName) {
    case EVENT_NAMES.ISSUE_COMMENT:
      return fromIssueComment(eventName, body);
    case EVENT_NAMES.PULL_REQUEST:
      return fromPullRequest(eventName, body);
    case EVENT_NAMES.CHECK_SUITE:
      return fromCheckSuite(eventName, body);
    default:
      return stop(ORCHESTRATOR_REASONS.EVENT_NOT_HANDLED, { trigger: eventName ?? null });
  }
}
