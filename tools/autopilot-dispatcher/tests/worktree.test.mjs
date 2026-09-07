/**
 * Worktree, chung minh tren MOT REPO GIT THAT (remote bare + ban sao lam viec trong thu muc tam).
 * Gia lap `git` o day se chi chung minh duoc rang mot doi tuong gia tra ve dung thu no duoc day.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { execFile } from '../src/exec.mjs';
import { REASONS } from '../src/errors.mjs';
import {
  checkWorktreePreconditions,
  createGit,
  createWorktree,
  resolveBaseSha,
} from '../src/worktree-manager.mjs';
import { makeGitRepo, removeDir, tempDir } from './helpers.mjs';

/** @param {import('node:test').TestContext} t */
function repoFixture(t) {
  const dir = tempDir('git');
  t.after(() => removeDir(dir));
  const repo = makeGitRepo(dir);
  const git = createGit({ exec: execFile, cwd: repo.work });
  const worktreeRoot = path.join(dir, 'worktrees');
  fs.mkdirSync(worktreeRoot, { recursive: true });
  return { dir, repo, git, worktreeRoot };
}

test('the base SHA comes from a freshly fetched remote ref, not from local HEAD', async (t) => {
  const { repo, git } = repoFixture(t);
  const resolved = await resolveBaseSha(git, { remote: 'origin', baseBranch: 'main' });
  assert.equal(resolved.ok, true);
  assert.match(resolved.baseSha, /^[0-9a-f]{40}$/);
  assert.equal(resolved.baseSha, repo.baseSha);
});

test('an unknown base branch is a typed refusal', async (t) => {
  const { git } = repoFixture(t);
  const resolved = await resolveBaseSha(git, { remote: 'origin', baseBranch: 'no-such-branch' });
  assert.equal(resolved.ok, false);
  assert.equal(resolved.reason, REASONS.BASE_SHA_UNRESOLVED);
});

test('a fresh worktree is created once, at the exact base SHA, and is clean', async (t) => {
  const { repo, git, worktreeRoot } = repoFixture(t);
  const plan = {
    branch: 'claude/autopilot/issue-1-aaaaaaaaaaaa',
    worktreePath: path.join(worktreeRoot, 'issue-1-aaaaaaaaaaaa'),
    baseSha: repo.baseSha,
    remote: 'origin',
  };

  const created = await createWorktree(git, plan);
  assert.equal(created.ok, true);
  assert.equal(created.head, repo.baseSha);

  const head = await git.run(['rev-parse', 'HEAD'], { cwd: plan.worktreePath });
  assert.equal(head.stdout.trim(), repo.baseSha);
  const status = await git.run(['status', '--porcelain=v1'], { cwd: plan.worktreePath });
  assert.equal(status.stdout.trim(), '');
  const branch = await git.run(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: plan.worktreePath });
  assert.equal(branch.stdout.trim(), plan.branch);
});

test('a second attempt on the same branch is refused instead of reusing it', async (t) => {
  const { repo, git, worktreeRoot } = repoFixture(t);
  const plan = {
    branch: 'claude/autopilot/issue-2-bbbbbbbbbbbb',
    worktreePath: path.join(worktreeRoot, 'issue-2-bbbbbbbbbbbb'),
    baseSha: repo.baseSha,
    remote: 'origin',
  };
  assert.equal((await createWorktree(git, plan)).ok, true);

  const again = await createWorktree(git, {
    ...plan,
    worktreePath: path.join(worktreeRoot, 'issue-2-different-dir'),
  });
  assert.equal(again.ok, false);
  assert.equal(again.reason, REASONS.BRANCH_EXISTS_LOCAL);
});

test('an existing worktree directory is refused instead of being reused', async (t) => {
  const { repo, git, worktreeRoot } = repoFixture(t);
  const worktreePath = path.join(worktreeRoot, 'issue-3-cccccccccccc');
  fs.mkdirSync(worktreePath, { recursive: true });
  fs.writeFileSync(path.join(worktreePath, 'leftover.txt'), 'from an earlier run\n');

  const result = await createWorktree(git, {
    branch: 'claude/autopilot/issue-3-cccccccccccc',
    worktreePath,
    baseSha: repo.baseSha,
    remote: 'origin',
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, REASONS.WORKTREE_PATH_EXISTS);
  assert.equal(fs.existsSync(path.join(worktreePath, 'leftover.txt')), true);
});

test('a branch that already exists on the remote is refused', async (t) => {
  const { repo, git, worktreeRoot } = repoFixture(t);
  const branch = 'claude/autopilot/issue-4-dddddddddddd';
  await git.run(['push', 'origin', `${repo.baseSha}:refs/heads/${branch}`]);

  const result = await createWorktree(git, {
    branch,
    worktreePath: path.join(worktreeRoot, 'issue-4-dddddddddddd'),
    baseSha: repo.baseSha,
    remote: 'origin',
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, REASONS.BRANCH_EXISTS_REMOTE);
});

test('a malformed branch name never reaches git worktree add', async (t) => {
  const { repo, git, worktreeRoot } = repoFixture(t);
  for (const branch of ['claude/autopilot/..evil', 'has space', '-leading-dash', 'ends.lock']) {
    const worktreePath = path.join(worktreeRoot, 'never-created');
    const result = await checkWorktreePreconditions(git, {
      branch,
      worktreePath,
      remote: 'origin',
    });
    assert.equal(result.ok, false, `expected ${branch} to be refused`);
    assert.equal(result.reason, REASONS.BRANCH_NAME_INVALID);
    assert.equal(fs.existsSync(worktreePath), false);
  }
  assert.equal(repo.baseSha.length, 40);
});

test('a worktree path with spaces and unicode is created and verified correctly', async (t) => {
  const { repo, git, dir } = repoFixture(t);
  const root = path.join(dir, 'work trees có dấu');
  fs.mkdirSync(root, { recursive: true });
  const plan = {
    branch: 'claude/autopilot/issue-5-eeeeeeeeeeee',
    worktreePath: path.join(root, 'issue-5-eeeeeeeeeeee'),
    baseSha: repo.baseSha,
    remote: 'origin',
  };
  const created = await createWorktree(git, plan);
  assert.equal(created.ok, true);
  assert.equal(fs.existsSync(path.join(plan.worktreePath, 'README.md')), true);
});

test('the worktree is preserved after use — nothing deletes evidence', async (t) => {
  const { repo, git, worktreeRoot } = repoFixture(t);
  const plan = {
    branch: 'claude/autopilot/issue-6-ffffffffffff',
    worktreePath: path.join(worktreeRoot, 'issue-6-ffffffffffff'),
    baseSha: repo.baseSha,
    remote: 'origin',
  };
  await createWorktree(git, plan);
  assert.equal(fs.existsSync(plan.worktreePath), true);
  assert.equal(fs.existsSync(path.join(plan.worktreePath, 'README.md')), true);
});
