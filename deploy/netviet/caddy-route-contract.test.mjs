import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const caddyfile = await readFile(new URL('./Caddyfile', import.meta.url), 'utf8');
const deployStack = await readFile(new URL('./deploy-stack.sh', import.meta.url), 'utf8');
const compose = await readFile(new URL('./compose.yaml', import.meta.url), 'utf8');
const renderSecrets = await readFile(new URL('./render-secrets.sh', import.meta.url), 'utf8');

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
    '/settings/groups/*',
    '/settings/rules*',
    '/settings/automation*',
    '/settings/audit*',
  ]) {
    assert.ok(
      apiMatcher.split(/\s+/).includes(apiPath),
      `@api thieu ${apiPath} -> trang /settings goi API se 404`,
    );
  }
  // `/settings/groups*` (khong co dau / truoc *) se nuot ca duong dan trang bat dau bang chuoi do.
  assert.doesNotMatch(apiMatcher, /(?:^|\s)\/settings\/groups\*(?:\s|$)/);
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

// Quyết định nghiệm thu 08/08/2026: pilot chỉ dùng dữ liệu TEST và phải giữ cả Bot/zca tắt.
// Khóa ở cả renderer lẫn smoke test để một token đang tồn tại không tự bật hybrid sau deploy.
test('pilot deploy always keeps CHANNEL_MODE=mock', () => {
  assert.match(renderSecrets, /^CHANNEL_MODE='mock'$/m);
  assert.doesNotMatch(renderSecrets, /^\s*CHANNEL_MODE='(?:hybrid|zca)'$/m);
  assert.equal(deployStack.match(/-e CHANNEL_MODE=mock/g)?.length, 2);
  assert.doesNotMatch(deployStack, /-e CHANNEL_MODE=(?:hybrid|zca)/);
});

// MOT IMAGE — MOI KHACH. Truoc 12/08/2026 image co `ARG TENANT=ultty` va `next build` nuong ten
// khach vao trang tinh, nen moi khach phai co mot image rieng. Danh tinh khach thuoc LOP DEPLOY.
// Phep chung minh o muc chay: apps/web/tenant-runtime.contract.mjs.
test('image khong mang danh tinh khach — TENANT den tu lop deploy luc chay', async () => {
  const dockerfile = await readFile(new URL('./Dockerfile', import.meta.url), 'utf8');

  // Co ARG/ENV TENANT trong Dockerfile la image gan chet vao mot khach.
  assert.doesNotMatch(dockerfile, /^\s*(?:ARG|ENV)\s+TENANT/m);
  // Va khong duoc COPY goi khach nao vao image.
  assert.doesNotMatch(dockerfile, /^\s*COPY\s+[^\n]*tenants/m);
});

// CACH LY DU LIEU. Image la ban chung cho moi khach; `tenants/<slug>/data/knowledge.json` chua gia
// si, dieu khoan cong no va chat ID nhom Zalo. Mot goi nam trong image = khach tu host `docker save`
// ra la doc duoc so lieu cua khach khac. Kiem tra tren IMAGE THAT: image-isolation.contract.mjs.
test('du lieu khach den tu volume mount, khong nam trong image', async () => {
  const dockerignore = await readFile(new URL('../../.dockerignore', import.meta.url), 'utf8');
  const deployRemote = await readFile(new URL('./deploy-remote.sh', import.meta.url), 'utf8');

  // Build context khong co `tenants/` -> khong `COPY` nao cham toi duoc, ke ca `COPY . .`.
  assert.match(dockerignore, /^tenants$/m);

  // Ca api lan web deu doc goi tu volume chi-doc, khong tu trong image.
  assert.equal(compose.match(/^\s*TENANT_DIR: \/srv\/tenant$/gm)?.length, 2);
  assert.equal(compose.match(/^\s*- \.\/tenant-pack:\/srv\/tenant:ro$/gm)?.length, 2);

  // Goi khach phai co mat tren VM truoc khi stack len, va thieu thi dung han chu khong boot rong.
  assert.match(deployRemote, /tenant-pack\/tenant\.json/);
  assert.match(deployRemote, /rsync -a --delete "\$remote_parent\/tenant-pack\/"/);

  // TENANT khong con di qua secrets.env: goi duoc mount thang, khong tra slug trong image nua.
  assert.doesNotMatch(renderSecrets, /^TENANT=/m);
});
