#!/usr/bin/env node
/**
 * POC-5 live proof against real GitHub issues.
 *
 * Creates two sandbox issues where B declares a dependency on A, then walks the resolver
 * through the whole sequence and asserts each step. Unit tests can only show the resolver
 * is consistent with itself; this shows it is consistent with what GitHub actually returns.
 *
 *   node live-proof.mjs --repo owner/name [--keep]
 *
 * Both issues are closed at the end unless --keep is passed. They are left in place, not
 * deleted: they are the audit trail for this PoC.
 */
import { execFileSync } from 'node:child_process';
import { resolve as resolveIssues, DISPATCH_MARKER, STATE } from './resolver.mjs';

const arg = (n) => {
  const i = process.argv.indexOf(n);
  return i === -1 ? undefined : process.argv[i + 1];
};
const repo = arg('--repo');
if (!repo) {
  console.error('usage: live-proof.mjs --repo owner/name [--keep]');
  process.exit(2);
}
const keep = process.argv.includes('--keep');
const gh = (args, input) =>
  execFileSync('gh', args, { encoding: 'utf8', input, maxBuffer: 16 * 1024 * 1024 });

const LABELS = [
  [STATE.READY, '0e8a16', 'POC-5 sandbox: task may start'],
  [STATE.DONE, '5319e7', 'POC-5 sandbox: task complete'],
  ['blocked:overlap', 'b60205', 'POC-5 sandbox: another agent owns these files'],
];

function ensureLabels() {
  for (const [name, color, desc] of LABELS) {
    try {
      gh(['label', 'create', name, '--repo', repo, '--color', color, '--description', desc, '--force']);
    } catch (e) {
      console.error(`label ${name}: ${e.message.split('\n')[0]}`);
    }
  }
}

function createIssue(title, body) {
  const url = gh(['issue', 'create', '--repo', repo, '--title', title, '--body', body]).trim();
  return Number(url.split('/').pop());
}

/** Fetch issues in the exact shape the resolver expects, comments included. */
function fetchIssues(numbers) {
  return numbers.map((n) => {
    const issue = JSON.parse(gh(['issue', 'view', String(n), '--repo', repo, '--json', 'number,state,labels,body']));
    const comments = JSON.parse(gh(['api', `repos/${repo}/issues/${n}/comments`, '--paginate']));
    return {
      number: issue.number,
      state: issue.state.toLowerCase(),
      labels: issue.labels.map((l) => l.name),
      body: issue.body,
      comments: comments.map((c) => ({ id: c.id, body: c.body })),
    };
  });
}

function step(label, numbers, expected) {
  const results = resolveIssues(fetchIssues(numbers));
  for (const r of results) {
    console.log(`  #${r.number} action=${r.action} reason=${r.reason}`);
  }
  const got = results.filter((r) => r.action === 'DISPATCH').map((r) => r.number);
  const ok = got.length === expected.length && got.every((n, i) => n === expected[i]);
  console.log(`  => dispatch set: [${got.join(',') || 'none'}] expected [${expected.join(',') || 'none'}] ${ok ? 'OK' : 'MISMATCH'}`);
  if (!ok) {
    console.error('LIVE_PROOF=FAIL');
    process.exit(1);
  }
  return results;
}

ensureLabels();

const a = createIssue(
  '[POC] Autopilot dependency A',
  'Sandbox issue for POC-5. Nothing here is real work.\n\nThis one has no dependencies.\n',
);
const b = createIssue(
  '[POC] Autopilot dependency B',
  `Sandbox issue for POC-5. Nothing here is real work.\n\nThis one must not start before A.\n\nAUTOPILOT_DEPENDS_ON=#${a}\n`,
);
console.log(`LIVE_ISSUE_A=${a}`);
console.log(`LIVE_ISSUE_B=${b}`);

console.log('\n== 1. A open: B must not start ==');
step('a-open', [a, b], [a]);

console.log('\n== 2. A closed: B is released ==');
gh(['issue', 'close', String(a), '--repo', repo]);
step('a-done', [a, b], [b]);

console.log('\n== 3. record the dispatch on the issue itself ==');
gh(['issue', 'comment', String(b), '--repo', repo, '--body', `${DISPATCH_MARKER} run=live-proof for=#${b}`]);
gh(['issue', 'edit', String(b), '--repo', repo, '--add-label', STATE.READY]);

console.log('\n== 4. same state again: nothing starts twice ==');
step('idempotent-1', [a, b], []);
console.log('\n== 5. and again, to rule out a one-off ==');
step('idempotent-2', [a, b], []);

if (!keep) {
  gh(['issue', 'close', String(b), '--repo', repo]);
  console.log(`\nclosed sandbox issues #${a} and #${b} (left in place as the audit trail)`);
}
console.log('LIVE_PROOF=PASS');
