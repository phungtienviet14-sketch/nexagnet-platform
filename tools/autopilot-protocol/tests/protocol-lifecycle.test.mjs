import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ACTORS, STATES } from '../validator/constants.mjs';
import { applyException, applyMerge, applyMessage, createTask } from '../validator/protocol.mjs';
import { REASONS } from '../validator/reasons.mjs';
import {
  ISSUE,
  PR,
  REQUIRED_CHECKS,
  SHA_A,
  SHA_B,
  SHA_MERGE,
  contract,
  drive,
  greenChecks,
  message,
  taskInReviewing,
} from './helpers.mjs';

const ctxGreen = (sha) => ({ checkRuns: greenChecks(sha), requiredChecks: REQUIRED_CHECKS });

test('vong doi day du: 9 thong diep + MERGED, ket thuc DONE, lich su ghi tung buoc, khoa ghi tung thong diep', () => {
  let task = taskInReviewing();
  task = drive(task, [[message('REVIEW_PASS')]]);
  const merged = applyMerge(task, { headSha: SHA_A, mergeSha: SHA_MERGE });
  assert.equal(merged.ok, true);
  task = drive(merged.task, [[message('RUNTIME_PROOF')], [message('TASK_DONE')]]);
  assert.equal(task.state, STATES.DONE);
  assert.deepEqual(
    task.history.map((h) => `${h.from}>${h.event}>${h.to}`),
    [
      'null>TASK_READY>READY',
      'READY>BUILD_STARTED>RUNNING',
      'RUNNING>BUILD_READY>CI',
      'CI>REVIEW_REQUEST>REVIEWING',
      'REVIEWING>REVIEW_PASS>REVIEWING',
      'REVIEWING>MERGED>RUNTIME_PROOF',
      'RUNTIME_PROOF>RUNTIME_PROOF>RUNTIME_PROOF',
      'RUNTIME_PROOF>TASK_DONE>DONE',
    ],
  );
  assert.deepEqual(
    [...task.ledger.keys],
    [
      `task-ready:${ISSUE}`,
      `build:${ISSUE}`,
      `build-ready:${PR}:${SHA_A}`,
      `review-request:${PR}:${SHA_A}`,
      `review-verdict:${PR}:${SHA_A}:REVIEW_PASS`,
      `runtime:${SHA_MERGE}:gd1-test`,
      `done:${ISSUE}:${SHA_MERGE}`,
    ],
  );
  assert.equal(task.mergeSha, SHA_MERGE);
});

test('task la bat bien: ap thong diep tra ve task MOI, task cu khong doi', () => {
  const before = createTask({ issue: ISSUE, contract: contract() });
  const after = applyMessage(before, message('TASK_READY'));
  assert.equal(after.ok, true);
  assert.equal(before.state, null);
  assert.equal(after.task.state, STATES.READY);
  assert.ok(Object.isFrozen(before) && Object.isFrozen(after.task));
  assert.throws(() => {
    after.task.state = 'DONE';
  });
});

test('thong diep lap (cung khoa) => DUPLICATE_MESSAGE, khong doi trang thai, khong doi bo dem', () => {
  const task = taskInReviewing();
  const first = applyMessage(task, message('REVIEW_BLOCK'));
  assert.equal(first.ok, true);
  assert.equal(first.task.reviewFixAttempts, 1);
  const again = applyMessage(first.task, message('REVIEW_BLOCK'));
  assert.equal(again.reason, REASONS.DUPLICATE_MESSAGE);
  assert.equal(again.task, first.task);
  const dupReady = applyMessage(taskInReviewing(), message('TASK_READY'));
  assert.equal(
    dupReady.reason,
    REASONS.DUPLICATE_MESSAGE,
    'TASK_READY lan hai la duplicate truoc khi xet may trang thai',
  );
});

test('thong diep cua issue khac, PR khac, hay nguoi phat sai vai => tu choi truoc moi cong khac', () => {
  const task = taskInReviewing();
  assert.equal(
    applyMessage(task, message('REVIEW_PASS', { issue: 999 })).reason,
    REASONS.ISSUE_MISMATCH,
  );
  assert.equal(applyMessage(task, message('REVIEW_PASS', { pr: 777 })).reason, REASONS.PR_MISMATCH);
  assert.equal(
    applyMessage(task, message('REVIEW_PASS'), { actor: ACTORS.BUILDER }).reason,
    REASONS.WRONG_PRODUCER,
  );
  assert.equal(applyMessage(task, message('REVIEW_PASS'), { actor: ACTORS.REVIEWER }).ok, true);
  assert.equal(
    applyMessage(task, message('BUILD_READY', { head_sha: SHA_B }), { actor: ACTORS.FIXER }).ok,
    true,
  );
  assert.equal(
    applyMessage(task, message('BUILD_READY', { head_sha: SHA_B }), { actor: ACTORS.REVIEWER })
      .reason,
    REASONS.WRONG_PRODUCER,
  );
});

test('TASK_READY khai rui ro khac hop dong => RISK_MISMATCH; thong diep hong schema => SCHEMA_VIOLATION', () => {
  const task = createTask({ issue: ISSUE, contract: contract() });
  assert.equal(
    applyMessage(task, message('TASK_READY', { risk: 'LOW' })).reason,
    REASONS.RISK_MISMATCH,
  );
  assert.equal(
    applyMessage(task, message('TASK_READY', { task_id: 'OTHER' })).reason,
    REASONS.TASK_ID_MISMATCH,
  );
  assert.equal(
    applyMessage(task, message('TASK_READY', { risk: 'ULTRA' })).reason,
    REASONS.SCHEMA_VIOLATION,
  );
  assert.equal(
    applyMessage(task, message('BUILD_STARTED')).reason,
    REASONS.ILLEGAL_TRANSITION,
    'chua READY thi khong BUILD_STARTED',
  );
});

test('CI_FAIL phai tro dung HEAD hien tai; truoc khi co PR thi khong co gi de FAIL', () => {
  const noPr = drive(createTask({ issue: ISSUE, contract: contract() }), [
    [message('TASK_READY')],
    [message('BUILD_STARTED')],
  ]);
  assert.equal(applyMessage(noPr, message('CI_FAIL')).reason, REASONS.ILLEGAL_TRANSITION);
  const inCi = drive(noPr, [[message('BUILD_READY')]]);
  assert.equal(
    applyMessage(inCi, message('CI_FAIL', { head_sha: SHA_B })).reason,
    REASONS.HEAD_MISMATCH,
  );
  assert.equal(applyMessage(inCi, message('CI_FAIL')).task.state, STATES.FIXING);
});

test('EXCEPTION vao BLOCKED tu trang thai song, phai co ly do; tu DONE/BLOCKED thi TERMINAL_STATE', () => {
  const task = taskInReviewing();
  assert.equal(applyException(task, {}).reason, REASONS.ILLEGAL_TRANSITION);
  const blocked = applyException(task, {
    reason: 'CONTRACT_CHANGED_MID_FLIGHT',
    detail: { by: 'human' },
  });
  assert.equal(blocked.task.state, STATES.BLOCKED);
  assert.deepEqual(blocked.task.blockedBy, {
    reason: 'CONTRACT_CHANGED_MID_FLIGHT',
    detail: { by: 'human' },
  });
  assert.equal(applyException(blocked.task, { reason: 'AGAIN' }).reason, REASONS.TERMINAL_STATE);
  assert.equal(applyMessage(blocked.task, message('REVIEW_PASS')).reason, REASONS.TERMINAL_STATE);
  assert.equal(
    applyMerge(blocked.task, { headSha: SHA_A, mergeSha: SHA_MERGE }).reason,
    REASONS.TERMINAL_STATE,
  );
});

test('MERGED khong hop le neu HEAD merge khac HEAD hien tai (PR bi push them ngay truoc merge)', () => {
  const task = drive(taskInReviewing(), [[message('REVIEW_PASS')]]);
  assert.equal(
    applyMerge(task, { headSha: SHA_B, mergeSha: SHA_MERGE }).reason,
    REASONS.HEAD_MISMATCH,
  );
  assert.equal(applyMerge(task, { headSha: SHA_A, mergeSha: SHA_MERGE }, ctxGreen(SHA_A)).ok, true);
});
