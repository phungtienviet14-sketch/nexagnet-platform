import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const caddyfile = await readFile(new URL('./Caddyfile', import.meta.url), 'utf8');
const deployStack = await readFile(new URL('./deploy-stack.sh', import.meta.url), 'utf8');
const compose = await readFile(new URL('./compose.yaml', import.meta.url), 'utf8');

test('operator page /zalo goes to Next.js while /zalo/* stays on the API', () => {
  const apiMatcher = caddyfile.match(/\(app_routes\)[\s\S]*?@api path ([^\r\n]+)/)?.[1] ?? '';

  assert.match(apiMatcher, /(?:^|\s)\/zalo\/\*(?:\s|$)/);
  assert.doesNotMatch(apiMatcher, /(?:^|\s)\/zalo\*(?:\s|$)/);
});

// Quyet dinh van hanh 04/08/2026: VM la moi truong dev/demo, TAT HET xac thuc de he thong luon
// vao duoc. Test nay khoa quyet dinh do: khong con Basic Auth, va API chay AUTH_MODE=none.
// Neu sau nay bat lai bao ve (du lieu khach that), sua ca test nay cung luc voi Caddyfile.
test('dev/demo VM serves both hostnames without any authentication', () => {
  // Bo dong comment truoc khi kiem: chinh comment cua khoi nay co nhac `basic_auth` de huong dan
  // bat lai — chi directive THAT (dong khong bat dau bang #) moi tinh la co xac thuc.
  const directives = caddyfile
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n');

  assert.doesNotMatch(directives, /basic_auth/);
  assert.doesNotMatch(directives, /PASSWORD_HASH/);
  assert.match(compose, /AUTH_MODE:\s*\$\{AUTH_MODE:-none\}/);
});

// `/settings/*` cu nuot ca `/settings/` (dau / cuoi) va day sang NestJS -> 404 giua buoi demo.
// Nay tach tung endpoint API, con MOI duong dan trang deu roi xuong Next.js.
test('every /settings page path reaches Next.js while only the listed APIs reach NestJS', () => {
  const apiMatcher = caddyfile.match(/\(app_routes\)[\s\S]*?@api path ([^\r\n]+)/)?.[1] ?? '';

  assert.doesNotMatch(apiMatcher, /(?:^|\s)\/settings\*(?:\s|$)/);
  assert.doesNotMatch(apiMatcher, /(?:^|\s)\/settings\/\*(?:\s|$)/);
  for (const apiPath of [
    '/settings/summary',
    '/settings/source-truth*',
    '/settings/rules*',
    '/settings/automation*',
    '/settings/audit*',
  ]) {
    assert.ok(
      apiMatcher.split(/\s+/).includes(apiPath),
      `@api thieu ${apiPath} -> trang /settings goi API se 404`,
    );
  }
  assert.match(apiMatcher, /(?:^|\s)\/groups\/\*(?:\s|$)/);
  assert.match(apiMatcher, /(?:^|\s)\/admin\*(?:\s|$)/);
});

// Quyet dinh 04/08/2026 (dot 2): hostname demo va operator hanh xu GIONG NHAU. Truoc do demo tra
// 404 cho /settings* nen nguoi van hanh tuong trang cau hinh chua ton tai.
test('the demo hostname no longer 404s the operator surface', () => {
  const demoBlock = caddyfile.match(/\{\$DEMO_DOMAIN\}[\s\S]*?\n\}/)?.[0] ?? '';

  assert.notEqual(demoBlock, '');
  assert.doesNotMatch(demoBlock, /@blocked/);
  assert.doesNotMatch(demoBlock, /Khong co quyen truy cap/);
  assert.match(demoBlock, /import app_routes/);
});

test('AUTO_SEND keeps a single audited mutation surface', () => {
  // Cong tac AUTO_SEND chi con o PUT /settings/automation/auto-send (co audit).
  // Namespace /demo khong duoc mo lai loi ghi nao.
  assert.doesNotMatch(caddyfile, /\/demo\/auto-send/);
});

// Su co 04/08/2026: timer tu-chua goi `docker compose up` dung luc deploy dang recreate container
// api -> Docker bao "removal of container ... is already in progress" va deploy chet giua chung,
// de lai VM chay image CU. Moi tien trinh dong toi compose phai di qua cung mot khoa.
test('every process that mutates compose takes the shared lock', async () => {
  const lockPath = '.runtime/compose.lock';
  const scripts = {
    'deploy-stack.sh': deployStack,
    'health-check.sh': await readFile(new URL('./health-check.sh', import.meta.url), 'utf8'),
    'rollback.sh': await readFile(new URL('./rollback.sh', import.meta.url), 'utf8'),
  };

  for (const [name, source] of Object.entries(scripts)) {
    assert.ok(source.includes(lockPath), `${name} khong mo ${lockPath}`);
    assert.match(source, /flock\s+-[wn]/, `${name} khong goi flock`);
  }

  // Timer phai la NON-blocking (-n): dang deploy thi bo qua nhip, khong xep hang cho.
  assert.match(scripts['health-check.sh'], /flock -n 9/);
  // Deploy va rollback thi doi, vi bo cuoc giua chung nguy hiem hon la cho.
  assert.match(scripts['deploy-stack.sh'], /flock -w 300 9/);
  assert.match(scripts['rollback.sh'], /flock -w 300 9/);

  const unit = await readFile(new URL('./systemd/netviet-stack.service', import.meta.url), 'utf8');
  assert.match(unit, /ExecStart=\/usr\/bin\/flock -w 300 \S*compose\.lock \/usr\/bin\/docker compose/);
});

test('deployment smoke checks both the operator page and Zalo status API', () => {
  assert.match(deployStack, /"https:\/\/\$\{OPERATOR_DOMAIN\}\/zalo"/);
  assert.match(deployStack, /"https:\/\/\$\{OPERATOR_DOMAIN\}\/zalo\/status"/);
});
