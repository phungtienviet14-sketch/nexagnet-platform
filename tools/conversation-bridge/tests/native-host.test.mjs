/**
 * §12 "Native host" — dong goi, cai dat, va bat bien "khong mo cong vao nao".
 */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import { MAX_FRAME_BYTES, createFrameDecoder, encodeFrame } from '../native-host/framing.mjs';
import { decodeFrame, helloFrame, resultFrame, wakeFrame } from '../extension/shared/ipc.js';
import {
  buildInstallPlan,
  buildUninstallPlan,
  launcherContents,
} from '../install/windows-registry.mjs';
import { renderPlan } from '../install/install.mjs';
import { scanForBanned, shippedSources } from './fixtures/source-scan.mjs';
import { HEAD_SHA, REPO, comment, pullRequest } from './fixtures/github.mjs';
import { makeRuntime } from './fixtures/runtime.mjs';
import { pollOnce } from '../native-host/poll.mjs';

const KEY = `conversation-bridge:${REPO}:205:${HEAD_SHA}`;

test('21. dong goi Native Messaging: ma hoa roi giai ma lai ra dung khung ban dau', () => {
  const frames = [
    helloFrame(),
    wakeFrame({ key: KEY, repo: REPO, pr: 205, headSha: HEAD_SHA }),
    resultFrame({ key: KEY, state: 'DELIVERED', reason: 'WAKE_SENT' }),
  ];
  const stream = Buffer.concat(frames.map(encodeFrame));
  const decoder = createFrameDecoder();
  const pushed = decoder.push(stream);
  assert.equal(pushed.ok, true);
  assert.deepEqual(pushed.frames, frames);
  assert.equal(decoder.pending(), 0);
});

test('21b. dong byte ve tung mieng tuy y van ghep lai dung', () => {
  const frames = [helloFrame(), resultFrame({ key: KEY, state: 'DELIVERED', reason: 'WAKE_SENT' })];
  const stream = Buffer.concat(frames.map(encodeFrame));
  for (const chunkSize of [1, 2, 3, 5, 7, stream.length - 1]) {
    const decoder = createFrameDecoder();
    /** @type {unknown[]} */
    const collected = [];
    for (let offset = 0; offset < stream.length; offset += chunkSize) {
      const pushed = decoder.push(stream.subarray(offset, offset + chunkSize));
      assert.equal(pushed.ok, true, `chunk ${chunkSize}`);
      collected.push(...pushed.frames);
    }
    assert.deepEqual(collected, frames, `chunk ${chunkSize}`);
  }
});

test('22. khung cut / do dai la / JSON hong -> dung han, khong doc tiep', () => {
  // Khung cut: chua du byte -> chua co khung nao, va KHONG phai loi.
  const partial = encodeFrame(helloFrame()).subarray(0, 5);
  const waiting = createFrameDecoder();
  const pushed = waiting.push(partial);
  assert.equal(pushed.ok, true);
  assert.deepEqual(pushed.frames, []);
  assert.ok(waiting.pending() > 0);

  // Do dai la: khong cap phat theo so ke khac noi.
  const huge = Buffer.alloc(4);
  huge.writeUInt32LE(MAX_FRAME_BYTES + 1, 0);
  assert.deepEqual(createFrameDecoder().push(huge), { ok: false, error: 'FRAME_LENGTH_INVALID' });
  const zero = Buffer.alloc(4);
  assert.deepEqual(createFrameDecoder().push(zero), { ok: false, error: 'FRAME_LENGTH_INVALID' });

  // JSON hong: hong mot lan la hong han — doc tiep chi la doc rac.
  const header = Buffer.alloc(4);
  header.writeUInt32LE(3, 0);
  const broken = createFrameDecoder();
  assert.deepEqual(broken.push(Buffer.concat([header, Buffer.from('{;;')])), {
    ok: false,
    error: 'FRAME_NOT_JSON',
  });
  assert.deepEqual(broken.push(encodeFrame(helloFrame())), { ok: false, error: 'FRAME_NOT_JSON' });
});

test('22b. khung dung dang nhung sai noi dung -> tu choi co ma', () => {
  const valid = wakeFrame({ key: KEY, repo: REPO, pr: 205, headSha: HEAD_SHA });
  const cases = [
    [{ ...valid, message: 'chu tu do' }, 'FRAME_FIELD_SET_MISMATCH'],
    [{ ...valid, v: 2 }, 'FRAME_VERSION_MISMATCH'],
    [{ ...valid, kind: 'RUN_SHELL' }, 'FRAME_KIND_UNKNOWN'],
    [{ ...valid, headSha: HEAD_SHA.toUpperCase() }, 'FRAME_HEAD_SHA_INVALID'],
    [{ ...valid, pr: 0 }, 'FRAME_PR_INVALID'],
    [{ ...valid, repo: 'https://evil.tld/a/b' }, 'FRAME_REPO_INVALID'],
    [{ ...valid, key: 'review-request:205:abc' }, 'FRAME_KEY_INVALID'],
    ['mot chuoi', 'FRAME_NOT_OBJECT'],
    [null, 'FRAME_NOT_OBJECT'],
  ];
  for (const [frame, error] of cases) {
    assert.deepEqual(decodeFrame(frame), { ok: false, error }, JSON.stringify(frame));
  }
});

const BS = String.fromCharCode(92);
const SAMPLE_DIR = `C:${BS}Users${BS}op${BS}nexagnet bridge`;
const SAMPLE_ID = 'abcdefghijklmnopabcdefghijklmnop';

test('23. chay kho cua cai/go la TAT DINH — cung dau vao, cung tung ky tu', () => {
  const render = (mode) =>
    renderPlan({
      mode,
      plan: /** @type {any} */ (
        (mode === 'install'
          ? buildInstallPlan({ extensionId: SAMPLE_ID, packageDir: SAMPLE_DIR })
          : buildUninstallPlan({ packageDir: SAMPLE_DIR })
        ).plan
      ),
    });
  for (const mode of ['install', 'uninstall']) {
    assert.equal(render(mode), render(mode), `${mode} phai tat dinh`);
    assert.ok(render(mode).includes('(dry-run)'));
  }
  // Dau `/` cuoi cua duong dan goi khong duoc de ra hai gach cheo.
  const withSlash = buildInstallPlan({ extensionId: SAMPLE_ID, packageDir: `${SAMPLE_DIR}${BS}` });
  assert.equal(withSlash.plan.launcherPath, `${SAMPLE_DIR}${BS}native-host${BS}launch-host.cmd`);
});

test('23b. thoat ky tu duong dan Windows dung o ca ba cho', () => {
  const built = buildInstallPlan({ extensionId: SAMPLE_ID, packageDir: SAMPLE_DIR });
  assert.equal(built.ok, true);
  const plan = /** @type {any} */ (built.plan);

  // 1. manifest JSON phai doc lai duoc, va `path` phai la duong dan THAT.
  const manifest = JSON.parse(plan.manifestContents);
  assert.equal(manifest.path, `${SAMPLE_DIR}${BS}native-host${BS}launch-host.cmd`);
  assert.deepEqual(manifest.allowed_origins, [`chrome-extension://${SAMPLE_ID}/`]);

  // 2. tep .cmd: `%~dp0` da co gach cheo cuoi, khong duoc them cai thu hai.
  assert.ok(plan.launcherContents.includes(`"%~dp0host.mjs"`));
  assert.ok(!plan.launcherContents.includes(`%~dp0${BS}`));
  // duong dan node co dau cach phai duoc boc trong dau nhay kep
  const spaced = launcherContents({ nodePath: `C:${BS}Program Files${BS}nodejs${BS}node.exe` });
  assert.ok(spaced.includes(`"C:${BS}Program Files${BS}nodejs${BS}node.exe"`));
  assert.ok(launcherContents().includes('node "'), 'node tren PATH thi khong can boc');

  // 3. tham so registry di dang MANG — khong co lop trich dan thu hai nao de sai.
  const registryAction = plan.actions.find((a) => a.kind === 'REGISTRY_ADD');
  assert.equal(registryAction.command, 'reg');
  assert.ok(Array.isArray(registryAction.args));
  assert.ok(registryAction.args.includes(plan.manifestPath));
  assert.ok(
    registryAction.args[1].startsWith('HKCU'),
    'phai la khoa per-user, khong can quyen admin',
  );
});

test('23c. ID tien ich sai hinh dang -> tu choi, va khong ke hoach nao duoc dung', () => {
  for (const bad of [
    '',
    'ZZZ',
    'a'.repeat(31),
    'a'.repeat(33),
    'abcdefghijklmnopqrstuvwxyzabcdef',
  ]) {
    assert.deepEqual(buildInstallPlan({ extensionId: bad, packageDir: SAMPLE_DIR }), {
      ok: false,
      error: 'EXTENSION_ID_INVALID',
    });
  }
});

/** Module co the mo mot cong lang nghe. Khong tep nao duoc giao duoc phep nhac toi chung. */
const SERVER_NEEDLES = Object.freeze([
  { needle: 'createServer', why: 'mo mot may chu = mo mot cong vao' },
  { needle: 'node:net', why: 'socket cap thap' },
  { needle: 'node:http', why: 'may chu HTTP' },
  { needle: 'node:https', why: 'may chu HTTPS' },
  { needle: 'node:dgram', why: 'socket UDP' },
  { needle: 'node:tls', why: 'may chu TLS' },
  { needle: 'node:cluster', why: 'chia socket lang nghe cho tien trinh con' },
  { needle: 'WebSocketServer', why: 'may chu WebSocket' },
  { needle: '.listen(', why: 'bat dau lang nghe' },
]);

test('24. khong mot cong vao nao — kiem bang CA ma nguon LAN tai nguyen dang song', async () => {
  const hits = scanForBanned(shippedSources(), SERVER_NEEDLES);
  assert.deepEqual(
    hits,
    [],
    hits.map((h) => `${h.path}:${h.line} chua "${h.needle}" (${h.why})`).join('\n'),
  );

  // Bang chung thu hai, o muc HANH VI: chay tron mot vong poll roi hoi Node xem no dang giu
  // nhung tai nguyen nao. Mot bo quet van ban co the bi qua mat; mot cong dang mo thi khong.
  const harness = makeRuntime({ comments: [comment()], pulls: { 205: pullRequest() } });
  await pollOnce(harness.runtime);
  const listening = process
    .getActiveResourcesInfo()
    .filter((resource) => /SERVERWRAP|UDPWRAP/.test(resource));
  assert.deepEqual(listening, [], `cau noi dang giu tai nguyen lang nghe: ${listening.join(', ')}`);
});

test('24b. DOI CHUNG — bo quet cong vao bat duoc mot may chu tu dung', () => {
  const forged = [
    {
      path: 'native-host/fake.mjs',
      text: "import http from 'node:http';\nhttp.createServer(fn).listen(8080);",
    },
  ];
  const needles = scanForBanned(forged, SERVER_NEEDLES).map((hit) => hit.needle);
  assert.ok(needles.includes('node:http'));
  assert.ok(needles.includes('createServer'));
  assert.ok(needles.includes('.listen('));
});
