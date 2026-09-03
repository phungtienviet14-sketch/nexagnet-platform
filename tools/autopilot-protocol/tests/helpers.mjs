/**
 * Du lieu TONG HOP dung chung cho bo test. Khong co SHA/issue/PR that nao o day — moi gia tri
 * la mau, va co y de de nhin (40 chu 'a', 40 chu 'b', ...).
 */
import { MARKERS } from '../validator/constants.mjs';
import { applyMessage, createTask } from '../validator/protocol.mjs';

export const SHA_A = 'a'.repeat(40);
export const SHA_B = 'b'.repeat(40);
export const SHA_MAIN = 'd'.repeat(40);
export const SHA_MERGE = 'e'.repeat(40);

export const ISSUE = 200;
export const PR = 201;

/** Bay required check cua repo — khop `.github/rulesets/main-protection.json`. */
export const REQUIRED_CHECKS = Object.freeze([
  'audit',
  'e2e',
  'images',
  'integration',
  'tenant-packs',
  'verify',
  'workflow-integration',
]);

/** Check-run xanh cho MOI required check tren mot HEAD. */
export const greenChecks = (headSha, overrides = {}) =>
  REQUIRED_CHECKS.map((name) => ({
    name,
    conclusion: name in overrides ? overrides[name] : 'success',
    head_sha: headSha,
  }));

/** Hop dong MEDIUM, doi runtime proof o gd1-test. */
export const contract = (overrides = {}) => ({
  protocol: 'V0',
  task_id: 'T-SAMPLE',
  goal: 'Muc tieu mau',
  context: 'Boi canh mau',
  scope: ['viec 1'],
  out_of_scope: ['viec ngoai'],
  acceptance: ['tieu chi 1'],
  risk: 'MEDIUM',
  human_gate: false,
  dependencies: [],
  runtime_proof: { required: true, env: 'gd1-test' },
  ...overrides,
});

/** Thong diep JSON canonical cho mot loai, voi cac truong mac dinh hop le. */
export function message(type, fields = {}) {
  const base = { protocol: 'V0', marker: MARKERS[type], type, issue: ISSUE };
  const defaults = {
    TASK_READY: { risk: 'MEDIUM' },
    BUILD_STARTED: { branch: 'claude/sample-branch', base_sha: SHA_MAIN },
    BUILD_READY: { pr: PR, head_sha: SHA_A },
    CI_FAIL: { pr: PR, head_sha: SHA_A, ci_run: 1001 },
    REVIEW_REQUEST: { pr: PR, head_sha: SHA_A, ci_run: 1002, risk: 'MEDIUM' },
    REVIEW_PASS: { pr: PR, head_sha: SHA_A },
    REVIEW_BLOCK: { pr: PR, head_sha: SHA_A, blockers: ['thieu test'] },
    RUNTIME_PROOF: {
      pr: PR,
      release_sha: SHA_MERGE,
      env: 'gd1-test',
      deploy_run: 2001,
      verdict: 'PASS',
    },
    TASK_DONE: { merge_sha: SHA_MERGE, runtime_verified: true },
  };
  return { ...base, ...defaults[type], ...fields };
}

/** Ap lien tiep nhieu thong diep; nem neu mot buoc bi tu choi (test happy-path dung). */
export function drive(task, steps) {
  return steps.reduce((current, [msg, context]) => {
    const result = applyMessage(current, msg, context);
    if (!result.ok)
      throw new Error(
        `buoc ${msg.type} bi tu choi: ${result.reason} ${JSON.stringify(result.detail)}`,
      );
    return result.task;
  }, task);
}

/** Task da di toi REVIEWING voi HEAD = SHA_A, CI xanh. */
export function taskInReviewing(overrides = {}) {
  const task = createTask({ issue: ISSUE, contract: contract(overrides) });
  const risk = overrides.risk ?? 'MEDIUM';
  return drive(task, [
    [message('TASK_READY', { risk })],
    [message('BUILD_STARTED')],
    [message('BUILD_READY')],
    [
      message('REVIEW_REQUEST', { risk }),
      { checkRuns: greenChecks(SHA_A), requiredChecks: REQUIRED_CHECKS },
    ],
  ]);
}
