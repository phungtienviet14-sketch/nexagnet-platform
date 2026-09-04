import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  evaluateMergeGate,
  evaluateTaskDoneGate,
  isAutoMergeEligible,
} from '../validator/gates.mjs';
import { REASONS } from '../validator/reasons.mjs';
import { SHA_A, SHA_B, SHA_MERGE } from './helpers.mjs';

const pass = (head = SHA_A) => ({ type: 'REVIEW_PASS', head_sha: head, pr: 201 });
const block = (head = SHA_A) => ({ type: 'REVIEW_BLOCK', head_sha: head, pr: 201 });
const proof = (over = {}) => ({
  release_sha: SHA_MERGE,
  env: 'gd1-test',
  verdict: 'PASS',
  ...over,
});
const done = (over = {}) => ({ merge_sha: SHA_MERGE, runtime_verified: true, ...over });

test('duong auto-merge chi mo cho LOW/MEDIUM khong human_gate', () => {
  assert.equal(isAutoMergeEligible({ risk: 'LOW', humanGate: false }), true);
  assert.equal(isAutoMergeEligible({ risk: 'MEDIUM', humanGate: false }), true);
  assert.equal(isAutoMergeEligible({ risk: 'HIGH', humanGate: true }), false);
  assert.equal(
    isAutoMergeEligible({ risk: 'HIGH', humanGate: false }),
    false,
    'HIGH luon dong, ke ca khi hop dong noi doi',
  );
  assert.equal(isAutoMergeEligible({ risk: 'LOW', humanGate: true }), false);
});

test('HIGH bi tu choi khoi duong auto-merge du da co REVIEW_PASS hien hanh; nguoi duyet moi mo', () => {
  const base = { risk: 'HIGH', humanGate: true, currentHeadSha: SHA_A, verdicts: [pass()] };
  assert.equal(evaluateMergeGate(base).reason, REASONS.HIGH_RISK_REQUIRES_HUMAN);
  assert.equal(
    evaluateMergeGate({ ...base, humanApproval: null }).reason,
    REASONS.HIGH_RISK_REQUIRES_HUMAN,
  );
  assert.deepEqual(evaluateMergeGate({ ...base, humanApproval: { head_sha: SHA_A } }), {
    ok: true,
  });
  assert.equal(
    evaluateMergeGate({ ...base, humanApproval: { head_sha: SHA_A }, verdicts: [] }).reason,
    REASONS.NO_CURRENT_REVIEW_PASS,
    'nguoi duyet KHONG thay the review',
  );
});

test('human_gate=true o task MEDIUM cung chan auto-merge', () => {
  const base = { risk: 'MEDIUM', humanGate: true, currentHeadSha: SHA_A, verdicts: [pass()] };
  assert.equal(evaluateMergeGate(base).reason, REASONS.HUMAN_GATE_REQUIRES_HUMAN);
  assert.deepEqual(evaluateMergeGate({ ...base, humanApproval: { head_sha: SHA_A } }), {
    ok: true,
  });
});

test('merge can REVIEW_PASS HIEN HANH: khong co, chi co BLOCK, hay PASS cua HEAD cu => tu choi', () => {
  const base = { risk: 'MEDIUM', humanGate: false, currentHeadSha: SHA_B };
  assert.equal(evaluateMergeGate({ ...base, verdicts: [] }).reason, REASONS.NO_CURRENT_REVIEW_PASS);
  assert.equal(
    evaluateMergeGate({ ...base, verdicts: [pass(SHA_A)] }).reason,
    REASONS.NO_CURRENT_REVIEW_PASS,
    'PASS cua HEAD A khong mo merge cho HEAD B',
  );
  assert.equal(
    evaluateMergeGate({ ...base, verdicts: [block(SHA_B)] }).reason,
    REASONS.NO_CURRENT_REVIEW_PASS,
  );
  assert.equal(
    evaluateMergeGate({ ...base, verdicts: [pass(SHA_B), block(SHA_B)] }).reason,
    REASONS.NO_CURRENT_REVIEW_PASS,
    'phan xet MOI NHAT cua HEAD thang',
  );
  assert.deepEqual(evaluateMergeGate({ ...base, verdicts: [block(SHA_B), pass(SHA_B)] }), {
    ok: true,
  });
  assert.deepEqual(evaluateMergeGate({ ...base, verdicts: [pass(SHA_A), pass(SHA_B)] }), {
    ok: true,
  });
  assert.equal(
    evaluateMergeGate({ ...base, currentHeadSha: null, verdicts: [pass()] }).reason,
    REASONS.NO_CURRENT_REVIEW_PASS,
  );
});

test('DONE bi tu choi TRUOC runtime proof khi hop dong doi proof', () => {
  const rp = { required: true, env: 'gd1-test' };
  assert.equal(
    evaluateTaskDoneGate({ runtimeProof: rp, message: done(), proofs: [] }).reason,
    REASONS.RUNTIME_PROOF_MISSING,
  );
  assert.deepEqual(evaluateTaskDoneGate({ runtimeProof: rp, message: done(), proofs: [proof()] }), {
    ok: true,
  });
});

test('proof phai dung release va dung env; FAIL chan DONE; co proof ma RUNTIME_VERIFIED=false cung tu choi', () => {
  const rp = { required: true, env: 'gd1-test' };
  assert.equal(
    evaluateTaskDoneGate({
      runtimeProof: rp,
      message: done(),
      proofs: [proof({ release_sha: SHA_A })],
    }).reason,
    REASONS.RUNTIME_PROOF_RELEASE_MISMATCH,
  );
  assert.equal(
    evaluateTaskDoneGate({
      runtimeProof: rp,
      message: done(),
      proofs: [proof({ env: 'production' })],
    }).reason,
    REASONS.RUNTIME_PROOF_ENV_MISMATCH,
  );
  assert.equal(
    evaluateTaskDoneGate({
      runtimeProof: rp,
      message: done(),
      proofs: [proof({ verdict: 'FAIL' })],
    }).reason,
    REASONS.RUNTIME_PROOF_FAILED,
  );
  assert.equal(
    evaluateTaskDoneGate({
      runtimeProof: rp,
      message: done(),
      proofs: [proof(), proof({ verdict: 'FAIL' })],
    }).reason,
    REASONS.RUNTIME_PROOF_FAILED,
    'proof moi nhat thang',
  );
  assert.deepEqual(
    evaluateTaskDoneGate({
      runtimeProof: rp,
      message: done(),
      proofs: [proof({ verdict: 'FAIL' }), proof()],
    }),
    { ok: true },
  );
  assert.equal(
    evaluateTaskDoneGate({
      runtimeProof: rp,
      message: done({ runtime_verified: false }),
      proofs: [proof()],
    }).reason,
    REASONS.RUNTIME_VERIFIED_FLAG_REQUIRED,
  );
});

test('khong doi proof: DONE voi RUNTIME_VERIFIED=false hop le; =true ma khong co proof la LOI KHAI', () => {
  const rp = { required: false };
  assert.deepEqual(
    evaluateTaskDoneGate({
      runtimeProof: rp,
      message: done({ runtime_verified: false }),
      proofs: [],
    }),
    { ok: true },
  );
  assert.equal(
    evaluateTaskDoneGate({
      runtimeProof: rp,
      message: done({ runtime_verified: true }),
      proofs: [],
    }).reason,
    REASONS.RUNTIME_VERIFIED_CLAIM_WITHOUT_PROOF,
  );
  assert.deepEqual(
    evaluateTaskDoneGate({
      runtimeProof: rp,
      message: done({ runtime_verified: true }),
      proofs: [proof()],
    }),
    { ok: true },
  );
  assert.equal(
    evaluateTaskDoneGate({
      runtimeProof: rp,
      message: done({ runtime_verified: false }),
      proofs: [proof({ verdict: 'FAIL' })],
    }).reason,
    REASONS.RUNTIME_PROOF_FAILED,
    'co proof FAIL thi khong duoc DONE du khong doi proof',
  );
});
