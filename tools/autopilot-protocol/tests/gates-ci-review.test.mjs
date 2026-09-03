import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { RETRY_CEILINGS } from '../validator/constants.mjs';
import {
  evaluateCiGreen,
  evaluateRetry,
  evaluateReviewRequestGate,
  evaluateReviewVerdict,
  requiredChecksFromRuleset,
} from '../validator/gates.mjs';
import { REASONS } from '../validator/reasons.mjs';
import { REQUIRED_CHECKS, SHA_A, SHA_B, greenChecks } from './helpers.mjs';

const RULESET = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  '.github',
  'rulesets',
  'main-protection.json',
);

test('required check doc tu ruleset that cua repo = 7 ten trong github-governance.md §2.1', () => {
  const checks = requiredChecksFromRuleset(JSON.parse(readFileSync(RULESET, 'utf8')));
  assert.deepEqual(checks, [...REQUIRED_CHECKS]);
  assert.equal(checks.length, 7);
});

test('ruleset khong co required_status_checks => danh sach rong => cong CI khong bao gio mo', () => {
  assert.deepEqual(requiredChecksFromRuleset({ rules: [{ type: 'deletion' }] }), []);
  assert.deepEqual(requiredChecksFromRuleset(null), []);
  assert.equal(
    evaluateCiGreen({ headSha: SHA_A, checkRuns: greenChecks(SHA_A), requiredChecks: [] }).reason,
    REASONS.NO_REQUIRED_CHECKS,
  );
});

test('CI xanh khi va chi khi MOI required check success tren DUNG HEAD', () => {
  assert.deepEqual(
    evaluateCiGreen({
      headSha: SHA_A,
      checkRuns: greenChecks(SHA_A),
      requiredChecks: REQUIRED_CHECKS,
    }),
    { ok: true },
  );
  const missing = evaluateCiGreen({
    headSha: SHA_A,
    checkRuns: greenChecks(SHA_A).filter((r) => r.name !== 'images'),
    requiredChecks: REQUIRED_CHECKS,
  });
  assert.equal(missing.reason, REASONS.CI_CHECK_MISSING);
  assert.deepEqual(missing.detail.missing, ['images']);
  const red = evaluateCiGreen({
    headSha: SHA_A,
    checkRuns: greenChecks(SHA_A, { audit: 'failure' }),
    requiredChecks: REQUIRED_CHECKS,
  });
  assert.equal(red.reason, REASONS.CI_CHECK_NOT_GREEN);
  assert.deepEqual(red.detail.notGreen, ['audit']);
  const pending = evaluateCiGreen({
    headSha: SHA_A,
    checkRuns: greenChecks(SHA_A, { e2e: null }),
    requiredChecks: REQUIRED_CHECKS,
  });
  assert.equal(
    pending.reason,
    REASONS.CI_CHECK_NOT_GREEN,
    'dang chay (conclusion null) chua phai xanh',
  );
  const otherHead = evaluateCiGreen({
    headSha: SHA_A,
    checkRuns: greenChecks(SHA_B),
    requiredChecks: REQUIRED_CHECKS,
  });
  assert.equal(otherHead.reason, REASONS.CI_CHECK_MISSING, 'check xanh cua HEAD khac khong tinh');
  assert.equal(
    evaluateCiGreen({ headSha: SHA_A, checkRuns: undefined, requiredChecks: REQUIRED_CHECKS })
      .reason,
    REASONS.CI_EVIDENCE_MISSING,
  );
});

test('mot check chay hai lan, lan sau do => khong xanh (khong lay lan xanh cu lam bang chung)', () => {
  const runs = [...greenChecks(SHA_A), { name: 'verify', conclusion: 'failure', head_sha: SHA_A }];
  assert.equal(
    evaluateCiGreen({ headSha: SHA_A, checkRuns: runs, requiredChecks: REQUIRED_CHECKS }).reason,
    REASONS.CI_CHECK_NOT_GREEN,
  );
});

test('REVIEW_REQUEST: HEAD trong thong diep phai la HEAD hien tai, roi moi xet CI', () => {
  const ok = evaluateReviewRequestGate({
    message: { head_sha: SHA_A },
    currentHeadSha: SHA_A,
    checkRuns: greenChecks(SHA_A),
    requiredChecks: REQUIRED_CHECKS,
  });
  assert.deepEqual(ok, { ok: true });
  const stale = evaluateReviewRequestGate({
    message: { head_sha: SHA_A },
    currentHeadSha: SHA_B,
    checkRuns: greenChecks(SHA_B),
    requiredChecks: REQUIRED_CHECKS,
  });
  assert.equal(stale.reason, REASONS.HEAD_MISMATCH);
  const red = evaluateReviewRequestGate({
    message: { head_sha: SHA_A },
    currentHeadSha: SHA_A,
    checkRuns: greenChecks(SHA_A, { verify: 'failure' }),
    requiredChecks: REQUIRED_CHECKS,
  });
  assert.equal(
    red.reason,
    REASONS.CI_CHECK_NOT_GREEN,
    'REVIEW_REQUEST bi tu choi khi required CI chua xanh',
  );
});

test('exact-SHA: phan xet chi hien hanh cho dung HEAD no neu; HEAD doi => STALE_VERDICT', () => {
  assert.deepEqual(evaluateReviewVerdict({ verdict: { head_sha: SHA_A }, currentHeadSha: SHA_A }), {
    ok: true,
  });
  const stale = evaluateReviewVerdict({ verdict: { head_sha: SHA_A }, currentHeadSha: SHA_B });
  assert.equal(stale.reason, REASONS.STALE_VERDICT);
  assert.deepEqual(stale.detail, { verdictHead: SHA_A, currentHead: SHA_B });
});

test('tran retry mac dinh V0 = 3/3; lan thu 4 => RETRY_CEILING_EXHAUSTED', () => {
  assert.deepEqual(RETRY_CEILINGS, {
    MAX_CI_FIX_ATTEMPTS: 3,
    MAX_REVIEW_FIX_ATTEMPTS: 3,
    MAX_HEAD_REVISIONS: 10,
  });
  for (const loop of ['ci', 'review']) {
    for (const used of [0, 1, 2]) {
      const r = evaluateRetry({ loop, attemptsUsed: used });
      assert.deepEqual(r, { ok: true, attempt: used + 1, ceiling: 3 }, `${loop} lan ${used + 1}`);
    }
    const exhausted = evaluateRetry({ loop, attemptsUsed: 3 });
    assert.equal(exhausted.reason, REASONS.RETRY_CEILING_EXHAUSTED, loop);
    assert.deepEqual(exhausted.detail, { loop, attemptsUsed: 3, ceiling: 3 });
  }
  assert.equal(
    evaluateRetry({
      loop: 'ci',
      attemptsUsed: 1,
      ceilings: { MAX_CI_FIX_ATTEMPTS: 1, MAX_REVIEW_FIX_ATTEMPTS: 1 },
    }).ok,
    false,
    'tran co the cau hinh, nhung luon huu han',
  );
});
