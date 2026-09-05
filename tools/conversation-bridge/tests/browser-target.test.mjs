/**
 * §12 "Browser target" — dung mot cuoc hoi thoai, hoac khong cuoc nao.
 *
 * "Khong dong vao DOM" duoc khang dinh bang BA dau vet cung mot luc, vi mot dau vet don co the
 * van xanh trong khi mot dau vet khac da bi cham: khong selector nao duoc dung, khong lenh dat
 * chu nao duoc goi, va khong nut nao bi bam/focus.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { routeWakeFrame } from '../extension/shared/wake-router.js';
import {
  COMPOSER_SELECTORS,
  SUBMIT_SELECTORS,
  injectWakeMessage,
  isExactConfiguredConversation,
} from '../extension/shared/composer-adapter.js';
import { buildWakeMessage } from '../extension/shared/wake-message.js';
import { deliveryKeyFor } from '../protocol/delivery-key.mjs';
import { HEAD_SHA, REPO } from './fixtures/github.mjs';
import { chatgptPage } from './fixtures/chatgpt-page.mjs';
import { withDom } from './fixtures/dom.mjs';
import { ARMED_URL, makeDeps } from './fixtures/router-deps.mjs';

const KEY = deliveryKeyFor({ repo: REPO, pr: 205, headSha: HEAD_SHA });
const FRAME = { v: 1, kind: 'WAKE', key: KEY, repo: REPO, pr: 205, headSha: HEAD_SHA };

/** Chay bo noi tren mot cay DOM, dung cach service worker chay no. */
const inject = (dom, expectedHref = ARMED_URL) =>
  withDom(dom, () =>
    injectWakeMessage({
      expectedHref,
      message: 'review autopilot pending',
      composerSelectors: [...COMPOSER_SELECTORS],
      submitSelectors: [...SUBMIT_SELECTORS],
    }),
  );

/** @param {ReturnType<typeof chatgptPage>} dom @param {string} label */
function assertPageUntouched(dom, label) {
  assert.deepEqual(dom.selectorsUsed, [], `${label}: khong duoc dung selector nao`);
  assert.deepEqual(dom.execCommands(), [], `${label}: khong duoc dat chu`);
  assert.deepEqual(dom.touchedTraps, [], `${label}: khong duoc cham vao khoi hoi thoai`);
  for (const node of dom.find('button')) {
    assert.equal(node.clicked, 0, `${label}: khong duoc bam nut nao`);
    assert.equal(node.focused, 0, `${label}: khong duoc focus`);
  }
}

test('12. tab la mot cuoc hoi thoai ChatGPT KHAC -> khong mot thao tac DOM nao', async () => {
  const other = 'https://chatgpt.com/c/11112222-3333-4444-5555-666677778888';
  const harness = makeDeps({ tabs: [{ id: 7, url: other }] });
  const outcome = await routeWakeFrame(FRAME, harness.deps);
  assert.equal(outcome.ok, false);
  assert.equal(outcome.state, 'REJECTED_WRONG_CHAT');
  assert.equal(outcome.reason, 'TARGET_TAB_NOT_FOUND');
  assert.deepEqual(harness.injections, []);
  assertPageUntouched(harness.dom, 'tab khac');
});

test('12b. nhieu tab cung mo dung URL da arm -> khong doan, khong tiem', async () => {
  const harness = makeDeps({
    tabs: [
      { id: 7, url: ARMED_URL },
      { id: 8, url: ARMED_URL },
    ],
  });
  const outcome = await routeWakeFrame(FRAME, harness.deps);
  assert.equal(outcome.reason, 'TARGET_TAB_AMBIGUOUS');
  assert.deepEqual(harness.injections, []);
  assertPageUntouched(harness.dom, 'nhieu tab');
});

test('13. dung URL da arm -> dat chu va gui, dung mot lan', async () => {
  const harness = makeDeps();
  const outcome = await routeWakeFrame(FRAME, harness.deps);
  assert.equal(outcome.ok, true);
  assert.equal(outcome.state, 'DELIVERED');
  assert.equal(harness.injections.length, 1);
  assert.equal(
    harness.injections[0].message,
    buildWakeMessage({ repo: REPO, pr: 205, headSha: HEAD_SHA }),
  );
  assert.deepEqual(harness.dom.execCommands(), [
    { command: 'selectAll', value: undefined },
    { command: 'insertText', value: harness.injections[0].message },
  ]);
  assert.equal(harness.dom.find('button')[0].clicked, 1);
});

test('14. da DISARM (du tab dung URL cu) -> khong mot thao tac DOM nao', async () => {
  const cases = [
    ['DISARMED', { state: 'DISARMED' }],
    ['khong co ho so', null],
    ['ho so hong', { state: 'ARMED_EXACT_CHAT', conversationUrl: 'https://evil.tld/c/aaaaaaaa' }],
  ];
  for (const [label, arm] of cases) {
    const harness = makeDeps({ arm });
    const outcome = await routeWakeFrame(FRAME, harness.deps);
    assert.equal(outcome.state, 'DISARMED', String(label));
    assert.equal(outcome.reason, 'NOT_ARMED', String(label));
    assert.deepEqual(harness.injections, [], String(label));
    assertPageUntouched(harness.dom, String(label));
  }
});

test('15. khung soan thieu / nhap nhang / khong nam trong form -> fail closed', () => {
  const cases = [
    ['khong co khung soan', { composer: 'none' }, 'COMPOSER_NOT_FOUND'],
    ['hai khung soan', { composer: 'ambiguous' }, 'COMPOSER_AMBIGUOUS'],
    ['khong co nut gui', { submit: 'none' }, 'SUBMIT_CONTROL_NOT_FOUND'],
    ['hai nut gui', { submit: 'ambiguous' }, 'SUBMIT_CONTROL_NOT_FOUND'],
    ['nut gui dang tat', { submit: 'disabled' }, 'SUBMIT_FAILED'],
    ['khung soan ngoai form', { composerInsideForm: false }, 'COMPOSER_NOT_FOUND'],
  ];
  for (const [label, options, reason] of cases) {
    const dom = chatgptPage({ href: ARMED_URL, .../** @type {any} */ (options) });
    const outcome = inject(dom);
    assert.equal(outcome.ok, false, String(label));
    assert.equal(outcome.reason, reason, String(label));
    assert.deepEqual(dom.touchedTraps, [], String(label));
  }
});

test('15b. khung soan la <textarea> van chay — bo noi khong buoc vao mot ky thuat duy nhat', () => {
  const dom = chatgptPage({ href: ARMED_URL, composer: 'textarea', submit: 'submitType' });
  const outcome = inject(dom);
  assert.equal(outcome.ok, true);
  assert.equal(dom.find('textarea')[0].value, 'review autopilot pending');
  assert.deepEqual(dom.find('textarea')[0].events, ['input']);
  assert.deepEqual(dom.touchedTraps, []);
});

test('15c. trang dieu huong ngay truoc luc tiem -> tu choi, khong cham DOM', () => {
  const dom = chatgptPage({ href: 'https://chatgpt.com/c/99998888-7777-6666-5555-444433332222' });
  const outcome = inject(dom);
  assert.equal(outcome.reason, 'ARMED_URL_MISMATCH');
  assertPageUntouched(dom, 'dieu huong');
});

test('16. khong selector nao cham vao mot nut cua khoi hoi thoai', () => {
  const dom = chatgptPage({ href: ARMED_URL });
  const outcome = inject(dom);
  assert.equal(outcome.ok, true, 'duong thanh cong phai that su chay het');
  assert.deepEqual(dom.touchedTraps, []);
  // DOI CHUNG: min co that su no khong? Khong co khang dinh nay thi bai tren van xanh voi mot cay
  // DOM khong co min nao — tuc la duoc "chung minh" boi mot kho rong.
  const trapped = dom.document.querySelectorAll('article[data-message-author-role="assistant"]');
  assert.equal(trapped.length, 2);
  assert.throws(() => String(trapped[0].isContentEditable));
  assert.ok(dom.touchedTraps.length > 0, 'min phai ghi lai duoc lan cham');
});

test('16b. so sanh URL la CHINH XAC, khong phai "bat dau bang"', () => {
  const base = ARMED_URL;
  assert.equal(isExactConfiguredConversation(base, base), true);
  assert.equal(isExactConfiguredConversation(`${base}/`, base), true);
  const impostors = [
    `${base}-2`,
    `${base}?model=x`,
    `${base}#frag`,
    'https://chatgpt.com/c/other-conversation-id',
    'https://chatgpt.com.evil.tld/c/6a1f0c9e-2b7d-4f11-9a30-5c8e2d1b4a77',
    'http://chatgpt.com/c/6a1f0c9e-2b7d-4f11-9a30-5c8e2d1b4a77',
    'https://chatgpt.com/',
    '',
  ];
  for (const impostor of impostors) {
    assert.equal(isExactConfiguredConversation(impostor, base), false, impostor);
  }
});
