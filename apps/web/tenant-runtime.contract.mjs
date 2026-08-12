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
 * Build MOT lan (khong dat TENANT), roi chay HAI lan voi hai goi khach khac nhau va doi hoi thuong
 * hieu doi theo. Neu con bat ky chuoi thuong hieu nao bi nuong vao artifact luc build, lan chay thu
 * hai se lo ra ten cua goi thu nhat va test nay do.
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
};
const PACK_B = {
  slug: 'khach-hai',
  productName: 'Khach Hai AI',
  installName: 'Khach Hai — Tro ly don hang AI',
  pageTitle: 'Khach Hai AI — Trung tam dieu hanh',
  themeColor: '#8a1f5c',
  backgroundColor: '#fdf7f0',
  monogram: 'HA',
};

const tmpDirs = [];

function writePack(spec) {
  const dir = mkdtempSync(join(tmpdir(), `tenant-${spec.slug}-`));
  mkdirSync(join(dir, 'data'), { recursive: true });
  writeFileSync(
    join(dir, 'tenant.json'),
    JSON.stringify({
      schemaVersion: 1,
      slug: spec.slug,
      displayName: `Cong ty ${spec.productName}`,
      shortName: spec.productName,
      branding: {
        productName: spec.productName,
        installName: spec.installName,
        pageTitle: spec.pageTitle,
        pageDescription: `Console xu ly don hang Zalo cho ${spec.productName}.`,
        themeColor: spec.themeColor,
        backgroundColor: spec.backgroundColor,
        monogram: spec.monogram,
        composerPlaceholder: `vd: @Bot ${spec.slug} gui 10 mon A ve HN`,
      },
      persona: {
        parserIntro: `Ban la bo PHAN LOAI Y DINH + TRICH XUAT don hang cho ${spec.productName}.`,
        botName: spec.productName,
        mentionName: `Bot ${spec.slug}`,
        productFallbackDescription: `San pham cua ${spec.productName}.`,
      },
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
  const child = spawn(process.execPath, [NEXT_BIN, 'start', '-p', String(PORT)], {
    cwd: WEB_DIR,
    env,
    stdio: 'ignore',
    detached: process.platform !== 'win32',
  });
  await waitFor(isUp, `khoi dong duoc next start o ${BASE}`);
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

test('cung MOT artifact, doi goi khach luc chay -> thuong hieu doi theo', async (t) => {
  const buildIdPath = join(WEB_DIR, '.next', 'BUILD_ID');
  assert.ok(
    existsSync(buildIdPath),
    'Chua co ban build. Chay truoc: pnpm --filter @netviet/web build (CO Y khong dat TENANT).',
  );
  const buildIdBefore = readFileSync(buildIdPath, 'utf8');

  const dirA = writePack(PACK_A);
  const dirB = writePack(PACK_B);

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
  assertNoTraceOf(seenA, PACK_B, 'goi A');

  const serverB = await startServer(dirB);
  let seenB;
  try {
    seenB = await readBranding();
  } finally {
    await stopServer(serverB);
  }
  assertMatchesPack(seenB, PACK_B, 'goi B');
  // Trong tam: lan chay thu hai khong duoc con dau vet cua goi thu nhat.
  assertNoTraceOf(seenB, PACK_A, 'goi B');

  assert.equal(
    readFileSync(buildIdPath, 'utf8'),
    buildIdBefore,
    'BUILD_ID doi -> da build lai giua hai lan chay, phep chung minh khong con gia tri',
  );
  t.diagnostic(`BUILD_ID khong doi (${buildIdBefore.trim()}) — mot artifact cho ca hai khach`);
});
