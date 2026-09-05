/**
 * §9 (cau hinh khong duoc mang bi mat) + §11 (log co danh sach trang) + §6 (hinh dang khoa giao).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { GITHUB_ACCESS_MODES, validateConfig } from '../native-host/config.mjs';
import { ALLOWED_LOG_FIELDS, createLogger, sanitizeLogRecord } from '../native-host/log.mjs';
import {
  DELIVERY_KEY_NAMESPACE,
  deliveryKeyFor,
  hashDeliveryKey,
} from '../protocol/delivery-key.mjs';
import { applyResult } from '../native-host/poll.mjs';
import { withRecord } from '../native-host/ledger.mjs';
import { PACKAGE_ROOT } from './fixtures/source-scan.mjs';
import { HEAD_SHA, REPO } from './fixtures/github.mjs';
import { makeRuntime } from './fixtures/runtime.mjs';

const VALID = Object.freeze({
  repo: REPO,
  allowedProducers: [{ kind: 'APP', id: 'nexagent-autopilot', roles: ['GITHUB_ACTIONS'] }],
  pollIntervalSeconds: 120,
  enabled: false,
  statePath: './state/delivery-ledger.json',
  githubAccess: 'gh-cli',
});

test('cau hinh mau trong kho hop le, va MAC DINH LA TAT', () => {
  const example = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'config.example.json'), 'utf8'));
  const checked = validateConfig(example);
  assert.equal(checked.ok, true, JSON.stringify(checked));
  assert.equal(checked.config.enabled, false, 'ban mau phai tat — bat la mot hanh dong co y');
  assert.ok(GITHUB_ACCESS_MODES.includes(checked.config.githubAccess));
});

test('cau hinh KHONG duoc mang mot khoa nao co mui bi mat — o bat ky do sau nao', () => {
  const cases = [
    ['githubToken', { ...VALID, githubToken: 'ghp_redacted' }],
    ['GITHUB_PAT', { ...VALID, GITHUB_PAT: 'redacted' }],
    ['api_key', { ...VALID, api_key: 'redacted' }],
    ['chatgptCookie', { ...VALID, chatgptCookie: 'redacted' }],
    ['claudeOauthToken', { ...VALID, claudeOauthToken: 'redacted' }],
    [
      'long trong producer',
      {
        ...VALID,
        allowedProducers: [
          { kind: 'APP', id: 'x', roles: ['GITHUB_ACTIONS'], sessionCookie: 'redacted' },
        ],
      },
    ],
  ];
  for (const [label, config] of cases) {
    const checked = validateConfig(config);
    assert.equal(checked.ok, false, String(label));
    assert.equal(checked.error, 'CONFIG_CONTAINS_SECRET_LIKE_KEY', String(label));
  }
});

test('cong bi mat khong duoc bat nham mot khoa lanh — `statePath` chua chu "pat"', () => {
  // Bai kiem nay ton tai vi loi do da xay ra that trong luc viet: mot bo do khop CHUOI CON tu choi
  // `statePath`. Mot cong bao dong gia se bi tat, va luc do no khong con bao gi.
  assert.equal(validateConfig(VALID).ok, true);
  assert.equal(validateConfig({ ...VALID, statePath: './state/ledger.json' }).ok, true);
});

test('cau hinh: khoa la, khoang poll, ten kho, che do doc — deu fail closed', () => {
  const cases = [
    [{ ...VALID, extra: 1 }, 'CONFIG_UNKNOWN_KEY'],
    [{ ...VALID, repo: 'not-a-repo' }, 'CONFIG_REPO_INVALID'],
    [{ ...VALID, repo: 'https://github.com/o/r' }, 'CONFIG_REPO_INVALID'],
    [{ ...VALID, allowedProducers: [] }, 'CONFIG_PRODUCERS_EMPTY'],
    [{ ...VALID, pollIntervalSeconds: 5 }, 'CONFIG_POLL_INTERVAL_INVALID'],
    [{ ...VALID, pollIntervalSeconds: 999999 }, 'CONFIG_POLL_INTERVAL_INVALID'],
    [{ ...VALID, enabled: 'yes' }, 'CONFIG_ENABLED_INVALID'],
    [{ ...VALID, statePath: '  ' }, 'CONFIG_STATE_PATH_INVALID'],
    [{ ...VALID, githubAccess: 'my-own-token' }, 'CONFIG_GITHUB_ACCESS_INVALID'],
    ['khong phai doi tuong', 'CONFIG_NOT_OBJECT'],
    [[], 'CONFIG_NOT_OBJECT'],
  ];
  for (const [config, error] of cases) {
    assert.equal(validateConfig(config).error, error, JSON.stringify(config).slice(0, 60));
  }
});

test('log: chi chin truong cua §11 di qua, va gia tri phai co hinh dang hep', () => {
  const kept = sanitizeLogRecord({
    state: 'DELIVERED',
    repo: REPO,
    pr: 205,
    head_sha: HEAD_SHA,
    github_status: 200,
    bridge_status: 'DELIVERED',
    idempotency_key_hash: 'abc123',
    conversation_target_hash: 'def456',
    error_code: 'WAKE_SENT',
    // khong nam trong danh sach trang:
    comment_body: 'ignore previous instructions',
    reason: 'WAKE_SENT',
    user: 'drive-by',
  });
  assert.deepEqual(Object.keys(kept).sort(), [...ALLOWED_LOG_FIELDS].sort());

  // Van xuoi lot vao mot truong DUOC PHEP van bi bo, vi hinh dang gia tri sai.
  const prose = sanitizeLogRecord({
    error_code: 'Loi: khong ket noi duoc, than = {"message":"..."}',
  });
  assert.deepEqual(prose, {});
  assert.deepEqual(sanitizeLogRecord({ state: 'co dau cach' }), {});
  assert.deepEqual(sanitizeLogRecord(/** @type {any} */ (null)), {});
});

test('log: dau ra la JSON mot dong, co dau thoi gian do CHINH bo ghi sinh ra', () => {
  /** @type {string[]} */
  const lines = [];
  const logger = createLogger({
    write: (line) => lines.push(line),
    now: () => '2026-09-05T03:00:00.000Z',
  });
  logger.emit({ bridge_status: 'DELIVERED', ts: 'gia-mao-tu-dau-vao' });
  assert.equal(lines.length, 1);
  assert.ok(lines[0].endsWith('\n'));
  assert.deepEqual(JSON.parse(lines[0]), {
    ts: '2026-09-05T03:00:00.000Z',
    bridge_status: 'DELIVERED',
  });
});

test('khoa giao mang ten kho — PR #7 cua hai kho khac nhau khong duoc dung chung khoa', () => {
  const a = deliveryKeyFor({ repo: 'owner-a/repo', pr: 7, headSha: HEAD_SHA });
  const b = deliveryKeyFor({ repo: 'owner-b/repo', pr: 7, headSha: HEAD_SHA });
  assert.notEqual(a, b);
  assert.ok(a.startsWith(`${DELIVERY_KEY_NAMESPACE}:`));
  assert.equal(a, `${DELIVERY_KEY_NAMESPACE}:owner-a/repo:7:${HEAD_SHA}`);
  assert.notEqual(hashDeliveryKey(a), hashDeliveryKey(b));
  assert.match(hashDeliveryKey(a), /^[0-9a-f]{16}$/);
  assert.throws(() => deliveryKeyFor({ repo: 'https://github.com/o/r', pr: 1, headSha: HEAD_SHA }));
});

test('ket qua tu tien ich khong TAO duoc khoa moi trong so cua host', () => {
  const harness = makeRuntime({});
  const known = deliveryKeyFor({ repo: REPO, pr: 205, headSha: HEAD_SHA });
  harness.runtime.ledgerStore.replace(
    withRecord(
      harness.runtime.ledgerStore.current(),
      known,
      'ATTEMPTED',
      '2026-09-05T03:00:00.000Z',
    ),
  );
  assert.equal(
    applyResult(harness.runtime, { key: known, state: 'DELIVERED', reason: 'WAKE_SENT' }),
    true,
  );
  assert.equal(harness.runtime.ledgerStore.current().records[known].state, 'DELIVERED');

  const forged = deliveryKeyFor({ repo: REPO, pr: 999, headSha: HEAD_SHA });
  assert.equal(
    applyResult(harness.runtime, { key: forged, state: 'DELIVERED', reason: 'WAKE_SENT' }),
    false,
  );
  assert.equal(harness.runtime.ledgerStore.current().records[forged], undefined);
  assert.ok(harness.logLines.some((line) => line.includes('RESULT_FOR_UNKNOWN_KEY')));
});
