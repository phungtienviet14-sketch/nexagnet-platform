import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DECISION,
  REASON,
  evaluateReviewGate,
  parseVerdict,
  renderReviewRequest,
} from './review-gate.mjs';

const SHA_A = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
const SHA_B = 'b2c3d4e5f60718293a4b5c6d7e8f90123456789a';

const verdict = (sha, decision, extra = '') =>
  ['<!-- CHATGPT_REVIEW', `HEAD_SHA=${sha}`, `VERDICT=${decision}`, extra, '-->']
    .filter(Boolean)
    .join('\n');

const comment = (id, body) => ({ id, body });

test('renders a review request an external reviewer can act on', () => {
  const out = renderReviewRequest({ pr: 42, headSha: SHA_A, issue: 7 });
  assert.equal(out, `AUTOPILOT_REVIEW_REQUEST\nPR=42\nHEAD_SHA=${SHA_A}\nISSUE=7`);
});

test('omits the optional issue line when there is no issue', () => {
  const out = renderReviewRequest({ pr: 42, headSha: SHA_A });
  assert.equal(out, `AUTOPILOT_REVIEW_REQUEST\nPR=42\nHEAD_SHA=${SHA_A}`);
});

test('a comment with no verdict block is not a verdict, and not an error', () => {
  assert.equal(parseVerdict('looks good to me'), null);
});

test('allows only when a PASS names exactly this head SHA', () => {
  const result = evaluateReviewGate({
    headSha: SHA_A,
    comments: [comment(1, verdict(SHA_A, 'PASS'))],
  });
  assert.equal(result.decision, DECISION.ALLOW);
  assert.equal(result.reason, REASON.REVIEWER_PASSED_AT_HEAD_SHA);
  assert.equal(result.commentId, 1);
});

test('blocks when nobody has reviewed at all', () => {
  const result = evaluateReviewGate({ headSha: SHA_A, comments: [] });
  assert.equal(result.decision, DECISION.BLOCK);
  assert.equal(result.reason, REASON.NO_VERDICT_FOR_HEAD_SHA);
});

test('blocks when the reviewer said BLOCK', () => {
  const result = evaluateReviewGate({
    headSha: SHA_A,
    comments: [comment(1, verdict(SHA_A, 'BLOCK', 'BLOCKERS=missing tenant isolation'))],
  });
  assert.equal(result.decision, DECISION.BLOCK);
  assert.equal(result.reason, REASON.REVIEWER_BLOCKED);
  assert.equal(result.blockers, 'missing tenant isolation');
});

test('blocks when the only PASS names a different commit', () => {
  const result = evaluateReviewGate({
    headSha: SHA_A,
    comments: [comment(1, verdict(SHA_B, 'PASS'))],
  });
  assert.equal(result.decision, DECISION.BLOCK);
  assert.equal(result.reason, REASON.NO_VERDICT_FOR_HEAD_SHA);
  assert.deepEqual(result.verdictsFoundForOtherShas, [SHA_B]);
});

// THE ONE THAT MATTERS. A PASS is a statement about one commit. Push another commit and
// that PASS must stop applying, or the whole gate is decoration.
test('a PASS for A does not survive the branch moving to B', () => {
  const comments = [comment(1, verdict(SHA_A, 'PASS'))];
  assert.equal(evaluateReviewGate({ headSha: SHA_A, comments }).decision, DECISION.ALLOW);
  const afterPush = evaluateReviewGate({ headSha: SHA_B, comments });
  assert.equal(afterPush.decision, DECISION.BLOCK);
  assert.equal(afterPush.reason, REASON.NO_VERDICT_FOR_HEAD_SHA);
});

test('blocks on a verdict block that is present but unreadable', () => {
  const result = evaluateReviewGate({
    headSha: SHA_A,
    comments: [comment(1, '<!-- CHATGPT_REVIEW\nHEAD_SHA=not-a-sha\nVERDICT=PASS\n-->')],
  });
  assert.equal(result.decision, DECISION.BLOCK);
  assert.equal(result.reason, REASON.MALFORMED_VERDICT);
});

test('blocks on a verdict word the protocol does not define', () => {
  const result = evaluateReviewGate({
    headSha: SHA_A,
    comments: [comment(1, verdict(SHA_A, 'LGTM'))],
  });
  assert.equal(result.decision, DECISION.BLOCK);
  assert.equal(result.reason, REASON.MALFORMED_VERDICT);
});

test('blocks on an unterminated verdict block rather than ignoring it', () => {
  const result = evaluateReviewGate({
    headSha: SHA_A,
    comments: [comment(1, `<!-- CHATGPT_REVIEW\nHEAD_SHA=${SHA_A}\nVERDICT=PASS`)],
  });
  assert.equal(result.decision, DECISION.BLOCK);
  assert.equal(result.reason, REASON.MALFORMED_VERDICT);
});

// Fail-closed precedence: two reviewers disagreeing at the same commit is not a pass.
test('a BLOCK at this SHA beats a PASS at this SHA regardless of order', () => {
  const both = [comment(1, verdict(SHA_A, 'PASS')), comment(2, verdict(SHA_A, 'BLOCK'))];
  assert.equal(evaluateReviewGate({ headSha: SHA_A, comments: both }).reason, REASON.REVIEWER_BLOCKED);
  assert.equal(
    evaluateReviewGate({ headSha: SHA_A, comments: [...both].reverse() }).reason,
    REASON.REVIEWER_BLOCKED,
  );
});

test('blocks when asked about a head SHA that is not a commit id', () => {
  const result = evaluateReviewGate({ headSha: 'HEAD', comments: [comment(1, verdict(SHA_A, 'PASS'))] });
  assert.equal(result.decision, DECISION.BLOCK);
  assert.equal(result.reason, REASON.INVALID_HEAD_SHA);
});

test('matches the head SHA case-insensitively but still demands a real one', () => {
  const upper = SHA_A.toUpperCase();
  const result = evaluateReviewGate({ headSha: upper, comments: [comment(1, verdict(SHA_A, 'PASS'))] });
  assert.equal(result.decision, DECISION.ALLOW);
});
