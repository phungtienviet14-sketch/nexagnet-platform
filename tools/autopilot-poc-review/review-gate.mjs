/**
 * POC-3 — repo-side review handshake, bound to an exact HEAD SHA.
 *
 * This proves the PROTOCOL only. It says nothing about whether the reviewer that wrote a
 * verdict was independent, competent, or even human. A verdict produced by a test harness
 * parses exactly like one produced by an external reviewer, and that is the point: the gate
 * must not be able to tell, so its safety cannot depend on trusting the author.
 *
 * The single property worth having: a PASS is a statement about ONE commit. The moment the
 * branch moves, that PASS stops applying. Everything else here is fail-closed plumbing
 * around that one rule.
 */

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const VERDICT_BLOCK = /<!--\s*CHATGPT_REVIEW\s*([\s\S]*?)-->/g;
const VERDICT_OPENING = /<!--\s*CHATGPT_REVIEW\b/;

export const DECISION = { ALLOW: 'ALLOW', BLOCK: 'BLOCK' };

export const REASON = {
  INVALID_HEAD_SHA: 'INVALID_HEAD_SHA',
  MALFORMED_VERDICT: 'MALFORMED_VERDICT',
  NO_VERDICT_FOR_HEAD_SHA: 'NO_VERDICT_FOR_HEAD_SHA',
  REVIEWER_BLOCKED: 'REVIEWER_BLOCKED',
  REVIEWER_PASSED_AT_HEAD_SHA: 'REVIEWER_PASSED_AT_HEAD_SHA',
};

/** The request an orchestrator posts once CI is green. */
export function renderReviewRequest({ pr, headSha, issue }) {
  const lines = ['AUTOPILOT_REVIEW_REQUEST', `PR=${pr}`, `HEAD_SHA=${headSha}`];
  if (issue !== undefined && issue !== null && `${issue}` !== '') lines.push(`ISSUE=${issue}`);
  return lines.join('\n');
}

/**
 * Parse one comment body into a verdict.
 *
 * Returns `null` when the body carries no verdict block at all — silence is not an error,
 * it is simply not a verdict. Returns `{ malformed: true }` when a block IS present but
 * cannot be read: a reviewer who tried to speak and produced garbage must never be treated
 * the same as a reviewer who said nothing.
 */
export function parseVerdict(body) {
  const text = typeof body === 'string' ? body : '';
  const matches = [...text.matchAll(VERDICT_BLOCK)];
  if (matches.length === 0) {
    return VERDICT_OPENING.test(text) ? { malformed: true, raw: text } : null;
  }
  const fields = {};
  for (const line of matches[0][1].split('\n')) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) fields[m[1]] = m[2];
  }
  const headSha = String(fields.HEAD_SHA ?? '').toLowerCase();
  const verdict = String(fields.VERDICT ?? '').toUpperCase();
  if (!SHA_PATTERN.test(headSha)) return { malformed: true, raw: text };
  if (verdict !== 'PASS' && verdict !== 'BLOCK') return { malformed: true, raw: text };
  return {
    malformed: false,
    headSha,
    verdict,
    blockers: fields.BLOCKERS ?? '',
  };
}

/**
 * Decide whether `headSha` carries a usable review verdict.
 *
 * Every path that is not an explicit PASS at exactly this SHA returns BLOCK. There is no
 * default-allow branch, and adding one would defeat the whole gate.
 */
export function evaluateReviewGate({ headSha, comments }) {
  const sha = String(headSha ?? '').toLowerCase();
  if (!SHA_PATTERN.test(sha)) {
    return { decision: DECISION.BLOCK, reason: REASON.INVALID_HEAD_SHA, headSha: sha };
  }

  const list = Array.isArray(comments) ? comments : [];
  const parsed = list.map((c) => ({ comment: c, verdict: parseVerdict(c?.body) }));

  const malformed = parsed.filter((p) => p.verdict?.malformed);
  if (malformed.length > 0) {
    return {
      decision: DECISION.BLOCK,
      reason: REASON.MALFORMED_VERDICT,
      headSha: sha,
      commentIds: malformed.map((p) => p.comment?.id ?? null),
    };
  }

  const forThisSha = parsed.filter((p) => p.verdict && p.verdict.headSha === sha);
  if (forThisSha.length === 0) {
    const otherShas = [...new Set(parsed.filter((p) => p.verdict).map((p) => p.verdict.headSha))];
    return {
      decision: DECISION.BLOCK,
      reason: REASON.NO_VERDICT_FOR_HEAD_SHA,
      headSha: sha,
      verdictsFoundForOtherShas: otherShas,
    };
  }

  // A BLOCK anywhere at this SHA wins over any PASS at the same SHA.
  const blocked = forThisSha.find((p) => p.verdict.verdict === 'BLOCK');
  if (blocked) {
    return {
      decision: DECISION.BLOCK,
      reason: REASON.REVIEWER_BLOCKED,
      headSha: sha,
      blockers: blocked.verdict.blockers,
      commentId: blocked.comment?.id ?? null,
    };
  }

  const passed = forThisSha[forThisSha.length - 1];
  return {
    decision: DECISION.ALLOW,
    reason: REASON.REVIEWER_PASSED_AT_HEAD_SHA,
    headSha: sha,
    commentId: passed.comment?.id ?? null,
  };
}
