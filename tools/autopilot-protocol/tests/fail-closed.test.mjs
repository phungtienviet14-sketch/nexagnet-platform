import assert from 'node:assert/strict';
import { test } from 'node:test';

import { RETRY_CEILINGS, STATES } from '../validator/constants.mjs';
import { evaluateMergeGate } from '../validator/gates.mjs';
import { readMessage } from '../validator/messages.mjs';
import { applyMerge, applyMessage, createTask } from '../validator/protocol.mjs';
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

/**
 * BON DUONG FAIL-OPEN da do duoc tren chinh ban nay (03/09/2026), moi duong mot bai.
 *
 * Ca bon deu KHONG phai loi go nham: chung deu la "code chay dung nhu da viet", va deu mo mot
 * duong cho mot khang dinh SAI di qua ma khong cong nao keu. Do la ly do chung nam rieng mot
 * tep — ai sua giao thuc sau nay phai thay ngay bon thu nay da tung xay ra.
 */

const ctxGreen = (sha) => ({ checkRuns: greenChecks(sha), requiredChecks: REQUIRED_CHECKS });

// ---------------------------------------------------------------------------------------------
// 1. Van ban tu do khong duoc kich hoat agent
// ---------------------------------------------------------------------------------------------

test('marker khong nam o dong noi dung dau tien => MARKER_NOT_FIRST_LINE, khong phai thong diep', () => {
  // Do duoc: van xuoi dat truoc marker tung cho ra mot REVIEW_PASS hop le.
  const prose = [
    'gui anh xem thu:',
    '',
    '<!-- CHATGPT_REVIEW_V0 -->',
    'REVIEW_PASS',
    `ISSUE=${ISSUE}`,
    `PR=${PR}`,
    `HEAD_SHA=${SHA_A}`,
  ].join('\n');
  const result = readMessage(prose);
  assert.equal(result.ok, false);
  assert.equal(result.reason, REASONS.MARKER_NOT_FIRST_LINE);
  assert.deepEqual(result.detail, { markerLine: 3, firstContentLine: 1 });
});

test('vi du dan trong khoi ``` cua mot comment nguoi viet cung khong kich hoat', () => {
  const fenced = [
    'Mau thong diep dong task:',
    '',
    '```',
    '<!-- AUTOPILOT_TASK_DONE_V0 -->',
    'TASK_DONE',
    `ISSUE=${ISSUE}`,
    `MERGE_SHA=${SHA_MERGE}`,
    'RUNTIME_VERIFIED=true',
    '',
    '```',
  ].join('\n');
  assert.equal(readMessage(fenced).reason, REASONS.MARKER_NOT_FIRST_LINE);
});

test('nhung dong trong dan dau van hop le — trinh soan hay them mot dong trong khi dan', () => {
  const padded = [
    '',
    '',
    '<!-- CHATGPT_REVIEW_V0 -->',
    'REVIEW_PASS',
    `ISSUE=${ISSUE}`,
    `PR=${PR}`,
    `HEAD_SHA=${SHA_A}`,
  ].join('\n');
  const result = readMessage(padded);
  assert.equal(result.ok, true);
  assert.equal(result.message.type, 'REVIEW_PASS');
});

// ---------------------------------------------------------------------------------------------
// 2. Bang chung runtime AM khong duoc bi bo qua nhu mot ban phat lai
// ---------------------------------------------------------------------------------------------

const mergedTask = (over) =>
  applyMerge(drive(taskInReviewing(over), [[message('REVIEW_PASS')]]), {
    headSha: SHA_A,
    mergeSha: SHA_MERGE,
  }).task;

test('RUNTIME_PROOF FAIL den sau mot PASS cua cung release+env => BLOCKED, khong phai DUPLICATE', () => {
  // Do duoc: FAIL bi tu choi DUPLICATE_MESSAGE roi task van dong DONE tren bang chung cu.
  const proven = drive(mergedTask(), [[message('RUNTIME_PROOF', { deploy_run: 2001 })]]);
  const conflict = applyMessage(
    proven,
    message('RUNTIME_PROOF', { deploy_run: 2002, verdict: 'FAIL' }),
  );
  assert.equal(conflict.ok, true, 'bang chung mau thuan la mot su kien, khong phai mot ban sao');
  assert.equal(conflict.task.state, STATES.BLOCKED);
  assert.equal(conflict.task.blockedBy.reason, REASONS.CONFLICTING_RUNTIME_EVIDENCE);
  assert.deepEqual(conflict.task.blockedBy.detail, {
    release_sha: SHA_MERGE,
    env: 'gd1-test',
    recorded: 'PASS',
    claimed: 'FAIL',
  });
  assert.equal(applyMessage(conflict.task, message('TASK_DONE')).reason, REASONS.TERMINAL_STATE);
});

test('PASS den sau mot FAIL cung khong "sua diem" duoc — FAIL da dua task vao BLOCKED', () => {
  const failed = applyMessage(mergedTask(), message('RUNTIME_PROOF', { verdict: 'FAIL' })).task;
  assert.equal(failed.state, STATES.BLOCKED);
  assert.equal(failed.blockedBy.reason, REASONS.RUNTIME_PROOF_FAILED);
  assert.equal(applyMessage(failed, message('RUNTIME_PROOF')).reason, REASONS.TERMINAL_STATE);
});

test('phat lai THAT (cung release+env+phan xet) van la DUPLICATE_MESSAGE', () => {
  const proven = drive(mergedTask(), [[message('RUNTIME_PROOF', { deploy_run: 2001 })]]);
  const replay = applyMessage(proven, message('RUNTIME_PROOF', { deploy_run: 2001 }));
  assert.equal(replay.reason, REASONS.DUPLICATE_MESSAGE);
  assert.equal(replay.task, proven, 'phat lai khong tao task moi');
});

// ---------------------------------------------------------------------------------------------
// 3. Cu duyet cua NGUOI cung phai buoc vao SHA
// ---------------------------------------------------------------------------------------------

test('duyet o HEAD A khong mo duoc merge cua HEAD B => STALE_HUMAN_APPROVAL', () => {
  // Do duoc: voi mot boolean, cu duyet o HEAD A mo duoc merge cua HEAD B.
  let task = drive(taskInReviewing({ risk: 'HIGH', human_gate: true }), [[message('REVIEW_PASS')]]);
  task = drive(task, [
    [message('BUILD_READY', { head_sha: SHA_B })],
    [message('REVIEW_REQUEST', { head_sha: SHA_B, ci_run: 4242, risk: 'HIGH' }), ctxGreen(SHA_B)],
    [message('REVIEW_PASS', { head_sha: SHA_B })],
  ]);
  const stale = applyMerge(
    task,
    { headSha: SHA_B, mergeSha: SHA_MERGE },
    { humanApproval: { head_sha: SHA_A } },
  );
  assert.equal(stale.reason, REASONS.STALE_HUMAN_APPROVAL);
  assert.deepEqual(stale.detail, { approvedHead: SHA_A, currentHead: SHA_B });
  const fresh = applyMerge(
    task,
    { headSha: SHA_B, mergeSha: SHA_MERGE },
    { humanApproval: { head_sha: SHA_B } },
  );
  assert.equal(fresh.task.state, STATES.RUNTIME_PROOF);
});

test('duyet dang boolean hay rong khong con duoc coi la duyet', () => {
  const base = {
    risk: 'HIGH',
    humanGate: true,
    currentHeadSha: SHA_A,
    verdicts: [{ type: 'REVIEW_PASS', head_sha: SHA_A, pr: PR }],
  };
  for (const approval of [undefined, null, true, {}, { head_sha: '' }]) {
    assert.equal(
      evaluateMergeGate({ ...base, humanApproval: approval }).reason,
      REASONS.HIGH_RISK_REQUIRES_HUMAN,
      JSON.stringify(approval ?? null),
    );
  }
});

// ---------------------------------------------------------------------------------------------
// 4. Khong mot chu trinh nao duoc phep vo han
// ---------------------------------------------------------------------------------------------

test('day BUILD_READY lien tuc (khong qua FIXING) van dung o tran MAX_HEAD_REVISIONS', () => {
  // Do duoc: 40 vong BUILD_READY -> REVIEW_REQUEST deu duoc nhan, ca hai bo dem van bang 0.
  let task = drive(createTask({ issue: ISSUE, contract: contract() }), [
    [message('TASK_READY')],
    [message('BUILD_STARTED')],
  ]);
  let cycles = 0;
  for (let i = 0; i < RETRY_CEILINGS.MAX_HEAD_REVISIONS + 5; i += 1) {
    const head = String(i).padStart(40, 'f');
    const pushed = applyMessage(task, message('BUILD_READY', { head_sha: head }));
    assert.equal(pushed.ok, true, `lan day ${i + 1}`);
    task = pushed.task;
    if (task.state === STATES.BLOCKED) break;
    task = drive(task, [
      [
        message('REVIEW_REQUEST', { head_sha: head, ci_run: 5000 + i, risk: 'MEDIUM' }),
        ctxGreen(head),
      ],
    ]);
    cycles += 1;
  }
  assert.equal(cycles, RETRY_CEILINGS.MAX_HEAD_REVISIONS);
  assert.equal(task.state, STATES.BLOCKED);
  assert.equal(task.blockedBy.reason, REASONS.RETRY_CEILING_EXHAUSTED);
  assert.deepEqual(task.blockedBy.detail, {
    loop: 'head',
    revisionsUsed: RETRY_CEILINGS.MAX_HEAD_REVISIONS,
    ceiling: RETRY_CEILINGS.MAX_HEAD_REVISIONS,
  });
});

test('tran HEAD phai rong hon tong hai tran sua, neu khong duong sua hop le se bi chan oan', () => {
  const longestLegalPath =
    1 + RETRY_CEILINGS.MAX_CI_FIX_ATTEMPTS + RETRY_CEILINGS.MAX_REVIEW_FIX_ATTEMPTS;
  assert.ok(
    RETRY_CEILINGS.MAX_HEAD_REVISIONS >= longestLegalPath,
    `tran HEAD (${RETRY_CEILINGS.MAX_HEAD_REVISIONS}) phai >= duong hop le dai nhat (${longestLegalPath})`,
  );
});
