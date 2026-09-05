/**
 * DUONG TRA CUU va CONG CHONG TRUNG — hai thu sinh ra tu viec co BA TRIGGER.
 *
 * Du lieu o day la THAT: `pr-155-comments.json` bat truc tiep tu REST cua chinh repo nay, gom mot
 * `BUILD_READY` that, mot `REVIEW_PASS` that (hong vi thua truong `REVIEWER`), va mot
 * `REVIEW_BLOCK` that.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { findPostedClaim, selectBuildReadyAtHead } from '../src/inbox.mjs';
import { ORCHESTRATOR_REASONS } from '../src/reasons.mjs';

/** @param {string} name */
const fixture = (name) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8'));

const COMMENTS = fixture('pr-155-comments.json');

const HEAD = 'c86219b22be19ce3db7a9753bd9866316b654cbe';
const OLD_HEAD = '3d11fbad86cf9dbc15978f6e2b741b669a5205c2';

/**
 * Mot `BUILD_READY` toi thieu nhung HOP LE — de dung khi bai kiem can nhieu ban o cac HEAD khac
 * nhau, thu ma du lieu bat duoc chi co mot.
 * @param {{ id: number, headSha: string, pr?: number }} at
 */
const buildReadyComment = ({ id, headSha, pr = 155 }) => ({
  id,
  user: { login: 'phungtienviet14-sketch' },
  performed_via_github_app: null,
  body: [
    '<!-- AUTOPILOT_BUILD_READY_V0 -->',
    'BUILD_READY',
    'ISSUE=153',
    `PR=${pr}`,
    `HEAD_SHA=${headSha}`,
    'BASE_SHA=b9ead7e0c238bea417763857ee85ae3714963be8',
  ].join('\n'),
});

test('TRA CUU: lay dung BUILD_READY THAT buoc vao HEAD hien tai', () => {
  const found = selectBuildReadyAtHead(COMMENTS, HEAD);
  assert.equal(found.ok, true);
  assert.equal(found.ok === true ? found.value.id : null, 5535424344);
});

test('KHONG CO thong diep nao o HEAD nay => dung, khong lay cai gan nhat', () => {
  // Day la truong hop THUONG cua `pull_request: synchronize` — HEAD vua doi, chua ai kip tuyen bo
  // no san sang. Lay dai BUILD_READY cu roi cho no truot cong exact-SHA se sinh ra mot
  // `HEAD_MISMATCH` ma KHONG AI vua phat: tieng on do chinh orchestrator tao ra.
  const missing = selectBuildReadyAtHead(COMMENTS, OLD_HEAD);
  assert.equal(missing.ok, false);
  assert.equal(
    missing.ok === false ? missing.reason : null,
    ORCHESTRATOR_REASONS.NO_BUILD_READY_AT_HEAD,
  );
  assert.equal(missing.ok === false ? missing.detail?.buildReadyAtOtherHeads : null, 1);
});

test('NHIEU BUILD_READY o cung HEAD => lay cai MOI NHAT theo id, khong theo thu tu mang', () => {
  const shuffled = [
    buildReadyComment({ id: 900, headSha: HEAD }),
    buildReadyComment({ id: 100, headSha: OLD_HEAD }),
    buildReadyComment({ id: 500, headSha: HEAD }),
  ];
  const found = selectBuildReadyAtHead(shuffled, HEAD);
  assert.equal(found.ok, true);
  assert.equal(found.ok === true ? found.value.id : null, 900);
});

test('duong TRA CUU khong phan xet: comment hong bi bo qua im lang, khong lam do lan chay', () => {
  // `REVIEW_PASS` that trong fixture KHONG parse duoc (thua dong `REVIEWER=chatgpt`). O duong
  // `issue_comment` no bi tu choi va tu choi duoc dang ra — do la viec cua `decide.mjs`. O day no
  // chi don gian khong phai BUILD_READY, va khong duoc lam hong viec tim kiem.
  const withGarbage = [{ id: 1, body: 'khong phai thong diep' }, { id: 2 }, ...COMMENTS];
  const found = selectBuildReadyAtHead(withGarbage, HEAD);
  assert.equal(found.ok, true);
  assert.equal(found.ok === true ? found.value.id : null, 5535424344);
});

test('khong doc duoc danh sach comment => FAIL-CLOSED, khong coi nhu "khong co thong diep nao"', () => {
  for (const bad of [null, undefined, {}, 'nope']) {
    const denied = selectBuildReadyAtHead(bad, HEAD);
    assert.equal(denied.ok, false);
    assert.equal(
      denied.ok === false ? denied.reason : null,
      ORCHESTRATOR_REASONS.PR_COMMENTS_UNAVAILABLE,
    );
  }
});

test('CHONG TRUNG: y dinh da dang roi thi khong dang lai — so bang KHOA cua giao thuc', () => {
  // Ba trigger co the cung du dieu kien tren MOT HEAD. Khong co cong nay thi mot HEAD lanh ba
  // comment giong het nhau.
  const claimed = findPostedClaim(COMMENTS, `build-ready:155:${HEAD}`);
  assert.equal(claimed.ok, true);
  assert.equal(claimed.ok === true ? claimed.value.duplicate : null, true);
  assert.equal(claimed.ok === true ? claimed.value.matchedCommentId : null, 5535424344);
});

test('CHONG TRUNG khong duoc bat nham: khoa khac thi khong phai trung', () => {
  for (const key of [
    `review-request:155:${HEAD}`, // chua tung dang
    `build-ready:155:${OLD_HEAD}`, // dung loai, khac HEAD
    `build-ready:167:${HEAD}`, // dung loai, khac PR
  ]) {
    const claimed = findPostedClaim(COMMENTS, key);
    assert.equal(claimed.ok, true, key);
    assert.equal(claimed.ok === true ? claimed.value.duplicate : null, false, key);
  }
});

test('CI_FAIL chay lai tren cung HEAD KHONG bi coi la trung — ci_run nam trong khoa', () => {
  // `ci-fail:<pr>:<head_sha>:<ci_run>`. Chay lai CI sinh ra run id moi, tuc BANG CHUNG MOI, nen
  // dang lai la dung. Neu ai do rut `ci_run` khoi khoa thi bai nay do.
  const posted = [
    {
      id: 10,
      body: [
        '<!-- AUTOPILOT_CI_FAIL_V0 -->',
        'CI_FAIL',
        'ISSUE=153',
        'PR=155',
        `HEAD_SHA=${HEAD}`,
        'CI_RUN=33834237024',
      ].join('\n'),
    },
  ];
  const same = findPostedClaim(posted, `ci-fail:155:${HEAD}:33834237024`);
  assert.equal(same.ok === true ? same.value.duplicate : null, true);
  const rerun = findPostedClaim(posted, `ci-fail:155:${HEAD}:99999999999`);
  assert.equal(rerun.ok === true ? rerun.value.duplicate : null, false);
});

test('khong co khoa (quyet dinh khong sinh khoa) => khong chan dang', () => {
  for (const key of [null, '']) {
    const claimed = findPostedClaim(COMMENTS, key);
    assert.equal(claimed.ok, true);
    assert.equal(claimed.ok === true ? claimed.value.duplicate : null, false);
  }
});
