/**
 * §12 "Exact SHA" — cong chong danh thuc nguoi review cho mot commit da qua.
 *
 * Bai kiem o day khang dinh CA hai chieu: HEAD trung thi co khung WAKE, HEAD lech thi KHONG CO
 * KHUNG NAO ROI KHOI TIEN TRINH. Khang dinh chieu thu hai bang "khong co khung" chu khong bang
 * mot ma tu choi, vi ma tu choi van dung ke ca khi mot khung da kip di.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { pollOnce } from '../native-host/poll.mjs';
import {
  HEAD_SHA,
  OTHER_SHA,
  comment,
  pullRequest,
  reviewRequestBody,
} from './fixtures/github.mjs';
import { makeRuntime } from './fixtures/runtime.mjs';

test('6. HEAD khai = HEAD song -> co dung mot khung WAKE, mang dung HEAD song', async () => {
  const harness = makeRuntime({
    comments: [comment()],
    pulls: { 205: pullRequest({ headSha: HEAD_SHA }) },
  });
  const result = await pollOnce(harness.runtime);
  assert.equal(result.sent, 1);
  assert.equal(harness.sentFrames.length, 1);
  assert.deepEqual(harness.sentFrames[0], {
    v: 1,
    kind: 'WAKE',
    key: `conversation-bridge:phungtienviet14-sketch/nexagnet-platform:205:${HEAD_SHA}`,
    repo: 'phungtienviet14-sketch/nexagnet-platform',
    pr: 205,
    headSha: HEAD_SHA,
  });
  // Trang thai PR phai duoc doc SONG, khong duoc suy tu carrier.
  assert.ok(harness.calls.some((path) => path.endsWith('/pulls/205')));
});

test('7. HEAD khai cu hon HEAD song -> tu choi, va KHONG khung nao duoc gui', async () => {
  const harness = makeRuntime({
    comments: [comment({ body: reviewRequestBody({ headSha: OTHER_SHA }) })],
    pulls: { 205: pullRequest({ headSha: HEAD_SHA }) },
  });
  const result = await pollOnce(harness.runtime);
  assert.equal(result.sent, 0);
  assert.deepEqual(harness.sentFrames, []);
  assert.deepEqual(result.outcomes, [{ state: 'REJECTED_STALE', reason: 'HEAD_MISMATCH' }]);
});

test('8. PR da dong / da merge / khong ton tai -> tu choi, khong khung nao duoc gui', async () => {
  for (const [label, pulls, reason] of [
    ['dong', { 205: pullRequest({ state: 'closed' }) }, 'PR_NOT_OPEN'],
    ['merge', { 205: pullRequest({ state: 'closed', merged: true }) }, 'PR_NOT_OPEN'],
    ['mo nhung da merge', { 205: pullRequest({ state: 'open', merged: true }) }, 'PR_NOT_OPEN'],
    ['khong ton tai', {}, 'PR_NOT_FOUND'],
  ]) {
    const harness = makeRuntime({ comments: [comment()], pulls: /** @type {any} */ (pulls) });
    const result = await pollOnce(harness.runtime);
    assert.equal(result.sent, 0, label);
    assert.deepEqual(harness.sentFrames, [], label);
    assert.equal(result.outcomes[0].reason, reason, label);
  }
});

test('8b. doc GitHub that bai -> tu choi FAIL-CLOSED, khong doan tu du lieu cu', async () => {
  const harness = makeRuntime({ comments: [comment()], pulls: {}, failWith: 503 });
  const result = await pollOnce(harness.runtime);
  assert.equal(result.sent, 0);
  assert.deepEqual(harness.sentFrames, []);
  assert.ok(harness.logLines.some((line) => line.includes('LIVE_STATE_UNAVAILABLE')));
});

test('8c. enabled=false -> khong doc GitHub mot lan nao', async () => {
  const harness = makeRuntime({
    comments: [comment()],
    pulls: { 205: pullRequest() },
    enabled: false,
  });
  const result = await pollOnce(harness.runtime);
  assert.equal(result.sent, 0);
  assert.deepEqual(harness.calls, []);
});
