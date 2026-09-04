import assert from 'node:assert/strict';
import { test } from 'node:test';

import { RETRY_CEILINGS, STATES } from '../validator/constants.mjs';
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

const ctxGreen = (sha) => ({ checkRuns: greenChecks(sha), requiredChecks: REQUIRED_CHECKS });
const mergedTask = (over) =>
  applyMerge(drive(taskInReviewing(over), [[message('REVIEW_PASS')]]), {
    headSha: SHA_A,
    mergeSha: SHA_MERGE,
  }).task;

test('DONE bi tu choi truoc runtime proof; proof FAIL => BLOCKED; proof cho release khac => tu choi', () => {
  const merged = mergedTask();
  assert.equal(apply(merged, message('TASK_DONE')).reason, REASONS.RUNTIME_PROOF_MISSING);
  assert.equal(
    apply(merged, message('TASK_DONE', { runtime_verified: false })).reason,
    REASONS.RUNTIME_PROOF_MISSING,
  );
  assert.equal(
    apply(merged, message('TASK_DONE', { merge_sha: SHA_A })).reason,
    REASONS.MERGE_SHA_MISMATCH,
  );
  assert.equal(
    apply(merged, message('RUNTIME_PROOF', { release_sha: SHA_A })).reason,
    REASONS.RUNTIME_PROOF_RELEASE_MISMATCH,
  );
  const failed = apply(merged, message('RUNTIME_PROOF', { verdict: 'FAIL' }));
  assert.equal(failed.ok, true);
  assert.equal(failed.task.state, STATES.BLOCKED);
  assert.equal(failed.task.blockedBy.reason, REASONS.RUNTIME_PROOF_FAILED);
  const proven = drive(merged, [[message('RUNTIME_PROOF')]]);
  assert.equal(
    apply(proven, message('TASK_DONE', { runtime_verified: false })).reason,
    REASONS.RUNTIME_VERIFIED_FLAG_REQUIRED,
  );
  assert.equal(apply(proven, message('TASK_DONE')).task.state, STATES.DONE);
});

test('khong doi runtime proof: DONE ngay sau merge voi RUNTIME_VERIFIED=false; =true la loi khai', () => {
  const merged = mergedTask({ runtime_proof: { required: false } });
  assert.equal(
    apply(merged, message('TASK_DONE', { runtime_verified: true })).reason,
    REASONS.RUNTIME_VERIFIED_CLAIM_WITHOUT_PROOF,
  );
  assert.equal(
    apply(merged, message('TASK_DONE', { runtime_verified: false })).task.state,
    STATES.DONE,
  );
});

test('tran vong sua CI: 3 lan FIXING, lan thu 4 => BLOCKED voi RETRY_CEILING_EXHAUSTED', () => {
  let task = drive(createTask({ issue: ISSUE, contract: contract() }), [
    [message('TASK_READY')],
    [message('BUILD_STARTED')],
    [message('BUILD_READY')],
  ]);
  const heads = ['1'.repeat(40), '2'.repeat(40), '3'.repeat(40)];
  for (let i = 0; i < RETRY_CEILINGS.MAX_CI_FIX_ATTEMPTS; i += 1) {
    const fail = apply(task, message('CI_FAIL', { head_sha: task.headSha, ci_run: 100 + i }));
    assert.equal(fail.task.state, STATES.FIXING, `lan ${i + 1}`);
    assert.equal(fail.task.ciFixAttempts, i + 1);
    task = drive(fail.task, [[message('BUILD_READY', { head_sha: heads[i] })]]);
  }
  const fourth = apply(task, message('CI_FAIL', { head_sha: task.headSha, ci_run: 999 }));
  assert.equal(fourth.ok, true, 'CI_FAIL van la su kien hop le — ket qua cua no la BLOCKED');
  assert.equal(fourth.task.state, STATES.BLOCKED);
  assert.equal(fourth.task.blockedBy.reason, REASONS.RETRY_CEILING_EXHAUSTED);
  assert.deepEqual(fourth.task.blockedBy.detail, { loop: 'ci', attemptsUsed: 3, ceiling: 3 });
  assert.equal(
    apply(fourth.task, message('BUILD_READY', { head_sha: SHA_B })).reason,
    REASONS.TERMINAL_STATE,
    'khong lap vo han',
  );
});

test('tran vong sua review: 3 REVIEW_BLOCK duoc sua, lan thu 4 => BLOCKED', () => {
  let task = taskInReviewing();
  const heads = ['4'.repeat(40), '5'.repeat(40), '6'.repeat(40)];
  for (let i = 0; i < RETRY_CEILINGS.MAX_REVIEW_FIX_ATTEMPTS; i += 1) {
    const block = apply(task, message('REVIEW_BLOCK', { head_sha: task.headSha }));
    assert.equal(block.task.state, STATES.FIXING, `lan ${i + 1}`);
    assert.equal(block.task.reviewFixAttempts, i + 1);
    task = drive(block.task, [
      [message('BUILD_READY', { head_sha: heads[i] })],
      [message('REVIEW_REQUEST', { head_sha: heads[i], ci_run: 200 + i }), ctxGreen(heads[i])],
    ]);
  }
  const fourth = apply(task, message('REVIEW_BLOCK', { head_sha: task.headSha }));
  assert.equal(fourth.task.state, STATES.BLOCKED);
  assert.deepEqual(fourth.task.blockedBy.detail, { loop: 'review', attemptsUsed: 3, ceiling: 3 });
});
