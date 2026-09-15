/**
 * Ranh gioi tien trinh, chung minh bang MOT TIEN TRINH THAT.
 *
 * Cac bai o day khong gia lap `spawn`. Chung phong mot executable that (node chay mot script ghi
 * lai argv/cwd/stdin cua chinh no) roi doc lai ban ghi do. Mot bai test doi voi `shell: false` ma
 * chi kiem mot doi tuong tuy chon thi chi chung minh duoc mot doi tuong; muon chung minh cu phap
 * shell khong duoc dien giai thi phai co mot tien trinh that khong dien giai no.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { buildClaudeArgv, launchClaude } from '../src/claude-launcher.mjs';
import { spawnProcess } from '../src/exec.mjs';
import { DISPATCH_STATES } from '../src/errors.mjs';
import { compilePrompt } from '../src/prompt-compiler.mjs';
import { baseConfig, makeFakeClaude, removeDir, tempDir, validContract } from './helpers.mjs';

/** Chuoi tan cong: neu co bat ky lop shell nao ben duoi, mot trong so nay se tao ra tep chung tich. */
const SHELL_ATTACKS = [
  '; node -e "process.exit(0)" > pwned-semicolon.txt',
  '&& echo pwned-and > pwned-and.txt',
  '| node -e "1" > pwned-pipe.txt',
  '$(node -e "1" > pwned-subshell.txt)',
  '`node -e "1"`',
  '\n echo pwned-newline > pwned-newline.txt \n',
  '"; Start-Process notepad.exe; #',
  "'; Out-File -FilePath pwned-ps.txt; #",
  '%CD% %PATH% $env:PATH',
  '../../../etc/passwd',
];

/** @param {string} dir @param {Record<string, any>} [behaviour] */
function launchIn(dir, behaviour = {}) {
  const fake = makeFakeClaude(dir, behaviour);
  const policy = { ...baseConfig().claude, bin: fake.bin, binPrefixArgs: fake.binPrefixArgs };
  return { fake, policy, argv: buildClaudeArgv(policy) };
}

/** @param {Record<string, any>} over */
const launch = (over) =>
  launchClaude({
    spawn: spawnProcess,
    timeoutMs: 30_000,
    killGraceMs: 1_000,
    maxCaptureBytes: 65_536,
    prompt: 'x',
    ...over,
  });

test('the prompt reaches the process through stdin, never through argv', async (t) => {
  const dir = tempDir('stdin');
  t.after(() => removeDir(dir));
  const { fake, policy, argv } = launchIn(dir);
  const prompt = 'PROMPT-SENTINEL-9f3a1c leading text\nand a second line\n';

  const result = await launch({ bin: policy.bin, argv, cwd: dir, prompt });

  assert.equal(result.ok, true);
  assert.equal(result.outcome.state, DISPATCH_STATES.CLAUDE_EXITED_0);
  const seen = fake.read();
  assert.equal(seen.stdin, prompt);
  assert.equal(
    seen.argv.some((arg) => arg.includes('PROMPT-SENTINEL')),
    false,
    'prompt text must never appear in argv',
  );
});

test('the child runs with the dispatcher worktree as its working directory', async (t) => {
  const dir = tempDir('cwd');
  t.after(() => removeDir(dir));
  const worktree = path.join(dir, 'worktree');
  fs.mkdirSync(worktree);
  const { fake, policy, argv } = launchIn(dir);

  await launch({ bin: policy.bin, argv, cwd: worktree });

  assert.equal(fs.realpathSync(fake.read().cwd), fs.realpathSync(worktree));
});

test('the policy flags arrive as exact argv elements, with model and effort intact', async (t) => {
  const dir = tempDir('argv');
  t.after(() => removeDir(dir));
  const { fake, policy, argv } = launchIn(dir);

  await launch({ bin: policy.bin, argv, cwd: dir });

  const seen = fake.read().argv;
  assert.equal(seen[seen.indexOf('--model') + 1], 'opus');
  assert.equal(seen[seen.indexOf('--effort') + 1], 'max');
  assert.ok(seen.includes('--print'));
  assert.equal(
    seen.some((arg) => /dangerously/i.test(arg)),
    false,
  );
});

test('shell metacharacters in the task contract cannot create a process or a file', async (t) => {
  const dir = tempDir('inject');
  t.after(() => removeDir(dir));
  const worktree = path.join(dir, 'worktree');
  fs.mkdirSync(worktree);

  const contract = validContract({
    goal: SHELL_ATTACKS.join(' '),
    context: SHELL_ATTACKS.join('\n'),
    scope: SHELL_ATTACKS,
    task_id: 'INJECTION_PROBE_V0',
  });
  const plan = {
    repo: 'acme/widgets',
    issue: 1,
    issueUrl: '',
    taskId: 'INJECTION_PROBE_V0',
    contractDigest: 'a'.repeat(64),
    triggerPrincipal: 'USER:architect-user',
    baseSha: 'b'.repeat(40),
    branch: 'claude/autopilot/issue-1-aaaaaaaaaaaa',
    worktreePath: worktree,
    worktreeLabel: 'issue-1-aaaaaaaaaaaa',
    model: 'opus',
    effort: 'max',
    ledgerKey: 'k',
  };
  const { prompt } = compilePrompt({ plan, contract });
  const { fake, policy, argv } = launchIn(dir);

  const result = await launch({
    bin: policy.bin,
    argv,
    cwd: worktree,
    prompt,
    maxCaptureBytes: 262_144,
  });

  assert.equal(result.ok, true);
  const seen = fake.read();
  // 1. moi ky tu tan cong den noi NGUYEN VEN qua stdin — chung la du lieu, khong bi cat xen.
  assert.equal(seen.stdin, prompt);
  // 2. khong mot manh nao trong so do tro thanh argv.
  for (const attack of SHELL_ATTACKS) {
    assert.equal(
      seen.argv.some((arg) => arg.includes(attack)),
      false,
      `argv absorbed an attack fragment: ${attack.slice(0, 24)}`,
    );
  }
  // 3. khong mot lop shell nao chay chung: khong tep chung tich nao duoc tao, o ca hai thu muc.
  for (const scope of [dir, worktree]) {
    const leftovers = fs.readdirSync(scope).filter((name) => name.startsWith('pwned'));
    assert.deepEqual(leftovers, [], `a shell layer executed attack text in ${scope}`);
  }
  assert.equal(fs.existsSync(path.join(worktree, 'passwd')), false);
});

test('a worktree path with spaces and unicode is passed through intact', async (t) => {
  const dir = tempDir('paths');
  t.after(() => removeDir(dir));
  const worktree = path.join(dir, 'wt with spaces và dấu tiếng Việt (v1)');
  fs.mkdirSync(worktree, { recursive: true });
  const { fake, policy, argv } = launchIn(dir);

  const result = await launch({ bin: policy.bin, argv, cwd: worktree });

  assert.equal(result.ok, true);
  assert.equal(fs.realpathSync(fake.read().cwd), fs.realpathSync(worktree));
});

test('a non-zero exit is reported as such and is not retried here', async (t) => {
  const dir = tempDir('nonzero');
  t.after(() => removeDir(dir));
  const { fake, policy, argv } = launchIn(dir, { exitCode: 42, stdout: 'not json' });

  const result = await launch({ bin: policy.bin, argv, cwd: dir });

  assert.equal(result.ok, true);
  assert.equal(result.outcome.state, DISPATCH_STATES.CLAUDE_EXITED_NONZERO);
  assert.equal(result.outcome.exitCode, 42);
  assert.equal(fs.existsSync(fake.reportFile), true);
});

test('a process that will not finish is terminated and recorded as timed out', async (t) => {
  const dir = tempDir('timeout');
  t.after(() => removeDir(dir));
  const { policy, argv } = launchIn(dir, { hang: true });

  const result = await launch({
    bin: policy.bin,
    argv,
    cwd: dir,
    timeoutMs: 700,
    killGraceMs: 500,
  });

  assert.equal(result.ok, true);
  assert.equal(result.outcome.state, DISPATCH_STATES.TIMED_OUT);
  assert.equal(result.outcome.timedOut, true);
});

test('a missing executable is a typed failure, not an exception', async (t) => {
  const dir = tempDir('enoent');
  t.after(() => removeDir(dir));

  const result = await launch({
    bin: path.join(dir, 'definitely-not-here'),
    argv: ['--print'],
    cwd: dir,
    timeoutMs: 5_000,
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'CLAUDE_BIN_MISSING');
});

test('captured output is bounded while the true byte count is still reported', async (t) => {
  const dir = tempDir('bounded');
  t.after(() => removeDir(dir));
  const { policy, argv } = launchIn(dir, { stdout: 'y'.repeat(50_000) });

  const result = await launch({ bin: policy.bin, argv, cwd: dir, maxCaptureBytes: 1_024 });

  assert.equal(result.ok, true);
  assert.ok(result.outcome.stdoutBytes >= 50_000);
  assert.equal(result.outcome.result.parsed, false);
});

test('a permission denial reported by the CLI becomes a typed blocked state', async (t) => {
  const dir = tempDir('blocked');
  t.after(() => removeDir(dir));
  const denial = JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    permission_denials: [{ tool_name: 'Edit' }],
  });
  const { policy, argv } = launchIn(dir, { stdout: denial });

  const result = await launch({ bin: policy.bin, argv, cwd: dir });

  assert.equal(result.ok, true);
  assert.equal(result.outcome.state, DISPATCH_STATES.BLOCKED_LOCAL_PERMISSION);
});
