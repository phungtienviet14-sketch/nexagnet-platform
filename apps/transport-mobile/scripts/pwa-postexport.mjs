#!/usr/bin/env node
/**
 * HOAN THIEN BAN XUAT WEB thanh PWA — chay NGAY SAU `expo export --platform web`:
 *
 *   node scripts/pwa-postexport.mjs [thu-muc-xuat]     (mac dinh: dist-web)
 *
 * 1. KIEM rang `expo export` da chep `public/` (manifest, icon, sw.js) va index.html co dau PWA —
 *    thieu la do NGAY o day, khong de mot ban "cai khong duoc" len may chu.
 * 2. TIEM vao `sw.js` ma ban dung + danh sach tien nap. Ma ban dung = bam SHA-256 cua index.html va
 *    NOI DUNG moi tep tien nap: doi mot byte o bo JS/icon/manifest -> cache moi -> SW moi -> nguoi
 *    dung duoc hoi cap nhat. Build lai y het -> cung ma (khong lam phien ai).
 *
 * Tien nap: vo (index.html), manifest, icon, favicon va MOI tep trong `_expo/static/` (JS/CSS da bam
 * ten). Font/anh trong `assets/` KHONG tien nap (ban xuat keo ca ~20 bo font icon, ~9MB); trang bao
 * cho SW nhung tep no THAT SU nap (`register-sw.web.ts`) va SW luu lai tu do.
 */
import { createHash } from 'node:crypto';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const MARKER = /\/\* __PWA_BUILD__ \*\/[\s\S]*?\/\* __PWA_BUILD_END__ \*\//;
const REQUIRED_FILES = [
  'index.html',
  'sw.js',
  'manifest.webmanifest',
  'favicon.ico',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon-180.png',
];
const REQUIRED_HEAD = [
  '<link rel="manifest" href="/manifest.webmanifest"',
  'name="apple-mobile-web-app-capable"',
  'rel="apple-touch-icon"',
  'viewport-fit=cover',
  '<html lang="vi">',
];
const SHELL_EXTRA = ['favicon.ico', 'icons/mark.svg', 'icons/favicon-48.png'];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const full = join(directory, entry.name);
      return entry.isDirectory() ? walk(full) : [full];
    }),
  );
  return nested.flat();
}

async function exists(path) {
  return stat(path).then(
    () => true,
    () => false,
  );
}

function fail(message) {
  process.stderr.write(`pwa-postexport: ${message}\n`);
  process.exit(1);
}

export async function finalizePwaExport(outputDir) {
  for (const file of REQUIRED_FILES) {
    if (!(await exists(join(outputDir, file)))) fail(`thiếu ${file} trong ${outputDir}`);
  }
  const html = await readFile(join(outputDir, 'index.html'), 'utf8');
  for (const needle of REQUIRED_HEAD) {
    if (!html.includes(needle)) fail(`index.html thiếu "${needle}" (public/index.html bị bỏ qua?)`);
  }
  if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(html)) {
    fail("index.html có <script> nội dòng — CSP script-src 'self' sẽ chặn nó");
  }

  const staticDir = join(outputDir, '_expo', 'static');
  const bundled = (await exists(staticDir)) ? await walk(staticDir) : [];
  const precacheFiles = [
    'index.html',
    'manifest.webmanifest',
    ...REQUIRED_FILES.filter((file) => file.startsWith('icons/')),
    ...SHELL_EXTRA,
    ...bundled.filter((file) => !file.endsWith('.map')).map((file) => relative(outputDir, file)),
  ];
  const unique = [...new Set(precacheFiles.map((file) => file.split(sep).join('/')))].sort();

  const hash = createHash('sha256');
  for (const file of unique) {
    hash.update(file);
    hash.update(await readFile(join(outputDir, file)));
  }
  const build = { id: hash.digest('hex').slice(0, 16), precache: unique.map((file) => `/${file}`) };

  const swPath = join(outputDir, 'sw.js');
  const sw = await readFile(swPath, 'utf8');
  if (!MARKER.test(sw)) fail('sw.js không còn dấu __PWA_BUILD__ … __PWA_BUILD_END__');
  // Giu nguyen hai dau: chay lai tren cung ban xuat thi thay dung cho do (idempotent).
  const injected = `/* __PWA_BUILD__ */ ${JSON.stringify(build)} /* __PWA_BUILD_END__ */`;
  await writeFile(swPath, sw.replace(MARKER, injected));
  return build;
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const outputDir = resolve(process.argv[2] ?? 'dist-web');
  const build = await finalizePwaExport(outputDir);
  process.stdout.write(
    `PWA: bản dựng ${build.id}, tiền nạp ${build.precache.length} tệp (${outputDir})\n`,
  );
}
