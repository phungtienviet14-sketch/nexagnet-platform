/**
 * Du lieu TONG HOP dung chung cho bo test. Khong co SHA/issue/PR that nao o day — moi gia tri
 * la mau, va co y de de nhin (40 chu 'a', 40 chu 'b', ...).
 */
import { ACTORS, MARKERS, MESSAGE_PRODUCERS } from '../validator/constants.mjs';
import { definePrincipalRegistry } from '../validator/principal.mjs';
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

/**
 * Ba principal TONG HOP, dung hinh dang cai dat that: mot GitHub App lam builder/fixer/orchestrator
 * + runtime verifier, mot tai khoan nguoi cho ChatGPT (architect + reviewer), va mot tai khoan
 * nguoi that. `id` la slug/login — KHONG BAO GIO la mot gia tri `ACTORS.*`.
 */
export const APP_PRINCIPAL = Object.freeze({ kind: 'APP', id: 'nexagent-autopilot' });
export const REVIEWER_PRINCIPAL = Object.freeze({ kind: 'USER', id: 'chatgpt-reviewer-account' });
export const HUMAN_PRINCIPAL = Object.freeze({ kind: 'USER', id: 'repo-owner-account' });

/** So do cai dat mau. Phan lap nhiem vu: principal cua App KHONG duoc giu `CHATGPT_REVIEWER`. */
export const REGISTRY = definePrincipalRegistry([
  {
    principal: APP_PRINCIPAL,
    roles: [ACTORS.BUILDER, ACTORS.FIXER, ACTORS.ORCHESTRATOR, ACTORS.RUNTIME_VERIFIER],
  },
  { principal: REVIEWER_PRINCIPAL, roles: [ACTORS.ARCHITECT, ACTORS.REVIEWER] },
  { principal: HUMAN_PRINCIPAL, roles: [ACTORS.HUMAN] },
]).registry;

/** Nguoi phat HOP LE dau tien cua mot loai thong diep, theo `MESSAGE_PRODUCERS`. */
export const producerOf = (type) => MESSAGE_PRODUCERS[type]?.[0];

/** Principal DUY NHAT trong `REGISTRY` giu mot vai. Dung de dung context cho tung loai thong diep. */
export const principalHolding = (role) =>
  REGISTRY.entries.find((entry) => entry.roles.includes(role))?.principal;

/**
 * `applyMessage` voi provenance mac dinh DUNG: principal that giu vai hop le cua loai thong diep.
 *
 * Khong test nao duoc mac dinh "bo qua phan quyen" — `applyMessage` doi mot principal DA XAC THUC
 * cong mot so do (§2.1), va thieu bat ky cai nao la mot ly do tu choi rieng. Test nao NOI ve phan
 * quyen thi truyen `principal` / `principalRegistry` / `assertedRole` tay de de.
 */
export const apply = (task, msg, context = {}) =>
  applyMessage(task, msg, {
    principal: principalHolding(producerOf(msg.type)),
    principalRegistry: REGISTRY,
    ...context,
  });

/** Ap lien tiep nhieu thong diep; nem neu mot buoc bi tu choi (test happy-path dung). */
export function drive(task, steps) {
  return steps.reduce((current, [msg, context]) => {
    const result = apply(current, msg, context);
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
