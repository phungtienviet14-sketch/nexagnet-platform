/**
 * WORKTREE LA CUA DISPATCHER, KHONG PHAI CUA CLAUDE.
 *
 * Neu de tien trinh Claude tu chon cho lam viec thi "nhanh moi tu main moi nhat" tro thanh mot
 * loi HUA, va mot loi hua thi khong kiem duoc. O day no la mot chuoi buoc do duoc: SHA lay tu
 * `origin/<base>` vua fetch, nhanh phai CHUA TON TAI, thu muc phai CHUA TON TAI, va sau khi tao
 * xong HEAD phai bang dung SHA do va cay phai sach. Khong dat mot dieu kien nao thi DUNG.
 *
 * Danh sach lenh git o day la co dinh va khong co lenh nao viet lai lich su: khong `reset --hard`,
 * khong `clean`, khong `stash`, khong `rebase`, khong `push --force`. Mot dispatcher chay khong
 * co nguoi ngoi canh khong duoc cam nhung con dao do. Co mot bai test tinh doc chinh tep nay va
 * bat neu chung xuat hien.
 */
import fs from 'node:fs';
import { REASONS, deny } from './errors.mjs';

const SHA40_PATTERN = /^[0-9a-f]{40}$/;

/**
 * Bien moi truong CUA GIT noi cho repo nam o dau. Neu dispatcher duoc goi tu ben trong mot lenh
 * git khac — mot hook `pre-push`, mot `git rebase --exec`, mot GUI — thi nhung bien nay DA duoc
 * dat san, va moi lenh git con se lam viec tren repo CUA NGUOI GOI thay vi tren cai ta chi dinh
 * bang `cwd`.
 *
 * Do khong phai gia thuyet: bo test cua chinh package nay tao mot repo tam roi `git init` no, va
 * khi chay duoi `pre-push` no da di sua `.git/config` cua REPO THAT. Mot dispatcher tao worktree
 * nham repo la mot loi nang hon nhieu.
 *
 * Chi go nhung bien noi VI TRI. `GIT_SSH_COMMAND`, `GIT_TERMINAL_PROMPT`, ... la cau hinh xac
 * thuc cua nguoi van hanh va phai duoc giu.
 */
const GIT_LOCATION_ENV = Object.freeze([
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_COMMON_DIR',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_NAMESPACE',
  'GIT_PREFIX',
  'GIT_CEILING_DIRECTORIES',
  'GIT_CONFIG',
  'GIT_CONFIG_COUNT',
]);

/**
 * Ban sao moi truong da go cac bien vi tri cua git.
 * @param {NodeJS.ProcessEnv} [base]
 * @returns {NodeJS.ProcessEnv}
 */
export function gitSafeEnv(base = process.env) {
  const env = { ...base };
  for (const key of GIT_LOCATION_ENV) delete env[key];
  return env;
}

/**
 * @param {{ exec: import('./exec.mjs').ExecFn, cwd: string, gitBin?: string }} deps
 */
export function createGit(deps) {
  const bin = deps.gitBin ?? 'git';
  const env = gitSafeEnv();
  /**
   * @param {ReadonlyArray<string>} args
   * @param {{ cwd?: string }} [options]
   */
  const run = (args, options = {}) =>
    deps.exec(bin, args, { cwd: options.cwd ?? deps.cwd, timeoutMs: 180_000, env });
  return { run, bin, cwd: deps.cwd };
}

/** @typedef {ReturnType<typeof createGit>} Git */

/**
 * Fetch roi doc SHA CHINH XAC cua nhanh nen tren remote. Doc `refs/remotes/<remote>/<base>` chu
 * khong doc `HEAD` cuc bo: cai thu hai la thu may nay dang co, khong phai thu GitHub dang co.
 * @param {Git} git
 * @param {{ remote: string, baseBranch: string }} input
 */
export async function resolveBaseSha(git, { remote, baseBranch }) {
  const fetched = await git.run(['fetch', remote, '--prune']);
  if (!fetched.ok) {
    return deny(REASONS.GIT_COMMAND_FAILED, { step: 'fetch', exitCode: fetched.code });
  }
  const resolved = await git.run(['rev-parse', `refs/remotes/${remote}/${baseBranch}`]);
  if (!resolved.ok) {
    return deny(REASONS.BASE_SHA_UNRESOLVED, { remote, baseBranch, exitCode: resolved.code });
  }
  const sha = resolved.stdout.trim();
  if (!SHA40_PATTERN.test(sha)) return deny(REASONS.BASE_SHA_UNRESOLVED, { remote, baseBranch });
  return { ok: /** @type {const} */ (true), baseSha: sha };
}

/**
 * Kiem cac dieu kien "chua ton tai" TRUOC khi cham vao he tep. Tach rieng de che do ke hoach
 * chay duoc dung phep kiem nay ma khong tao gi.
 * @param {Git} git
 * @param {{ branch: string, worktreePath: string, remote: string }} plan
 * @param {{ existsSync?: (p: string) => boolean }} [io]
 */
export async function checkWorktreePreconditions(git, plan, io = {}) {
  const exists = io.existsSync ?? fs.existsSync;
  const shaped = await git.run(['check-ref-format', '--branch', plan.branch]);
  if (!shaped.ok) return deny(REASONS.BRANCH_NAME_INVALID, { branch: plan.branch });

  const local = await git.run(['rev-parse', '--verify', '--quiet', `refs/heads/${plan.branch}`]);
  if (local.ok && local.stdout.trim() !== '') {
    return deny(REASONS.BRANCH_EXISTS_LOCAL, { branch: plan.branch });
  }
  const remote = await git.run(['ls-remote', '--heads', plan.remote, plan.branch]);
  if (!remote.ok) {
    return deny(REASONS.GIT_COMMAND_FAILED, { step: 'ls-remote', exitCode: remote.code });
  }
  if (remote.stdout.trim() !== '') {
    return deny(REASONS.BRANCH_EXISTS_REMOTE, { branch: plan.branch });
  }
  if (exists(plan.worktreePath)) return deny(REASONS.WORKTREE_PATH_EXISTS);
  return { ok: /** @type {const} */ (true) };
}

/**
 * Tao worktree MOI TINH roi CHUNG MINH no dung: HEAD bang base, cay sach.
 * @param {Git} git
 * @param {{ branch: string, worktreePath: string, baseSha: string, remote: string }} plan
 * @param {{ existsSync?: (p: string) => boolean }} [io]
 */
export async function createWorktree(git, plan, io = {}) {
  const pre = await checkWorktreePreconditions(git, plan, io);
  if (!pre.ok) return pre;

  const added = await git.run([
    'worktree',
    'add',
    '-b',
    plan.branch,
    plan.worktreePath,
    plan.baseSha,
  ]);
  if (!added.ok) {
    return deny(REASONS.GIT_COMMAND_FAILED, { step: 'worktree-add', exitCode: added.code });
  }

  const head = await git.run(['rev-parse', 'HEAD'], { cwd: plan.worktreePath });
  if (!head.ok || head.stdout.trim() !== plan.baseSha) {
    return deny(REASONS.WORKTREE_HEAD_MISMATCH, { want: plan.baseSha, got: head.stdout.trim() });
  }
  const status = await git.run(['status', '--porcelain=v1'], { cwd: plan.worktreePath });
  if (!status.ok) {
    return deny(REASONS.GIT_COMMAND_FAILED, { step: 'status', exitCode: status.code });
  }
  if (status.stdout.trim() !== '') return deny(REASONS.WORKTREE_DIRTY);

  return { ok: /** @type {const} */ (true), worktreePath: plan.worktreePath, head: plan.baseSha };
}
