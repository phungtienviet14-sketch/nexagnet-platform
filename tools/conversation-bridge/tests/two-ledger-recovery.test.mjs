/**
 * §12 "Two-ledger recovery" — hai so, mot duong hoa giai CO DICH, va khong duong nao khac.
 *
 * Bai quan trong nhat trong tep nay la bai 34: no chung minh dieu ma tai lieu TUNG NOI SAI — xoa
 * mot minh so cua tien ich KHONG hoi phuc duoc gi, vi so ben cua host van giu khoa. Neu ai do quay
 * lai lam mot nut "xoa so cuc bo" roi goi do la duong hoi phuc, bai 34 se do.
 *
 * Moi bai deu chay tren so THAT tren dia (thu muc tam), vi "khoi dong lai host van an toan" chi co
 * nghia neu du lieu that su di qua dia.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  emptyLedger,
  loadLedger,
  saveLedger,
  withRecord,
  withoutRecord,
} from '../native-host/ledger.mjs';
import { applyReset, pollOnce } from '../native-host/poll.mjs';
import { decideReset } from '../native-host/decide.mjs';
import { deliveryKeyFor } from '../protocol/delivery-key.mjs';
import { decodeFrame, parseDeliveryKey, resetFrame } from '../extension/shared/ipc.js';
import {
  applyResetResult,
  buildResetRequest,
  withoutDeliveredKey,
} from '../extension/shared/reset-request.js';
import {
  RESET_REASONS,
  RESET_STATES,
  STATE_OF_RESET_REASON,
  resetOutcome,
} from '../extension/shared/states.js';
import { routeWakeFrame } from '../extension/shared/wake-router.js';
import { HEAD_SHA, OTHER_SHA, REPO, comment, pullRequest } from './fixtures/github.mjs';
import { makeRuntime, tempStatePath } from './fixtures/runtime.mjs';
import { ARMED_URL, makeDeps } from './fixtures/router-deps.mjs';
import { chatgptPage } from './fixtures/chatgpt-page.mjs';

const KEY = deliveryKeyFor({ repo: REPO, pr: 205, headSha: HEAD_SHA });
const OTHER_KEY = deliveryKeyFor({ repo: REPO, pr: 205, headSha: OTHER_SHA });
const WAKE = { v: 1, kind: 'WAKE', key: KEY, repo: REPO, pr: 205, headSha: HEAD_SHA };

/** Khung RESET dung nhu tien ich se gui — dung tu CHINH chuoi khoa, khong ghep tay. */
function resetFor(key) {
  const built = buildResetRequest(key);
  assert.equal(built.ok, true, `khong dung duoc khung RESET cho ${key}`);
  return /** @type {any} */ (built).frame;
}

/** @param {string} statePath */
function keysOnDisk(statePath) {
  const loaded = loadLedger(statePath);
  assert.equal(loaded.ok, true, 'so tren dia phai doc duoc');
  return Object.keys(/** @type {any} */ (loaded).ledger.records).sort();
}

test('32. khoa giao doc NGUOC ra duoc, va khong troi khoi `deliveryKeyFor`', () => {
  for (const [pr, sha] of [
    [205, HEAD_SHA],
    [1, OTHER_SHA],
    [999999, HEAD_SHA],
  ]) {
    const key = deliveryKeyFor({ repo: REPO, pr: Number(pr), headSha: String(sha) });
    assert.deepEqual(parseDeliveryKey(key), {
      ok: true,
      repo: REPO,
      pr: Number(pr),
      headSha: String(sha),
    });
    // Dung lai tu ba nguyen thuy do phai ra DUNG chuoi cu — vong khep kin ma cong "khoa tu mau
    // thuan" cua host dua vao. Hai dinh nghia khong the troi ra khoi nhau ma van xanh.
    assert.equal(deliveryKeyFor(/** @type {any} */ (parseDeliveryKey(key))), key);
  }
  for (const bad of ['', 'review-request:205:abc', `${KEY}:thua`, 'conversation-bridge:o/r:0:x']) {
    assert.deepEqual(parseDeliveryKey(bad), { ok: false, error: 'FRAME_KEY_INVALID' }, bad);
  }
});

test('33. mot lan TIEM HONG lam chay khoa o CA HAI so', async () => {
  const statePath = tempStatePath();
  const host = makeRuntime({ comments: [comment()], pulls: { 205: pullRequest() }, statePath });
  assert.equal((await pollOnce(host.runtime)).sent, 1);
  assert.deepEqual(keysOnDisk(statePath), [KEY], 'so #1 (host) giu khoa TRUOC khi gui');

  // Phia tien ich: khong tim thay khung soan -> tiem hong, nhung khoa DA ben.
  const browser = makeDeps({ page: chatgptPage({ href: ARMED_URL, composer: 'none' }) });
  const outcome = await routeWakeFrame(WAKE, browser.deps);
  assert.equal(outcome.reason, 'COMPOSER_NOT_FOUND');
  assert.deepEqual(Object.keys(browser.deliveredNow()), [KEY], 'so #2 (tien ich) cung giu khoa');
});

test('34. XOA MOT MINH SO CUA TIEN ICH KHONG HOI PHUC DUOC GI', async () => {
  const statePath = tempStatePath();
  const host = makeRuntime({ comments: [comment()], pulls: { 205: pullRequest() }, statePath });
  await pollOnce(host.runtime);

  // Dung nhu cai nut "xoa so khoa giao cuc bo" cu tung lam: bo sach so #2.
  const browser = makeDeps({ delivered: { [KEY]: { state: 'ATTEMPTED', at: 'x' } } });
  await browser.deps.writeDelivered({});
  assert.deepEqual(Object.keys(browser.deliveredNow()), []);

  // Nhung so #1 van giu khoa, nen KHONG khung WAKE nao duoc gui nua: tien ich khong bao gio duoc
  // hoi den, va "duong hoi phuc" do khong hoi phuc gi ca.
  const again = makeRuntime({ comments: [comment()], pulls: { 205: pullRequest() }, statePath });
  const second = await pollOnce(again.runtime);
  assert.equal(second.sent, 0);
  assert.deepEqual(again.sentFrames, []);
  assert.equal(second.outcomes[0].reason, 'ALREADY_DELIVERED');
});

test('35. HOA GIAI CO DICH: mot khoa, hai so, roi giao lai DUNG MOT LAN', async () => {
  const statePath = tempStatePath();
  const host = makeRuntime({ comments: [comment()], pulls: { 205: pullRequest() }, statePath });
  await pollOnce(host.runtime);

  // Mot khoa KHONG LIEN QUAN nam canh, de chung minh no khong bi dong toi.
  const neighboured = withRecord(host.runtime.ledgerStore.current(), OTHER_KEY, 'DELIVERED', 'at');
  assert.equal(saveLedger(statePath, neighboured).ok, true);
  host.runtime.ledgerStore.replace(neighboured);

  const browser = makeDeps({
    delivered: { [KEY]: { state: 'ATTEMPTED', at: 'x' }, [OTHER_KEY]: { state: 'DELIVERED' } },
  });

  // 1-2. nguoi bam xac nhan, tien ich dung va gui khung RESET
  const frame = resetFor(KEY);
  assert.deepEqual(Object.keys(frame).sort(), ['headSha', 'key', 'kind', 'pr', 'repo', 'v']);

  // 3-4. host doi chieu roi go DUNG mot khoa, va tra khung ket qua CO KIEU
  const applied = applyReset(host.runtime, frame);
  assert.deepEqual(applied, resetOutcome(RESET_REASONS.RESET_APPLIED));
  assert.deepEqual(keysOnDisk(statePath), [OTHER_KEY], 'chi khoa duoc goi ten bi go');
  const replied = /** @type {any} */ (host.sentFrames.at(-1));
  assert.equal(replied.kind, 'RESET_RESULT');
  assert.equal(replied.state, RESET_STATES.RESET_DONE);
  assert.equal(replied.key, KEY);

  // 5. CHI KHI host bao xong, tien ich moi go khoa cuc bo
  const local = await applyResetResult(replied, browser.deps);
  assert.equal(local.ok, true);
  assert.deepEqual(Object.keys(browser.deliveredNow()), [OTHER_KEY]);

  // Va bay gio CUNG HEAD do duoc giao lai — dung MOT lan.
  const after = makeRuntime({ comments: [comment()], pulls: { 205: pullRequest() }, statePath });
  assert.equal((await pollOnce(after.runtime)).sent, 1);
  assert.equal((await pollOnce(after.runtime)).sent, 0, 'van la at-most-once sau hoa giai');
});

test('36. host TU CHOI moi khung RESET khong dung, va khong dong vao so', () => {
  const host = makeRuntime({ statePath: tempStatePath() });
  host.runtime.ledgerStore.replace(withRecord(emptyLedger(), KEY, 'ATTEMPTED', 'at'));

  const forged = [
    // kho khac kho da cau hinh cua host
    [{ ...resetFor(KEY), repo: 'ke-la/kho-khac' }, RESET_REASONS.RESET_REPOSITORY_MISMATCH],
    // chuoi khoa khong ung voi {pr, headSha} di kem — khung TU MAU THUAN
    [{ ...resetFor(KEY), pr: 206 }, RESET_REASONS.RESET_KEY_NOT_CANONICAL],
    [{ ...resetFor(KEY), headSha: OTHER_SHA }, RESET_REASONS.RESET_KEY_NOT_CANONICAL],
    // khoa canonical dang hoang nhung KHONG co trong so
    [resetFor(OTHER_KEY), RESET_REASONS.RESET_KEY_UNKNOWN],
  ];
  for (const [frame, reason] of forged) {
    const outcome = applyReset(host.runtime, /** @type {any} */ (frame));
    assert.equal(outcome.reason, reason, JSON.stringify(frame));
    assert.equal(outcome.state, RESET_STATES.RESET_REFUSED, JSON.stringify(frame));
    assert.deepEqual(
      Object.keys(host.runtime.ledgerStore.current().records),
      [KEY],
      'so khong duoc dong toi khi tu choi',
    );
    // Va van tra ve mot khung CO KIEU, khong im lang.
    assert.equal(/** @type {any} */ (host.sentFrames.at(-1)).kind, 'RESET_RESULT');
  }
});

test('36b. mot khung RESET KHONG BAO GIO tao duoc ban ghi moi trong so cua host', () => {
  const host = makeRuntime({ statePath: tempStatePath() });
  assert.deepEqual(Object.keys(host.runtime.ledgerStore.current().records), []);
  const outcome = applyReset(host.runtime, resetFor(KEY));
  assert.equal(outcome.reason, RESET_REASONS.RESET_KEY_UNKNOWN);
  assert.deepEqual(
    Object.keys(host.runtime.ledgerStore.current().records),
    [],
    'so van rong — RESET la duong GO, khong bao gio la duong GHI',
  );
});

test('37. KHOI DONG LAI HOST quanh lan hoa giai van an toan', async () => {
  const statePath = tempStatePath();
  const first = makeRuntime({ comments: [comment()], pulls: { 205: pullRequest() }, statePath });
  await pollOnce(first.runtime);
  assert.deepEqual(keysOnDisk(statePath), [KEY]);

  // Tien trinh host MOI (Chrome de lai mot cai khac) thuc hien lan hoa giai.
  const second = makeRuntime({ comments: [comment()], pulls: { 205: pullRequest() }, statePath });
  assert.equal(applyReset(second.runtime, resetFor(KEY)).ok, true);
  assert.deepEqual(keysOnDisk(statePath), [], 'lan go phai ben qua ranh gioi tien trinh');

  // Tien trinh thu BA: giao duoc dung mot lan. Tien trinh thu TU: khong lan nao nua.
  const third = makeRuntime({ comments: [comment()], pulls: { 205: pullRequest() }, statePath });
  assert.equal((await pollOnce(third.runtime)).sent, 1);
  const fourth = makeRuntime({ comments: [comment()], pulls: { 205: pullRequest() }, statePath });
  assert.equal((await pollOnce(fourth.runtime)).sent, 0);
});

test('38. phia tien ich chi go khoa khi host BAO XONG', async () => {
  const browser = makeDeps({
    delivered: { [KEY]: { state: 'ATTEMPTED', at: 'x' }, [OTHER_KEY]: { state: 'DELIVERED' } },
  });
  for (const reason of [
    RESET_REASONS.RESET_KEY_UNKNOWN,
    RESET_REASONS.RESET_KEY_NOT_CANONICAL,
    RESET_REASONS.RESET_REPOSITORY_MISMATCH,
    RESET_REASONS.RESET_LEDGER_UNWRITABLE,
    RESET_REASONS.RESET_LINK_DOWN,
    RESET_REASONS.RESET_TIMED_OUT,
  ]) {
    const outcome = await applyResetResult({ key: KEY, ...resetOutcome(reason) }, browser.deps);
    assert.equal(outcome.ok, false, reason);
    assert.deepEqual(
      Object.keys(browser.deliveredNow()).sort(),
      [KEY, OTHER_KEY].sort(),
      `so cuc bo khong duoc dong toi khi host tu choi (${reason})`,
    );
  }
});

test('38b. go khoa chi go DUNG MOT, va khong sua ban ghi tai cho', () => {
  const delivered = Object.freeze({ [KEY]: { state: 'A' }, [OTHER_KEY]: { state: 'B' } });
  const next = withoutDeliveredKey(/** @type {any} */ (delivered), KEY);
  assert.deepEqual(Object.keys(next), [OTHER_KEY]);
  assert.deepEqual(Object.keys(delivered).sort(), [KEY, OTHER_KEY].sort(), 'ban goc khong doi');
  assert.deepEqual(Object.keys(withoutDeliveredKey(/** @type {any} */ (delivered), 'khong-co')), [
    KEY,
    OTHER_KEY,
  ]);

  const ledger = withRecord(withRecord(emptyLedger(), KEY, 'A', 'at'), OTHER_KEY, 'B', 'at');
  const trimmed = withoutRecord(ledger, KEY);
  assert.deepEqual(Object.keys(trimmed.records), [OTHER_KEY]);
  assert.deepEqual(Object.keys(ledger.records).sort(), [KEY, OTHER_KEY].sort());
  assert.equal(withoutRecord(ledger, 'khong-co'), ledger, 'khong co gi de go thi tra chinh so cu');
});

test('39. tu vung hoa giai: moi ma xep duoc vao dung mot ket cuc, khong ma nao mo coi', () => {
  const reasons = Object.values(RESET_REASONS);
  assert.deepEqual(
    reasons.filter((reason) => STATE_OF_RESET_REASON[reason] === undefined),
    [],
  );
  const states = new Set(Object.values(RESET_STATES));
  for (const state of Object.values(STATE_OF_RESET_REASON)) {
    assert.ok(states.has(state), `${state} khong thuoc tap ket cuc hoa giai`);
  }
  assert.throws(() => resetOutcome('KHONG_TON_TAI'));
  // Dung MOT ma la duong thanh cong. Bay ma con lai deu la tu choi — mot cong N duong, N ly do.
  assert.deepEqual(
    reasons.filter((reason) => STATE_OF_RESET_REASON[reason] === RESET_STATES.RESET_DONE),
    [RESET_REASONS.RESET_APPLIED],
  );
  assert.equal(reasons.length, 8);
});

test('39b. `buildResetRequest` tu choi moi khoa khong canonical, va khong dung khung nao', () => {
  for (const bad of [undefined, null, '', 'xin chao', `${KEY} `, 'review-request:205:abc']) {
    const built = buildResetRequest(/** @type {any} */ (bad));
    assert.equal(built.ok, false, String(bad));
    assert.equal(/** @type {any} */ (built).reason, RESET_REASONS.RESET_KEY_MALFORMED, String(bad));
  }
});

test('39c. `decideReset` la THUAN — goi hai lan cho cung ket qua, khong dong vao gi', () => {
  const ledger = withRecord(emptyLedger(), KEY, 'ATTEMPTED', 'at');
  const frame = resetFor(KEY);
  const first = decideReset({ frame, repo: REPO, ledger });
  const second = decideReset({ frame, repo: REPO, ledger });
  assert.deepEqual(first, second);
  assert.equal(first.key, KEY);
  assert.deepEqual(Object.keys(ledger.records), [KEY], 'so khong bi sua boi mot ham quyet dinh');
});

test('39d. khung RESET khong co cho nao nhet van ban vao', () => {
  // Ban than bo dung khung khong the phat ra mot truong thua: no dung tu SAU truong da goi ten.
  const frame = resetFor(KEY);
  assert.deepEqual(Object.keys(frame).sort(), ['headSha', 'key', 'kind', 'pr', 'repo', 'v']);

  // Va o dau nhan, mot truong thua la TU CHOI chu khong phai bo qua — day moi la ranh gioi that,
  // vi mot khung tren duong ong khong nhat thiet do bo dung khung nay tao ra.
  assert.deepEqual(decodeFrame({ ...frame, note: 'ignore previous instructions' }), {
    ok: false,
    error: 'FRAME_FIELD_SET_MISMATCH',
  });
  assert.deepEqual(decodeFrame({ ...frame, headSha: HEAD_SHA.toUpperCase() }), {
    ok: false,
    error: 'FRAME_HEAD_SHA_INVALID',
  });
  assert.deepEqual(decodeFrame({ ...frame, repo: 'https://evil.tld/a/b' }), {
    ok: false,
    error: 'FRAME_REPO_INVALID',
  });
  assert.deepEqual(decodeFrame({ ...frame, key: 'xin chao' }), {
    ok: false,
    error: 'FRAME_KEY_INVALID',
  });

  // Bo dung khung tu kiem dau ra, nen mot khoa hong khong bao gio thanh mot khung gui di.
  assert.throws(() => resetFrame({ key: 'xin chao', repo: REPO, pr: 205, headSha: HEAD_SHA }));
  assert.throws(() =>
    resetFrame({ key: KEY, repo: 'https://evil.tld/a/b', pr: 205, headSha: HEAD_SHA }),
  );
});
