import assert from 'node:assert/strict';
import { test } from 'node:test';

import { STATES } from '../validator/constants.mjs';
import { applyMerge, createTask } from '../validator/protocol.mjs';
import { REASONS } from '../validator/reasons.mjs';
import {
  ISSUE,
  REQUIRED_CHECKS,
  SHA_A,
  SHA_B,
  SHA_MERGE,
  apply,
  contract,
  drive,
  greenChecks,
  message,
  taskInReviewing,
} from './helpers.mjs';

const ctxGreen = (sha, overrides) => ({
  checkRuns: greenChecks(sha, overrides),
  requiredChecks: REQUIRED_CHECKS,
});
const readyToCi = () =>
  drive(createTask({ issue: ISSUE, contract: contract() }), [
    [message('TASK_READY')],
    [message('BUILD_STARTED')],
    [message('BUILD_READY')],
  ]);

test('REVIEW_PASS neu ten HEAD cu bi tu choi sau khi HEAD doi (stale), merge chi mo bang PASS cua HEAD moi', () => {
  let task = taskInReviewing();
  const pushed = apply(task, message('BUILD_READY', { head_sha: SHA_B }));
  assert.equal(pushed.ok, true);
  assert.equal(pushed.task.state, STATES.CI, 'commit moi luc dang review => quay ve CI');
  task = drive(pushed.task, [
    [message('REVIEW_REQUEST', { head_sha: SHA_B, ci_run: 3 }), ctxGreen(SHA_B)],
  ]);
  const stale = apply(task, message('REVIEW_PASS', { head_sha: SHA_A }));
  assert.equal(stale.reason, REASONS.STALE_VERDICT);
  assert.deepEqual(stale.detail, { verdictHead: SHA_A, currentHead: SHA_B });
  assert.equal(stale.task.verdicts.length, 0, 'phan xet stale KHONG duoc ghi');
  assert.equal(
    applyMerge(task, { headSha: SHA_B, mergeSha: SHA_MERGE }).reason,
    REASONS.NO_CURRENT_REVIEW_PASS,
  );
  task = drive(task, [[message('REVIEW_PASS', { head_sha: SHA_B })]]);
  assert.equal(applyMerge(task, { headSha: SHA_B, mergeSha: SHA_MERGE }).ok, true);
});

test('REVIEW_PASS DA GHI cho HEAD A khong mo merge cho HEAD B; phat lai PASS(A) la duplicate, khong phai bang chung moi', () => {
  let task = drive(taskInReviewing(), [[message('REVIEW_PASS')]]);
  assert.equal(task.verdicts.length, 1);
  task = drive(task, [
    [message('BUILD_READY', { head_sha: SHA_B })],
    [message('REVIEW_REQUEST', { head_sha: SHA_B, ci_run: 4 }), ctxGreen(SHA_B)],
  ]);
  assert.equal(
    applyMerge(task, { headSha: SHA_B, mergeSha: SHA_MERGE }).reason,
    REASONS.NO_CURRENT_REVIEW_PASS,
  );
  assert.equal(
    apply(task, message('REVIEW_PASS', { head_sha: SHA_A })).reason,
    REASONS.DUPLICATE_MESSAGE,
    'khoa review-verdict:<pr>:<A>:REVIEW_PASS da ghi',
  );
  assert.equal(task.verdicts.length, 1, 'khong co phan xet moi nao duoc ghi');
});

test('REVIEW_REQUEST bi tu choi khi required CI chua xanh, thieu check, hay thieu bang chung', () => {
  const task = readyToCi();
  const req = message('REVIEW_REQUEST');
  assert.equal(
    apply(task, req).reason,
    REASONS.NO_REQUIRED_CHECKS,
    'khong dua required checks => khong mo',
  );
  assert.equal(
    apply(task, req, { requiredChecks: REQUIRED_CHECKS }).reason,
    REASONS.CI_EVIDENCE_MISSING,
  );
  assert.equal(
    apply(task, req, ctxGreen(SHA_A, { verify: 'failure' })).reason,
    REASONS.CI_CHECK_NOT_GREEN,
  );
  assert.equal(
    apply(task, req, ctxGreen(SHA_A, { images: null })).reason,
    REASONS.CI_CHECK_NOT_GREEN,
  );
  assert.equal(
    apply(task, req, ctxGreen(SHA_B)).reason,
    REASONS.CI_CHECK_MISSING,
    'CI xanh cua HEAD khac khong tinh',
  );
  assert.equal(
    apply(task, message('REVIEW_REQUEST', { head_sha: SHA_B }), ctxGreen(SHA_B)).reason,
    REASONS.HEAD_MISMATCH,
  );
  assert.equal(
    apply(task, message('REVIEW_REQUEST', { risk: 'LOW' }), ctxGreen(SHA_A)).reason,
    REASONS.RISK_MISMATCH,
  );
  assert.equal(apply(task, req, ctxGreen(SHA_A)).task.state, STATES.REVIEWING);
});

test('HIGH: REVIEW_PASS hien hanh van KHONG merge duoc neu khong co nguoi duyet', () => {
  const task = drive(taskInReviewing({ risk: 'HIGH', human_gate: true }), [
    [message('REVIEW_PASS')],
  ]);
  assert.equal(
    applyMerge(task, { headSha: SHA_A, mergeSha: SHA_MERGE }).reason,
    REASONS.HIGH_RISK_REQUIRES_HUMAN,
  );
  assert.equal(
    applyMerge(task, { headSha: SHA_A, mergeSha: SHA_MERGE }, { humanApproval: null }).reason,
    REASONS.HIGH_RISK_REQUIRES_HUMAN,
  );
  assert.equal(
    applyMerge(
      task,
      { headSha: SHA_A, mergeSha: SHA_MERGE },
      { humanApproval: { head_sha: SHA_A } },
    ).task.state,
    STATES.RUNTIME_PROOF,
  );
  const gated = drive(taskInReviewing({ risk: 'MEDIUM', human_gate: true }), [
    [message('REVIEW_PASS')],
  ]);
  assert.equal(
    applyMerge(gated, { headSha: SHA_A, mergeSha: SHA_MERGE }).reason,
    REASONS.HUMAN_GATE_REQUIRES_HUMAN,
  );
});

test('REVIEW_BLOCK roi REVIEW_PASS tren cung HEAD: phan xet moi nhat thang, merge mo', () => {
  const blocked = apply(taskInReviewing(), message('REVIEW_BLOCK'));
  assert.equal(blocked.task.state, STATES.FIXING);
  const back = drive(blocked.task, [
    [message('BUILD_READY', { head_sha: SHA_B })],
    [message('REVIEW_REQUEST', { head_sha: SHA_B, ci_run: 9 }), ctxGreen(SHA_B)],
  ]);
  const passed = drive(back, [[message('REVIEW_PASS', { head_sha: SHA_B })]]);
  assert.equal(applyMerge(passed, { headSha: SHA_B, mergeSha: SHA_MERGE }).ok, true);
});
