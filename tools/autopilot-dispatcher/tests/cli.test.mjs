import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { main, parseArgs } from '../src/cli.mjs';
import { baseConfig, fakeGh, removeDir, tempDir } from './helpers.mjs';

/** @param {import('node:test').TestContext} t @param {Record<string, any>} [over] */
function configFile(t, over = {}) {
  const dir = tempDir('cli');
  t.after(() => removeDir(dir));
  const file = path.join(dir, 'dispatcher.config.json');
  const config = baseConfig({
    stateDir: path.join(dir, 'state'),
    worktreeRoot: path.join(dir, 'worktrees'),
    ...over,
  });
  fs.writeFileSync(file, JSON.stringify(config, null, 2), 'utf8');
  return { dir, file };
}

function capture() {
  /** @type {string[]} */ const out = [];
  /** @type {string[]} */ const err = [];
  return { out, err, io: { stdout: (l) => out.push(l), stderr: (l) => err.push(l) } };
}

test('flags are parsed without any shell involvement', () => {
  assert.deepEqual(parseArgs(['plan', '--config', 'a.json', '--issue', '256']), {
    command: 'plan',
    flags: { config: 'a.json', issue: '256' },
  });
  assert.deepEqual(parseArgs(['once', '--config', 'a.json', '--execute']), {
    command: 'once',
    flags: { config: 'a.json', execute: true },
  });
  assert.equal(parseArgs([]).command, 'plan');
});

test('plan is the default command', () => {
  assert.equal(parseArgs(['--config', 'a.json']).command, '--config');
  assert.equal(parseArgs([]).command, 'plan');
});

test('an unknown command is refused with usage text', async () => {
  const { err, io } = capture();
  const code = await main(['destroy', '--config', 'x.json'], io);
  assert.equal(code, 2);
  assert.match(err.join('\n'), /unknown command: destroy/);
});

test('a missing --config is refused', async () => {
  const { err, io } = capture();
  assert.equal(await main(['plan'], io), 2);
  assert.match(err.join('\n'), /missing --config/);
});

test('an unreadable config is refused with a typed reason and no stack trace', async (t) => {
  const dir = tempDir('cli-missing');
  t.after(() => removeDir(dir));
  const { err, io } = capture();
  const code = await main(['plan', '--config', path.join(dir, 'nope.json')], io);
  assert.equal(code, 2);
  const parsed = JSON.parse(err[0]);
  assert.equal(parsed.event, 'config.rejected');
  assert.equal(parsed.reason, 'CONFIG_UNREADABLE');
});

test('a config that names a non-Opus model is refused at startup', async (t) => {
  const { file } = configFile(t, {
    claude: { ...baseConfig().claude, model: 'sonnet' },
  });
  const { err, io } = capture();
  assert.equal(await main(['plan', '--config', file], io), 2);
  assert.equal(JSON.parse(err[0]).reason, 'CONFIG_MODEL_NOT_OPUS');
});

test('`once` without --execute refuses to execute and says so', async (t) => {
  const { file, dir } = configFile(t);
  const { err, io } = capture();
  // GitHub duoc thay bang mot ban gia KHONG CO task nao: bai nay do hanh vi cua CLI, khong do
  // mang, nen no phai chay duoc tren mot may khong co ket noi.
  await main(['once', '--config', file], io, { deps: { gh: fakeGh({}) } });
  assert.match(err.join('\n'), /needs --execute/);
  // Va khong co dau vet nao cua mot lan chay that.
  assert.equal(fs.existsSync(path.join(dir, 'state', 'ledger.json')), false);
});

test('status prints ledger records as structured lines', async (t) => {
  const { file, dir } = configFile(t);
  const stateDir = path.join(dir, 'state');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(
    path.join(stateDir, 'ledger.json'),
    JSON.stringify({
      'dispatch:acme/widgets:256:aa': {
        key: 'dispatch:acme/widgets:256:aa',
        repo: 'acme/widgets',
        issue: 256,
        taskId: 'DEMO_TASK_V0',
        contractDigest: 'a'.repeat(64),
        branch: 'claude/autopilot/issue-256-aaaaaaaaaaaa',
        state: 'HANDOFF_PRESENT',
        model: 'opus',
        effort: 'max',
        lastReason: null,
      },
    }),
    'utf8',
  );

  const { out, io } = capture();
  assert.equal(await main(['status', '--config', file], io), 0);
  const record = JSON.parse(out[0]);
  assert.equal(record.event, 'ledger.record');
  assert.equal(record.state, 'HANDOFF_PRESENT');
  assert.equal(record.model, 'opus');
  assert.equal(record.effort, 'max');
});

test('help lists only the three read-or-run commands and no install command', async () => {
  const { out, io } = capture();
  assert.equal(await main(['help'], io), 0);
  const text = out.join('\n');
  for (const command of ['plan', 'once', 'status']) assert.ok(text.includes(command));
  for (const forbidden of ['install', 'service', 'daemon', 'schtasks']) {
    assert.equal(text.includes(forbidden), false, `usage advertises ${forbidden}`);
  }
});
