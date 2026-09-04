/**
 * Quyet dinh chay tren COMMENT THAT cua PR #155, khong phai comment nguoi viet nghi ra.
 *
 * Bai quan trong nhat trong tep nay la bai dau: MOI thong diep orchestrator dinh dang len GitHub
 * phai doc nguoc lai duoc qua chinh validator cua giao thuc. Mot orchestrator sinh ra thong diep
 * khong hop le thi no dang noi mot thu ngon ngu khac voi thu no cuong che — va khong cong nao bat
 * duoc dieu do ngoai bai nay.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { REASONS, readMessage } from '@netviet/autopilot-protocol/validator/index.mjs';

import { ACTIONS, decideOnComment } from '../src/decide.mjs';
import { checkRunsFromApi, requiredChecksFromBranchRules } from '../src/evidence.mjs';
import { ORCHESTRATOR_REASONS } from '../src/reasons.mjs';
import { buildPrincipalRegistry } from '../src/registry.mjs';

/** @param {string} name */
const fixture = (name) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8'));

const COMMENTS = fixture('pr-155-comments.json');
const BRANCH_RULES = fixture('branch-rules-main.json');
const CHECK_RUNS = fixture('check-runs-c86219b.json');

/** @param {number} id */
const commentById = (id) => COMMENTS.find((/** @type {{ id: number }} */ c) => c.id === id);

const BUILD_READY = commentById(5535424344);
const REVIEW_PASS = commentById(5535457998);
const REVIEW_BLOCK = commentById(5529320305);

const HEAD = 'c86219b22be19ce3db7a9753bd9866316b654cbe';
const OLD_HEAD = '3d11fbad86cf9dbc15978f6e2b741b669a5205c2';
const CI_RUN = 33834237024;

const registryResult = buildPrincipalRegistry({
  repoOwnerLogin: 'phungtienviet14-sketch',
  reviewerAppSlug: 'chatgpt-codex-connector',
});
const REGISTRY = registryResult.registry ?? registryResult;

const requiredChecks = requiredChecksFromBranchRules(BRANCH_RULES);
const checkRuns = checkRunsFromApi(CHECK_RUNS);

/** @param {{ headSha?: string }} [over] */
const evidenceAt = (over = {}) => ({
  headSha: over.headSha ?? HEAD,
  checkRuns: checkRuns.ok === true ? checkRuns.value : [],
  requiredChecks: requiredChecks.ok === true ? requiredChecks.value : [],
  ciRunId: CI_RUN,
});

/** @param {Record<string, unknown>} [over] */
const decide = (over = {}) =>
  decideOnComment(
    /** @type {never} */ ({
      comment: BUILD_READY,
      evidence: evidenceAt(),
      registry: REGISTRY,
      issue: 153,
      pr: 155,
      risk: 'HIGH',
      ...over,
    }),
  );

test('MOI thong diep orchestrator dinh dang deu doc nguoc lai duoc qua validator cua giao thuc', () => {
  const green = decide();
  assert.equal(green.action, ACTIONS.POST_REVIEW_REQUEST);
  const parsedGreen = readMessage(/** @type {string} */ (green.body));
  assert.equal(parsedGreen.ok, true, `REVIEW_REQUEST khong hop le: ${JSON.stringify(parsedGreen)}`);

  // Cung bang chung do, bo mot check bat buoc => CI_FAIL. No cung phai hop le.
  const red = decide({
    evidence: {
      ...evidenceAt(),
      checkRuns: (checkRuns.ok === true ? checkRuns.value : []).filter(
        (run) => run.name !== 'audit',
      ),
    },
  });
  assert.equal(red.action, ACTIONS.POST_CI_FAIL);
  const parsedRed = readMessage(/** @type {string} */ (red.body));
  assert.equal(parsedRed.ok, true, `CI_FAIL khong hop le: ${JSON.stringify(parsedRed)}`);
  assert.equal(parsedRed.ok === true ? parsedRed.message.type : null, 'CI_FAIL');
});

test('BUILD_READY that + CI xanh that o dung HEAD => moi review, va dat nhan REVIEWING', () => {
  const result = decide();
  assert.equal(result.action, ACTIONS.POST_REVIEW_REQUEST);
  assert.deepEqual(result.labels.add, ['autopilot:reviewing']);
  assert.equal(result.idempotencyKey, `review-request:155:${HEAD}`);
});

test('CONG EXACT-SHA: cung comment do, HEAD hien tai da doi => tu choi HEAD_MISMATCH', () => {
  const result = decide({ evidence: evidenceAt({ headSha: OLD_HEAD }) });
  assert.equal(result.action, ACTIONS.POST_REJECTION);
  assert.equal(result.reason, REASONS.HEAD_MISMATCH);
  // Tu choi thi KHONG duoc dong vao nhan nao.
  assert.deepEqual(result.labels, { add: [], remove: [] });
});

test('REVIEW_PASS that cua ChatGPT bi tu choi vi thua truong — du lieu that, khong phai gia dinh', () => {
  const result = decide({ comment: REVIEW_PASS });
  assert.equal(result.action, ACTIONS.POST_REJECTION);
  assert.equal(result.reason, REASONS.UNKNOWN_FIELD);
  assert.match(/** @type {string} */ (result.body), /REASON=UNKNOWN_FIELD/);
});

test('REVIEW_BLOCK that parse duoc, nhung V0 read-only khong xu ly => bo qua, khong ghi gi', () => {
  const result = decide({ comment: REVIEW_BLOCK });
  assert.equal(result.action, ACTIONS.IGNORE);
  assert.equal(result.reason, ORCHESTRATOR_REASONS.EVENT_NOT_HANDLED);
  assert.equal(result.body, null);
  assert.deepEqual(result.labels, { add: [], remove: [] });
});

test('SAI VAI: app cua reviewer phat BUILD_READY => tu choi, va khong nhan nao bi doi', () => {
  const spoofed = { ...BUILD_READY, performed_via_github_app: { slug: 'chatgpt-codex-connector' } };
  const result = decide({ comment: spoofed });
  assert.equal(result.action, ACTIONS.POST_REJECTION);
  assert.equal(result.reason, REASONS.WRONG_PRODUCER);
  assert.deepEqual(result.labels, { add: [], remove: [] });
});

test('khong dan xuat duoc principal => PRINCIPAL_UNKNOWN, khong doan la chu repo', () => {
  const result = decide({ comment: { body: BUILD_READY.body } });
  assert.equal(result.action, ACTIONS.POST_REJECTION);
  assert.equal(result.reason, REASONS.PRINCIPAL_UNKNOWN);
});

test('comment nguoi thuong => bo qua im lang, khong phai tu choi', () => {
  const result = decide({ comment: { user: { login: 'ai-do' }, body: 'trong on lam nhe' } });
  assert.equal(result.action, ACTIONS.IGNORE);
  assert.equal(result.reason, ORCHESTRATOR_REASONS.NOT_A_PROTOCOL_MESSAGE);
  assert.equal(result.body, null);
});

test('so Issue/PR khai sai => tu choi, khong lang le xu ly cho task khac', () => {
  assert.equal(decide({ issue: 999 }).reason, REASONS.ISSUE_MISMATCH);
  assert.equal(decide({ pr: 999 }).reason, REASONS.PR_MISMATCH);
});

test('HAI BO MA TACH NHAU: ma cua orchestrator khong trung ma cua giao thuc', () => {
  const orchestrator = new Set(Object.values(ORCHESTRATOR_REASONS));
  const protocolReasons = new Set(Object.values(REASONS));
  const overlap = [...orchestrator].filter((code) => protocolReasons.has(code));
  assert.deepEqual(overlap, [], `hai bo ma khong duoc trung nhau: ${overlap.join(', ')}`);
});
