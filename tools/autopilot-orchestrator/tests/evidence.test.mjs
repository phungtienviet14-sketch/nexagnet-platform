/**
 * Bang chung lay tu GITHUB API THAT — khong phai payload tong hop.
 *
 * Ba fixture trong `tests/fixtures/` duoc bat truc tiep tu REST cua chinh repo nay tai thoi diem
 * PR #155 xanh 7/7. Do la diem khac cot loi so voi 122 bai cua Protocol V0: o do moi bang chung la
 * do nguoi viet nghi ra, o day hinh dang la do GitHub quyet dinh.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  evaluateCiGreen,
  requiredChecksFromRuleset,
} from '@netviet/autopilot-protocol/validator/index.mjs';

import {
  checkRunsFromApi,
  headRepoIsSelf,
  headShaFromPull,
  requiredChecksFromBranchRules,
} from '../src/evidence.mjs';
import { ORCHESTRATOR_REASONS } from '../src/reasons.mjs';

/** @param {string} name */
const fixture = (name) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8'));

const BRANCH_RULES = fixture('branch-rules-main.json');
const CHECK_RUNS = fixture('check-runs-c86219b.json');
const PULL_155 = fixture('pull-155.json');

const HEAD = 'c86219b22be19ce3db7a9753bd9866316b654cbe';
const OTHER_HEAD = '3d11fbad86cf9dbc15978f6e2b741b669a5205c2';
const SEVEN = [
  'audit',
  'e2e',
  'images',
  'integration',
  'tenant-packs',
  'verify',
  'workflow-integration',
];

test('API tra ve MANG PHANG, khong phai { rules: [...] } — day la ly do adapter ton tai', () => {
  assert.ok(Array.isArray(BRANCH_RULES), 'fixture that phai la mang');
  assert.ok(!Object.hasOwn(/** @type {object} */ (BRANCH_RULES), 'rules'));
});

test('DUONG FAIL-OPEN neu ai do dua thang mang API vao requiredChecksFromRuleset', () => {
  // Khong nem, khong bao loi — tra ve MANG RONG. Mang rong di vao evaluateCiGreen thi hom nay ra
  // NO_REQUIRED_CHECKS, tuc "chua xanh"; nhung mot ban sau coi mang rong la "khong doi hoi gi" se
  // mo cong cho MOI HEAD. Bai nay khoa dung cho do.
  assert.deepEqual(requiredChecksFromRuleset(BRANCH_RULES), []);
  const adapted = requiredChecksFromBranchRules(BRANCH_RULES);
  assert.equal(adapted.ok, true);
  assert.deepEqual(adapted.ok === true ? adapted.value : null, SEVEN);
});

test('bay check bat buoc lay tu API trung khit voi tep ruleset trong repo — hom nay', () => {
  const fromApi = requiredChecksFromBranchRules(BRANCH_RULES);
  const fromFile = requiredChecksFromRuleset(
    JSON.parse(
      readFileSync(
        fileURLToPath(new URL('../../../.github/rulesets/main-protection.json', import.meta.url)),
        'utf8',
      ),
    ),
  );
  assert.equal(fromApi.ok, true);
  assert.deepEqual(fromApi.ok === true ? fromApi.value : null, fromFile);
});

test('khong phai mang => BRANCH_RULES_UNAVAILABLE, khong doan danh sach rong', () => {
  for (const bad of [undefined, null, {}, 'rules', 42]) {
    const result = requiredChecksFromBranchRules(bad);
    assert.equal(result.ok, false);
    assert.equal(
      result.ok === false ? result.reason : null,
      ORCHESTRATOR_REASONS.BRANCH_RULES_UNAVAILABLE,
    );
  }
});

test('mang rule khong co required_status_checks => bao, khong tra mang rong', () => {
  const result = requiredChecksFromBranchRules([{ type: 'deletion' }, { type: 'pull_request' }]);
  assert.equal(result.ok, false);
  assert.equal(
    result.ok === false ? result.reason : null,
    ORCHESTRATOR_REASONS.BRANCH_RULES_NO_REQUIRED_CHECKS,
  );
});

test('check-runs that: bay run, tat ca buoc vao dung HEAD', () => {
  const result = checkRunsFromApi(CHECK_RUNS);
  assert.equal(result.ok, true);
  const runs = result.ok === true ? result.value : [];
  assert.equal(runs.length, 7);
  assert.deepEqual(runs.map((run) => run.name).sort(), SEVEN);
  assert.ok(runs.every((run) => run.head_sha === HEAD));
  assert.ok(runs.every((run) => run.conclusion === 'success'));
});

test('mot run thieu head_sha => TU CHOI CA LO, khong bo rieng no di', () => {
  const poisoned = {
    check_runs: [...CHECK_RUNS.check_runs.slice(0, 6), { name: 'audit', conclusion: 'success' }],
  };
  const result = checkRunsFromApi(poisoned);
  assert.equal(result.ok, false);
  assert.equal(result.ok === false ? result.reason : null, ORCHESTRATOR_REASONS.CHECK_RUN_UNBOUND);
  // Bo rieng no di thi con sau run xanh, va evaluateCiGreen se bao thieu 'audit' — mot cau dung
  // nhung vi ly do SAI. Ta muon biet la BANG CHUNG hong, khong phai CI chua xong.
  assert.deepEqual(result.ok === false ? result.detail?.unbound : null, ['audit']);
});

test('than tra ve khong co check_runs => CHECK_RUNS_UNAVAILABLE', () => {
  for (const bad of [undefined, null, {}, { check_runs: 'nope' }]) {
    const result = checkRunsFromApi(bad);
    assert.equal(result.ok, false);
    assert.equal(
      result.ok === false ? result.reason : null,
      ORCHESTRATOR_REASONS.CHECK_RUNS_UNAVAILABLE,
    );
  }
});

test('HEAD cua PR lay tu API, va phai la SHA 40 hex', () => {
  const result = headShaFromPull(PULL_155);
  assert.equal(result.ok, true);
  assert.equal(result.ok === true ? result.value : null, HEAD);

  for (const bad of [{}, { head: {} }, { head: { sha: 'c86219b' } }, { head: { sha: 42 } }, null]) {
    const denied = headShaFromPull(bad);
    assert.equal(denied.ok, false);
    assert.equal(
      denied.ok === false ? denied.reason : null,
      ORCHESTRATOR_REASONS.PR_HEAD_UNAVAILABLE,
    );
  }
});

test('HEAD phai thuoc CHINH repo nay — mot cho kiem cho ca ba trigger', () => {
  const own = headRepoIsSelf(PULL_155, 'phungtienviet14-sketch/nexagnet-platform');
  assert.equal(own.ok, true);

  // `pull_request` chay ca tren PR den tu fork. Voi mot task HIGH / AUTH_AUTHORIZATION, huong dong
  // la TU CHOI: khong chay giao thuc tren mot cay ma repo nay khong so huu.
  const fork = headRepoIsSelf(PULL_155, 'nguoi-khac/nexagnet-platform');
  assert.equal(fork.ok, false);
  assert.equal(fork.ok === false ? fork.reason : null, ORCHESTRATOR_REASONS.FORK_HEAD_NOT_TRUSTED);

  // Doc khong ra nguon goc cung bi tu choi — "khong biet" khong duoc doc thanh "cua minh".
  for (const bad of [null, {}, { head: {} }, { head: { repo: {} } }, { head: { repo: null } }]) {
    const denied = headRepoIsSelf(bad, 'phungtienviet14-sketch/nexagnet-platform');
    assert.equal(denied.ok, false, JSON.stringify(bad));
    assert.equal(
      denied.ok === false ? denied.reason : null,
      ORCHESTRATOR_REASONS.FORK_HEAD_NOT_TRUSTED,
    );
  }
});

test('DAU-DEN-CUOI tren du lieu that: API => cong CI cua giao thuc => xanh dung o HEAD do', () => {
  const requiredChecks = requiredChecksFromBranchRules(BRANCH_RULES);
  const checkRuns = checkRunsFromApi(CHECK_RUNS);
  const headSha = headShaFromPull(PULL_155);
  assert.ok(requiredChecks.ok && checkRuns.ok && headSha.ok);

  const green = evaluateCiGreen({
    headSha: headSha.ok === true ? headSha.value : '',
    checkRuns: checkRuns.ok === true ? checkRuns.value : [],
    requiredChecks: requiredChecks.ok === true ? requiredChecks.value : [],
  });
  assert.equal(green.ok, true, `phai xanh o ${HEAD}`);

  // Cung bang chung do, hoi ve mot HEAD KHAC => khong duoc xanh. Cong exact-SHA dang chay tren du
  // lieu that, khong phai tren fixture nguoi viet nghi ra.
  const stale = evaluateCiGreen({
    headSha: OTHER_HEAD,
    checkRuns: checkRuns.ok === true ? checkRuns.value : [],
    requiredChecks: requiredChecks.ok === true ? requiredChecks.value : [],
  });
  assert.equal(stale.ok, false);
});
