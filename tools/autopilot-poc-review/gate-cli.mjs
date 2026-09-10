#!/usr/bin/env node
/**
 * POC-3 CLI — evaluate the review gate against REAL comments on a pull request.
 *
 * Reads a JSON array of GitHub issue comments on stdin (what
 * `gh api repos/O/R/issues/<n>/comments` returns) and prints exactly one decision line.
 *
 *   node gate-cli.mjs --head-sha <sha> [--expect ALLOW|BLOCK] < comments.json
 *
 * With --expect the process exits non-zero when the decision differs, so a workflow can
 * assert the protocol instead of eyeballing it.
 */
import { evaluateReviewGate } from './review-gate.mjs';

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8').trim();
}

const headSha = arg('--head-sha');
const expected = arg('--expect');

const raw = await readStdin();
let comments = [];
if (raw) {
  try {
    comments = JSON.parse(raw);
  } catch {
    // Unparseable input is not an excuse to allow anything through.
    console.log('REVIEW_GATE_DECISION=BLOCK');
    console.log('REVIEW_GATE_REASON=UNREADABLE_COMMENT_PAYLOAD');
    process.exit(expected === 'BLOCK' ? 0 : 1);
  }
}

const result = evaluateReviewGate({ headSha, comments });
console.log(`REVIEW_GATE_HEAD_SHA=${result.headSha}`);
console.log(`REVIEW_GATE_DECISION=${result.decision}`);
console.log(`REVIEW_GATE_REASON=${result.reason}`);
if (result.commentId) console.log(`REVIEW_GATE_COMMENT_ID=${result.commentId}`);
if (result.blockers) console.log(`REVIEW_GATE_BLOCKERS=${result.blockers}`);
if (result.verdictsFoundForOtherShas?.length) {
  console.log(`REVIEW_GATE_VERDICTS_AT_OTHER_SHAS=${result.verdictsFoundForOtherShas.join(',')}`);
}

if (expected && result.decision !== expected) {
  console.error(`REVIEW_GATE_ASSERTION_FAILED expected=${expected} got=${result.decision}`);
  process.exit(1);
}
