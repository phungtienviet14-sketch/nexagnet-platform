#!/usr/bin/env node
/**
 * POC-3 comment renderer.
 *
 * Rendering these bodies in Node rather than in shell is not a style choice: the verdict
 * format is newline-sensitive and quoting it through YAML into bash is exactly where a
 * protocol harness silently starts testing something other than the protocol.
 *
 * Every body this file produces is prefixed SYNTHETIC. A harness verdict that could pass
 * for a real review would poison the evidence this PoC exists to produce.
 *
 *   render-comment.mjs request --pr <n> --head-sha <sha> [--issue <n>]
 *   render-comment.mjs verdict --head-sha <sha> --verdict PASS|BLOCK [--blockers <text>]
 */
import { renderReviewRequest } from './review-gate.mjs';

const SYNTHETIC = 'SYNTHETIC - written by the POC-3 harness, not by any reviewer.';

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

const mode = process.argv[2];
const headSha = arg('--head-sha');

if (mode === 'request') {
  const block = renderReviewRequest({ pr: arg('--pr'), headSha, issue: arg('--issue') });
  process.stdout.write(`${SYNTHETIC}\n\n\`\`\`\n${block}\n\`\`\`\n`);
} else if (mode === 'verdict') {
  const decision = arg('--verdict');
  const blockers = arg('--blockers');
  const lines = ['<!-- CHATGPT_REVIEW', `HEAD_SHA=${headSha}`, `VERDICT=${decision}`];
  if (blockers) lines.push(`BLOCKERS=${blockers}`);
  lines.push('-->');
  process.stdout.write(`${SYNTHETIC}\n\n${lines.join('\n')}\n`);
} else {
  console.error('usage: render-comment.mjs request|verdict ...');
  process.exit(2);
}
