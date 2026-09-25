import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * UNG DUNG DI DONG KHONG DUOC LAN SANG DO THI PHU THUOC CUA MAY CHU (#394).
 *
 * `apps/transport-mobile` keo theo ca cay Expo/React Native. Do 25/09/2026: khong co
 * `.pnpmfile.cjs`, pnpm dung chinh cay do de thoa peer TUY CHON cua adminjs (react-native), next
 * (babel-plugin-react-compiler) va vite (lightningcss, terser) — nen image may chu keo react-native
 * + metro vao du khong dong ma nao nap chung. Bai nay khoa ba lop cua cach sua:
 *
 *   1. lockfile: KHONG importer nao ngoai app di dong nhac toi mot goi cua cay Expo;
 *   2. hook: go DUNG peer tuy chon, khong dung peer bat buoc, khong dung goi khac;
 *   3. Docker: stage `deps` COPY `.pnpmfile.cjs` (thieu la `--frozen-lockfile` tu choi), va build
 *      context loai ma nguon di dong.
 *
 * Doc tep bang van ban thuan — khong can parser YAML — vi thu can khang dinh la "chuoi nay KHONG
 * xuat hien trong khoi nay", va mot parser sai se lam bai xanh gia.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MOBILE_IMPORTER = 'apps/transport-mobile';
const EXPO_TREE_MARKERS = [
  'react-native@',
  'expo@',
  'babel-plugin-react-compiler@',
  'lightningcss@',
  'terser@',
];

/** Tach khoi `importers:` cua pnpm-lock.yaml thanh { ten importer -> van ban cua khoi }. */
function importerBlocks(lockText) {
  const lines = lockText.split('\n');
  const start = lines.indexOf('importers:');
  assert.notEqual(start, -1, 'pnpm-lock.yaml phai co khoi importers:');
  const blocks = new Map();
  let current = null;
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break; // khoa cap cao tiep theo (packages:) — het khoi importers
    const header = /^ {2}(\S[^:]*):\s*$/.exec(line);
    if (header) {
      current = header[1].replace(/^'|'$/g, '');
      blocks.set(current, []);
      continue;
    }
    if (current) blocks.get(current).push(line);
  }
  return new Map([...blocks].map(([name, body]) => [name, body.join('\n')]));
}

const lockText = readFileSync(join(ROOT, 'pnpm-lock.yaml'), 'utf8');

test('lockfile: app di dong la importer rieng va co mang cay Expo', () => {
  const blocks = importerBlocks(lockText);
  assert.ok(blocks.has(MOBILE_IMPORTER), `${MOBILE_IMPORTER} phai la mot importer cua workspace`);
  assert.match(blocks.get(MOBILE_IMPORTER), /react-native@/);
});

test('lockfile: KHONG importer nao khac nhac toi mot goi cua cay Expo', () => {
  const blocks = importerBlocks(lockText);
  assert.ok(blocks.has('apps/api'), 'khoi importers phai doc duoc apps/api');
  const leaks = [];
  for (const [name, body] of blocks) {
    if (name === MOBILE_IMPORTER) continue;
    for (const marker of EXPO_TREE_MARKERS) {
      if (body.includes(marker)) leaks.push(`${name} -> ${marker}`);
    }
  }
  assert.deepEqual(leaks, [], `peer tuy chon da lan tu cay Expo sang: ${leaks.join(', ')}`);
});

test('lockfile: ghi checksum cua .pnpmfile.cjs (thieu tep thi frozen install tu choi)', () => {
  assert.match(lockText, /^pnpmfileChecksum: sha256-/m);
});

const require = createRequire(import.meta.url);
const { hooks, OPTIONAL_PEERS_TO_DROP } = require(join(ROOT, '.pnpmfile.cjs'));

test('hook: go dung peer TUY CHON cua dung goi, giu nguyen phan con lai', () => {
  const out = hooks.readPackage({
    name: 'react-redux',
    peerDependencies: { react: '^18', 'react-native': '>=0.59', redux: '^5' },
    peerDependenciesMeta: { 'react-native': { optional: true }, redux: { optional: true } },
  });
  assert.deepEqual(out.peerDependencies, { react: '^18', redux: '^5' });
  assert.deepEqual(out.peerDependenciesMeta, { redux: { optional: true } });
});

test('hook: KHONG go mot peer BAT BUOC du trung ten (go se thanh loi luc chay, im lang)', () => {
  const manifest = {
    name: 'next',
    peerDependencies: { 'babel-plugin-react-compiler': '*' },
    peerDependenciesMeta: {},
  };
  assert.equal(hooks.readPackage(manifest), manifest);
});

test('hook: goi ngoai danh sach di qua nguyen ven', () => {
  const manifest = {
    name: 'react-native-screens',
    peerDependencies: { 'react-native': '*' },
    peerDependenciesMeta: { 'react-native': { optional: true } },
  };
  assert.equal(hooks.readPackage(manifest), manifest);
  assert.ok(!('react-native-screens' in OPTIONAL_PEERS_TO_DROP));
});

test('Docker: stage deps COPY .pnpmfile.cjs cung lockfile', () => {
  const dockerfile = readFileSync(join(ROOT, 'deploy/netviet/Dockerfile'), 'utf8');
  const deps = dockerfile.split(/^FROM /m).find((stage) => /\bAS deps\b/.test(stage));
  assert.ok(deps, 'Dockerfile phai co stage deps');
  const copyBeforeInstall = deps.slice(0, deps.indexOf('pnpm install'));
  assert.match(copyBeforeInstall, /^COPY [^\n]*\.pnpmfile\.cjs/m);
});

test('Docker: build context loai ma nguon di dong', () => {
  const ignore = readFileSync(join(ROOT, '.dockerignore'), 'utf8').split('\n');
  assert.ok(ignore.map((line) => line.trim()).includes(MOBILE_IMPORTER));
});
