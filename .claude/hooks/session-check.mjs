#!/usr/bin/env node
// SessionStart check — CHI DOC, KHONG SUA GI.
//
// Muc dich: mot phien lam viec trong worktree moi thuong do o cho khong lien quan den diff
// (thieu node_modules cua goi le, thieu Prisma client, thieu dist cua @netviet/tenant).
// Hook nay CHI BAO, khong tu chay install/build/test, khong dung mang, khong dung Docker.
//
// Bat buoc: luon exit 0. Observability/kiem tra khong duoc la dieu kien de phien lam viec chay.

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HOOK_TAG = '[worktree-check]';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..'); // <root>/.claude/hooks -> <root>

const lines = [];
const todo = [];
const say = (s) => lines.push(s);

/** Chay mot lenh ngan, co tran thoi gian. Khong bao gio nem. */
function run(cmd, args, timeout = 5000) {
  try {
    const r = spawnSync(cmd, args, {
      cwd: root,
      timeout,
      encoding: 'utf8',
      shell: process.platform === 'win32',
      windowsHide: true,
    });
    if (r.status !== 0 || typeof r.stdout !== 'string') return null;
    return r.stdout.trim();
  } catch {
    return null;
  }
}

function readJson(p) {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

try {
  const pkg = readJson(path.join(root, 'package.json')) ?? {};

  // --- 1. Checkout: worktree hay ban chinh -------------------------------------------------
  // Trong worktree, `.git` la mot TEP tro ve gitdir, khong phai thu muc.
  const gitPath = path.join(root, '.git');
  const isWorktree = existsSync(gitPath) && !existsSync(path.join(gitPath, 'HEAD'));
  const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD']) ?? '?';
  say(`${HOOK_TAG} ${isWorktree ? 'WORKTREE' : 'checkout chinh'} · nhanh ${branch}`);
  say(`  duong dan: ${root}`);

  // --- 2. Node -----------------------------------------------------------------------------
  const wantNode = String(pkg.engines?.node ?? '>=22').replace(/[^\d.]/g, '') || '22';
  const haveNodeMajor = Number(process.versions.node.split('.')[0]);
  const wantNodeMajor = Number(wantNode.split('.')[0]);
  const nodeOk = Number.isFinite(haveNodeMajor) && haveNodeMajor >= wantNodeMajor;
  say(`  node ${process.version} (can >=${wantNodeMajor}) ${nodeOk ? 'OK' : 'KHONG DAT'}`);

  // --- 3. pnpm -----------------------------------------------------------------------------
  const pinned = String(pkg.packageManager ?? '').split('@')[1] ?? null;
  const pnpmVersion = run('pnpm', ['--version']);
  if (!pnpmVersion) {
    say('  pnpm KHONG GOI DUOC — kiem tra PATH / corepack');
  } else if (pinned && pnpmVersion !== pinned) {
    say(`  pnpm ${pnpmVersion} — package.json ghim ${pinned} (lech)`);
  } else {
    say(`  pnpm ${pnpmVersion}${pinned ? ` (khop ghim ${pinned})` : ''} OK`);
  }

  // --- 4. Dependency da cai chua -----------------------------------------------------------
  // pnpm cai node_modules RIENG cho tung goi. Thieu goi le tung lam pre-push do o package
  // ma diff khong he cham toi, nen kiem ca goc lan vai goi dai dien.
  const needDirs = ['node_modules', 'apps/api/node_modules', 'packages/tenant/node_modules'];
  const missingDeps = needDirs.filter((d) => !existsSync(path.join(root, d)));
  if (missingDeps.length > 0) {
    say(`  dependency: THIEU (${missingDeps.join(', ')})`);
    todo.push('pnpm install --frozen-lockfile');
  } else {
    say('  dependency: da cai');
  }

  // --- 5. Prisma client da sinh chua -------------------------------------------------------
  // pnpm 10 chan postinstall cua Prisma -> phai `prisma generate` TAY. Thieu buoc nay thi
  // typecheck do hang loat "PrismaClient is not exported", trong nhu loi do minh gay ra.
  // Ban sinh nam canh @prisma/client trong store, nen di theo symlink thay vi doan duong dan.
  let prismaReady = false;
  const clientLink = path.join(root, 'apps/api/node_modules/@prisma/client');
  if (existsSync(clientLink)) {
    try {
      const real = realpathSync(clientLink); // <store>/node_modules/@prisma/client
      const nm = path.resolve(real, '..', '..'); // <store>/node_modules
      prismaReady = existsSync(path.join(nm, '.prisma/client/index.d.ts'));
    } catch {
      prismaReady = false;
    }
  }
  if (missingDeps.length === 0) {
    say(`  prisma client: ${prismaReady ? 'da sinh' : 'CHUA SINH'}`);
    if (!prismaReady) todo.push('pnpm --filter @netviet/api exec prisma generate');
  }

  // --- 6. @netviet/tenant da build chua ----------------------------------------------------
  // typecheck/e2e doc dist cua goi nay; dist cu hoac thieu bao loi kieu "X does not exist"
  // nghe nhu code hong, thuc ra chi la chua build.
  const tenantDist = existsSync(path.join(root, 'packages/tenant/dist/index.js'));
  if (missingDeps.length === 0) {
    say(`  @netviet/tenant dist: ${tenantDist ? 'co' : 'CHUA BUILD'}`);
    if (!tenantDist) todo.push('pnpm --filter "@netviet/tenant..." build');
  }

  // --- 7. Nhac ve dich vu DUNG CHUNG -------------------------------------------------------
  // docker-compose.yml o goc bind cong 5432/6379 tren HOST: mot Postgres/Redis dung chung cho
  // MOI worktree. Khoi dong/migrate no tu mot lane se dam vao lane khac.
  if (isWorktree) {
    say('  luu y: docker-compose.yml goc dung cong 5432/6379 CHUNG cho moi worktree —');
    say('         khong tu bat/migrate no tu mot lane.');
  }

  if (todo.length > 0) {
    say('  can chay TRUOC khi build/test/push (theo dung thu tu):');
    for (const t of todo) say(`    ${t}`);
  }
} catch (err) {
  // Fail-open: bao mot dong, khong bao gio chan phien lam viec.
  lines.length = 0;
  lines.push(`${HOOK_TAG} bo qua (loi kiem tra): ${err?.message ?? String(err)}`);
}

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: lines.join('\n'),
    },
  }),
);
process.exit(0);
