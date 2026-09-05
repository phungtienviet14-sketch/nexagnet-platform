/**
 * §3.3 — may trang thai arm, va bat bien "mac dinh la khong cuoc hoi thoai nao".
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  ALLOWED_CONVERSATION_HOST,
  armExactConversation,
  disarmed,
  normalizeConversationUrl,
  readArmState,
} from '../extension/shared/arming.js';
import {
  BRIDGE_REASONS,
  BRIDGE_STATES,
  STATE_OF_REASON,
  rejected,
} from '../extension/shared/states.js';
import { DEFAULT_CONFIG_PATH, buildRuntime, configPathFrom } from '../native-host/host.mjs';
import { createLogger } from '../native-host/log.mjs';
import { REPO } from './fixtures/github.mjs';

const GOOD = 'https://chatgpt.com/c/6a1f0c9e-2b7d-4f11-9a30-5c8e2d1b4a77';

/** Ma Project that (32 chu hex thuong), lay tu URL duoc dan trong REVIEW_BLOCK cua #206. */
const PROJECT_ID = '6a22b674b76881918809ceac4396a409';

/** CUNG cuoc hoi thoai `GOOD`, nhung nhin tu ben trong mot ChatGPT Project. */
const PROJECT_GOOD = `https://chatgpt.com/g/g-p-${PROJECT_ID}-nexagnet-platform/c/6a1f0c9e-2b7d-4f11-9a30-5c8e2d1b4a77`;

test('mac dinh la DISARMED, va moi ho so hong deu quy ve DISARMED', () => {
  assert.deepEqual(disarmed(), { state: 'DISARMED' });
  const broken = [
    undefined,
    null,
    'ARMED_EXACT_CHAT',
    {},
    { state: 'ARMED_EXACT_CHAT' },
    { state: 'ARMED_EXACT_CHAT', conversationUrl: '' },
    { state: 'ARMED_EXACT_CHAT', conversationUrl: 'https://evil.tld/c/aaaaaaaa' },
    { state: 'ARMED_EXACT_CHAT', conversationUrl: 'https://chatgpt.com/' },
    { state: 'DELIVERED', conversationUrl: GOOD },
  ];
  for (const stored of broken) {
    assert.deepEqual(readArmState(stored), { state: 'DISARMED' }, JSON.stringify(stored));
  }
  assert.deepEqual(readArmState({ state: 'ARMED_EXACT_CHAT', conversationUrl: `${GOOD}/` }), {
    state: 'ARMED_EXACT_CHAT',
    conversationUrl: GOOD,
  });
});

test('chi host ChatGPT Web thuong, chi duong dan mot cuoc hoi thoai', () => {
  assert.equal(ALLOWED_CONVERSATION_HOST, 'chatgpt.com');
  assert.equal(armExactConversation(GOOD).ok, true);
  const denied = [
    ['http://chatgpt.com/c/6a1f0c9e-2b7d-4f11-9a30-5c8e2d1b4a77', 'NOT_HTTPS'],
    ['https://chat.openai.com/c/6a1f0c9e-2b7d-4f11-9a30-5c8e2d1b4a77', 'HOST_NOT_ALLOWED'],
    ['https://chatgpt.com.evil.tld/c/6a1f0c9e-2b7d-4f11-9a30-5c8e2d1b4a77', 'HOST_NOT_ALLOWED'],
    ['https://chatgpt.com/', 'NOT_A_CONVERSATION_PATH'],
    ['https://chatgpt.com/g/g-abc/c/xyz-12345678', 'NOT_A_CONVERSATION_PATH'],
    [`${GOOD}?model=x`, 'HAS_QUERY_OR_FRAGMENT'],
    [`${GOOD}#frag`, 'HAS_QUERY_OR_FRAGMENT'],
    ['khong phai URL', 'NOT_A_URL'],
    ['', 'EMPTY'],
  ];
  for (const [url, problem] of denied) {
    const result = normalizeConversationUrl(url);
    assert.equal(result.ok, false, url);
    assert.equal(result.state, 'REJECTED_WRONG_CHAT', url);
    assert.equal(result.detail?.problem, problem, url);
  }
});

test('cuoc hoi thoai NAM TRONG mot ChatGPT Project arm duoc — va giu nguyen doan Project', () => {
  const accepted = [
    PROJECT_GOOD,
    // Project chua dat ten: khong co slug.
    `https://chatgpt.com/g/g-p-${PROJECT_ID}/c/6a1f0c9e-2b7d-4f11-9a30-5c8e2d1b4a77`,
    // Can duoi cua khoang do dai ma Project.
    'https://chatgpt.com/g/g-p-0123456789abcdef/c/6a1f0c9e-2b7d-4f11-9a30-5c8e2d1b4a77',
  ];
  for (const url of accepted) {
    const result = normalizeConversationUrl(url);
    assert.equal(result.ok, true, url);
    // URL nguoi dung arm CHINH LA URL duoc luu: doan `/g/g-p-...` khong bi cat bot.
    assert.equal(result.conversationUrl, url, url);
  }
  // Dau `/` cuoi la cung mot trang, nen no duoc chuan hoa chu khong bi tu choi.
  assert.equal(normalizeConversationUrl(`${PROJECT_GOOD}/`).conversationUrl, PROJECT_GOOD);
  assert.deepEqual(
    readArmState({ state: 'ARMED_EXACT_CHAT', conversationUrl: `${PROJECT_GOOD}/` }),
    {
      state: 'ARMED_EXACT_CHAT',
      conversationUrl: PROJECT_GOOD,
    },
  );
});

test('goc `/c/<id>` va Project `/g/g-p-.../c/<id>` la HAI DICH, khong phai hai bi danh', () => {
  // Hai URL nay tro toi cung MOT ma hoi thoai. Neu ho so arm bi chuan hoa ve cung mot chuoi thi
  // arm cai nay se danh thuc duoc cai kia — dung dieu bat bien "exact target" cam.
  const root = armExactConversation(GOOD);
  const project = armExactConversation(PROJECT_GOOD);
  assert.equal(root.ok, true);
  assert.equal(project.ok, true);
  assert.equal(root.arm.conversationUrl, GOOD);
  assert.equal(project.arm.conversationUrl, PROJECT_GOOD);
  assert.notEqual(root.arm.conversationUrl, project.arm.conversationUrl);
});

test('KHONG noi thanh moi `/g/.../c/...` — chi dung `g-p-<hex>` moi la mot Project', () => {
  const CID = '6a1f0c9e-2b7d-4f11-9a30-5c8e2d1b4a77';
  const PROJECT = `g-p-${PROJECT_ID}-nexagnet-platform`;
  const denied = [
    // --- GPT tuy chinh: `/g/g-...`, KHONG phai `/g/g-p-...` -------------------------------------
    `https://chatgpt.com/g/g-ClUusYYbO-url-slug-gpt/c/${CID}`,
    `https://chatgpt.com/g/g-ClUusYYbO/c/${CID}`,
    // Mot ma GPT tuy chinh dat sau `g-p-` van khong thanh Project: no khong phai hex thuong.
    `https://chatgpt.com/g/g-p-ClUusYYbO-url-slug-gpt/c/${CID}`,
    // --- Trang cua chinh Project, khong phai mot cuoc hoi thoai ---------------------------------
    `https://chatgpt.com/g/${PROJECT}/project`,
    `https://chatgpt.com/g/g-p-${PROJECT_ID}/project`,
    `https://chatgpt.com/g/${PROJECT}`,
    // --- Duong dan chia se: mot trang khac, doc bang mot phien khac -----------------------------
    `https://chatgpt.com/g/${PROJECT}/shared/c/${CID}`,
    `https://chatgpt.com/g/${PROJECT}/c/${CID}/shared`,
    // --- Tien to Project sai --------------------------------------------------------------------
    `https://chatgpt.com/g/g-q-${PROJECT_ID}/c/${CID}`,
    `https://chatgpt.com/g/p-${PROJECT_ID}/c/${CID}`,
    `https://chatgpt.com/g/gp-${PROJECT_ID}/c/${CID}`,
    `https://chatgpt.com/g/g-p${PROJECT_ID}/c/${CID}`,
    `https://chatgpt.com/g/${PROJECT}/g/${PROJECT}/c/${CID}`,
    // --- Ma Project hong ------------------------------------------------------------------------
    `https://chatgpt.com/g/g-p-/c/${CID}`,
    `https://chatgpt.com/g/g-p-6a22b6/c/${CID}`,
    `https://chatgpt.com/g/g-p-${PROJECT_ID.toUpperCase()}/c/${CID}`,
    `https://chatgpt.com/g/g-p-6a22b674b76881918809ceac4396a40z/c/${CID}`,
    `https://chatgpt.com/g/g-p-${PROJECT_ID}-/c/${CID}`,
    `https://chatgpt.com/g/g-p-${PROJECT_ID}--x/c/${CID}`,
    // Slug mang ky tu da ma hoa phan tram bi tu choi CO CHU DICH (xem the than `arming.js`).
    `https://chatgpt.com/g/g-p-${PROJECT_ID}-n%E1%BB%81n-t%E1%BA%A3ng/c/${CID}`,
    // --- Ma hoi thoai hong ----------------------------------------------------------------------
    `https://chatgpt.com/g/${PROJECT}/c/short`,
    `https://chatgpt.com/g/${PROJECT}/c/`,
    `https://chatgpt.com/g/${PROJECT}/c/6a1f0c9e_2b7d_4f11`,
  ];
  for (const url of denied) {
    const result = normalizeConversationUrl(url);
    assert.equal(result.ok, false, url);
    assert.equal(result.state, 'REJECTED_WRONG_CHAT', url);
    assert.equal(result.detail?.problem, 'NOT_A_CONVERSATION_PATH', url);
  }
  // Query va fragment van bi tu choi tren CA hinh dang Project.
  for (const url of [`${PROJECT_GOOD}?model=x`, `${PROJECT_GOOD}#frag`]) {
    const result = normalizeConversationUrl(url);
    assert.equal(result.ok, false, url);
    assert.equal(result.detail?.problem, 'HAS_QUERY_OR_FRAGMENT', url);
  }
  // Va moi ho so arm hong o tren deu quy ve DISARMED, khong "gan dung".
  for (const url of denied) {
    assert.deepEqual(
      readArmState({ state: 'ARMED_EXACT_CHAT', conversationUrl: url }),
      { state: 'DISARMED' },
      url,
    );
  }
});

test('moi ma ly do xep duoc vao dung mot trang thai, va khong ma nao mo coi', () => {
  const reasons = Object.values(BRIDGE_REASONS);
  assert.deepEqual(
    reasons.filter((reason) => STATE_OF_REASON[reason] === undefined),
    [],
  );
  const states = new Set(Object.values(BRIDGE_STATES));
  for (const state of Object.values(STATE_OF_REASON)) {
    assert.ok(states.has(state), `${state} khong thuoc tap trang thai cua §3.3`);
  }
  // Trang thai ARMED_EXACT_CHAT khong phai mot ket cuc tu choi nen khong co ma ly do nao tro ve no
  // qua `rejected()`. Bai kiem nay giu cho ai do khong bien no thanh mot ket cuc loi.
  assert.throws(() => rejected('KHONG_TON_TAI'));
  assert.deepEqual(rejected(BRIDGE_REASONS.NOT_ARMED), {
    ok: false,
    state: 'DISARMED',
    reason: 'NOT_ARMED',
  });
});

test('host: duong dan cau hinh lay tu bien moi truong, mac dinh canh goi', () => {
  assert.equal(configPathFrom({}), DEFAULT_CONFIG_PATH);
  assert.equal(configPathFrom({ CONVERSATION_BRIDGE_CONFIG: '   ' }), DEFAULT_CONFIG_PATH);
  const explicit = join(tmpdir(), 'cb-config.json');
  assert.equal(configPathFrom({ CONVERSATION_BRIDGE_CONFIG: explicit }), explicit);
});

test('host: cau hinh hong / so hong -> KHONG khoi dong duoc, co ma loi', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cb-host-'));
  const logger = createLogger({ write: () => {}, now: () => '2026-09-05T03:00:00.000Z' });
  const send = () => {};

  assert.deepEqual(buildRuntime({ configPath: join(dir, 'nope.json'), send, logger }), {
    ok: false,
    error: 'CONFIG_UNREADABLE',
  });

  const badJson = join(dir, 'bad.json');
  writeFileSync(badJson, '{not json');
  assert.deepEqual(buildRuntime({ configPath: badJson, send, logger }), {
    ok: false,
    error: 'CONFIG_NOT_JSON',
  });

  const good = join(dir, 'config.json');
  writeFileSync(
    good,
    JSON.stringify({
      repo: REPO,
      allowedProducers: [{ kind: 'APP', id: 'nexagent-autopilot', roles: ['GITHUB_ACTIONS'] }],
      pollIntervalSeconds: 120,
      enabled: false,
      statePath: './state/ledger.json',
      githubAccess: 'gh-cli',
    }),
  );
  const built = buildRuntime({ configPath: good, send, logger });
  assert.equal(built.ok, true);
  // `statePath` tuong doi duoc giai theo THU MUC CUA TEP CAU HINH, khong theo thu muc lam viec —
  // Chrome khoi dong host voi mot cwd khong ai doan duoc.
  assert.equal(built.runtime.config.statePath, join(dir, 'state', 'ledger.json'));

  writeFileSync(join(good), JSON.stringify({ repo: REPO }));
  assert.equal(buildRuntime({ configPath: good, send, logger }).ok, false);
});
