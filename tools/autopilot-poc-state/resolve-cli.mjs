#!/usr/bin/env node
/**
 * POC-5 CLI — run the resolver against real GitHub issues.
 *
 * Reads a JSON array of issues on stdin. Each issue may carry a `comments` array; the
 * resolver needs it to see whether a dispatch already happened, and a caller that omits it
 * will get a duplicate dispatch, so the CLI refuses to run without it.
 *
 *   gh issue list --json number,state,labels,body ... | node resolve-cli.mjs --expect-dispatch 2
 */
import { resolve } from './resolver.mjs';

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const raw = Buffer.concat(chunks).toString('utf8').trim();

let issues;
try {
  issues = JSON.parse(raw || '[]');
} catch {
  console.error('RESOLVER_ERROR=UNREADABLE_ISSUE_PAYLOAD');
  process.exit(1);
}

for (const i of issues) {
  if (!Array.isArray(i?.comments)) {
    console.error(`RESOLVER_ERROR=ISSUE_${i?.number}_HAS_NO_COMMENTS_ARRAY`);
    console.error('Without comments the resolver cannot see a prior dispatch and would repeat it.');
    process.exit(1);
  }
}

const results = resolve(issues);
for (const r of results) {
  const detail = r.detail ? ` detail=${JSON.stringify(r.detail)}` : '';
  console.log(`RESOLVER #${r.number} action=${r.action} reason=${r.reason}${detail}`);
}

const expect = arg('--expect-dispatch');
if (expect !== undefined) {
  const dispatched = results.filter((r) => r.action === 'DISPATCH').map((r) => String(r.number));
  const wanted = expect === 'none' ? [] : expect.split(',').map((s) => s.trim());
  const same = dispatched.length === wanted.length && dispatched.every((n, k) => n === wanted[k]);
  console.log(`RESOLVER_DISPATCH_SET=${dispatched.join(',') || 'none'}`);
  if (!same) {
    console.error(`RESOLVER_ASSERTION_FAILED expected=${expect} got=${dispatched.join(',') || 'none'}`);
    process.exit(1);
  }
}
