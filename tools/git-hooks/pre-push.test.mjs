// Khoa chinh sach pre-push cuc bo: NHANH, theo vung sua, khong bao gio thanh full suite lan nua.
// Chay: node --test tools/git-hooks/pre-push.test.mjs (nam trong `pnpm test` → job CI `verify`).

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  MARKER,
  classifyWorktreePins,
  desiredShims,
  renderDelegateShim,
  renderPrePushShim,
} from './install.mjs';
import { CI_GATES, chunkByLength, parsePushLines, planChecks, resolveBase } from './pre-push.mjs';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const ZERO = '0'.repeat(40);
const everything = () => true;

test('parsePushLines doc tung ref va bo dong xoa nhanh', () => {
  const stdin = [
    `refs/heads/feat ${SHA_A} refs/heads/feat ${ZERO}`,
    `(delete) ${ZERO} refs/heads/old ${SHA_B}`,
    '',
  ].join('\r\n');
  assert.deepEqual(parsePushLines(stdin), [
    { localRef: 'refs/heads/feat', localSha: SHA_A, remoteRef: 'refs/heads/feat', remoteSha: ZERO },
  ]);
});

test('resolveBase so voi merge-base cua <remote>/main — dung pham vi PR', () => {
  const calls = [];
  const git = (args) => {
    calls.push(args.join(' '));
    if (args[0] === 'rev-parse') return SHA_B;
    if (args[0] === 'merge-base') return 'c'.repeat(40);
    return null;
  };
  const base = resolveBase({ localSha: SHA_A, remoteSha: ZERO }, 'origin', git);
  assert.equal(base, 'c'.repeat(40));
  assert.ok(calls.includes(`merge-base ${SHA_A} refs/remotes/origin/main`));
});

test('resolveBase lui ve sha tren remote khi khong co <remote>/main', () => {
  const git = (args) => (args[0] === 'cat-file' ? '' : null);
  assert.equal(resolveBase({ localSha: SHA_A, remoteSha: SHA_B }, 'origin', git), SHA_B);
  assert.equal(resolveBase({ localSha: SHA_A, remoteSha: ZERO }, 'origin', git), null);
});

test('chunkByLength giu thu tu, khong mat phan tu, moi lo duoi nguong', () => {
  const items = Array.from({ length: 50 }, (_, i) => `apps/web/file-${i}.ts`);
  const chunks = chunkByLength(items, 200);
  assert.deepEqual(chunks.flat(), items);
  for (const chunk of chunks) assert.ok(chunk.join(' ').length < 200);
});

test('chi doi tai lieu → chi quet lich su nguon khach', () => {
  const checks = planChecks({
    ranges: [`${SHA_B}..${SHA_A}`],
    files: ['docs/README.md'],
    hasFile: everything,
  });
  assert.deepEqual(
    checks.map((c) => c.id),
    ['customer-source-history'],
  );
});

test('check theo vung sua: tep web → eslint; api/src → them source-manifest; deploy → them caddy', () => {
  const ids = (files) =>
    planChecks({ ranges: ['x..y'], files, hasFile: everything }).map((c) => c.id);
  assert.deepEqual(ids(['apps/web/app/page.tsx']), ['customer-source-history', 'eslint']);
  assert.deepEqual(ids(['apps/api/src/orders/x.ts']), [
    'customer-source-history',
    'eslint',
    'source-manifest',
  ]);
  assert.deepEqual(ids(['deploy/netviet/Caddyfile']), ['customer-source-history', 'deploy-routes']);
});

test('tep da xoa khoi working tree khong duoc dua vao eslint', () => {
  const checks = planChecks({
    ranges: ['x..y'],
    files: ['apps/web/gone.ts', 'apps/web/kept.ts'],
    hasFile: (f) => f !== 'apps/web/gone.ts',
  });
  const eslint = checks.find((c) => c.id === 'eslint');
  assert.ok(eslint.args.includes('apps/web/kept.ts'));
  assert.ok(!eslint.args.includes('apps/web/gone.ts'));
});

test('CHINH SACH: du cham moi vung, pre-push khong bao gio chay full suite / build / IT / Docker', () => {
  const files = [
    'apps/api/src/a.ts',
    'apps/api/prisma/schema.prisma',
    'apps/web/e2e/x.spec.ts',
    'packages/tenant/src/b.ts',
    'deploy/netviet/docker-compose.yml',
    '.github/workflows/ci.yml',
    'tools/git-hooks/pre-push.mjs',
    'tools/source-manifest/generate.mjs',
    'package.json',
  ];
  const checks = planChecks({ ranges: ['x..y'], files, hasFile: everything });
  const forbidden =
    /\bpnpm\b|\bnpm\b|vitest|playwright|test:e2e|docker|typecheck|\bbuild\b|prisma|RUN_PRISMA_IT|RUN_WORKFLOW_IT|--filter/i;
  for (const check of checks) {
    const line = check.args.join(' ');
    assert.ok(!forbidden.test(line), `${check.id} chay lenh bi cam: ${line}`);
  }
  assert.deepEqual(
    new Set(checks.map((c) => c.id)),
    new Set(['customer-source-history', 'eslint', 'source-manifest', 'deploy-routes', 'git-hooks']),
  );
});

test('7 cong CI ma pre-push giao phan regression van ton tai trong ci.yml', () => {
  const ciYml = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  const lines = ciYml.split(/\r?\n/);
  const start = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  assert.ok(start >= 0, 'ci.yml khong co khoi jobs:');
  const jobs = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break;
    const m = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (m) jobs.push(m[1]);
  }
  for (const gate of CI_GATES) assert.ok(jobs.includes(gate), `ci.yml mat job ${gate}`);
});

test('shim pre-push chi goi logic co phien ban, khong tu chay gi nang', () => {
  const shim = renderPrePushShim();
  assert.ok(shim.startsWith('#!/usr/bin/env bash\n'));
  assert.ok(shim.includes(MARKER));
  assert.ok(shim.includes('exec node "$root/tools/git-hooks/pre-push.mjs" "$@"'));
  const executable = shim
    .split('\n')
    .filter((l) => !l.startsWith('#') && !l.startsWith('echo '))
    .join('\n');
  assert.ok(!/pnpm|npm run|vitest|build/.test(executable), executable);
  assert.ok(!shim.includes('\r'), 'shim phai la LF — bash tren Windows chet voi CRLF');
});

test('shim chuyen tiep giu hook toan cuc (bo quet secret pre-commit) va khong tu goi lai chinh no', () => {
  const shim = renderDelegateShim('pre-commit');
  assert.ok(shim.includes(MARKER));
  assert.ok(shim.includes('exec "$global/pre-commit" "$@"'));
  assert.ok(shim.includes('[ "$global" != "$own" ]'));
  assert.ok(!shim.includes('\r'));
  assert.deepEqual(Object.keys(desiredShims(['pre-commit', 'pre-push', 'x.sample'])), [
    'pre-push',
    'pre-commit',
  ]);
});

test('ghim core.hooksPath o scope worktree: go ghim hook toan cuc, chi canh bao gia tri la', () => {
  const hooksPath = 'C:/repo/.git/hooks';
  const globalDir = 'C:/Users/me/.codex/git-hooks';
  const pins = [
    { file: 'wt-a/config.worktree', value: 'C:/Users/me/.codex/git-hooks' },
    { file: 'wt-b/config.worktree', value: 'c:\\users\\me\\.codex\\git-hooks\\' },
    { file: 'wt-c/config.worktree', value: 'C:/repo/.git/hooks' },
    { file: 'wt-d/config.worktree', value: null },
    { file: 'wt-e/config.worktree', value: '.husky/_' },
  ];
  const { stale, custom } = classifyWorktreePins(pins, { hooksPath, globalDir });
  assert.deepEqual(
    stale.map((p) => p.file),
    ['wt-a/config.worktree', 'wt-b/config.worktree'],
  );
  assert.deepEqual(
    custom.map((p) => p.file),
    ['wt-e/config.worktree'],
  );
});
