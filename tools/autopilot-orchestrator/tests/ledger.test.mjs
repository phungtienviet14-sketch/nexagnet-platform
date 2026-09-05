/**
 * SO LEDGER PHAI DOC DUOC HET — blocker B6 cua PR #167.
 *
 * V0 read-only khong co so ledger ben ngoai, nen luong comment cua PR CHINH LA so ledger. Ban truoc
 * doc dung mot loi goi `?per_page=100` — tuc TRANG DAU. Duoi 100 comment thi "trang dau" va "ca
 * luong" trung nhau, nen bug nam im; qua 100 thi chung tach ra.
 *
 * Hai bai o day khong kiem `fetchAllComments` cho vui: chung dung dung hai ham DOC so ledger
 * (`selectBuildReadyAtHead`, `findPostedClaim`) tren mot luong 250 comment, va chung khang dinh CA
 * HAI chieu — sau khi phan trang thi tim ra, va neu chi doc trang dau thi KHONG. Chieu thu hai la
 * thu chung minh bug co that, chu khong phai mot bai kiem trang tri.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { findPostedClaim, selectBuildReadyAtHead } from '../src/inbox.mjs';
import { COMMENTS_PER_PAGE, MAX_COMMENT_PAGES, fetchAllComments } from '../src/ledger.mjs';
import { ORCHESTRATOR_REASONS } from '../src/reasons.mjs';

const HEAD = 'c86219b22be19ce3db7a9753bd9866316b654cbe';
const OLD_HEAD = '3d11fbad86cf9dbc15978f6e2b741b669a5205c2';
const PR = 155;

/** Mot comment nguoi thuong — do "don" ma so ledger phai loi qua duoc. */
const chatter = (/** @type {number} */ id) => ({ id, body: `noi chuyen phiem #${id}` });

/** @param {{ id: number, headSha: string }} at */
const buildReady = ({ id, headSha }) => ({
  id,
  user: { login: 'phungtienviet14-sketch' },
  performed_via_github_app: null,
  body: [
    '<!-- AUTOPILOT_BUILD_READY_V0 -->',
    'BUILD_READY',
    'ISSUE=153',
    `PR=${PR}`,
    `HEAD_SHA=${headSha}`,
    'BASE_SHA=b9ead7e0c238bea417763857ee85ae3714963be8',
  ].join('\n'),
});

/** @param {{ id: number, headSha: string, ciRun: number }} at */
const ciFail = ({ id, headSha, ciRun }) => ({
  id,
  user: { login: 'phungtienviet14-sketch' },
  performed_via_github_app: null,
  body: [
    '<!-- AUTOPILOT_CI_FAIL_V0 -->',
    'CI_FAIL',
    'ISSUE=153',
    `PR=${PR}`,
    `HEAD_SHA=${headSha}`,
    `CI_RUN=${ciRun}`,
  ].join('\n'),
});

/**
 * Mot endpoint phan trang gia, cat tu mot mang co san. `force` cho phep mot bai kiem lam hong dung
 * mot trang ma khong dung den mang.
 *
 * @param {Array<Record<string, any>>} all
 * @param {(page: number) => ({ ok: boolean, status: number, body: any } | null)} [force]
 */
function pagedEndpoint(all, force) {
  /** @type {number[]} */
  const pagesRead = [];
  /** @param {string} query */
  const request = async (query) => {
    const page = Number(new URLSearchParams(query.slice(1)).get('page'));
    pagesRead.push(page);
    const forced = force?.(page);
    if (forced) return forced;
    const start = (page - 1) * COMMENTS_PER_PAGE;
    return { ok: true, status: 200, body: all.slice(start, start + COMMENTS_PER_PAGE) };
  };
  return { request, pagesRead };
}

test('doc HET nhieu trang, dung thu tu, va dung ngay o trang ngan hon `per_page`', async () => {
  const all = Array.from({ length: 250 }, (_, i) => chatter(1000 + i));
  const { request, pagesRead } = pagedEndpoint(all);

  const read = await fetchAllComments(request);
  assert.equal(read.ok, true);
  assert.equal(read.ok === true ? read.value.length : -1, 250);
  assert.deepEqual(
    read.ok === true ? read.value.map((entry) => entry.id) : [],
    all.map((entry) => entry.id),
  );
  // Trang 3 co 50 phan tu (< 100) nen la trang cuoi. Khong duoc goi trang 4 de "cho chac".
  assert.deepEqual(pagesRead, [1, 2, 3]);
});

test('luong ngan hon mot trang => dung mot loi goi', async () => {
  const { request, pagesRead } = pagedEndpoint(Array.from({ length: 40 }, (_, i) => chatter(i)));
  const read = await fetchAllComments(request);
  assert.equal(read.ok === true ? read.value.length : -1, 40);
  assert.deepEqual(pagesRead, [1]);
});

test('luong dai DUNG boi so cua `per_page` => van doc them mot trang de biet da het', async () => {
  const { request, pagesRead } = pagedEndpoint(Array.from({ length: 200 }, (_, i) => chatter(i)));
  const read = await fetchAllComments(request);
  assert.equal(read.ok === true ? read.value.length : -1, 200);
  // Trang 2 DAY, nen chua the ket luan da het. Trang 3 rong moi la bang chung ket thuc.
  assert.deepEqual(pagesRead, [1, 2, 3]);
});

test('B6: BUILD_READY nam NGOAI trang dau van tim ra — va chi doc trang dau thi KHONG', async () => {
  // Comment thu 241 la thong diep duy nhat buoc vao HEAD hien tai.
  const all = Array.from({ length: 250 }, (_, i) => chatter(1000 + i));
  all[240] = buildReady({ id: 9001, headSha: HEAD });

  const { request } = pagedEndpoint(all);
  const read = await fetchAllComments(request);
  assert.equal(read.ok, true);

  const found = selectBuildReadyAtHead(read.ok === true ? read.value : [], HEAD);
  assert.equal(found.ok, true, 'so ledger doc tron ven thi phai thay thong diep o trang 3');
  assert.equal(found.ok === true ? found.value.id : null, 9001);

  // CHIEU NGUOC LAI — day la bug B6 duoc dung lai nguyen van: doc dung trang dau thi thong diep
  // hop le nay bien mat, va orchestrator tra ve `NO_BUILD_READY_AT_HEAD`, mot cau tra loi SAI.
  const firstPageOnly = selectBuildReadyAtHead(all.slice(0, COMMENTS_PER_PAGE), HEAD);
  assert.equal(firstPageOnly.ok, false);
  assert.equal(
    firstPageOnly.ok === false ? firstPageOnly.reason : null,
    ORCHESTRATOR_REASONS.NO_BUILD_READY_AT_HEAD,
  );
});

test('B6: comment DA DANG nam NGOAI trang dau van chan duoc dang trung', async () => {
  const all = Array.from({ length: 250 }, (_, i) => chatter(2000 + i));
  all[150] = ciFail({ id: 9002, headSha: HEAD, ciRun: 33834237024 });

  const { request } = pagedEndpoint(all);
  const read = await fetchAllComments(request);
  const key = `ci-fail:${PR}:${HEAD}:33834237024`;

  const claimed = findPostedClaim(read.ok === true ? read.value : [], key);
  assert.equal(claimed.ok === true ? claimed.value.duplicate : null, true);
  assert.equal(claimed.ok === true ? claimed.value.matchedCommentId : null, 9002);

  // Chieu nguoc lai: chi trang dau thi cong chong trung MO RA, va HEAD nay lanh comment thu hai
  // giong het cai da co.
  const firstPageOnly = findPostedClaim(all.slice(0, COMMENTS_PER_PAGE), key);
  assert.equal(firstPageOnly.ok === true ? firstPageOnly.value.duplicate : null, false);
});

test('B6: mot trang hong => FAIL-CLOSED, khong quyet dinh tren phan da doc duoc', async () => {
  const all = Array.from({ length: 250 }, (_, i) => chatter(3000 + i));
  const { request, pagesRead } = pagedEndpoint(all, (page) =>
    page === 2 ? { ok: false, status: 502, body: null } : null,
  );

  const read = await fetchAllComments(request);
  assert.equal(read.ok, false);
  assert.equal(
    read.ok === false ? read.reason : null,
    ORCHESTRATOR_REASONS.PR_COMMENTS_UNAVAILABLE,
  );
  assert.equal(read.ok === false ? read.detail?.page : null, 2);
  assert.equal(read.ok === false ? read.detail?.status : null, 502);
  // Dung ngay, khong di tiep sang trang 3: mot so ledger doc thieu khong duoc dung.
  assert.deepEqual(pagesRead, [1, 2]);
});

test('B6: than tra ve khong phai mang cung la FAIL-CLOSED, khong coi la "trang rong"', async () => {
  const { request } = pagedEndpoint([], () => ({ ok: true, status: 200, body: { message: 'x' } }));
  const read = await fetchAllComments(request);
  assert.equal(read.ok, false);
  assert.equal(
    read.ok === false ? read.reason : null,
    ORCHESTRATOR_REASONS.PR_COMMENTS_UNAVAILABLE,
  );
});

test('B6: cham TRAN trang => bao rieng, khong lang le cat bot so ledger', async () => {
  // Moi trang deu DAY, nen khong bao gio co bang chung "da het". Mot cai tran im lang chinh la bug
  // B6 duoc doi cho — tu 100 len 2000 — nen no phai mang mot ma ly do rieng.
  const { request, pagesRead } = pagedEndpoint([], (page) => ({
    ok: true,
    status: 200,
    body: Array.from({ length: COMMENTS_PER_PAGE }, (_, i) => chatter(page * 1000 + i)),
  }));

  const read = await fetchAllComments(request);
  assert.equal(read.ok, false);
  assert.equal(read.ok === false ? read.reason : null, ORCHESTRATOR_REASONS.PR_COMMENTS_TRUNCATED);
  assert.equal(read.ok === false ? read.detail?.scanned : null, MAX_COMMENT_PAGES * COMMENTS_PER_PAGE);
  assert.equal(pagesRead.length, MAX_COMMENT_PAGES);
});

test('comment lap lai giua hai trang chi duoc dem MOT lan', async () => {
  // Giua hai loi goi trang co the co comment moi chen vao, va khi do mot phan tu tut xuong trang
  // sau. Neu khong loai theo `id` thi `findPostedClaim` co the dem mot comment hai lan.
  const overlap = chatter(7777);
  const { request } = pagedEndpoint([], (page) => {
    if (page === 1) {
      return {
        ok: true,
        status: 200,
        body: [
          ...Array.from({ length: COMMENTS_PER_PAGE - 1 }, (_, i) => chatter(i)),
          overlap,
        ],
      };
    }
    return { ok: true, status: 200, body: [overlap, chatter(8888)] };
  });

  const read = await fetchAllComments(request);
  assert.equal(read.ok, true);
  const ids = read.ok === true ? read.value.map((entry) => entry.id) : [];
  assert.equal(ids.filter((id) => id === 7777).length, 1);
  assert.equal(ids.length, COMMENTS_PER_PAGE + 1);
});

test('BUILD_READY o HEAD KHAC, nam o trang sau, van khong bi lay nham', async () => {
  const all = Array.from({ length: 150 }, (_, i) => chatter(4000 + i));
  all[120] = buildReady({ id: 9003, headSha: OLD_HEAD });

  const { request } = pagedEndpoint(all);
  const read = await fetchAllComments(request);
  const found = selectBuildReadyAtHead(read.ok === true ? read.value : [], HEAD);
  assert.equal(found.ok, false);
  assert.equal(found.ok === false ? found.detail?.buildReadyAtOtherHeads : null, 1);
  assert.equal(found.ok === false ? found.detail?.scanned : null, 150);
});
