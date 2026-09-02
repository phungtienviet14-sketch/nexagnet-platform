import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { OUTCOME, RISK, classifyRisk, decide } from './policy.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const policy = JSON.parse(readFileSync(join(here, 'policy.json'), 'utf8'));

/** A task where everything a gate could complain about is already fine. */
const green = (over = {}) => ({
  changedPaths: ['docs/poc/autopilot/note.md'],
  topics: [],
  ownershipOverlapWith: [],
  customerAuthority: 'present',
  businessSource: 'present',
  ciAttempts: 0,
  runtimeAttempts: 0,
  ci: 'green',
  review: 'ALLOW',
  ...over,
});

test('a documentation-only change is LOW risk', () => {
  assert.equal(classifyRisk({ changedPaths: ['docs/a.md'] }, policy).risk, RISK.LOW);
});

test('ordinary application code is MEDIUM risk', () => {
  assert.equal(classifyRisk({ changedPaths: ['apps/web/app/page.tsx'] }, policy).risk, RISK.MEDIUM);
});

test('one high-risk path outranks any number of harmless ones', () => {
  const paths = ['README.md', 'docs/a.md', 'docs/b.md', 'apps/api/src/auth/token.ts'];
  assert.equal(classifyRisk({ changedPaths: paths }, policy).risk, RISK.HIGH);
});

test('every named high-risk topic classifies HIGH on its own', () => {
  for (const topic of policy.highRiskTopics) {
    const { risk } = classifyRisk({ changedPaths: ['docs/a.md'], topics: [topic] }, policy);
    assert.equal(risk, RISK.HIGH, `topic ${topic} should be HIGH`);
  }
});

test('LOW risk with CI green and review PASS is eligible', () => {
  const d = decide(green(), policy);
  assert.equal(d.risk, RISK.LOW);
  assert.equal(d.outcome, OUTCOME.ELIGIBLE);
});

test('MEDIUM risk with CI green and review PASS follows the configured gate', () => {
  const task = green({ changedPaths: ['apps/web/app/page.tsx'] });
  assert.equal(policy.autoMerge.MEDIUM, true);
  assert.equal(decide(task, policy).outcome, OUTCOME.ELIGIBLE);

  const stricter = { ...policy, autoMerge: { ...policy.autoMerge, MEDIUM: false } };
  assert.equal(decide(task, stricter).outcome, OUTCOME.HUMAN);
});

// THE ONE THAT MATTERS. A HIGH-risk change with nothing at all wrong with it still stops.
test('HIGH risk still requires a human even when every gate is green', () => {
  for (const paths of [
    ['apps/api/src/auth/token.ts'],
    ['apps/api/prisma/migrations/20260101_drop/migration.sql'],
    ['deploy/netviet/render-secrets.sh'],
    ['tenants/ultty/tenant.json'],
    ['.github/workflows/ci.yml'],
  ]) {
    const d = decide(green({ changedPaths: paths }), policy);
    assert.equal(d.risk, RISK.HIGH, paths[0]);
    assert.equal(d.outcome, OUTCOME.HUMAN, paths[0]);
  }
});

test('ownership overlap blocks before anything else is considered', () => {
  const d = decide(green({ ownershipOverlapWith: ['#77'] }), policy);
  assert.equal(d.outcome, OUTCOME.BLOCKED_OVERLAP);
  assert.deepEqual(d.detail.overlapWith, ['#77']);
});

test('a missing business source blocks', () => {
  assert.equal(decide(green({ businessSource: 'missing' }), policy).outcome, OUTCOME.BLOCKED_BUSINESS);
});

test('missing customer authority blocks', () => {
  assert.equal(decide(green({ customerAuthority: 'missing' }), policy).outcome, OUTCOME.BLOCKED_DATA);
});

test('CI retries stop at the cap instead of running forever', () => {
  const cap = policy.maxAttempts.ci;
  assert.equal(decide(green({ ciAttempts: cap - 1, ci: 'red' }), policy).outcome, OUTCOME.BLOCKED_CI_RED);
  assert.equal(decide(green({ ciAttempts: cap, ci: 'red' }), policy).outcome, OUTCOME.BLOCKED_CI);
  assert.equal(decide(green({ ciAttempts: cap + 5, ci: 'red' }), policy).outcome, OUTCOME.BLOCKED_CI);
});

test('runtime retries stop at the cap too', () => {
  const cap = policy.maxAttempts.runtime;
  assert.equal(decide(green({ runtimeAttempts: cap }), policy).outcome, OUTCOME.BLOCKED_RUNTIME);
});

test('a red CI blocks even at LOW risk', () => {
  assert.equal(decide(green({ ci: 'red' }), policy).outcome, OUTCOME.BLOCKED_CI_RED);
});

test('a review that says BLOCK blocks even at LOW risk', () => {
  assert.equal(decide(green({ review: 'BLOCK' }), policy).outcome, OUTCOME.BLOCKED_REVIEW);
});

// An unreported gate is the case that quietly ships things. Undeclared must never read as
// passed, so every omitted field below has to produce a blocker rather than an allowance.
test('an omitted review is a missing review, not an approval', () => {
  assert.equal(decide(green({ review: undefined }), policy).outcome, OUTCOME.BLOCKED_REVIEW);
});

test('an omitted CI result is not a green CI', () => {
  assert.equal(decide(green({ ci: undefined }), policy).outcome, OUTCOME.BLOCKED_CI_RED);
});

test('an empty task is never eligible', () => {
  const d = decide({}, policy);
  assert.notEqual(d.outcome, OUTCOME.ELIGIBLE);
  assert.equal(d.outcome, OUTCOME.BLOCKED_BUSINESS);
});

test('there is exactly one route to ELIGIBLE and every omission leaves it', () => {
  assert.equal(decide(green(), policy).outcome, OUTCOME.ELIGIBLE);
  for (const field of ['customerAuthority', 'businessSource', 'ci', 'review']) {
    const d = decide(green({ [field]: undefined }), policy);
    assert.notEqual(d.outcome, OUTCOME.ELIGIBLE, `omitting ${field} must not stay eligible`);
  }
});

test('the decision is a single value, never a boolean pair', () => {
  const outcomes = new Set(Object.values(OUTCOME));
  for (const task of [green(), green({ ci: 'red' }), green({ ownershipOverlapWith: ['#1'] })]) {
    assert.ok(outcomes.has(decide(task, policy).outcome));
  }
});
