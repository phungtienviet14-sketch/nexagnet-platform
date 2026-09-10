/**
 * POC-6 — the handoff that does NOT stop at CI green.
 *
 * A green pipeline says the code compiles and the tests the team wrote agree with it. It
 * says nothing about whether the thing runs. So there is no path from "CI green" straight
 * to DONE here; a runtime proof is a separate, required input.
 *
 * And a runtime proof is a statement about ONE release. Evidence gathered from a stack
 * running commit A cannot be used to declare commit B done - the same rule as the review
 * verdict in POC-3, for the same reason: the moment the artefact changes, the observation
 * stops describing it.
 *
 * This does not invent a new verification mechanism. `deploy/netviet/verify-deployment.mjs`
 * already binds observed runtime identity to declared release identity field by field; this
 * module is the state machine around it, and the test suite exercises the real thing.
 */

const SHA_PATTERN = /^[0-9a-f]{40}$/;

export const RUNTIME = {
  DONE_ELIGIBLE: 'DONE_ELIGIBLE',
  BLOCK_INVALID_SHA: 'BLOCK_INVALID_SHA',
  BLOCK_CI_RED: 'BLOCK_CI_RED',
  BLOCK_NO_RUNTIME_PROOF: 'BLOCK_NO_RUNTIME_PROOF',
  BLOCK_STALE_RUNTIME_PROOF: 'BLOCK_STALE_RUNTIME_PROOF',
  BLOCKED_RUNTIME: 'BLOCKED_RUNTIME',
};

/**
 * @param {object} input
 * @param {string} input.mergedSha  the commit that is a candidate for DONE
 * @param {string} input.ci         'green' or anything else
 * @param {{gitSha?: string, ok?: boolean, runId?: string}|null} input.runtimeProof
 */
export function evaluateRuntimeHandoff({ mergedSha, ci = 'unknown', runtimeProof = null } = {}) {
  const sha = String(mergedSha ?? '').toLowerCase();
  if (!SHA_PATTERN.test(sha)) {
    return { outcome: RUNTIME.BLOCK_INVALID_SHA, mergedSha: sha };
  }
  if (ci !== 'green') {
    return { outcome: RUNTIME.BLOCK_CI_RED, mergedSha: sha, detail: { ci } };
  }
  // CI green is NOT done. This is the whole point of the PoC.
  if (!runtimeProof) {
    return { outcome: RUNTIME.BLOCK_NO_RUNTIME_PROOF, mergedSha: sha };
  }
  const proofSha = String(runtimeProof.gitSha ?? '').toLowerCase();
  if (proofSha !== sha) {
    return {
      outcome: RUNTIME.BLOCK_STALE_RUNTIME_PROOF,
      mergedSha: sha,
      detail: { proofGitSha: proofSha || null, runId: runtimeProof.runId ?? null },
    };
  }
  if (runtimeProof.ok !== true) {
    return {
      outcome: RUNTIME.BLOCKED_RUNTIME,
      mergedSha: sha,
      detail: { errors: runtimeProof.errors ?? [] },
    };
  }
  return { outcome: RUNTIME.DONE_ELIGIBLE, mergedSha: sha, detail: { runId: runtimeProof.runId ?? null } };
}
