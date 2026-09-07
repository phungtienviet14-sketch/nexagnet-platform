import assert from 'node:assert/strict';
import test from 'node:test';
import { DISPATCH_STATES, REASONS } from '../src/errors.mjs';
import { findHandoffMessages, verifyHandoff } from '../src/post-run-verifier.mjs';
import { fakeGh } from './helpers.mjs';

const REPO = 'acme/widgets';
const BRANCH = 'claude/autopilot/issue-256-aaaaaaaaaaaa';
const HEAD = 'd'.repeat(40);

const buildReady = (pr, headSha = HEAD) =>
  [
    '<!-- AUTOPILOT_BUILD_READY_V0 -->',
    'BUILD_READY',
    'ISSUE=256',
    `PR=${pr}`,
    `HEAD_SHA=${headSha}`,
  ].join('\n');

/** @param {Record<string, any>} routes */
const gh = (routes) =>
  fakeGh({
    [`/repos/${REPO}/git/ref/heads/`]: { ref: `refs/heads/${BRANCH}` },
    [`/repos/${REPO}/pulls?`]: [],
    [`/repos/${REPO}/issues/256/comments`]: [],
    ...routes,
  });

test('a schema-valid BUILD_READY bound to the real PR is a present handoff', async () => {
  const result = await verifyHandoff(
    gh({
      [`/repos/${REPO}/pulls?`]: [{ number: 700, head: { sha: HEAD } }],
      [`/repos/${REPO}/issues/700/comments`]: [{ body: buildReady(700) }],
    }),
    { repo: REPO, issue: 256, branch: BRANCH },
  );
  assert.equal(result.ok, true);
  assert.equal(result.state, DISPATCH_STATES.HANDOFF_PRESENT);
  assert.equal(result.pr, 700);
  assert.equal(result.headSha, HEAD);
  assert.deepEqual(result.handoffTypes, ['BUILD_READY']);
});

test('a clean exit with no PR and no handoff stays visibly incomplete', async () => {
  const result = await verifyHandoff(gh({}), { repo: REPO, issue: 256, branch: BRANCH });
  assert.equal(result.state, DISPATCH_STATES.HANDOFF_MISSING);
  assert.equal(result.reason, REASONS.HANDOFF_MISSING);
  assert.equal(result.pr, null);
});

test('a PR with no protocol message is still a missing handoff', async () => {
  const result = await verifyHandoff(
    gh({
      [`/repos/${REPO}/pulls?`]: [{ number: 700, head: { sha: HEAD } }],
      [`/repos/${REPO}/issues/700/comments`]: [{ body: 'looks good to me!' }],
    }),
    { repo: REPO, issue: 256, branch: BRANCH },
  );
  assert.equal(result.state, DISPATCH_STATES.HANDOFF_MISSING);
  assert.equal(result.pr, 700);
});

test('the words BUILD_READY in prose prove nothing without the protocol marker', () => {
  const found = findHandoffMessages(
    [
      { body: 'I finished the work. BUILD_READY. PR=700. HEAD_SHA=' + HEAD },
      { body: 'Status: BUILD_READY\nISSUE=256\nPR=700\nHEAD_SHA=' + HEAD },
      { body: '> <!-- AUTOPILOT_BUILD_READY_V0 -->\n> BUILD_READY' },
    ],
    { pr: 700 },
  );
  assert.deepEqual(found, []);
});

test('a marker that is not the first content line does not count', () => {
  const found = findHandoffMessages([{ body: `Here you go:\n\n${buildReady(700)}` }], { pr: 700 });
  assert.deepEqual(found, []);
});

test('a BUILD_READY pointing at a different PR is not this run handoff', () => {
  assert.deepEqual(findHandoffMessages([{ body: buildReady(999) }], { pr: 700 }), []);
  assert.equal(findHandoffMessages([{ body: buildReady(700) }], { pr: 700 }).length, 1);
});

test('a REVIEW_REQUEST also counts as a handoff', () => {
  const reviewRequest = [
    '<!-- AUTOPILOT_REVIEW_REQUEST_V0 -->',
    'REVIEW_REQUEST',
    'ISSUE=256',
    'PR=700',
    `HEAD_SHA=${HEAD}`,
    'CI_RUN=12345',
    'RISK=HIGH',
  ].join('\n');
  const found = findHandoffMessages([{ body: reviewRequest }], { pr: 700 });
  assert.equal(found.length, 1);
  assert.equal(found[0].type, 'REVIEW_REQUEST');
});

test('a handoff on the issue rather than the PR is still found', async () => {
  const result = await verifyHandoff(
    gh({
      [`/repos/${REPO}/pulls?`]: [{ number: 700, head: { sha: HEAD } }],
      [`/repos/${REPO}/issues/256/comments`]: [{ body: buildReady(700) }],
      [`/repos/${REPO}/issues/700/comments`]: [],
    }),
    { repo: REPO, issue: 256, branch: BRANCH },
  );
  assert.equal(result.state, DISPATCH_STATES.HANDOFF_PRESENT);
});

test('the verifier reads GitHub, never a process stdout', async () => {
  const client = gh({});
  await verifyHandoff(client, { repo: REPO, issue: 256, branch: BRANCH });
  assert.ok(client.calls.length >= 3);
  for (const call of client.calls) assert.match(call, new RegExp(`^/repos/${REPO}/`));
});
