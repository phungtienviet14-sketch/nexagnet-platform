import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { formatMessage } from '../validator/messages.mjs';
import { SHA_A, contract, message } from './helpers.mjs';

const CLI = join(import.meta.dirname, '..', 'validator', 'cli.mjs');

/** Chay CLI, tra { code, out } — out la JSON da parse. */
function run(args, input) {
  const result = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', input });
  assert.equal(result.stderr, '', `stderr phai rong: ${result.stderr}`);
  return { code: result.status, out: JSON.parse(result.stdout) };
}

const dir = mkdtempSync(join(tmpdir(), 'autopilot-cli-'));
const file = (name, content) => {
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
};
test.after(() => rmSync(dir, { recursive: true, force: true }));

test('message: comment hop le => exit 0, in payload + khoa idempotency', () => {
  const { code, out } = run(['message', file('pass.txt', formatMessage(message('REVIEW_PASS')))]);
  assert.equal(code, 0);
  assert.equal(out.ok, true);
  assert.equal(out.message.type, 'REVIEW_PASS');
  assert.equal(out.idempotencyKey, `review-verdict:201:${SHA_A}:REVIEW_PASS`);
});

test('message: doc tu stdin bang "-"; comment sai => exit 1 kem ly do co ma', () => {
  const viaStdin = run(['message', '-'], formatMessage(message('TASK_DONE')));
  assert.equal(viaStdin.code, 0);
  assert.equal(viaStdin.out.message.type, 'TASK_DONE');
  const bad = run(['message', '-'], 'chi la van xuoi');
  assert.equal(bad.code, 1);
  assert.equal(bad.out.reason, 'NO_MARKER');
  const shortSha = run(
    ['message', '-'],
    formatMessage(message('REVIEW_PASS', { head_sha: 'abc123' })),
  );
  assert.equal(shortSha.code, 1);
  assert.equal(shortSha.out.reason, 'SCHEMA_VIOLATION');
});

test('key: in dung khoa cua thong diep', () => {
  const { code, out } = run(['key', '-'], formatMessage(message('BUILD_STARTED')));
  assert.equal(code, 0);
  assert.deepEqual(out, { ok: true, idempotencyKey: 'build:200' });
});

test('contract: nhan JSON thuan hoac than Issue Markdown; hop dong hong => exit 1', () => {
  const okJson = run(['contract', file('c.json', JSON.stringify(contract()))]);
  assert.equal(okJson.code, 0);
  assert.equal(okJson.out.contract.task_id, 'T-SAMPLE');
  const body = [
    '<!-- AUTOPILOT_TASK_V0 -->',
    '```json',
    JSON.stringify(contract({ issue: 42 })),
    '```',
    '',
    '# Issue — ban nguoi doc',
  ].join('\n');
  const okMd = run(['contract', file('issue.md', body)]);
  assert.equal(okMd.code, 0);
  assert.equal(okMd.out.contract.issue, 42);
  const proseFirst = run(['contract', '-'], `# Issue\n${body}`);
  assert.equal(proseFirst.code, 1);
  assert.equal(proseFirst.out.reason, 'CONTRACT_MARKER_NOT_FIRST_LINE');
  const high = run(
    ['contract', '-'],
    JSON.stringify(contract({ risk: 'HIGH', human_gate: false })),
  );
  assert.equal(high.code, 1);
  assert.equal(high.out.reason, 'HIGH_RISK_REQUIRES_HUMAN_GATE');
  const prose = run(['contract', '-'], '# chi co van xuoi, nhu Issue viet truoc khi co schema');
  assert.equal(prose.code, 1);
  assert.equal(prose.out.reason, 'CONTRACT_MARKER_MISSING');
});

test('transition: hop le exit 0 va in trang thai ke; bat hop phap exit 1; "-" la chua co task', () => {
  assert.deepEqual(run(['transition', 'CI', 'REVIEW_REQUEST']).out, { ok: true, to: 'REVIEWING' });
  assert.deepEqual(run(['transition', '-', 'TASK_READY']).out, { ok: true, to: 'READY' });
  const illegal = run(['transition', 'READY', 'TASK_DONE']);
  assert.equal(illegal.code, 1);
  assert.equal(illegal.out.reason, 'ILLEGAL_TRANSITION');
  assert.equal(run(['transition', 'DONE', 'EXCEPTION']).out.reason, 'TERMINAL_STATE');
});

test('required-checks: mac dinh doc ruleset cua repo => 7 ten; ruleset rong => exit 1', () => {
  const repo = run(['required-checks']);
  assert.equal(repo.code, 0);
  assert.equal(repo.out.requiredChecks.length, 7);
  const empty = run(['required-checks', file('empty.json', '{"rules":[]}')]);
  assert.equal(empty.code, 1);
  assert.deepEqual(empty.out, { ok: false, requiredChecks: [] });
});

test('dung sai (lenh la, thieu tham so) => exit 2, van la JSON', () => {
  assert.equal(run(['bogus']).code, 2);
  assert.equal(run(['transition', 'CI']).code, 2);
  const noFile = run(['message']);
  assert.equal(noFile.code, 2);
  assert.equal(noFile.out.reason, 'USAGE');
});
