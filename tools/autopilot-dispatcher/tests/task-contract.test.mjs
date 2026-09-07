import assert from 'node:assert/strict';
import test from 'node:test';
import { REASONS } from '../src/errors.mjs';
import { canonicalJson, contractDigest, readTaskContract } from '../src/task-reader.mjs';
import { issueBodyFor, validContract } from './helpers.mjs';

test('reads a canonical contract out of an issue body', () => {
  const contract = validContract();
  const result = readTaskContract({ body: issueBodyFor(contract), issue: 256 });
  assert.equal(result.ok, true);
  assert.equal(result.contract.task_id, 'DEMO_TASK_V0');
  assert.match(result.digest, /^[0-9a-f]{64}$/);
});

test('a HIGH-risk contract without a human gate is rejected by protocol semantics', () => {
  const body = issueBodyFor(validContract({ risk: 'HIGH', human_gate: false }));
  const result = readTaskContract({ body, issue: 256 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'HIGH_RISK_REQUIRES_HUMAN_GATE');
});

test('declaring risk areas while claiming a low risk is rejected', () => {
  const body = issueBodyFor(validContract({ risk: 'LOW', risk_areas: ['SECURITY'] }));
  const result = readTaskContract({ body, issue: 256 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'RISK_UNDERSTATED_FOR_AREAS');
});

test('a contract missing required fields is rejected', () => {
  const broken = validContract();
  delete broken.acceptance;
  const result = readTaskContract({ body: issueBodyFor(broken), issue: 256 });
  assert.equal(result.ok, false);
});

test('an issue with no contract marker is rejected', () => {
  const result = readTaskContract({ body: 'please build me a dispatcher, thanks', issue: 256 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'CONTRACT_MARKER_MISSING');
});

test('prose before the marker cannot activate a contract', () => {
  const body = ['Here is what a contract looks like:', '', issueBodyFor(validContract())].join(
    '\n',
  );
  const result = readTaskContract({ body, issue: 256 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'CONTRACT_MARKER_NOT_FIRST_LINE');
});

test('a contract block that is not valid JSON is rejected', () => {
  const body = ['<!-- AUTOPILOT_TASK_V0 -->', '', '```json', '{ nope', '```'].join('\n');
  const result = readTaskContract({ body, issue: 256 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'CONTRACT_BLOCK_NOT_JSON');
});

test('a contract that claims a different issue number is rejected', () => {
  const body = issueBodyFor(validContract({ issue: 999 }));
  const result = readTaskContract({ body, issue: 256 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, REASONS.CONTRACT_ISSUE_MISMATCH);
});

test('the digest ignores key order but not values', () => {
  const a = { protocol: 'V0', task_id: 'A', goal: 'g' };
  const b = { goal: 'g', task_id: 'A', protocol: 'V0' };
  assert.equal(canonicalJson(a), canonicalJson(b));
  assert.equal(contractDigest(a), contractDigest(b));
  assert.notEqual(contractDigest(a), contractDigest({ ...a, goal: 'g2' }));
});

test('the digest is stable across repeated reads of the same body', () => {
  const body = issueBodyFor(validContract());
  const first = readTaskContract({ body, issue: 256 });
  const second = readTaskContract({ body, issue: 256 });
  assert.equal(first.digest, second.digest);
});

test('editing any contract field changes the digest', () => {
  const base = readTaskContract({ body: issueBodyFor(validContract()), issue: 256 });
  const edited = readTaskContract({
    body: issueBodyFor(validContract({ scope: ['one thing', 'and another'] })),
    issue: 256,
  });
  assert.notEqual(base.digest, edited.digest);
});

test('trailing human prose does not change the digest', () => {
  const contract = validContract();
  const a = readTaskContract({ body: issueBodyFor(contract, 'notes A'), issue: 256 });
  const b = readTaskContract({
    body: issueBodyFor(contract, 'a totally different essay'),
    issue: 256,
  });
  assert.equal(a.digest, b.digest);
});
