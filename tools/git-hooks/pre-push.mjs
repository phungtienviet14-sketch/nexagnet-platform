#!/usr/bin/env node
// Pre-push CUC BO — chi chay check NHANH theo vung vua sua. Regression day du la viec cua GitHub CI.
//
// Duoc goi boi shim `<git-common-dir>/hooks/pre-push` (sinh bang `pnpm hooks:install`).
// Git truyen argv = <remote name> <remote url>; stdin = moi dong mot ref:
//   <local ref> <local sha> <remote ref> <remote sha>
//
// KHONG BAO GIO chay o day (pre-push.test.mjs khoa dieu nay): `pnpm test`, `pnpm -r ...`, build,
// typecheck toan repo, Playwright, Postgres/Hatchet integration, Docker. Truoc 21/09/2026 hook
// TOAN CUC `~/.codex/git-hooks/pre-push` chay `lint → typecheck → test → build` toan monorepo moi
// lan push (~10-25 phut, output bi buffer nen trong nhu treo). Cac cong do nam o CI_GATES.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const TAG = '[pre-push]';
const ZERO_SHA = /^0+$/;
const LINTABLE = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const ESLINT_BIN = 'node_modules/eslint/bin/eslint.js';
const GUARDRAIL = 'tools/customer-source-guardrail/guardrail.mjs';
// Windows cat dong lenh o ~32k ky tu; chia lo ESLint duoi nguong nay.
const MAX_ARGS_CHARS = 8000;

/** 7 status check bat buoc cua `main` — noi DUY NHAT chay regression day du. */
export const CI_GATES = Object.freeze([
  'verify',
  'integration',
  'workflow-integration',
  'tenant-packs',
  'e2e',
  'audit',
  'images',
]);

/** Doc stdin cua pre-push; bo dong xoa nhanh (local sha toan so 0). */
export function parsePushLines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [localRef, localSha, remoteRef, remoteSha] = line.split(/\s+/);
      return { localRef, localSha, remoteRef, remoteSha };
    })
    .filter((u) => u.localSha && !ZERO_SHA.test(u.localSha));
}

/**
 * Diem goc de so: merge-base voi `<remote>/main` — tuc DUNG pham vi PR ma CI se cham, ke ca khi
 * nhanh moi hay vua force-push. Khong co `<remote>/main` thi lui ve sha dang co tren remote.
 * `git(args)` tra stdout (chuoi, co the rong) hoac null neu lenh loi.
 */
export function resolveBase(update, remote, git) {
  const mainRef = `refs/remotes/${remote}/main`;
  if (git(['rev-parse', '--verify', '--quiet', mainRef])) {
    const mergeBase = git(['merge-base', update.localSha, mainRef]);
    if (mergeBase) return mergeBase;
  }
  const remoteSha = update.remoteSha ?? '';
  if (remoteSha && !ZERO_SHA.test(remoteSha)) {
    if (git(['cat-file', '-e', `${remoteSha}^{commit}`]) !== null) return remoteSha;
  }
  return null;
}

/** Chia danh sach tep thanh lo sao cho tong do dai moi lo < maxChars. */
export function chunkByLength(items, maxChars = MAX_ARGS_CHARS) {
  const chunks = [];
  let current = [];
  let size = 0;
  for (const item of items) {
    if (current.length > 0 && size + item.length + 1 > maxChars) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(item);
    size += item.length + 1;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/**
 * Lap ke hoach check tu khoang commit + tep doi. Moi check la `node <args>` — khong shell, khong
 * pnpm — de ke hoach doc duoc va test khoa duoc.
 */
export function planChecks({ ranges, files, hasFile = existsSync }) {
  const changed = [...new Set(files.map((f) => f.replace(/\\/g, '/')))];
  const touches = (prefix) => changed.some((f) => f === prefix || f.startsWith(prefix));
  const checks = [];

  // Repo PUBLIC: byte da push len la nam vinh vien trong lich su cong khai. CI chi bat duoc SAU
  // khi da lo, nen day la cong duy nhat con chan duoc truoc.
  if (hasFile(GUARDRAIL)) {
    for (const range of ranges) {
      checks.push({
        id: 'customer-source-history',
        why: `nguon goc khach trong khoang ${range}`,
        args: [GUARDRAIL, '--range', range],
      });
    }
  }

  const lintable = changed.filter((f) => LINTABLE.test(f) && hasFile(f));
  if (lintable.length > 0) {
    const batches = chunkByLength(lintable);
    batches.forEach((batch, i) => {
      checks.push({
        id: 'eslint',
        why: `${batch.length} tep JS/TS doi${batches.length > 1 ? ` (lo ${i + 1}/${batches.length})` : ''}`,
        args: [ESLINT_BIN, '--no-warn-ignored', ...batch],
        needs: ESLINT_BIN,
      });
    });
  }

  if (touches('apps/api/src/') || touches('tools/source-manifest/') || touches('package.json')) {
    checks.push({
      id: 'source-manifest',
      why: 'bang nguon audit sinh tu AST apps/api/src phai con khop',
      args: ['--test', 'tools/source-manifest/manifest.test.mjs'],
    });
  }

  if (touches('deploy/')) {
    checks.push({
      id: 'deploy-routes',
      why: 'hop dong duong di Caddy',
      args: ['--test', 'deploy/netviet/caddy-route-contract.test.mjs'],
    });
  }

  if (touches('tools/git-hooks/')) {
    checks.push({
      id: 'git-hooks',
      why: 'tu kiem chinh hook nay',
      args: ['--test', 'tools/git-hooks/pre-push.test.mjs'],
    });
  }

  return checks;
}

// ---------------------------------------------------------------------------------------------
// Phan duoi day chi chay khi Git goi hook.

/**
 * Bien vi tri cua Git ma hook ke thua se THANG `cwd` trong moi lenh git con — tung lam mot fixture
 * ghi bay vao `.git/config` that. Go het truoc khi chay check.
 */
function checkEnv() {
  const env = { ...process.env };
  for (const key of [
    'GIT_DIR',
    'GIT_WORK_TREE',
    'GIT_INDEX_FILE',
    'GIT_PREFIX',
    'GIT_COMMON_DIR',
    'GIT_OBJECT_DIRECTORY',
    'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  ]) {
    delete env[key];
  }
  return env;
}

function git(args) {
  const r = spawnSync('git', args, { encoding: 'utf8', windowsHide: true });
  return r.status === 0 ? r.stdout.trim() : null;
}

function changedFiles(base, head) {
  // `-z`: khong trich dan ten tep co dau tieng Viet (core.quotePath).
  const out = git(['diff', '--name-only', '--diff-filter=ACMR', '-z', base, head]);
  return out ? out.split('\0').filter(Boolean) : [];
}

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function runCheck(check, env) {
  if (check.needs && !existsSync(check.needs)) {
    console.log(
      `${TAG} BO QUA ${check.id}: thieu ${check.needs} (chua pnpm install trong worktree nay)`,
    );
    return { ...check, status: 'skipped', ms: 0 };
  }
  const started = Date.now();
  console.log(`${TAG} ${check.id} — ${check.why}`);
  const r = spawnSync(process.execPath, check.args, { stdio: 'inherit', env, windowsHide: true });
  return { ...check, status: r.status === 0 ? 'ok' : 'failed', ms: Date.now() - started };
}

function main() {
  if (process.env.ECC_SKIP_GIT_HOOKS === '1' || process.env.ECC_SKIP_PREPUSH === '1') {
    console.log(`${TAG} bo qua theo ECC_SKIP_GIT_HOOKS/ECC_SKIP_PREPUSH=1`);
    return 0;
  }

  const remote = process.argv[2] || 'origin';
  const updates = parsePushLines(readStdin());
  if (updates.length === 0) return 0; // chi xoa nhanh

  const ranges = [];
  const files = [];
  for (const update of updates) {
    const base = resolveBase(update, remote, git);
    if (!base) {
      console.log(
        `${TAG} khong xac dinh duoc diem goc cho ${update.localRef} — bo qua check theo tep`,
      );
      continue;
    }
    ranges.push(`${base}..${update.localSha}`);
    files.push(...changedFiles(base, update.localSha));
  }

  const started = Date.now();
  const env = checkEnv();
  const results = planChecks({ ranges: [...new Set(ranges)], files }).map((c) => runCheck(c, env));

  for (const r of results) {
    console.log(`${TAG}   ${r.status.padEnd(7)} ${r.id} ${r.ms}ms`);
  }
  console.log(
    `${TAG} ${results.length} check, ${Date.now() - started}ms. KHONG chay o day: pnpm test/build/` +
      `typecheck toan repo, Playwright, Postgres/Hatchet IT, Docker — regression day du la cua CI ` +
      `(${CI_GATES.join(', ')}).`,
  );

  const failed = results.filter((r) => r.status === 'failed');
  if (failed.length > 0) {
    console.error(`${TAG} FAILED: ${failed.map((r) => r.id).join(', ')} — sua roi push lai.`);
    return 1;
  }
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exit(main());
}
