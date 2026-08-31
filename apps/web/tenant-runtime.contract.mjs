import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * HOP DONG "MOT IMAGE — MOI KHACH".
 *
 * Build MOT lan (khong dat TENANT), roi chay HAI experience tren hai goi khach khac nhau. Contract
 * chung minh ca branding LAN composition doi luc runtime ma BUILD_ID khong doi.
 *
 * Chay:
 *   pnpm --filter @netviet/web build     # CO Y khong dat TENANT
 *   pnpm test:tenant-runtime
 *
 * Hai goi khach o day la goi GIA trong thu muc tam — test khong duoc biet khach that nao ton tai.
 */

const WEB_DIR = dirname(fileURLToPath(import.meta.url));
const NEXT_BIN = createRequire(join(WEB_DIR, 'package.json')).resolve('next/dist/bin/next');
const PORT = Number(process.env.TENANT_CONTRACT_PORT ?? 3987);
const BASE = `http://127.0.0.1:${PORT}`;
const BOOT_TIMEOUT_MS = 120_000;
const POLL_MS = 500;

/** Hai goi khach chenh nhau O MOI truong thuong hieu, de khong chuoi nao lot qua ma khong bi bat. */
const PACK_A = {
  slug: 'khach-mot',
  productName: 'Khach Mot AI',
  installName: 'Khach Mot — Tro ly don hang AI',
  pageTitle: 'Khach Mot AI — Trung tam dieu hanh',
  themeColor: '#0f62fe',
  backgroundColor: '#f7f4ee',
  monogram: 'M',
  experience: 'operations-console',
};
const PACK_B = {
  slug: 'khach-hai',
  productName: 'Khach Hai AI',
  installName: 'Khach Hai — Khong gian tri thuc',
  pageTitle: 'Khach Hai AI — Khong gian tri thuc',
  themeColor: '#8a1f5c',
  backgroundColor: '#fdf7f0',
  monogram: 'HA',
  experience: 'knowledge-workspace',
};
const PACK_C = {
  slug: 'khach-ba',
  productName: 'Khach Ba AI',
  installName: 'Khach Ba — AI Workforce Control Plane',
  pageTitle: 'Khach Ba AI — AI Workforce Control Plane',
  themeColor: '#1d4ed8',
  backgroundColor: '#0a0f1d',
  monogram: 'BA',
  experience: 'agent-workforce',
};

/** Goi khach thu tu — BE MAT KHACH huong khach hang (Issue #107). */
const PACK_D = {
  slug: 'khach-bon',
  productName: 'Khach Bon AI',
  installName: 'Khach Bon — Van hanh ban hang B2B',
  pageTitle: 'Khach Bon AI — Van hanh ban hang',
  themeColor: '#0b6b53',
  backgroundColor: '#f4f7f5',
  monogram: 'BO',
  experience: 'b2b-sales-operations',
  /**
   * Goi nay khai mot nang luc BI CHAN. Bai kiem tra o day khong doc duoc noi dung do (xem
   * `assertCustomerDocumentHasNoEngineeringPayload`), nhung goi van phai khai no: nho vay hop dong
   * chung minh duoc mot goi khach CO nang luc bi chan van boot va van doi thuong hieu binh thuong.
   * Con phan noi dung duoc doc o `e2e/b2b-sales-operations.spec.ts`.
   */
  blockedCapabilities: [
    { key: 'cod_ship', label: 'COD va cuoc van chuyen', reason: 'Chua co bang phi chinh thuc.' },
  ],
};

const tmpDirs = [];

function writePack(spec) {
  // Hai be mat ban hang doi CUNG mot nen du lieu (xem EXPERIENCE_REQUIREMENTS), nen goi gia cua
  // chung cung phai giong nhau. Khac nhau chi o chuoi thuong hieu va nang luc bi chan.
  const salesPack =
    spec.experience === 'operations-console' || spec.experience === 'b2b-sales-operations';
  const dir = mkdtempSync(join(tmpdir(), `tenant-${spec.slug}-`));
  mkdirSync(join(dir, 'data'), { recursive: true });
  writeFileSync(
    join(dir, 'tenant.json'),
    JSON.stringify({
      schemaVersion: 2,
      slug: spec.slug,
      identity: {
        displayName: `Cong ty ${spec.productName}`,
        shortName: spec.productName,
      },
      branding: {
        productName: spec.productName,
        installName: spec.installName,
        pageTitle: spec.pageTitle,
        pageDescription: `${spec.productName} runtime experience.`,
        themeColor: spec.themeColor,
        backgroundColor: spec.backgroundColor,
        monogram: spec.monogram,
        composerPlaceholder: 'Nhap noi dung',
      },
      experience: spec.experience,
      capabilities:
        salesPack
          ? [
              'knowledge',
              'messaging',
              'turn-processing',
              'sales-order',
              'campaign',
              'operations',
              'notifications',
            ]
          : spec.experience === 'agent-workforce'
            ? ['knowledge', 'operations']
            : ['knowledge'],
      policies:
        salesPack
          ? {
              salesOrder: {
                supportedDealerPolicies: ['thanh_toan_ngay'],
                automation: { enabled: false, maxAutoConfirmQuantity: 1 },
                retailAdvice: { priceField: 'retailPrice', qualifier: 'gia tham khao' },
              },
              campaign: {
                defaultWindow: { start: '08:00', end: '20:00' },
                minSpacingSeconds: 60,
                maxTargets: 10,
                rateLimitPerMinute: 10,
                claimLeaseSeconds: 60,
                tickIntervalSeconds: 30,
                retry: { maxAttempts: 3, baseBackoffSeconds: 60 },
                features: { lunarCalendarEnabled: false },
              },
              readiness: { blockedCapabilities: spec.blockedCapabilities ?? [] },
            }
          : { readiness: { blockedCapabilities: [] } },
      integrations:
        salesPack
          ? {
              channel: { allowedAdapters: ['mock'] },
              parser: { allowedAdapters: ['claude'] },
              erp: { adapter: 'none' },
              contentSource: { adapter: 'local_manifest' },
            }
          : { contentSource: { adapter: 'local_manifest' } },
      persona:
        salesPack
          ? {
              messaging: { botName: spec.productName, mentionName: `Bot ${spec.slug}` },
              turnProcessing: { parserIntro: `Parser fixture cho ${spec.productName}.` },
              knowledge: { productFallbackDescription: `San pham cua ${spec.productName}.` },
            }
          : {},
      bootstrap:
        salesPack
          ? {
              knowledge: { path: 'data/knowledge.json' },
              salesOrder: { path: 'data/knowledge.json' },
            }
          : { knowledge: { path: 'data/knowledge.json' } },
      smoke: null,
    }),
    'utf8',
  );
  tmpDirs.push(dir);
  return dir;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate, what) {
  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await sleep(POLL_MS);
  }
  throw new Error(`Qua ${BOOT_TIMEOUT_MS}ms van chua ${what}`);
}

const isUp = async () => {
  try {
    return (await fetch(BASE, { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    return false;
  }
};

/** Chay `next start` tren ban build SAN, chi doi bien moi truong goi khach. KHONG build lai. */
async function startServer(tenantDir) {
  const env = { ...process.env, TENANT_DIR: tenantDir, NODE_ENV: 'production' };
  delete env.TENANT; // bo di cho khong con duong nao mo ho ve goi khach dang duoc dung
  // Giu lai stderr thay vi 'ignore': khi server khong len duoc, ly do that (vd goi khach thieu
  // truong -> loader nem) nam o day. Truoc day no bi nem di va test chi noi duoc "qua 120s".
  const child = spawn(process.execPath, [NEXT_BIN, 'start', '-p', String(PORT)], {
    cwd: WEB_DIR,
    env,
    stdio: ['ignore', 'ignore', 'pipe'],
    detached: process.platform !== 'win32',
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += String(chunk);
  });

  try {
    await waitFor(isUp, `khoi dong duoc next start o ${BASE}`);
  } catch (error) {
    // PHAI don tien trinh con truoc khi nem. Neu khong, `next start` con song se giu event loop cua
    // node --test mo mai — job CI khong "do" ma "treo" den khi het timeout 20 phut, va nguoi doc
    // log thay mot job bi huy chu khong thay mot test that bai (su co 15-17/08/2026).
    await stopServer(child).catch(() => {});
    const detail = stderr.trim().split('\n').slice(-12).join('\n');
    throw new Error(
      `${error.message}${detail ? `\n--- stderr cua next start ---\n${detail}` : ''}`,
      {
        cause: error,
      },
    );
  }
  return child;
}

async function stopServer(child) {
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      child.kill('SIGKILL');
    }
  }
  await waitFor(async () => !(await isUp()), 'nha duoc cong sau khi dung server');
}

const getText = async (path) => {
  const res = await fetch(`${BASE}${path}`);
  assert.equal(res.status, 200, `${path} phai tra 200`);
  return res.text();
};

/** Doc ba be mat mang thuong hieu cua mot lan chay. */
async function readBranding() {
  const [html, manifest, icon] = await Promise.all([
    getText('/'),
    getText('/manifest.webmanifest'),
    getText('/icon.svg'),
  ]);
  return { html, manifest: JSON.parse(manifest), icon };
}

function assertExperience(seen, spec, label) {
  assert.match(
    seen.html,
    new RegExp(`data-experience="${spec.experience}"`),
    `${label}: experience composition`,
  );
}

function assertKnowledgeWorkspaceHasNoOperationsSurface(seen) {
  for (const marker of [
    'data-experience="operations-console"',
    'Luồng xử lý 6 agent',
    'Kênh Zalo',
    'Đại lý &amp; giá',
    'AUTO_SEND',
  ]) {
    assert.ok(!seen.html.includes(marker), `knowledge workspace khong duoc co marker: ${marker}`);
  }
}

/**
 * KHONG mot khai niem ky thuat nao duoc di kem TAI LIEU may chu tra ve cho be mat khach.
 *
 * PHAM VI CO GIOI HAN, va gioi han do phai noi ro. `AuthGate` hoi `/auth/config` trong mot effect
 * o trinh duyet, nen tai lieu `next start` tra ve cho `/` chi chua man hinh cho — vo khach chua
 * ton tai trong do. Vay nen bai nay KHONG chung minh duoc "man hinh sach"; thu no chung minh la
 * TAI LIEU sach, ke ca phan payload RSC nhung trong <script>. Do van la mot bao dam that: mot
 * `traceId` di lac vao prop cua server component se hien ra o day du khong ai nhin thay no tren
 * man hinh.
 *
 * Con "man hinh sach" duoc chung minh o `apps/web/e2e/b2b-sales-operations.spec.ts`, tren trinh
 * duyet that, quet qua bon muc.
 */
function assertCustomerDocumentHasNoEngineeringPayload(seen) {
  for (const marker of [
    'data-experience="operations-console"',
    'Luồng xử lý 6 agent',
    'traceId',
    'spanId',
    'workflowRunId',
    'ruleConfigVersion',
    'AUTO_SEND',
  ]) {
    assert.ok(!seen.html.includes(marker), `tai lieu be mat khach khong duoc co marker: ${marker}`);
  }
}

function assertMatchesPack(seen, spec, label) {
  assert.match(seen.html, new RegExp(`<title>${spec.pageTitle}</title>`), `${label}: <title>`);
  assert.equal(seen.manifest.name, spec.installName, `${label}: manifest.name`);
  assert.equal(seen.manifest.short_name, spec.productName, `${label}: manifest.short_name`);
  assert.equal(seen.manifest.theme_color, spec.themeColor, `${label}: manifest.theme_color`);
  assert.equal(
    seen.manifest.background_color,
    spec.backgroundColor,
    `${label}: manifest.background_color`,
  );
  assert.match(seen.icon, new RegExp(`>${spec.monogram}</text>`), `${label}: monogram tren icon`);
  assert.match(seen.icon, new RegExp(spec.themeColor), `${label}: mau nen icon`);
}

/** Moi chuoi rieng cua goi kia deu KHONG duoc xuat hien — do la dau hieu bi nuong vao build. */
function assertNoTraceOf(seen, spec, label) {
  const blob = `${seen.html}\n${JSON.stringify(seen.manifest)}\n${seen.icon}`;
  for (const leaked of [
    spec.productName,
    spec.installName,
    spec.pageTitle,
    spec.themeColor,
    spec.backgroundColor,
  ]) {
    assert.ok(!blob.includes(leaked), `${label}: con sot chuoi cua goi kia — "${leaked}"`);
  }
}

test('cung MOT artifact, doi tenant luc chay -> branding va experience deu doi', async (t) => {
  const buildIdPath = join(WEB_DIR, '.next', 'BUILD_ID');
  assert.ok(
    existsSync(buildIdPath),
    'Chua co ban build. Chay truoc: pnpm --filter @netviet/web build (CO Y khong dat TENANT).',
  );
  const buildIdBefore = readFileSync(buildIdPath, 'utf8');

  const dirA = writePack(PACK_A);
  const dirB = writePack(PACK_B);
  const dirC = writePack(PACK_C);
  const dirD = writePack(PACK_D);

  t.after(() => {
    for (const dir of tmpDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  const serverA = await startServer(dirA);
  let seenA;
  try {
    seenA = await readBranding();
  } finally {
    await stopServer(serverA);
  }
  assertMatchesPack(seenA, PACK_A, 'goi A');
  assertExperience(seenA, PACK_A, 'goi A');
  assertNoTraceOf(seenA, PACK_B, 'goi A');
  assertNoTraceOf(seenA, PACK_C, 'goi A');

  const serverB = await startServer(dirB);
  let seenB;
  let zaloResponseB;
  try {
    seenB = await readBranding();
    const response = await fetch(`${BASE}/zalo`, { redirect: 'manual' });
    zaloResponseB = { status: response.status, html: await response.text() };
  } finally {
    await stopServer(serverB);
  }
  assertMatchesPack(seenB, PACK_B, 'goi B');
  assertExperience(seenB, PACK_B, 'goi B');
  assertKnowledgeWorkspaceHasNoOperationsSurface(seenB);
  assert.ok(
    zaloResponseB.status === 404 || /404|could not be found/i.test(zaloResponseB.html),
    'knowledge-only tenant phai render notFound cho route /zalo',
  );
  assertNoTraceOf(seenB, PACK_A, 'goi B');
  assertNoTraceOf(seenB, PACK_C, 'goi B');

  const serverC = await startServer(dirC);
  let seenC;
  try {
    seenC = await readBranding();
  } finally {
    await stopServer(serverC);
  }
  assertMatchesPack(seenC, PACK_C, 'goi C');
  assertExperience(seenC, PACK_C, 'goi C');
  assertNoTraceOf(seenC, PACK_A, 'goi C');
  assertNoTraceOf(seenC, PACK_B, 'goi C');

  // Goi D — be mat khach. Lan chay nay tra loi ba cau cua Issue #107 cung mot luc: experience moi
  // render duoc that, no khong phoi khai niem ky thuat nao, va nang luc bi chan doc ra dung ly do
  // khach viet. Ca ba deu duoc do tren HTML that, tren dung ban build da phuc vu ba goi tren.
  const serverD = await startServer(dirD);
  let seenD;
  try {
    seenD = await readBranding();
  } finally {
    await stopServer(serverD);
  }
  assertMatchesPack(seenD, PACK_D, 'goi D');
  assertExperience(seenD, PACK_D, 'goi D');
  assertCustomerDocumentHasNoEngineeringPayload(seenD);
  assertNoTraceOf(seenD, PACK_A, 'goi D');
  assertNoTraceOf(seenD, PACK_B, 'goi D');
  assertNoTraceOf(seenD, PACK_C, 'goi D');

  assert.equal(
    readFileSync(buildIdPath, 'utf8'),
    buildIdBefore,
    'BUILD_ID doi -> da build lai giua cac lan chay, phep chung minh khong con gia tri',
  );
  t.diagnostic(`BUILD_ID khong doi (${buildIdBefore.trim()}) — mot artifact cho ca bon khach`);
});
