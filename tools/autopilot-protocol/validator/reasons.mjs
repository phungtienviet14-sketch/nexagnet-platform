/**
 * Bo tu vung LY DO co ma cua validator. Moi duong tu choi la MOT ma rieng — khong gop thanh
 * boolean (cung nguyen tac voi `apps/api/src/observability/decision-vocabulary.ts`).
 *
 * Ma la mot phan cua giao thuc: orchestrator va nguoi doc log loc theo ma, khong theo cau van.
 */
export const REASONS = Object.freeze({
  // --- thong diep dang van ban ---------------------------------------------------------------
  NO_MARKER: 'NO_MARKER',
  MARKER_NOT_FIRST_LINE: 'MARKER_NOT_FIRST_LINE',
  MULTIPLE_MARKERS: 'MULTIPLE_MARKERS',
  UNKNOWN_MARKER: 'UNKNOWN_MARKER',
  MISSING_TYPE_LINE: 'MISSING_TYPE_LINE',
  UNKNOWN_MESSAGE_TYPE: 'UNKNOWN_MESSAGE_TYPE',
  MARKER_TYPE_MISMATCH: 'MARKER_TYPE_MISMATCH',
  MALFORMED_LINE: 'MALFORMED_LINE',
  DUPLICATE_KEY: 'DUPLICATE_KEY',
  UNKNOWN_FIELD: 'UNKNOWN_FIELD',
  BAD_FIELD_VALUE: 'BAD_FIELD_VALUE',
  EMPTY_LIST: 'EMPTY_LIST',
  // --- schema ------------------------------------------------------------------------------
  SCHEMA_VIOLATION: 'SCHEMA_VIOLATION',
  // --- hop dong task -----------------------------------------------------------------------
  CONTRACT_MARKER_MISSING: 'CONTRACT_MARKER_MISSING',
  CONTRACT_MARKER_NOT_FIRST_LINE: 'CONTRACT_MARKER_NOT_FIRST_LINE',
  CONTRACT_BLOCK_MISSING: 'CONTRACT_BLOCK_MISSING',
  CONTRACT_BLOCK_NOT_ADJACENT: 'CONTRACT_BLOCK_NOT_ADJACENT',
  CONTRACT_BLOCK_NOT_JSON: 'CONTRACT_BLOCK_NOT_JSON',
  HIGH_RISK_REQUIRES_HUMAN_GATE: 'HIGH_RISK_REQUIRES_HUMAN_GATE',
  RISK_UNDERSTATED_FOR_AREAS: 'RISK_UNDERSTATED_FOR_AREAS',
  // --- may trang thai ----------------------------------------------------------------------
  ILLEGAL_TRANSITION: 'ILLEGAL_TRANSITION',
  TERMINAL_STATE: 'TERMINAL_STATE',
  UNKNOWN_STATE: 'UNKNOWN_STATE',
  UNKNOWN_EVENT: 'UNKNOWN_EVENT',
  // --- cong nghiep vu ----------------------------------------------------------------------
  HEAD_MISMATCH: 'HEAD_MISMATCH',
  STALE_VERDICT: 'STALE_VERDICT',
  NO_CURRENT_REVIEW_PASS: 'NO_CURRENT_REVIEW_PASS',
  CI_CHECK_MISSING: 'CI_CHECK_MISSING',
  CI_CHECK_NOT_GREEN: 'CI_CHECK_NOT_GREEN',
  CI_EVIDENCE_UNBOUND: 'CI_EVIDENCE_UNBOUND',
  NO_REQUIRED_CHECKS: 'NO_REQUIRED_CHECKS',
  HIGH_RISK_REQUIRES_HUMAN: 'HIGH_RISK_REQUIRES_HUMAN',
  HUMAN_GATE_REQUIRES_HUMAN: 'HUMAN_GATE_REQUIRES_HUMAN',
  STALE_HUMAN_APPROVAL: 'STALE_HUMAN_APPROVAL',
  CONFLICTING_RUNTIME_EVIDENCE: 'CONFLICTING_RUNTIME_EVIDENCE',
  RETRY_CEILING_EXHAUSTED: 'RETRY_CEILING_EXHAUSTED',
  RUNTIME_PROOF_MISSING: 'RUNTIME_PROOF_MISSING',
  RUNTIME_PROOF_FAILED: 'RUNTIME_PROOF_FAILED',
  RUNTIME_PROOF_RELEASE_MISMATCH: 'RUNTIME_PROOF_RELEASE_MISMATCH',
  RUNTIME_PROOF_ENV_MISMATCH: 'RUNTIME_PROOF_ENV_MISMATCH',
  RUNTIME_VERIFIED_CLAIM_WITHOUT_PROOF: 'RUNTIME_VERIFIED_CLAIM_WITHOUT_PROOF',
  RUNTIME_VERIFIED_FLAG_REQUIRED: 'RUNTIME_VERIFIED_FLAG_REQUIRED',
  // --- idempotency / dinh danh -------------------------------------------------------------
  DUPLICATE_MESSAGE: 'DUPLICATE_MESSAGE',
  ISSUE_MISMATCH: 'ISSUE_MISMATCH',
  PR_MISMATCH: 'PR_MISMATCH',
  NO_PR_BOUND: 'NO_PR_BOUND',
  RISK_MISMATCH: 'RISK_MISMATCH',
  TASK_ID_MISMATCH: 'TASK_ID_MISMATCH',
  MERGE_SHA_MISMATCH: 'MERGE_SHA_MISMATCH',
  CI_EVIDENCE_MISSING: 'CI_EVIDENCE_MISSING',
  WRONG_PRODUCER: 'WRONG_PRODUCER',
  PRODUCER_UNKNOWN: 'PRODUCER_UNKNOWN',
});

/**
 * @typedef {{ ok: true }} Ok
 * @typedef {{ ok: false, reason: string, detail?: Record<string, unknown> }} Denied
 */

/** @returns {Ok} */
export const ok = () => ({ ok: true });

/**
 * @param {string} reason
 * @param {Record<string, unknown>} [detail]
 * @returns {Denied}
 */
export const deny = (reason, detail) =>
  detail ? { ok: false, reason, detail } : { ok: false, reason };
