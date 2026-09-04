import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MESSAGE_TYPES } from '../validator/constants.mjs';
import { claimKey, createLedger, idempotencyKeyFor } from '../validator/idempotency.mjs';
import { SHA_A, SHA_B, SHA_MERGE, message } from './helpers.mjs';

test('nam khoa bat buoc cua #153 dung tung ky tu', () => {
  assert.equal(idempotencyKeyFor(message('BUILD_STARTED')), 'build:200');
  assert.equal(idempotencyKeyFor(message('REVIEW_REQUEST')), `review-request:201:${SHA_A}`);
  assert.equal(
    idempotencyKeyFor(message('REVIEW_PASS')),
    `review-verdict:201:${SHA_A}:REVIEW_PASS`,
  );
  assert.equal(
    idempotencyKeyFor(message('REVIEW_BLOCK')),
    `review-verdict:201:${SHA_A}:REVIEW_BLOCK`,
  );
  assert.equal(idempotencyKeyFor(message('RUNTIME_PROOF')), `runtime:${SHA_MERGE}:gd1-test`);
  assert.equal(idempotencyKeyFor(message('TASK_DONE')), `done:200:${SHA_MERGE}`);
});

test('ba khoa mo rong V0 — moi loai thong diep deu co khoa, khong loai nao phat bao nhieu lan cung duoc', () => {
  assert.equal(idempotencyKeyFor(message('TASK_READY')), 'task-ready:200');
  assert.equal(idempotencyKeyFor(message('BUILD_READY')), `build-ready:201:${SHA_A}`);
  assert.equal(idempotencyKeyFor(message('CI_FAIL')), `ci-fail:201:${SHA_A}:1001`);
  for (const type of Object.values(MESSAGE_TYPES))
    assert.equal(typeof idempotencyKeyFor(message(type)), 'string', type);
});

test('khoa la ham cua Y DINH: cung HEAD khac phan xet => khac khoa; khac HEAD => khac khoa', () => {
  assert.notEqual(
    idempotencyKeyFor(message('REVIEW_PASS')),
    idempotencyKeyFor(message('REVIEW_BLOCK')),
  );
  assert.notEqual(
    idempotencyKeyFor(message('REVIEW_PASS')),
    idempotencyKeyFor(message('REVIEW_PASS', { head_sha: SHA_B })),
  );
  assert.notEqual(
    idempotencyKeyFor(message('RUNTIME_PROOF')),
    idempotencyKeyFor(message('RUNTIME_PROOF', { env: 'production' })),
  );
  assert.equal(
    idempotencyKeyFor(message('REVIEW_PASS')),
    idempotencyKeyFor(message('REVIEW_PASS')),
    'cung y dinh => cung khoa',
  );
});

test('loai thong diep khong co khoa => nem, khong tra khoa rong', () => {
  assert.throws(() => idempotencyKeyFor({ type: 'MERGED' }), /MERGED/);
});

test('so khoa: lan dau claim duoc, lan hai la duplicate, so cu khong doi (bat bien)', () => {
  const empty = createLedger();
  const first = claimKey(empty, 'build:200');
  assert.equal(first.duplicate, false);
  assert.deepEqual([...first.ledger.keys], ['build:200']);
  assert.deepEqual([...empty.keys], [], 'so cu khong bi sua');
  const second = claimKey(first.ledger, 'build:200');
  assert.equal(second.duplicate, true);
  assert.equal(second.ledger, first.ledger, 'duplicate khong tao so moi');
  assert.ok(Object.isFrozen(first.ledger) && Object.isFrozen(first.ledger.keys));
  assert.throws(() => {
    first.ledger.keys.push('x');
  });
});
