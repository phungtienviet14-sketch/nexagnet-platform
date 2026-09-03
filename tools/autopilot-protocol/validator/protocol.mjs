/**
 * BO GIAM (reducer) cua giao thuc: (task, thong diep, bang chung) -> task moi hoac tu choi co ma.
 *
 * Day la thu orchestrator (task sau) se goi. No KHONG goi GitHub; moi bang chung (check-run,
 * nguoi da duyet) di vao qua `context`. Khong co bang chung = khong mo cong (fail closed).
 *
 * Thu tu kiem cho MOI thong diep, co chu dich:
 *   1. schema            (hinh dang)
 *   2. dung issue        (thong diep cua task khac thi khong dung o day)
 *   3. dung nguoi phat   (actor BAT BUOC; khong biet ai phat => tu choi)
 *   4. idempotency       (da thay khoa nay => khong lam gi, ke ca khi trang thai cho phep)
 *   5. may trang thai    (co trong bang chuyen khong)
 *   6. cong nghiep vu    (SHA/CI/rui ro/retry/runtime)
 * Chi khi qua ca 6 thi khoa moi duoc ghi va trang thai moi doi. Task cu KHONG bao gio bi sua.
 */
import { EVENTS, MESSAGE_PRODUCERS, MESSAGE_TYPES, RETRY_CEILINGS, STATES } from './constants.mjs';
import {
  evaluateMergeGate,
  evaluateRetry,
  evaluateReviewRequestGate,
  evaluateReviewVerdict,
  evaluateTaskDoneGate,
} from './gates.mjs';
import { claimKey, createLedger, idempotencyKeyFor } from './idempotency.mjs';
import { REASONS, deny } from './reasons.mjs';
import { validateMessagePayload } from './schemas.mjs';
import { NO_STATE, nextState } from './state-machine.mjs';

/**
 * @typedef {object} Task
 * @property {number} issue
 * @property {string} taskId
 * @property {string} risk
 * @property {boolean} humanGate
 * @property {{ required: boolean, env?: string, checks?: string[] }} runtimeProof
 * @property {string | null} state
 * @property {string | null} branch
 * @property {string | null} baseSha
 * @property {number | null} pr
 * @property {string | null} headSha
 * @property {string | null} mergeSha
 * @property {number} ciFixAttempts
 * @property {number} reviewFixAttempts
 * @property {number} headRevisions
 * @property {ReadonlyArray<Record<string, unknown>>} verdicts
 * @property {ReadonlyArray<Record<string, unknown>>} proofs
 * @property {import('./idempotency.mjs').IdempotencyLedger} ledger
 * @property {ReadonlyArray<Record<string, unknown>>} history
 * @property {Record<string, unknown> | null} blockedBy
 *
 * @typedef {{ checkRuns?: import('./gates.mjs').CheckRun[], requiredChecks?: string[], humanApproval?: { head_sha: string } | null, actor: string }} Context
 * @typedef {{ humanApproval?: { head_sha: string } | null }} MergeContext
 *   `MERGED` la su kien cua GitHub, khong phai thong diep ai do phat, nen no khong co `actor`:
 *   bang chung cua no la nguoi da duyet (`humanApproval`), khong phai `MESSAGE_PRODUCERS`.
 * @typedef {{ ok: true, task: Task, from: string | null, to: string, event: string, note?: Record<string, unknown> }} Accepted
 * @typedef {{ ok: false, reason: string, detail?: Record<string, unknown>, task: Task }} Rejected
 * @typedef {{ ok: true, patch: Partial<Task>, blocked?: Record<string, unknown> } | import('./reasons.mjs').Denied} GateOutcome
 */

/**
 * Tao task tu mot hop dong DA QUA validateTaskContract.
 * @param {{ issue: number, contract: import('./task-contract.mjs').TaskContract }} input
 * @returns {Task}
 */
export function createTask({ issue, contract }) {
  return Object.freeze({
    issue,
    taskId: contract.task_id,
    risk: contract.risk,
    humanGate: contract.human_gate,
    runtimeProof: Object.freeze({ ...contract.runtime_proof }),
    state: NO_STATE,
    branch: null,
    baseSha: null,
    pr: null,
    headSha: null,
    mergeSha: null,
    ciFixAttempts: 0,
    reviewFixAttempts: 0,
    headRevisions: 0,
    verdicts: Object.freeze([]),
    proofs: Object.freeze([]),
    ledger: createLedger(),
    history: Object.freeze([]),
    blockedBy: null,
  });
}

/**
 * @param {Task} task
 * @param {string} reason
 * @param {Record<string, unknown>} [detail]
 * @returns {Rejected}
 */
const reject = (task, reason, detail) => ({ ...deny(reason, detail), task });

/**
 * @param {Task} task
 * @param {Partial<Task>} patch
 * @param {{ from: string | null, to: string, event: string, note?: Record<string, unknown> }} step
 * @returns {Accepted}
 */
function accept(task, patch, step) {
  const entry = Object.freeze({
    from: step.from,
    to: step.to,
    event: step.event,
    ...(step.note ? { note: step.note } : {}),
  });
  const next = Object.freeze({
    ...task,
    ...patch,
    state: step.to,
    history: Object.freeze([...task.history, entry]),
  });
  return { ok: true, task: next, ...step };
}

/**
 * Vao BLOCKED tu mot su kien HOP LE ma cong dong lai (tran retry, proof FAIL).
 * @param {string} reason
 * @param {Record<string, unknown>} [detail]
 */
const blockedBy = (reason, detail) => Object.freeze({ reason, ...(detail ? { detail } : {}) });

/**
 * @param {Task} task
 * @param {Record<string, unknown>} m
 * @returns {import('./reasons.mjs').Ok | import('./reasons.mjs').Denied}
 */
function checkPrBinding(task, m) {
  if (task.pr === null) return deny(REASONS.NO_PR_BOUND);
  if (m.pr !== task.pr) return deny(REASONS.PR_MISMATCH, { claimed: m.pr, bound: task.pr });
  return { ok: true };
}

/**
 * Mot thong diep trung khoa nhung MAU THUAN voi bang chung da ghi. Chi RUNTIME_PROOF roi vao
 * truong hop nay: khoa cua no khong mang phan xet, nen PASS roi FAIL (hay nguoc lai) tren cung
 * release+env deu ra cung mot khoa. Cac loai khac co phan xet ngay trong khoa nen trung khoa la
 * trung y dinh — mot ban phat lai that.
 * @param {Task} task
 * @param {Record<string, unknown>} m
 * @returns {Record<string, unknown> | null}
 */
function conflictingEvidence(task, m) {
  if (m.type !== MESSAGE_TYPES.RUNTIME_PROOF) return null;
  const recorded = task.proofs.filter((p) => p.release_sha === m.release_sha && p.env === m.env);
  const previous = recorded.at(-1);
  if (!previous || previous.verdict === m.verdict) return null;
  return blockedBy(REASONS.CONFLICTING_RUNTIME_EVIDENCE, {
    release_sha: m.release_sha,
    env: m.env,
    recorded: previous.verdict,
    claimed: m.verdict,
  });
}

/**
 * Ap mot thong diep giao thuc (9 loai) len task.
 *
 * `context.actor` la BAT BUOC. Ban truoc chi kiem `MESSAGE_PRODUCERS` khi actor duoc dua vao, nen
 * mot orchestrator quen dua danh tinh nguoi phat se lam CA TANG phan quyen bien mat MA KHONG KEU:
 * "khong biet ai phat" thanh "ai phat cung duoc" — fail-open ngay tai bien cua he thong. Khong biet
 * ai phat la mot LY DO TU CHOI (`PRODUCER_UNKNOWN`), khong phai mot truong hop duoc mien kiem.
 * Muon go thong diep tu GitHub thi lay danh tinh cung luc: `comment.user.login`/`app.slug` la thu
 * di kem thong diep, khong phai thu tuy chon.
 * @param {Task} task
 * @param {Record<string, unknown>} message
 * @param {Context} context
 * @returns {Accepted | Rejected}
 */
export function applyMessage(task, message, context = /** @type {Context} */ ({})) {
  const type = /** @type {string} */ (message.type);
  const shape = validateMessagePayload(type, message);
  if (!shape.ok) return reject(task, shape.reason, shape.detail);
  if (message.issue !== task.issue) {
    return reject(task, REASONS.ISSUE_MISMATCH, { claimed: message.issue, task: task.issue });
  }
  if (typeof context.actor !== 'string' || context.actor.length === 0) {
    return reject(task, REASONS.PRODUCER_UNKNOWN, { type, allowed: MESSAGE_PRODUCERS[type] });
  }
  if (!MESSAGE_PRODUCERS[type]?.includes(context.actor)) {
    return reject(task, REASONS.WRONG_PRODUCER, {
      type,
      actor: context.actor,
      allowed: MESSAGE_PRODUCERS[type],
    });
  }
  const key = idempotencyKeyFor(message);
  const claimed = claimKey(task.ledger, key);
  if (claimed.duplicate) {
    // Mot khoa da thay KHONG duong nhien la mot ban phat lai. Khoa runtime cua hop dong
    // (`runtime:<release>:<env>`) khong mang phan xet, nen mot RUNTIME_PROOF FAIL den SAU mot
    // PASS cua cung release+env se roi vao day. Bo qua no la VUT BANG CHUNG AM: do duoc
    // 03/09/2026 — FAIL bi tu choi DUPLICATE roi task van dong DONE tren bang chung cu.
    // Bang chung mau thuan la mot ngoai le, khong phai mot ban sao.
    const conflict = conflictingEvidence(task, message);
    if (!conflict) return reject(task, REASONS.DUPLICATE_MESSAGE, { key });
    // Mau thuan van phai la mot su kien HOP LE o trang thai hien tai. Thieu buoc nay thi mot
    // task da DONE/BLOCKED lai bi mo ra de dong lan nua.
    const legal = nextState(task.state, type);
    if (!legal.ok) return reject(task, legal.reason, legal.detail);
    return accept(
      task,
      { blockedBy: conflict },
      { from: task.state, to: STATES.BLOCKED, event: type, note: conflict },
    );
  }
  const step = nextState(task.state, type);
  if (!step.ok) return reject(task, step.reason, step.detail);
  const outcome = applyGates(task, message, context);
  if (!outcome.ok) return reject(task, outcome.reason, outcome.detail);
  const to = outcome.blocked ? STATES.BLOCKED : step.to;
  const patch = {
    ledger: claimed.ledger,
    ...outcome.patch,
    ...(outcome.blocked ? { blockedBy: outcome.blocked } : {}),
  };
  const note = outcome.blocked ? { note: outcome.blocked } : {};
  return accept(task, patch, { from: task.state, to, event: type, ...note });
}

/**
 * Cong + du lieu ghi lai cho tung loai.
 * @param {Task} task
 * @param {Record<string, unknown>} m
 * @param {Context} context
 * @returns {GateOutcome}
 */
function applyGates(task, m, context) {
  switch (m.type) {
    case MESSAGE_TYPES.TASK_READY:
      return gateTaskReady(task, m);
    case MESSAGE_TYPES.BUILD_STARTED:
      return { ok: true, patch: { branch: String(m.branch), baseSha: String(m.base_sha) } };
    case MESSAGE_TYPES.BUILD_READY:
      return gateBuildReady(task, m);
    case MESSAGE_TYPES.CI_FAIL:
      return gateCiFail(task, m);
    case MESSAGE_TYPES.REVIEW_REQUEST:
      return gateReviewRequest(task, m, context);
    case MESSAGE_TYPES.REVIEW_PASS:
    case MESSAGE_TYPES.REVIEW_BLOCK:
      return gateReviewVerdict(task, m);
    case MESSAGE_TYPES.RUNTIME_PROOF:
      return gateRuntimeProof(task, m);
    case MESSAGE_TYPES.TASK_DONE:
      return gateTaskDone(task, m);
    default:
      return deny(REASONS.UNKNOWN_MESSAGE_TYPE, { type: m.type });
  }
}

/** @param {Task} task @param {Record<string, unknown>} m @returns {GateOutcome} */
function gateTaskReady(task, m) {
  if (m.risk !== task.risk)
    return deny(REASONS.RISK_MISMATCH, { claimed: m.risk, contract: task.risk });
  if (m.task_id !== undefined && m.task_id !== task.taskId) {
    return deny(REASONS.TASK_ID_MISMATCH, { claimed: m.task_id, contract: task.taskId });
  }
  return { ok: true, patch: {} };
}

/**
 * BUILD_READY mo mot HEAD moi. Day la cho DUY NHAT ma moi chu trinh cua may trang thai deu di
 * qua, nen tran `MAX_HEAD_REVISIONS` o day la thu bien "vong sua co tran" thanh "khong chu trinh
 * nao vo han" — ke ca duong day khong qua FIXING (CI -> CI, REVIEWING -> CI).
 * @param {Task} task @param {Record<string, unknown>} m @returns {GateOutcome}
 */
function gateBuildReady(task, m) {
  if (task.pr !== null && m.pr !== task.pr) {
    return deny(REASONS.PR_MISMATCH, { claimed: m.pr, bound: task.pr });
  }
  const patch = {
    pr: Number(m.pr),
    headSha: String(m.head_sha),
    headRevisions: task.headRevisions + 1,
  };
  if (patch.headRevisions > RETRY_CEILINGS.MAX_HEAD_REVISIONS) {
    const detail = {
      loop: 'head',
      revisionsUsed: task.headRevisions,
      ceiling: RETRY_CEILINGS.MAX_HEAD_REVISIONS,
    };
    return { ok: true, patch, blocked: blockedBy(REASONS.RETRY_CEILING_EXHAUSTED, detail) };
  }
  return { ok: true, patch };
}

/** @param {Task} task @param {Record<string, unknown>} m @returns {GateOutcome} */
function gateCiFail(task, m) {
  const bound = checkPrBinding(task, m);
  if (!bound.ok) return bound;
  if (m.head_sha !== task.headSha) {
    return deny(REASONS.HEAD_MISMATCH, { claimed: m.head_sha, current: task.headSha });
  }
  const retry = evaluateRetry({ loop: 'ci', attemptsUsed: task.ciFixAttempts });
  if (!retry.ok) return { ok: true, patch: {}, blocked: blockedBy(retry.reason, retry.detail) };
  return { ok: true, patch: { ciFixAttempts: retry.attempt } };
}

/** @param {Task} task @param {Record<string, unknown>} m @param {Context} context @returns {GateOutcome} */
function gateReviewRequest(task, m, context) {
  const bound = checkPrBinding(task, m);
  if (!bound.ok) return bound;
  const gate = evaluateReviewRequestGate({
    message: { head_sha: String(m.head_sha) },
    currentHeadSha: String(task.headSha),
    checkRuns: context.checkRuns,
    requiredChecks: context.requiredChecks,
  });
  if (!gate.ok) return gate;
  if (m.risk !== task.risk)
    return deny(REASONS.RISK_MISMATCH, { claimed: m.risk, contract: task.risk });
  return { ok: true, patch: {} };
}

/** @param {Task} task @param {Record<string, unknown>} m @returns {GateOutcome} */
function gateReviewVerdict(task, m) {
  const bound = checkPrBinding(task, m);
  if (!bound.ok) return bound;
  const fresh = evaluateReviewVerdict({
    verdict: { head_sha: String(m.head_sha) },
    currentHeadSha: String(task.headSha),
  });
  if (!fresh.ok) return fresh;
  const verdicts = Object.freeze([...task.verdicts, Object.freeze({ ...m })]);
  if (m.type === MESSAGE_TYPES.REVIEW_PASS) return { ok: true, patch: { verdicts } };
  const retry = evaluateRetry({ loop: 'review', attemptsUsed: task.reviewFixAttempts });
  if (!retry.ok)
    return { ok: true, patch: { verdicts }, blocked: blockedBy(retry.reason, retry.detail) };
  return { ok: true, patch: { verdicts, reviewFixAttempts: retry.attempt } };
}

/** @param {Task} task @param {Record<string, unknown>} m @returns {GateOutcome} */
function gateRuntimeProof(task, m) {
  const bound = checkPrBinding(task, m);
  if (!bound.ok) return bound;
  if (m.release_sha !== task.mergeSha) {
    return deny(REASONS.RUNTIME_PROOF_RELEASE_MISMATCH, {
      claimed: m.release_sha,
      merged: task.mergeSha,
    });
  }
  const proofs = Object.freeze([...task.proofs, Object.freeze({ ...m })]);
  if (m.verdict === 'FAIL') {
    const detail = { env: m.env, deploy_run: m.deploy_run };
    return {
      ok: true,
      patch: { proofs },
      blocked: blockedBy(REASONS.RUNTIME_PROOF_FAILED, detail),
    };
  }
  return { ok: true, patch: { proofs } };
}

/** @param {Task} task @param {Record<string, unknown>} m @returns {GateOutcome} */
function gateTaskDone(task, m) {
  if (m.merge_sha !== task.mergeSha) {
    return deny(REASONS.MERGE_SHA_MISMATCH, { claimed: m.merge_sha, merged: task.mergeSha });
  }
  const gate = evaluateTaskDoneGate({
    runtimeProof: task.runtimeProof,
    message: { merge_sha: String(m.merge_sha), runtime_verified: m.runtime_verified === true },
    proofs: /** @type {import('./gates.mjs').RuntimeProof[]} */ (task.proofs),
  });
  if (!gate.ok) return gate;
  return { ok: true, patch: {} };
}

/**
 * Su kien MERGED (tu GitHub, khong phai comment). Cong merge: rui ro + REVIEW_PASS hien hanh.
 * @param {Task} task
 * @param {{ headSha: string, mergeSha: string }} merge
 * @param {MergeContext} [context]
 * @returns {Accepted | Rejected}
 */
export function applyMerge(task, { headSha, mergeSha }, context = {}) {
  const step = nextState(task.state, EVENTS.MERGED);
  if (!step.ok) return reject(task, step.reason, step.detail);
  if (headSha !== task.headSha) {
    return reject(task, REASONS.HEAD_MISMATCH, { merged: headSha, current: task.headSha });
  }
  const gate = evaluateMergeGate({
    risk: task.risk,
    humanGate: task.humanGate,
    humanApproval: context.humanApproval,
    currentHeadSha: task.headSha,
    verdicts: /** @type {import('./gates.mjs').Verdict[]} */ (task.verdicts),
  });
  if (!gate.ok) return reject(task, gate.reason, gate.detail);
  return accept(task, { mergeSha }, { from: task.state, to: step.to, event: EVENTS.MERGED });
}

/**
 * Ngoai le: vao BLOCKED tu moi trang thai song. Ly do la bat buoc — BLOCKED khong ly do la
 * mot trang thai khong ai go duoc.
 * @param {Task} task
 * @param {{ reason: string, detail?: Record<string, unknown> }} exception
 * @returns {Accepted | Rejected}
 */
export function applyException(task, exception) {
  if (!exception?.reason) {
    return reject(task, REASONS.ILLEGAL_TRANSITION, { event: EVENTS.EXCEPTION, missing: 'reason' });
  }
  const step = nextState(task.state, EVENTS.EXCEPTION);
  if (!step.ok) return reject(task, step.reason, step.detail);
  const blocked = blockedBy(exception.reason, exception.detail);
  return accept(
    task,
    { blockedBy: blocked },
    { from: task.state, to: step.to, event: EVENTS.EXCEPTION, note: blocked },
  );
}
