/**
 * DUONG FAIL-CLOSED, DO QUA CHINH ENTRYPOINT — khong qua mot ham duoc goi rieng.
 *
 * VI SAO PHAI CHAY THAT `main.mjs`
 *
 * Blocker B3 cua PR #167 khong phai mot loi trong `registryInputFromEnv` — ham do von da fail-closed
 * va co test. Loi nam o CHO NOI hai thu: workflow tung viet
 * `${{ vars.AUTOPILOT_REVIEWER_APP_SLUG || 'chatgpt-codex-connector' }}`, nen bien "thieu" khong bao
 * gio den duoc ham do. Mot bai test goi thang `registryInputFromEnv({})` van xanh trong khi he
 * thong that thi fail-open.
 *
 * Nen bai o day chay `node src/main.mjs` nhu Actions chay no: mot tep su kien that tren dia, mot bo
 * bien moi truong, va do MA THOAT cong voi thu no ghi ra. Cong voi
 * `workflow-contract.test.mjs` (canh khoi YAML) thi ca hai nua cua duong do deu co cai chan.
 *
 * CA BAI CHAY OFFLINE. Ca hai truong hop deu ket thuc TRUOC loi goi mang dau tien, va bai kiem
 * khang dinh dieu do bang cach doi hoi KHONG co dong log `orchestrator: "event"` — dong do la thu
 * duy nhat di truoc phan goi mang.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const MAIN = fileURLToPath(new URL('../src/main.mjs', import.meta.url));

/** Su kien toi thieu, du hinh dang de di tiep NEU cong so do principal cho qua. */
const EVENT = {
  action: 'created',
  issue: { number: 155, pull_request: { url: 'https://api.github.com/repos/o/r/pulls/155' } },
  comment: { id: 1, user: { login: 'ai-do' }, body: 'khong phai thong diep' },
};

const eventPath = join(mkdtempSync(join(tmpdir(), 'autopilot-orchestrator-')), 'event.json');
writeFileSync(eventPath, JSON.stringify(EVENT), 'utf8');

/**
 * @param {Record<string, string | undefined>} over
 * @param {string} [eventName]
 */
function runMain(over, eventName = 'issue_comment') {
  /** @type {Record<string, string>} */
  const env = {};
  for (const [key, value] of Object.entries({
    ...process.env,
    GITHUB_TOKEN: 'khong-duoc-dung-den',
    GITHUB_REPOSITORY: 'phungtienviet14-sketch/nexagnet-platform',
    GITHUB_EVENT_NAME: eventName,
    GITHUB_EVENT_PATH: eventPath,
    AUTOPILOT_DRY_RUN: 'true',
    AUTOPILOT_REPO_OWNER_LOGIN: 'phungtienviet14-sketch',
    // Moi bai tu quyet dinh bien nay; mac dinh la KHONG DAT.
    AUTOPILOT_REVIEWER_APP_SLUG: undefined,
    ...over,
  })) {
    if (typeof value === 'string') env[key] = value;
  }

  const result = spawnSync(process.execPath, [MAIN], { encoding: 'utf8', timeout: 60_000, env });
  const logs = String(result.stdout)
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
  return { status: result.status, logs, stderr: String(result.stderr) };
}

test('B3: THIEU AUTOPILOT_REVIEWER_APP_SLUG => job DO, va khong cham vao GitHub', () => {
  const { status, logs, stderr } = runMain({});
  assert.equal(status, 1, `phai thoat 1; stderr: ${stderr}`);

  const abort = logs.find((entry) => entry.orchestrator === 'abort');
  assert.ok(abort, `phai co mot dong abort; da ghi: ${JSON.stringify(logs)}`);
  assert.equal(abort.reason, 'REGISTRY_NOT_CONFIGURED');
  assert.deepEqual(abort.missing, ['AUTOPILOT_REVIEWER_APP_SLUG']);

  // Cong so do principal dung TRUOC moi loi goi mang. Neu dong `event` xuat hien thi no da di qua
  // cong do va dang tren duong goi API — tuc fail-open.
  assert.equal(
    logs.find((entry) => entry.orchestrator === 'event'),
    undefined,
    'khong duoc di toi buoc phan giai su kien khi so do principal chua duoc cau hinh',
  );
});

test('B3: bien chi co khoang trang cung la THIEU — khong thanh mot principal ten " "', () => {
  const { status, logs } = runMain({ AUTOPILOT_REVIEWER_APP_SLUG: '   ' });
  assert.equal(status, 1);
  const abort = logs.find((entry) => entry.orchestrator === 'abort');
  assert.equal(abort?.reason, 'REGISTRY_NOT_CONFIGURED');
  assert.deepEqual(abort?.missing, ['AUTOPILOT_REVIEWER_APP_SLUG']);
});

test('B3: thieu ca hai bien thi bao ca hai, khong bao mot roi dung', () => {
  const { logs } = runMain({ AUTOPILOT_REPO_OWNER_LOGIN: '' });
  const abort = logs.find((entry) => entry.orchestrator === 'abort');
  assert.deepEqual(abort?.missing, ['AUTOPILOT_REPO_OWNER_LOGIN', 'AUTOPILOT_REVIEWER_APP_SLUG']);
});

test('comment NGUOI THUONG dung truoc moi loi goi mang — khong ton mot lan goi API nao', () => {
  // `issue_comment: created` ban tren MOI comment cua MOI PR. Neu cong "co phai thong diep khong"
  // nam SAU cac loi goi API thi moi cau chuyen phiem giua hai nguoi deu ton quota — va bai nay se
  // do neu ai do doi lai thu tu do.
  //
  // Token o day la rac: neu no CO goi mang thi se an 401 va di tiep sang mot ma ly do khac.
  const { status, logs } = runMain({ AUTOPILOT_REVIEWER_APP_SLUG: 'mot-app-nao-do' });
  assert.equal(status, 0, 'comment nguoi thuong khong phai loi');
  const stop = logs.find((entry) => entry.orchestrator === 'stop');
  assert.equal(stop?.reason, 'NOT_A_PROTOCOL_MESSAGE');
  assert.equal(stop?.pr, 155);
  // Dong `event` VAN phai co (su kien da duoc phan giai), nhung khong duoc co abort nao — mot loi
  // goi mang voi token rac se ra PR_HEAD_UNAVAILABLE.
  assert.ok(logs.find((entry) => entry.orchestrator === 'event'));
  assert.equal(
    logs.find((entry) => entry.orchestrator === 'abort'),
    undefined,
    'da cham vao mang roi: cong re bi dat sau loi goi API',
  );
});

test('DOI CHUNG: co du cau hinh thi di qua duoc cong so do — bai tren do vi cau hinh, khong vi hong', () => {
  // Su kien `push` khong thuoc ba trigger, nen `main.mjs` dung ngay sau khi phan giai su kien —
  // van truoc loi goi mang dau tien. Nho vay doi chung nay cung chay offline.
  const { status, logs } = runMain({ AUTOPILOT_REVIEWER_APP_SLUG: 'mot-app-nao-do' }, 'push');
  assert.equal(status, 0, 'bo qua mot su kien khong xu ly KHONG phai loi');
  const stop = logs.find((entry) => entry.orchestrator === 'stop');
  assert.equal(stop?.reason, 'EVENT_NOT_HANDLED');
  assert.equal(
    logs.find((entry) => entry.orchestrator === 'abort'),
    undefined,
  );
});
