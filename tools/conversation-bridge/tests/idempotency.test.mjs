/**
 * §12 "Idempotency" — mot y dinh danh thuc chi duoc thanh MOT tin nhan, qua moi ranh gioi.
 *
 * Bon ranh gioi duoc kiem rieng vi chung hong theo bon kieu khac nhau:
 *   · hai vong poll trong CUNG mot tien trinh   -> so trong bo nho
 *   · KHOI DONG LAI tien trinh host             -> so tren dia
 *   · service worker cua tien ich bi thu hoi    -> so trong chrome.storage
 *   · HEAD moi                                  -> khoa MOI, va phai giao duoc mot lan nua
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pollOnce } from '../native-host/poll.mjs';
import { routeWakeFrame } from '../extension/shared/wake-router.js';
import { loadLedger } from '../native-host/ledger.mjs';
import { deliveryKeyFor } from '../protocol/delivery-key.mjs';
import {
  HEAD_SHA,
  OTHER_SHA,
  REPO,
  comment,
  pullRequest,
  reviewRequestBody,
} from './fixtures/github.mjs';
import { makeRuntime, tempStatePath } from './fixtures/runtime.mjs';
import { makeDeps } from './fixtures/router-deps.mjs';

test('9. cung mot carrier duoc poll hai lan -> dung mot lan giao', async () => {
  const harness = makeRuntime({ comments: [comment()], pulls: { 205: pullRequest() } });
  const first = await pollOnce(harness.runtime);
  const second = await pollOnce(harness.runtime);
  assert.equal(first.sent, 1);
  assert.equal(second.sent, 0);
  assert.equal(harness.sentFrames.length, 1);
  assert.equal(second.outcomes[0].reason, 'ALREADY_DELIVERED');
});

test('10. khoi dong lai host voi so da luu -> khong giao lai', async () => {
  const statePath = tempStatePath();
  const before = makeRuntime({ comments: [comment()], pulls: { 205: pullRequest() }, statePath });
  assert.equal((await pollOnce(before.runtime)).sent, 1);

  // Tien trinh moi: KHONG mang theo gi trong bo nho, chi doc lai so tu dia.
  const after = makeRuntime({ comments: [comment()], pulls: { 205: pullRequest() }, statePath });
  const result = await pollOnce(after.runtime);
  assert.equal(result.sent, 0);
  assert.deepEqual(after.sentFrames, []);

  const reloaded = loadLedger(statePath);
  assert.equal(reloaded.ok, true);
  assert.deepEqual(Object.keys(reloaded.ledger.records), [
    deliveryKeyFor({ repo: REPO, pr: 205, headSha: HEAD_SHA }),
  ]);
});

test('10b. khoa duoc ghi TRUOC khi khung roi khoi tien trinh', async () => {
  const statePath = tempStatePath();
  const harness = makeRuntime({ comments: [comment()], pulls: { 205: pullRequest() }, statePath });
  const key = deliveryKeyFor({ repo: REPO, pr: 205, headSha: HEAD_SHA });
  /** @type {string[]} */
  const order = [];
  harness.runtime.send = () => order.push('SEND');
  const originalReplace = harness.runtime.ledgerStore.replace;
  harness.runtime.ledgerStore.replace = (next) => {
    order.push('LEDGER');
    originalReplace(next);
  };
  await pollOnce(harness.runtime);
  assert.deepEqual(order, ['LEDGER', 'SEND'], 'so phai ben TRUOC khi gui');
  // Va so tren DIA cung da ben truoc lan gui, khong chi so trong bo nho.
  const onDisk = loadLedger(statePath);
  assert.equal(onDisk.ok && Object.prototype.hasOwnProperty.call(onDisk.ledger.records, key), true);
});

test('11. cung PR, HEAD moi -> khoa moi, giao duoc dung mot lan nua', async () => {
  const statePath = tempStatePath();
  const first = makeRuntime({ comments: [comment()], pulls: { 205: pullRequest() }, statePath });
  assert.equal((await pollOnce(first.runtime)).sent, 1);

  const second = makeRuntime({
    comments: [comment({ body: reviewRequestBody({ headSha: OTHER_SHA }) })],
    pulls: { 205: pullRequest({ headSha: OTHER_SHA }) },
    statePath,
  });
  assert.equal((await pollOnce(second.runtime)).sent, 1);
  assert.equal((await pollOnce(second.runtime)).sent, 0, 'HEAD moi cung chi duoc mot lan');

  const reloaded = loadLedger(statePath);
  assert.equal(Object.keys(reloaded.ok ? reloaded.ledger.records : {}).length, 2);
});

test('11b. so hong -> host tu choi chay, KHONG coi nhu chua giao lan nao', () => {
  const statePath = tempStatePath();
  // Ghi rac vao dung cho so.
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, '{"version":1,"records":');
  assert.deepEqual(loadLedger(statePath), { ok: false, error: 'LEDGER_CORRUPT' });
});

test('12-pre. phia tien ich: khung WAKE lap lai -> khong cham vao DOM lan hai', async () => {
  const key = deliveryKeyFor({ repo: REPO, pr: 205, headSha: HEAD_SHA });
  const frame = { v: 1, kind: 'WAKE', key, repo: REPO, pr: 205, headSha: HEAD_SHA };
  const harness = makeDeps();
  const first = await routeWakeFrame(frame, harness.deps);
  const second = await routeWakeFrame(frame, harness.deps);
  assert.equal(first.reason, 'WAKE_SENT');
  assert.equal(second.reason, 'ALREADY_DELIVERED');
  assert.equal(harness.injections.length, 1, 'chi mot lan tiem');
  assert.deepEqual(harness.dom.touchedTraps, []);
});

test('12-pre-b. tien ich ghi khoa TRUOC khi tiem, nen mot lan tiem hong khong mo duong gui lai', async () => {
  const key = deliveryKeyFor({ repo: REPO, pr: 205, headSha: HEAD_SHA });
  const frame = { v: 1, kind: 'WAKE', key, repo: REPO, pr: 205, headSha: HEAD_SHA };
  const { chatgptPage } = await import('./fixtures/chatgpt-page.mjs');
  const { ARMED_URL } = await import('./fixtures/router-deps.mjs');
  const broken = chatgptPage({ href: ARMED_URL, composer: 'none' });
  const harness = makeDeps({ page: broken });
  const first = await routeWakeFrame(frame, harness.deps);
  assert.equal(first.reason, 'COMPOSER_NOT_FOUND');
  assert.deepEqual(Object.keys(harness.deliveredNow()), [key], 'khoa da ben du tiem hong');
  const second = await routeWakeFrame(frame, harness.deps);
  assert.equal(second.reason, 'ALREADY_DELIVERED');
});
