#!/usr/bin/env node
// Cai hook git CUC BO cho repo nay — MOT lan cho moi clone; moi worktree dung chung.
//
//   pnpm hooks:install            ghi shim + dat core.hooksPath cuc bo
//   pnpm hooks:install --check    chi kiem; exit 1 neu chua cai hoac shim da cu
//
// Vi sao can: `core.hooksPath` TOAN CUC (vd `~/.codex/git-hooks` cua ECC) thang `.git/hooks`, va
// pre-push o do chay lint + typecheck + test + build toan monorepo moi lan push. Dat
// `core.hooksPath` o scope `--local` thi thang scope toan cuc — CHI cho repo nay, khong dung toi
// repo khac tren may.
//
// Vi sao shim nam o `<git-common-dir>/hooks` chu khong tro thang vao `tools/git-hooks/`: cau hinh
// `--local` dung CHUNG cho moi worktree, con duong dan tuong doi lai phan giai theo tung worktree —
// worktree o nhanh cu chua co `tools/git-hooks/` se mat LUON bo quet secret pre-commit. Shim o thu
// muc chung thi nhanh nao cung co hook; phan logic van co phien ban trong repo.

import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const TAG = '[hooks:install]';
export const MARKER = '# nexagnet-git-hooks v1';
const HEADER = `#!/usr/bin/env bash
${MARKER} — sinh boi tools/git-hooks/install.mjs; sua o do roi chay lai \`pnpm hooks:install\`.
`;

export function renderPrePushShim() {
  return `${HEADER}# Chuyen cho logic CO PHIEN BAN cua worktree dang push. Nhanh cu chua co tep do thi khong chay
# gi: regression day du la viec cua GitHub CI, khong phai cua may nay.
root="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
if [ -f "$root/tools/git-hooks/pre-push.mjs" ]; then
  exec node "$root/tools/git-hooks/pre-push.mjs" "$@"
fi
echo "[pre-push] nhanh nay chua co tools/git-hooks/pre-push.mjs — khong chay check cuc bo; CI la cong regression." >&2
exit 0
`;
}

/** Chuyen tiep sang hook cung ten o core.hooksPath TOAN CUC (vd bo quet secret pre-commit cua ECC). */
export function renderDelegateShim(name) {
  return `${HEADER}# core.hooksPath cuc bo che hook TOAN CUC cung ten; chuyen tiep de no van chay.
global="$(git config --global --type=path --get core.hooksPath 2>/dev/null || true)"
own="$(git config --local --type=path --get core.hooksPath 2>/dev/null || true)"
if [ -n "$global" ] && [ "$global" != "$own" ] && [ -f "$global/${name}" ]; then
  exec "$global/${name}" "$@"
fi
exit 0
`;
}

/** pre-push luon la cua repo; moi hook khac co o thu muc toan cuc thi chuyen tiep. */
export function desiredShims(globalHookNames) {
  const shims = { 'pre-push': renderPrePushShim() };
  for (const name of globalHookNames) {
    if (name !== 'pre-push' && /^[a-z-]+$/.test(name)) shims[name] = renderDelegateShim(name);
  }
  return shims;
}

const normalize = (p) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

/**
 * Phan loai `core.hooksPath` ghim o scope WORKTREE (`config.worktree` — THANG scope local). Claude
 * Code chep gia tri dang hieu luc vao day luc tao worktree, nen 46/55 worktree tung ghim hook TOAN
 * CUC: chi cai o scope local thi push trong cac worktree do van chay full suite.
 * `stale` = ghim dung thu muc toan cuc → go an toan. `custom` = gia tri khac → chi canh bao.
 */
export function classifyWorktreePins(pins, { hooksPath, globalDir }) {
  const stale = [];
  const custom = [];
  for (const pin of pins) {
    if (!pin.value || normalize(pin.value) === normalize(hooksPath)) continue;
    if (globalDir && normalize(pin.value) === normalize(globalDir)) stale.push(pin);
    else custom.push(pin);
  }
  return { stale, custom };
}

function gitGet(args) {
  try {
    return (
      execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() ||
      null
    );
  } catch {
    return null;
  }
}

function readWorktreePins(commonDir) {
  const files = [path.join(commonDir, 'config.worktree')];
  const dir = path.join(commonDir, 'worktrees');
  if (existsSync(dir)) {
    for (const name of readdirSync(dir)) files.push(path.join(dir, name, 'config.worktree'));
  }
  return files
    .filter((file) => existsSync(file))
    .map((file) => ({ file, value: gitGet(['config', '-f', file, '--get', 'core.hooksPath']) }));
}

function inspect(commonDir) {
  const hooksPath = path.join(commonDir, 'hooks').split(path.sep).join('/');
  const globalDir = gitGet(['config', '--global', '--type=path', '--get', 'core.hooksPath']);
  const globalNames =
    globalDir && normalize(globalDir) !== normalize(hooksPath) && existsSync(globalDir)
      ? readdirSync(globalDir)
      : [];
  const shims = desiredShims(globalNames);
  const pins = classifyWorktreePins(readWorktreePins(commonDir), { hooksPath, globalDir });
  const current = gitGet(['config', '--local', '--get', 'core.hooksPath']);

  const problems = [];
  const foreign = [];
  if (current !== hooksPath) {
    problems.push(`core.hooksPath cuc bo = ${current ?? '(chua dat)'}; can ${hooksPath}`);
  }
  for (const [name, body] of Object.entries(shims)) {
    const file = path.join(hooksPath, name);
    const have = existsSync(file) ? readFileSync(file, 'utf8') : null;
    if (have !== body) problems.push(`${name}: ${have === null ? 'chua co' : 'khac ban hien tai'}`);
    if (have !== null && !have.includes(MARKER)) foreign.push(file);
  }
  for (const pin of pins.stale) problems.push(`${pin.file}: ghim hook toan cuc ${pin.value}`);
  for (const pin of pins.custom)
    problems.push(`${pin.file}: ghim ${pin.value} (khong tu go — kiem tay)`);
  return { hooksPath, globalDir, shims, pins, problems, foreign };
}

function main(argv) {
  const commonDir = gitGet(['rev-parse', '--path-format=absolute', '--git-common-dir']);
  if (!commonDir) {
    console.error(`${TAG} khong o trong repo git`);
    return 1;
  }
  const { hooksPath, globalDir, shims, pins, problems, foreign } = inspect(commonDir);

  if (argv.includes('--check')) {
    for (const p of problems) console.log(`${TAG} ${p}`);
    console.log(`${TAG} ${problems.length === 0 ? 'OK' : 'CHUA DAT — chay `pnpm hooks:install`'}`);
    return problems.length === 0 ? 0 : 1;
  }
  if (foreign.length > 0 && !argv.includes('--force')) {
    console.error(`${TAG} hook tu viet (khong co marker), khong ghi de: ${foreign.join(', ')}`);
    console.error(`${TAG} chay lai voi --force neu chac chan.`);
    return 1;
  }

  mkdirSync(hooksPath, { recursive: true });
  for (const [name, body] of Object.entries(shims)) {
    const file = path.join(hooksPath, name);
    writeFileSync(file, body, 'utf8');
    chmodSync(file, 0o755);
  }
  execFileSync('git', ['config', '--local', 'core.hooksPath', hooksPath]);
  for (const pin of pins.stale) {
    execFileSync('git', ['config', '-f', pin.file, '--unset', 'core.hooksPath']);
  }
  console.log(`${TAG} core.hooksPath (local) = ${hooksPath}`);
  console.log(
    `${TAG} shim: ${Object.keys(shims).join(', ')}${globalDir ? ` (chuyen tiep toan cuc: ${globalDir})` : ''}`,
  );
  console.log(`${TAG} go ${pins.stale.length} ghim worktree tro vao hook toan cuc`);
  for (const pin of pins.custom)
    console.log(`${TAG} CANH BAO: ${pin.file} ghim ${pin.value} — kiem tay`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exit(main(process.argv.slice(2)));
}
