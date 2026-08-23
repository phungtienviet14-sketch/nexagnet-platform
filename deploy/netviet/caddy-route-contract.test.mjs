import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

import { resolveStackSlug } from './stack-identity.mjs';

const caddyfile = await readFile(new URL('./edge/Caddyfile', import.meta.url), 'utf8');
const deployStack = await readFile(new URL('./deploy-stack.sh', import.meta.url), 'utf8');
const compose = await readFile(new URL('./compose.yaml', import.meta.url), 'utf8');
const renderSecrets = await readFile(new URL('./render-secrets.sh', import.meta.url), 'utf8');
const channelMode = await readFile(new URL('./channel-mode.sh', import.meta.url), 'utf8');
const setChannelMode = await readFile(new URL('./set-channel-mode.sh', import.meta.url), 'utf8');
const deployPs1 = await readFile(new URL('./deploy.ps1', import.meta.url), 'utf8');
const deployCi = await readFile(new URL('./deploy-ci.sh', import.meta.url), 'utf8');
const deployRemote = await readFile(new URL('./deploy-remote.sh', import.meta.url), 'utf8');
const smokeTest = await readFile(new URL('./smoke-test.mjs', import.meta.url), 'utf8');
const authBootstrap = await readFile(new URL('./bootstrap-auth-user.mjs', import.meta.url), 'utf8');
const rollback = await readFile(new URL('./rollback.sh', import.meta.url), 'utf8');
const backup = await readFile(new URL('./backup.sh', import.meta.url), 'utf8');

test('operator page /zalo goes to Next.js while /zalo/* stays on the API', () => {
  const apiMatcher = caddyfile.match(/\(app_routes\)[\s\S]*?@api path ([^\r\n]+)/)?.[1] ?? '';

  assert.match(apiMatcher, /(?:^|\s)\/zalo\/\*(?:\s|$)/);
  assert.doesNotMatch(apiMatcher, /(?:^|\s)\/zalo\*(?:\s|$)/);
});

// Caddy chi route; NestJS session/role/CSRF la mot lop auth duy nhat cho ca hai hostname.
test('Caddy routes both hostnames consistently; application session guard owns authentication', () => {
  // Bo dong comment truoc khi kiem: chinh comment cua khoi nay co nhac `basic_auth` de huong dan
  // bat lai — chi directive THAT (dong khong bat dau bang #) moi tinh la co xac thuc.
  const directives = caddyfile
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n');

  assert.doesNotMatch(directives, /basic_auth/);
  assert.doesNotMatch(directives, /PASSWORD_HASH/);
  assert.match(compose, /AUTH_MODE:\s*\$\{AUTH_MODE:-session\}/);
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

/**
 * Doc NGUOC tu controller thay vi chep tay danh sach.
 *
 * Vi sao: 13/08/2026 phat hien tren ban deploy that, `/settings/readiness`, `/settings/price-periods*`,
 * `/settings/content*`, `/settings/users*`, `/campaigns*` va `/health/media` deu tra 404 — code co
 * du, Caddyfile thi khong biet, nen chung roi xuong Next.js. Nang nhat la `price-periods`: do la
 * man hinh Sale nhap bang gia thang hien hanh, tuc la cong go-live so 1 khong the dong duoc qua UI
 * da deploy. Danh sach chep tay se lai lech lan nua; test nay bat CI do ngay khi them controller.
 */
async function controllerFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) files.push(...(await controllerFiles(path)));
    else if (entry.name.endsWith('.controller.ts')) files.push(path);
  }
  return files;
}

/** Duong dan API co duoc matcher phu khong: khop chinh xac, hoac qua glob `*` / `/*`. */
function covered(tokens, path) {
  return tokens.some(
    (token) =>
      token === path ||
      token === `${path}*` ||
      token === `${path}/*` ||
      (token.endsWith('*') && path.startsWith(token.slice(0, -1)) && token.length > 1),
  );
}

test('moi namespace controller deu co duong di qua Caddy — khong route nao roi xuong Next.js', async () => {
  const apiMatcher = caddyfile.match(/\(app_routes\)[\s\S]*?@api path ([^\r\n]+)/)?.[1] ?? '';
  const tokens = apiMatcher.trim().split(/\s+/);
  const srcDir = new URL('../../apps/api/src', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

  const required = new Set();
  for (const file of await controllerFiles(srcDir)) {
    const source = await readFile(file, 'utf8');
    const prefixes = [...source.matchAll(/@Controller\(\s*(\[[^\]]*\]|'[^']*')?\s*\)/g)].flatMap(
      (match) => [...(match[1] ?? "''").matchAll(/'([^']*)'/g)].map((inner) => inner[1]),
    );
    for (const prefix of prefixes) {
      if (prefix === 'settings') {
        // Namespace `/settings` dung chung voi TRANG web -> phai liet ke tung endpoint mot.
        for (const method of source.matchAll(/@(?:Get|Post|Put|Patch|Delete)\(\s*'([^']+)'/g)) {
          required.add(`/settings/${method[1].split('/')[0]}`);
        }
      } else if (prefix !== '') {
        required.add(`/${prefix}`);
      } else {
        // Controller khong co tien to: lay thang duong dan cua tung phuong thuc (vd @Sse('events')).
        for (const method of source.matchAll(/@(?:Get|Post|Put|Patch|Delete|Sse)\(\s*'([^']+)'/g)) {
          required.add(`/${method[1].split('/')[0]}`);
        }
      }
    }
  }

  assert.ok(required.size > 10, `chi doc duoc ${required.size} route — regex controller da hong`);
  const missing = [...required].filter((path) => !covered(tokens, path)).sort();
  assert.deepEqual(
    missing,
    [],
    `Caddyfile thieu duong di cho: ${missing.join(', ')} -> tren ban deploy se tra 404 trang Next.js`,
  );
});

// Quyet dinh 04/08/2026 (dot 2): hostname demo va operator hanh xu GIONG NHAU. Truoc do demo tra
// 404 cho /settings* nen nguoi van hanh tuong trang cau hinh chua ton tai.
//
// Sau khi tach edge (15/08/2026), hostname khong con nam trong Caddyfile: edge dung chung cho moi
// khach va khong biet truoc ten mien nao, con tung khach duoc render ra mot manh rieng. Nen khang
// dinh nay chuyen sang doc BO SINH MANH trong render-secrets.sh.
test('the demo hostname no longer 404s the operator surface', () => {
  const demoBlock = renderSecrets.match(/\$\{DEMO_DOMAIN\}\$\{DEMO_ALIASES[\s\S]*?\n\}/)?.[0] ?? '';

  assert.notEqual(demoBlock, '', 'render-secrets.sh khong con sinh khoi site cho hostname demo');
  assert.doesNotMatch(demoBlock, /@blocked/);
  assert.doesNotMatch(demoBlock, /Khong co quyen truy cap/);
  assert.match(demoBlock, /import app_routes/);
});

// MOI KHACH MOT KHOANG RIENG. Hostname, alias mang va ten secret deu phai mang slug: thieu mot cho
// thoi la khach thu hai giam len khach thu nhat — dung ten mien cua nhau, hoac te hon, dung
// PostgreSQL cua nhau.
test('moi STACK co hostname, alias mang, secret va volume rieng', () => {
  // Bat bien 3 (ci-cd.md) khong doi: MOT nguon duy nhat quyet dinh dong thoi thu muc stack, ten
  // compose project (=> ten volume), tien to secret, alias mang va hostname. Nguon do nay la
  // STACK SLUG (tenant + moi truong) thay vi tenant slug, vi mot khach co the co hai stack —
  // `ultty` dang chay va `ultty-gd1-test` — va hai stack do khong duoc dung chung gi.
  // Mac dinh `${STACK_SLUG:-${TENANT_SLUG}}` giu nguyen hanh vi cu cho moi duong goi chua truyen.

  // Hostname: `<vai tro>-<stack>` chu khong phai `<vai tro>` tran.
  assert.match(renderSecrets, /DEMO_DOMAIN="demo-\$\{STACK_SLUG\}\./);
  assert.match(renderSecrets, /OPERATOR_DOMAIN="operator-\$\{STACK_SLUG\}\./);

  // Upstream tro vao alias mang mang stack slug, khong tro vao ten service (`api`/`web` trung nhau
  // giua cac stack tren mang edge dung chung).
  assert.match(renderSecrets, /import app_routes api-\$\{STACK_SLUG\} web-\$\{STACK_SLUG\}/);
  assert.doesNotMatch(renderSecrets, /import app_routes api web/);

  // Secret: khong mot ten secret nao duoc tro cung vao mot stack.
  assert.match(renderSecrets, /secret zalo-\$\{STACK_SLUG\}-api-key/);
  assert.doesNotMatch(renderSecrets, /secret zalo-[a-z]+-[a-z-]*password/);

  // Ten compose project quyet dinh ten volume — khong mang stack slug thi hai stack dung chung
  // volume PostgreSQL, tuc la dung chung du lieu.
  assert.match(compose, /^name: zalo-\$\{STACK_SLUG:-\$\{TENANT_SLUG\}\}$/m);
  assert.match(compose, /- api-\$\{STACK_SLUG:-\$\{TENANT_SLUG\}\}$/m);
  assert.match(compose, /- web-\$\{STACK_SLUG:-\$\{TENANT_SLUG\}\}$/m);
  assert.match(compose, /- flowise-\$\{STACK_SLUG:-\$\{TENANT_SLUG\}\}$/m);

  // Thu muc stack, unit systemd va tien to backup cung phai theo stack, neu khong stack moi se
  // ghi de len thu muc, timer va cua so luu tru cua stack dang chay.
  assert.match(deployRemote, /app_dir="\/srv\/netviet\/apps\/zalo-\$\{stack_slug\}"/);
  assert.match(deployRemote, /netviet-backup@\$\{stack_slug\}\.timer/);
  assert.match(deployRemote, /netviet-stack@\$\{stack_slug\}\.service/);
  assert.match(backup, /BACKUP_ROOT="\$\{BACKUP_BUCKET\}\/stacks\/\$\{STACK_SLUG\}"/);

  // Gateway phai da roi khoi stack khach: con o lai thi stack thu hai gianh :443 voi stack dau.
  assert.doesNotMatch(compose, /^\s{2}gateway:$/m);
  assert.doesNotMatch(compose, /"443:443"/);
});

// Stack dang chay KHONG DUOC DOI TEN. Ten compose project quyet dinh ten volume, nen `ultty/dev`
// va `ultty/production` phai tiep tuc suy ra dung `ultty` — neu khong, lan deploy tiep theo se
// tao volume moi va bo lai toan bo du lieu PostgreSQL cua khach o volume cu.
test('dev va production van suy ra dung stack slug cu', () => {
  for (const environment of ['dev', 'production', 'legacy']) {
    assert.equal(resolveStackSlug('ultty', environment), 'ultty');
    assert.equal(resolveStackSlug('amico', environment), 'amico');
  }
  assert.equal(resolveStackSlug('ultty', 'gd1-test'), 'ultty-gd1-test');
});

// Su co 17/08/2026: deploy.ps1 doc $env:TENANT de chon GOI KHACH upload len, nhung goi
// deploy-remote.sh voi 5 tham so — thieu slug — nen phia VM roi ve mac dinh 'ultty'. Ket qua:
// `TENANT=amico ./deploy.ps1` ghi goi cua Amico DE LEN thu muc stack cua Ultty, tuc la thay bang
// gia cua khach nay bang bang gia cua khach kia. Khoa lai: mot nguon slug duy nhat, va phai truyen.
test('deploy tay truyen slug khach xuong VM thay vi de VM doan', () => {
  assert.match(deployPs1, /\[string\]\$Tenant = \$\(if \(\$env:TENANT\)/);
  // Thu muc va tien to secret theo STACK (tenant + moi truong), con GOI KHACH van chon theo
  // TENANT. Mac dinh `$Stack` rong => StackSlug = TenantSlug, nen moi lan chay cu khong doi hanh vi.
  assert.match(deployPs1, /\$StackSlug = if \(\$Stack\) \{ \$Stack \} else \{ \$TenantSlug \}/);
  assert.match(deployPs1, /\$AppDirectory = "\/srv\/netviet\/apps\/zalo-\$StackSlug"/);
  assert.match(deployPs1, /deploy-remote\.sh'[^\n]*'\$PublicIp' '\$TenantSlug'/);

  // Khong con ten secret nao cam cung mot khach.
  assert.doesNotMatch(deployPs1, /Ensure-Secret 'zalo-[a-z0-9-]+-/);
  assert.match(deployPs1, /\$SecretPrefix = "zalo-\$StackSlug"/);

  // Tao secret va cap quyen doc phai di tu CUNG mot danh sach: hai danh sach roi thi mot ben them
  // secret con ben kia quen binding -> stack chet giua chung voi PERMISSION_DENIED.
  assert.match(deployPs1, /\$secretNames = \$secretSuffixes \| ForEach-Object/);
});

// Tach edge dung chung (12/08/2026) da bo cong host 3002 cua Flowise, nhung script rotate van goi
// `--network host` toi 127.0.0.1:3002 — dut duong ma khong ai thay, vi rotate khong nam trong luong
// deploy. Duong vao dung la mang RIENG cua khach do.
test('rotate Flowise di vao dung container cua khach, khong qua cong host', async () => {
  const rotate = await readFile(new URL('./rotate-flowise-admin-password.sh', import.meta.url), 'utf8');
  // Bo dong comment truoc khi kiem: chinh comment giai thich su co co nhac `--network host` va cong
  // 3002 cu — chi lenh THAT moi tinh (cung cach test Caddyfile o tren xu ly `basic_auth`).
  const commands = rotate
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n');

  assert.doesNotMatch(commands, /--network host/);
  assert.doesNotMatch(commands, /127\.0\.0\.1:3002/);
  assert.match(rotate, /network="zalo-\$\{tenant_slug\}_backend"/);
  assert.match(rotate, /base_url="http:\/\/flowise-\$\{tenant_slug\}:3000"/);
  assert.doesNotMatch(rotate, /secret zalo-ultty-/);
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
    'set-channel-mode.sh': setChannelMode,
    // Duc token cho workflow engine cung `docker compose up` cum Hatchet, nen no la mot tien
    // trinh SUA compose — phai xep cung hang khoa. Thieu no o day thi bao dam nay im lang khong
    // phu script moi nhat.
    'bootstrap-workflow-engine.sh': await readFile(
      new URL('./bootstrap-workflow-engine.sh', import.meta.url),
      'utf8',
    ),
  };

  for (const [name, source] of Object.entries(scripts)) {
    assert.ok(
      source.includes(lockPath) || source.includes('${RUNTIME_DIR}/compose.lock'),
      `${name} khong mo ${lockPath}`,
    );
    assert.match(source, /flock\s+-[wn]/, `${name} khong goi flock`);
  }

  // Timer phai la NON-blocking (-n): dang deploy thi bo qua nhip, khong xep hang cho.
  assert.match(scripts['health-check.sh'], /flock -n 9/);
  // Deploy va rollback thi doi, vi bo cuoc giua chung nguy hiem hon la cho.
  assert.match(scripts['deploy-stack.sh'], /flock -w 300 9/);
  assert.match(scripts['rollback.sh'], /flock -w 300 9/);
  assert.match(scripts['set-channel-mode.sh'], /flock -w 300 9/);
  assert.ok(
    scripts['set-channel-mode.sh'].indexOf('flock -w 300 9') <
      scripts['set-channel-mode.sh'].indexOf('channel-mode.sh" write'),
    'channel override must be written only after the compose lock is held',
  );
  assert.ok(
    renderSecrets.indexOf('flock -w 300 9') < renderSecrets.indexOf('cat >"${RUNTIME_DIR}/secrets.env"'),
    'secrets.env must be written only after the compose lock is held',
  );

  const unit = await readFile(new URL('./systemd/netviet-stack@.service', import.meta.url), 'utf8');
  assert.match(unit, /ExecStart=\/usr\/bin\/flock -w 300 \S*compose\.lock \/usr\/bin\/docker compose/);
});

test('deployment smoke checks public pages and requires auth for Zalo status API', () => {
  assert.match(deployStack, /"https:\/\/\$\{OPERATOR_DOMAIN\}\/zalo"/);
  assert.match(deployStack, /"https:\/\/\$\{OPERATOR_DOMAIN\}\/zalo\/status"/);
  assert.match(deployStack, /== '401'/);
});

// Pilot GĐ1 dung zca va tu gui theo policy tenant; `.runtime` van luu duoc override co y.
test('pilot deploy defaults to zca and auto-send, while preserving a validated channel override', () => {
  assert.match(channelMode, /echo 'zca'/);
  assert.match(channelMode, /mock\|bot\|zca\|hybrid/);
  assert.match(channelMode, /CHANNEL_MODE khong hop le/);
  assert.match(channelMode, /mktemp/);
  assert.match(renderSecrets, /channel-mode\.sh" read/);
  assert.match(setChannelMode, /channel-mode\.sh" write/);
  assert.match(setChannelMode, /--force-recreate api/);
  assert.equal(deployStack.match(/-e "CHANNEL_MODE=\$\{channel_mode\}"/g)?.length, 2);
  assert.doesNotMatch(deployStack, /-e CHANNEL_MODE=mock/);
  assert.match(deployStack, /channel-mode\.sh" read/);
  assert.match(setChannelMode, /rollback_runtime/);
  assert.match(compose, /CHANNEL_MODE:\s*\$\{CHANNEL_MODE:-zca\}/);
  assert.match(compose, /AUTO_SEND:\s*\$\{AUTO_SEND:-on\}/);
});

test('Ultty GD1-test renders an explicit no-mock safety profile without changing pilot defaults', () => {
  assert.match(renderSecrets, /DEPLOYMENT_ENVIRONMENT/);
  assert.match(renderSecrets, /gd1-test[\s\S]*CHANNEL_MODE='zca'/);
  assert.match(renderSecrets, /gd1-test[\s\S]*PARSER_MODE='deepseek'/);
  assert.match(renderSecrets, /gd1-test[\s\S]*AUTO_SEND='off'/);
  assert.match(renderSecrets, /gd1-test[\s\S]*DATA_CLASSIFICATION='test'/);
  assert.match(renderSecrets, /^DATA_CLASSIFICATION=\$\{DATA_CLASSIFICATION\}$/m);
  assert.match(compose, /DATA_CLASSIFICATION:\s*\$\{DATA_CLASSIFICATION:-test\}/);
  assert.match(deployRemote, /DEPLOYMENT_ENVIRONMENT/);
  assert.match(deployCi, /DEPLOYMENT_ENVIRONMENT="\$\{ENVIRONMENT:-legacy\}"/);
  assert.match(deployCi, /'\$\{DEPLOYMENT_ENVIRONMENT\}'/);
});

test('rollback restores both immutable app and Flowise images without touching the database', () => {
  assert.match(rollback, /APP_IMAGE.*FLOWISE_IMAGE/);
  assert.match(rollback, /\^FLOWISE_IMAGE=/);
  assert.match(rollback, /pull api web flowise/);
  assert.match(rollback, /up -d flowise/);
  assert.doesNotMatch(rollback, /migrate reset|prisma migrate down|drop database/i);
});

test('deploy smoke cannot approve through a live Zalo API transport', async () => {
  assert.match(deployStack, /channel_mode="\$\("\$\{APP_DIR\}\/channel-mode\.sh" read/);
  assert.match(deployStack, /-e "CHANNEL_MODE=\$\{channel_mode\}"/);
  const recreateIndex = deployStack.indexOf('up -d --no-deps --force-recreate api web');
  const smokeIndex = deployStack.indexOf('smoke_output=');
  assert.ok(recreateIndex >= 0 && recreateIndex < smokeIndex, 'API must reset AUTO_SEND before smoke');
  assert.match(
    await readFile(new URL('./smoke-test.mjs', import.meta.url), 'utf8'),
    /if \(!liveZaloTransport\) \{[\s\S]*\/approve/,
  );
});

test('PowerShell deploy creates the remote tenant-pack destination before Windows pscp uploads', () => {
  const createParent = deployPs1.indexOf("install -d -m 0700 '$remoteParent' '$remoteParent/tenant-pack'");
  const uploadTenant = deployPs1.indexOf('"${VmName}:$remoteParent/tenant-pack"');
  assert.ok(createParent >= 0 && createParent < uploadTenant);
});

test('public pilot uses persistent session auth and bootstraps one operator without resetting it', () => {
  assert.match(renderSecrets, /netviet-api-session-v1/);
  assert.match(renderSecrets, /sha256sum/);
  assert.doesNotMatch(renderSecrets, /secret zalo-ultty-session-secret/);
  assert.match(renderSecrets, /^AUTH_MODE='session'$/m);
  assert.match(compose, /SESSION_SECRET: \$\{SESSION_SECRET\}/);
  const migrateIndex = deployStack.indexOf('prisma migrate deploy');
  const authBootstrapIndex = deployStack.indexOf('bootstrap-auth-user.mjs');
  assert.ok(migrateIndex >= 0 && migrateIndex < authBootstrapIndex, 'migrate before auth bootstrap');
  assert.match(deployStack, /PILOT_BASE_URL=https:\/\/\$\{OPERATOR_DOMAIN\}/);
  assert.match(compose, /extra_hosts:[\s\S]*"\$\{OPERATOR_DOMAIN\}:host-gateway"/);
  assert.match(deployStack, /runtime_value OPERATOR_DOMAIN/);
  assert.doesNotMatch(deployStack, /source \.runtime\/secrets\.env/);
  assert.match(authBootstrap, /findUnique/);
  assert.match(authBootstrap, /apps\/api\/node_modules\/@prisma\/client\/default\.js/);
  assert.match(authBootstrap, /Da co operator/);
  assert.doesNotMatch(authBootstrap, /update\s*\(/);
  assert.match(smokeTest, /\/auth\/login/);
  assert.match(smokeTest, /x-csrf-token/);
  assert.match(smokeTest, /cookie/i);
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

  // Build context khong co `tenants/` -> khong `COPY` nao cham toi duoc, ke ca `COPY . .`.
  assert.match(dockerignore, /^tenants$/m);

  // BA tien trinh doc goi tu volume chi-doc, khong tu trong image: `api`, `web`, va
  // `workflow-worker-v1`. Worker can goi khach vi `activeWorkflowEngine()` phai biet khach nay
  // rang buoc khuon nao va `credentialRef` tro toi bien moi truong nao.
  assert.equal(compose.match(/^\s*TENANT_DIR: \/srv\/tenant$/gm)?.length, 3);
  // BON mount: api, web, `bootstrap` va `workflow-worker-v1`. `bootstrap` co mat vi smoke-test.mjs
  // chay trong do va doc tin nhan mau tu goi khach (cau don hop le phu thuoc SKU/dai ly rieng
  // tung khach).
  //
  // DEM SO chu khong chi kiem "co ton tai" la CO Y: them mot tien trinh doc goi khach phai la mot
  // quyet dinh duoc noi ra o day, khong phai mot dong `volumes:` lang le trong mot lan review.
  assert.equal(compose.match(/^\s*- \.\/tenant-pack:\/srv\/tenant:ro$/gm)?.length, 4);

  // Goi khach phai co mat tren VM truoc khi stack len, va thieu thi dung han chu khong boot rong.
  assert.match(deployRemote, /tenant-pack\/tenant\.json/);
  assert.match(deployRemote, /rsync -a --delete "\$remote_parent\/tenant-pack\/"/);

  // TENANT khong con di qua secrets.env: goi duoc mount thang, khong tra slug trong image nua.
  assert.doesNotMatch(renderSecrets, /^TENANT=/m);
});

// Metadata release/rollback duoc sinh bang `printf`, ma printf KHONG bao loi khi so `%s` nhieu hon
// so tham so — no lang le dien chuoi rong va lam LECH moi truong phia sau. Da xay ra that: them
// truong "stack" vao format ma quen them tham so, khien `capturedAt` rong va `appDigest` nhan
// nham gia tri cua truong ben canh. Mot tep rollback sai la thu chi bi phat hien dung luc can
// rollback, nen dem so o day.
test('printf metadata release/rollback co so tham so khop so %s', () => {
  // Khong rang buoc kieu xuong dong: tep nay co the la CRLF tren may Windows.
  const blocks = [
    ...deployRemote.matchAll(
      /printf '(\{[^']*\})([\s\S]*?)>"\$(?:temporary|rollback_file)"/g,
    ),
  ];

  assert.ok(blocks.length >= 3, `phai tim thay ca 3 khoi printf metadata, thay ${blocks.length}`);

  for (const [, format, args] of blocks) {
    const placeholders = (format.match(/%s/g) ?? []).length;
    const supplied = (args.match(/"\$(?:\w+|\([^)]*\))"/g) ?? []).length;
    assert.equal(
      supplied,
      placeholders,
      `printf co ${placeholders} placeholder nhung ${supplied} tham so: ${format.slice(0, 90)}`,
    );
  }
});

// Su co 21/08/2026: stack gd1-test len khoe manh nhung smoke chet vi tin dat hang mau bi phan loai
// 'khac'. Ly do: voi PERSISTENCE=prisma, KnowledgeService nap tu Postgres va BO QUA seed trong bo
// nho, nen DB moi = danh muc rong = parser khong co gi de doi chieu. Dung cho BAT KY stack moi nao,
// khong rieng gd1-test.
test('deploy gieo nguon su that TRUOC khi chay smoke, va chi khi DB rong', async () => {
  const deployStack = await readFile(new URL('./deploy-stack.sh', import.meta.url), 'utf8');
  const seed = await readFile(new URL('./seed-tenant-knowledge.mjs', import.meta.url), 'utf8');

  const seedIndex = deployStack.indexOf('seed-tenant-knowledge.mjs');
  const migrateIndex = deployStack.indexOf('prisma migrate deploy');
  const smokeIndex = deployStack.indexOf('smoke-test.mjs');

  assert.ok(seedIndex > 0, 'deploy phai gieo nguon su that');
  assert.ok(migrateIndex < seedIndex, 'phai migrate truoc khi gieo');
  assert.ok(seedIndex < smokeIndex, 'phai gieo truoc khi smoke chay duong dat hang');

  // Gieo MOT LAN. Goi khach la hat giong; sau lan dau Postgres moi la nguon su that, nen mot lan
  // deploy lai khong duoc ghi de thu Sale da sua qua /admin.
  assert.match(seed, /product\.count\(\)/);
  assert.match(seed, /khong gieo lai/);
  // ...va phai la mot giao dich, neu khong mot goi hong nua chung se de lai DB nua voi ma lan sau
  // van thay "da co san pham" roi bo qua.
  assert.match(seed, /\$transaction/);
});
