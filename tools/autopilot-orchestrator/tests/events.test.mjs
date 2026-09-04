/**
 * BA TRIGGER CUA HOP DONG #165 — cai dat du ca ba, va ca ba fail-closed.
 *
 * MOT LOI THU NHAN VE DU LIEU: vo su kien (`payload.action`, `payload.check_suite`, ...) trong tep
 * nay la TONG HOP — dung theo hinh dang GitHub khai trong tai lieu, nhung khong phai ban bat duoc
 * tu webhook that. NOI DUNG THONG DIEP thi that: than comment lay tu `pr-155-comments.json`, bat
 * truc tiep tu REST cua chinh repo nay.
 *
 * Noi ro vi bo test cua package nay duoc dung de noi "giao thuc chay tren su kien that", va ranh
 * gioi giua cai that va cai tong hop phai doc duoc, khong phai doan.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { EVENT_NAMES, RESOLUTIONS, resolveEventTarget } from '../src/events.mjs';
import { ORCHESTRATOR_REASONS } from '../src/reasons.mjs';

/** @param {string} name */
const fixture = (name) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8'));

const COMMENTS = fixture('pr-155-comments.json');
const BUILD_READY = COMMENTS.find((/** @type {{ id: number }} */ c) => c.id === 5535424344);

const HEAD = 'c86219b22be19ce3db7a9753bd9866316b654cbe';

/** @param {Record<string, any>} [over] */
const issueCommentEvent = (over = {}) => ({
  action: 'created',
  issue: { number: 155, pull_request: { url: 'https://api.github.com/repos/o/r/pulls/155' } },
  comment: BUILD_READY,
  ...over,
});

/** @param {Record<string, any>} [over] */
const pullRequestEvent = (over = {}) => ({
  action: 'synchronize',
  pull_request: { number: 155, head: { sha: HEAD } },
  ...over,
});

/** @param {Record<string, any>} [over] */
const checkSuiteEvent = (over = {}) => ({
  action: 'completed',
  check_suite: { head_sha: HEAD, conclusion: 'success', pull_requests: [{ number: 155 }] },
  ...over,
});

test('CA BA trigger cua hop dong #165 duoc xu ly — khong cai nao roi vao nhanh "khong biet"', () => {
  // Ba ten trong `EVENT_NAMES` phai dung bang ba ten hop dong khai. Them/bot mot cai o day ma quen
  // sua workflow thi bai trong `workflow.test.mjs` bat.
  assert.deepEqual(Object.values(EVENT_NAMES).slice().sort(), [
    'check_suite',
    'issue_comment',
    'pull_request',
  ]);

  /** @type {Array<[string, Record<string, any>]>} */
  const byTrigger = [
    [EVENT_NAMES.ISSUE_COMMENT, issueCommentEvent()],
    [EVENT_NAMES.PULL_REQUEST, pullRequestEvent()],
    [EVENT_NAMES.CHECK_SUITE, checkSuiteEvent()],
  ];
  for (const [eventName, payload] of byTrigger) {
    const resolved = resolveEventTarget({ eventName, payload });
    assert.equal(resolved.resolution, RESOLUTIONS.TARGET, `${eventName} phai ra duoc muc tieu`);
    assert.equal(resolved.target?.pr, 155);
    assert.equal(resolved.target?.trigger, eventName);
  }
});

test('KHAC BIET DUY NHAT giua ba duong: ai mang thong diep san, ai phai tra cuu', () => {
  const fromComment = resolveEventTarget({
    eventName: EVENT_NAMES.ISSUE_COMMENT,
    payload: issueCommentEvent(),
  });
  assert.equal(fromComment.target?.inbandComment, BUILD_READY);
  // Comment den truc tiep thi khong co "HEAD ma su kien noi toi" — chinh than thong diep khai HEAD,
  // va cong exact-SHA cua giao thuc lo phan do.
  assert.equal(fromComment.target?.claimedHeadSha, null);

  /** @type {Array<[string, Record<string, any>]>} */
  const lookups = [
    [EVENT_NAMES.PULL_REQUEST, pullRequestEvent()],
    [EVENT_NAMES.CHECK_SUITE, checkSuiteEvent()],
  ];
  for (const [eventName, payload] of lookups) {
    const resolved = resolveEventTarget({ eventName, payload });
    assert.equal(resolved.target?.inbandComment, null, `${eventName} khong mang thong diep`);
    assert.equal(resolved.target?.claimedHeadSha, HEAD);
  }
});

test('issue_comment tren Issue thuong => bo qua, khong phai loi', () => {
  const resolved = resolveEventTarget({
    eventName: EVENT_NAMES.ISSUE_COMMENT,
    payload: issueCommentEvent({ issue: { number: 165 } }),
  });
  assert.equal(resolved.resolution, RESOLUTIONS.STOP);
  assert.equal(resolved.reason, ORCHESTRATOR_REASONS.EVENT_NOT_HANDLED);
});

test('pull_request: chi ba action lam HEAD/su ton tai doi moi duoc xu ly', () => {
  for (const action of ['opened', 'reopened', 'synchronize']) {
    const resolved = resolveEventTarget({
      eventName: EVENT_NAMES.PULL_REQUEST,
      payload: pullRequestEvent({ action }),
    });
    assert.equal(resolved.resolution, RESOLUTIONS.TARGET, action);
  }
  // `closed`, `labeled`, `edited`, ... khong doi HEAD => khong co gi de quyet dinh lai.
  for (const action of ['closed', 'labeled', 'edited', 'review_requested']) {
    const resolved = resolveEventTarget({
      eventName: EVENT_NAMES.PULL_REQUEST,
      payload: pullRequestEvent({ action }),
    });
    assert.equal(resolved.resolution, RESOLUTIONS.STOP, action);
    assert.equal(resolved.reason, ORCHESTRATOR_REASONS.EVENT_NOT_HANDLED);
  }
});

test('check_suite: chua xong thi chua co gi de ket luan', () => {
  const resolved = resolveEventTarget({
    eventName: EVENT_NAMES.CHECK_SUITE,
    payload: checkSuiteEvent({ action: 'requested' }),
  });
  assert.equal(resolved.resolution, RESOLUTIONS.STOP);
  assert.equal(resolved.reason, ORCHESTRATOR_REASONS.EVENT_NOT_HANDLED);
});

test('check_suite khong buoc vao PR nao (push len main) => bo qua', () => {
  const resolved = resolveEventTarget({
    eventName: EVENT_NAMES.CHECK_SUITE,
    payload: checkSuiteEvent({ check_suite: { head_sha: HEAD, pull_requests: [] } }),
  });
  assert.equal(resolved.resolution, RESOLUTIONS.STOP);
  assert.equal(resolved.reason, ORCHESTRATOR_REASONS.EVENT_NOT_HANDLED);
});

test('check_suite buoc vao NHIEU PR => tu choi, khong chon dai cai dau tien', () => {
  // Hinh dang HOP LE cua GitHub (hai PR cung mot HEAD), khong phai payload hong. Nhung chon mot
  // trong hai la DOAN, va V0 read-only thi khong doan.
  const resolved = resolveEventTarget({
    eventName: EVENT_NAMES.CHECK_SUITE,
    payload: checkSuiteEvent({
      check_suite: { head_sha: HEAD, pull_requests: [{ number: 155 }, { number: 167 }] },
    }),
  });
  assert.equal(resolved.resolution, RESOLUTIONS.STOP);
  assert.equal(resolved.reason, ORCHESTRATOR_REASONS.EVENT_TARGET_UNRESOLVED);
  assert.deepEqual(resolved.detail.pullRequests, [155, 167]);
});

test('payload hong cua mot loai DA KHAI => ABORT (job do), khong lang le bo qua', () => {
  /** @type {Array<[string, Record<string, any>]>} */
  const broken = [
    [EVENT_NAMES.ISSUE_COMMENT, { action: 'created' }],
    [EVENT_NAMES.PULL_REQUEST, { action: 'synchronize' }],
    [EVENT_NAMES.CHECK_SUITE, { action: 'completed' }],
  ];
  for (const [eventName, payload] of broken) {
    const resolved = resolveEventTarget({ eventName, payload });
    assert.equal(resolved.resolution, RESOLUTIONS.ABORT, eventName);
    assert.equal(resolved.reason, ORCHESTRATOR_REASONS.EVENT_SHAPE_UNKNOWN);
  }
});

test('so PR khong doc duoc => ABORT, khong chay tren mot PR doan ra', () => {
  for (const number of [null, 'mot-tram-nam-lam', 0, -1, 1.5]) {
    const resolved = resolveEventTarget({
      eventName: EVENT_NAMES.PULL_REQUEST,
      payload: pullRequestEvent({ pull_request: { number, head: { sha: HEAD } } }),
    });
    assert.equal(resolved.resolution, RESOLUTIONS.ABORT, String(number));
    assert.equal(resolved.reason, ORCHESTRATOR_REASONS.EVENT_TARGET_UNRESOLVED);
  }
});

test('su kien ngoai ba loai (ke ca payload rong) => bo qua im lang', () => {
  for (const eventName of ['push', 'workflow_run', 'release', undefined]) {
    const resolved = resolveEventTarget({ eventName, payload: {} });
    assert.equal(resolved.resolution, RESOLUTIONS.STOP, String(eventName));
    assert.equal(resolved.reason, ORCHESTRATOR_REASONS.EVENT_NOT_HANDLED);
  }
  const nothing = resolveEventTarget({ eventName: EVENT_NAMES.PULL_REQUEST, payload: null });
  assert.equal(nothing.resolution, RESOLUTIONS.ABORT);
});
