import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { REASONS } from '../src/errors.mjs';
import { createLedger } from '../src/ledger.mjs';
import { acquireProcessLock } from '../src/process-lock.mjs';
import { removeDir, tempDir } from './helpers.mjs';

/** @param {Record<string, any>} [over] */
const record = (over = {}) => ({
  key: 'dispatch:acme/widgets:256:' + 'a'.repeat(64),
  repo: 'acme/widgets',
  issue: 256,
  taskId: 'DEMO_TASK_V0',
  contractDigest: 'a'.repeat(64),
  promptDigest: 'b'.repeat(64),
  triggerPrincipal: 'USER:architect-user',
  baseSha: 'c'.repeat(40),
  branch: 'claude/autopilot/issue-256-aaaaaaaaaaaa',
  worktreeLabel: 'issue-256-aaaaaaaaaaaa',
  model: 'opus',
  effort: 'max',
  state: 'CLAIMED',
  claimedAt: '',
  updatedAt: '',
  launches: 0,
  lastReason: null,
  ...over,
});

test('a claim is durable and a second claim of the same key is refused', (t) => {
  const dir = tempDir('ledger');
  t.after(() => removeDir(dir));
  const ledger = createLedger({ dir });

  assert.equal(ledger.claim(record()).ok, true);
  const again = ledger.claim(record());
  assert.equal(again.ok, false);
  assert.equal(again.reason, REASONS.TASK_ALREADY_CLAIMED);
});

test('a claim survives a restart, so the same task is not launched twice', (t) => {
  const dir = tempDir('ledger-restart');
  t.after(() => removeDir(dir));

  createLedger({ dir }).claim(record());
  // Mot tien trinh dispatcher HOAN TOAN MOI, doc lai tu dia.
  const afterRestart = createLedger({ dir });
  assert.equal(afterRestart.get(record().key).record.state, 'CLAIMED');
  assert.equal(afterRestart.claim(record()).ok, false);
});

test('a different task can be claimed after the first one reaches a terminal state', (t) => {
  const dir = tempDir('ledger-next');
  t.after(() => removeDir(dir));
  const ledger = createLedger({ dir });

  ledger.claim(record());
  ledger.update(record().key, { state: 'HANDOFF_PRESENT' });

  const other = record({
    key: 'dispatch:acme/widgets:257:' + 'd'.repeat(64),
    issue: 257,
    contractDigest: 'd'.repeat(64),
  });
  assert.equal(ledger.claim(other).ok, true);
  assert.equal(Object.keys(ledger.readAll().records).length, 2);
});

test('an edited contract produces a different key and is reported, not silently rerun', (t) => {
  const dir = tempDir('ledger-changed');
  t.after(() => removeDir(dir));
  const ledger = createLedger({ dir });
  ledger.claim(record());

  const priors = ledger.priorContractsFor({
    repo: 'acme/widgets',
    issue: 256,
    contractDigest: 'e'.repeat(64),
  });
  assert.equal(priors.ok, true);
  assert.equal(priors.records.length, 1);
  assert.equal(priors.records[0].contractDigest, 'a'.repeat(64));
});

test('the same contract sees no prior contract change', (t) => {
  const dir = tempDir('ledger-same');
  t.after(() => removeDir(dir));
  const ledger = createLedger({ dir });
  ledger.claim(record());
  const priors = ledger.priorContractsFor({
    repo: 'acme/widgets',
    issue: 256,
    contractDigest: 'a'.repeat(64),
  });
  assert.deepEqual(priors.records, []);
});

test('a corrupt ledger stops the dispatcher instead of being silently discarded', (t) => {
  const dir = tempDir('ledger-corrupt');
  t.after(() => removeDir(dir));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'ledger.json'), '{ not json', 'utf8');
  const ledger = createLedger({ dir });

  assert.equal(ledger.readAll().reason, REASONS.LEDGER_CORRUPT);
  assert.equal(ledger.claim(record()).reason, REASONS.LEDGER_CORRUPT);
  // Va tep hong VAN CON tren dia — khong co duong nao tu dong xoa tri nho di.
  assert.equal(fs.readFileSync(path.join(dir, 'ledger.json'), 'utf8'), '{ not json');
});

test('the ledger never stores a token-shaped value from the record it is given', (t) => {
  const dir = tempDir('ledger-secret');
  t.after(() => removeDir(dir));
  const ledger = createLedger({ dir });
  ledger.claim(record());
  const onDisk = fs.readFileSync(path.join(dir, 'ledger.json'), 'utf8');
  for (const pattern of [/ghp_/, /github_pat_/, /sk-ant-/, /Authorization/i, /Bearer /]) {
    assert.equal(pattern.test(onDisk), false, `ledger leaked ${pattern}`);
  }
});

test('a second dispatcher process on the same host is refused by the lock', (t) => {
  const dir = tempDir('lock');
  t.after(() => removeDir(dir));

  const first = acquireProcessLock({ dir });
  assert.equal(first.ok, true);

  const second = acquireProcessLock({
    dir,
    proc: { pid: process.pid + 1, kill: () => undefined },
  });
  assert.equal(second.ok, false);
  assert.equal(second.reason, REASONS.LOCK_HELD);

  first.release();
  assert.equal(acquireProcessLock({ dir }).ok, true);
});

test('a lock left behind by a dead process is reclaimed', (t) => {
  const dir = tempDir('lock-stale');
  t.after(() => removeDir(dir));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'dispatcher.lock'),
    JSON.stringify({ pid: 999_999_999, startedAt: '2026-01-01T00:00:00Z' }),
    'utf8',
  );

  const dead = {
    pid: process.pid,
    kill: (pid) => {
      if (pid === 999_999_999) throw Object.assign(new Error('gone'), { code: 'ESRCH' });
    },
  };
  const acquired = acquireProcessLock({ dir, proc: dead });
  assert.equal(acquired.ok, true);
});

test('a lock held by a live process is not reclaimed', (t) => {
  const dir = tempDir('lock-live');
  t.after(() => removeDir(dir));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'dispatcher.lock'), JSON.stringify({ pid: 4242 }), 'utf8');

  const alive = { pid: process.pid, kill: () => undefined };
  const acquired = acquireProcessLock({ dir, proc: alive });
  assert.equal(acquired.ok, false);
  assert.equal(acquired.reason, REASONS.LOCK_HELD);
  assert.equal(acquired.detail.holder, 4242);
});
