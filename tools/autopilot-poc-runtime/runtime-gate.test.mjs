import test from 'node:test';
import assert from 'node:assert/strict';
import { RUNTIME, evaluateRuntimeHandoff } from './runtime-gate.mjs';
import { verifyDeployment } from '../../deploy/netviet/verify-deployment.mjs';

const A = '1'.repeat(40);
const B = '2'.repeat(40);
const proof = (over = {}) => ({ gitSha: B, ok: true, runId: '999', ...over });

// THE ONE THAT MATTERS. There is no edge from "CI green" to DONE.
test('CI green on its own is never DONE', () => {
  const d = evaluateRuntimeHandoff({ mergedSha: B, ci: 'green' });
  assert.notEqual(d.outcome, RUNTIME.DONE_ELIGIBLE);
  assert.equal(d.outcome, RUNTIME.BLOCK_NO_RUNTIME_PROOF);
});

test('a red CI is blocked before runtime is even considered', () => {
  assert.equal(evaluateRuntimeHandoff({ mergedSha: B, ci: 'red', runtimeProof: proof() }).outcome, RUNTIME.BLOCK_CI_RED);
});

test('an unreported CI is not a green CI', () => {
  assert.equal(evaluateRuntimeHandoff({ mergedSha: B, runtimeProof: proof() }).outcome, RUNTIME.BLOCK_CI_RED);
});

test('a failed runtime proof blocks rather than falling back to CI', () => {
  const d = evaluateRuntimeHandoff({
    mergedSha: B,
    ci: 'green',
    runtimeProof: proof({ ok: false, errors: ['api container unhealthy'] }),
  });
  assert.equal(d.outcome, RUNTIME.BLOCKED_RUNTIME);
  assert.deepEqual(d.detail.errors, ['api container unhealthy']);
});

test('a runtime proof gathered at A cannot declare B done', () => {
  const d = evaluateRuntimeHandoff({ mergedSha: B, ci: 'green', runtimeProof: proof({ gitSha: A }) });
  assert.equal(d.outcome, RUNTIME.BLOCK_STALE_RUNTIME_PROOF);
  assert.equal(d.detail.proofGitSha, A);
});

test('a passing runtime proof bound to this exact commit is eligible for DONE', () => {
  const d = evaluateRuntimeHandoff({ mergedSha: B, ci: 'green', runtimeProof: proof() });
  assert.equal(d.outcome, RUNTIME.DONE_ELIGIBLE);
  assert.equal(d.detail.runId, '999');
});

test('a candidate that is not a commit id is blocked', () => {
  assert.equal(evaluateRuntimeHandoff({ mergedSha: 'main', ci: 'green', runtimeProof: proof() }).outcome, RUNTIME.BLOCK_INVALID_SHA);
  assert.equal(evaluateRuntimeHandoff({}).outcome, RUNTIME.BLOCK_INVALID_SHA);
});

// The state machine above would be worthless if the repository's real verifier did not
// already enforce the same binding on the evidence itself. It does - this exercises it
// rather than restating it.
test('the repository verifier rejects runtime evidence observed at a different commit', () => {
  const tenant = { schemaVersion: 2, slug: 'ultty', branding: {}, capabilities: [] };
  const declared = {
    tenant: 'ultty',
    environment: 'gd1-test',
    target: 'netviet-shared-vm',
    gitSha: B,
    appDigest: `registry/app@sha256:${'a'.repeat(64)}`,
    flowiseDigest: `registry/flowise@sha256:${'b'.repeat(64)}`,
    tenantSchemaVersion: 2,
    workflowRunId: '123456789',
    deployedAt: '2026-08-20T10:00:00.000Z',
  };

  const matching = verifyDeployment({
    tenant,
    release: declared,
    evidence: { release: { ...declared } },
  });
  const stale = verifyDeployment({
    tenant,
    release: declared,
    evidence: { release: { ...declared, gitSha: A } },
  });

  const mismatch = /observed release gitSha does not match declared release identity/i;
  assert.ok(
    stale.errors.some((e) => mismatch.test(e)),
    `stale evidence should be rejected, got: ${stale.errors.join(' | ')}`,
  );
  assert.ok(
    !matching.errors.some((e) => mismatch.test(e)),
    'evidence observed at the declared commit must not raise the mismatch error',
  );
});
