/**
 * Do gia dung chung cho bo test cua dispatcher.
 *
 * Nguyen tac: fake phai gia o dung MOT cho — bien gioi I/O — va that o moi cho con lai. GitHub la
 * fake vi khong the goi mang that trong CI; nhung `git` la THAT (repo tam tren dia) va tien trinh
 * con la THAT (mot executable that), vi hai thu do chinh la thu can chung minh.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gitSafeEnv } from '../src/worktree-manager.mjs';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PACKAGE_ROOT = path.resolve(HERE, '..');
export const SRC_DIR = path.join(PACKAGE_ROOT, 'src');

/** @param {string} prefix */
export function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `apd-${prefix}-`));
}

/** @param {string} dir */
export function removeDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * Bo `//` va block comment khoi ma nguon truoc khi quet tinh. Neu khong, mot bai test "khong duoc
 * co shell:true" se do ngay tren chinh cau chu thich giai thich vi sao khong duoc co shell:true.
 * @param {string} source
 */
export function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Doc toan bo tep .mjs trong src/ (da bo comment). @returns {Array<{ file: string, code: string }>} */
export function readSourceFiles() {
  return fs
    .readdirSync(SRC_DIR)
    .filter((name) => name.endsWith('.mjs'))
    .map((name) => ({
      file: name,
      code: stripComments(fs.readFileSync(path.join(SRC_DIR, name), 'utf8')),
    }));
}

/** Cau hinh hop le toi thieu, da vu trang. @param {Record<string, any>} [overrides] */
export function baseConfig(overrides = {}) {
  const root = overrides.__root ?? '/tmp/apd-root';
  const config = {
    enabled: true,
    repo: 'acme/widgets',
    readyLabel: 'agent:ready',
    trustedTriggerPrincipals: [{ kind: 'USER', id: 'architect-user' }],
    worktreeRoot: path.join(root, 'worktrees'),
    branchPrefix: 'claude/autopilot',
    stateDir: path.join(root, 'state'),
    remote: 'origin',
    baseBranch: 'main',
    claude: {
      bin: '/usr/bin/claude',
      binPrefixArgs: [],
      model: 'opus',
      effort: 'max',
      permissionPrompts: 'none',
      permissionMode: null,
      timeoutMs: 600_000,
      killGraceMs: 2_000,
      maxCaptureBytes: 65_536,
    },
    ...overrides,
  };
  delete config.__root;
  return config;
}

/** Hop dong task hop le toi thieu. @param {Record<string, any>} [overrides] */
export function validContract(overrides = {}) {
  return {
    protocol: 'V0',
    task_id: 'DEMO_TASK_V0',
    goal: 'Do the demo thing.',
    context: 'Demo context.',
    scope: ['one thing'],
    out_of_scope: ['another thing'],
    acceptance: ['it works'],
    risk: 'LOW',
    human_gate: false,
    dependencies: [],
    runtime_proof: { required: false },
    ...overrides,
  };
}

/** Than Issue canonical: marker la dong noi dung DAU TIEN, khoi json ngay sau. */
export function issueBodyFor(contract, trailingProse = 'Human-readable notes.') {
  return [
    '<!-- AUTOPILOT_TASK_V0 -->',
    '',
    '```json',
    JSON.stringify(contract, null, 2),
    '```',
    '',
    trailingProse,
  ].join('\n');
}

/** @param {Record<string, any>} [overrides] */
export function issueFixture(overrides = {}) {
  const contract = overrides.contract ?? validContract();
  return {
    number: 256,
    state: 'open',
    html_url: 'https://github.com/acme/widgets/issues/256',
    repository_url: 'https://api.github.com/repos/acme/widgets',
    labels: [{ name: 'agent:ready' }],
    body: issueBodyFor(contract),
    ...overrides,
  };
}

/** @param {Record<string, any>} [overrides] */
export function labeledEvent(overrides = {}) {
  return {
    id: 9001,
    event: 'labeled',
    created_at: '2026-09-07T10:00:00Z',
    label: { name: 'agent:ready' },
    actor: { login: 'architect-user' },
    ...overrides,
  };
}

/**
 * GitHub gia: mot bang tra cuu tu duong dan REST sang than tra ve, cong nhat ky moi lan goi.
 * @param {Record<string, any>} routes
 */
export function fakeGh(routes, graphqlData) {
  /** @type {string[]} */
  const calls = [];
  return {
    calls,
    bin: 'gh',
    /**
     * Mac dinh: than Issue CHUA BAO GIO bi sua. Bai nao muon do cong "sua sau khi gan nhan" thi
     * truyen `graphqlData` rieng.
     */
    async graphql() {
      calls.push('graphql');
      if (graphqlData instanceof Error) return { ok: false, reason: 'GITHUB_CALL_FAILED' };
      return {
        ok: true,
        data: graphqlData ?? { repository: { issue: { lastEditedAt: null } } },
      };
    },
    /** @param {string} apiPath */
    async api(apiPath) {
      calls.push(apiPath);
      for (const [pattern, value] of Object.entries(routes)) {
        if (apiPath === pattern || apiPath.startsWith(pattern)) {
          if (value instanceof Error) return { ok: false, reason: 'GITHUB_CALL_FAILED' };
          return { ok: true, body: typeof value === 'function' ? value(apiPath) : value };
        }
      }
      return { ok: true, body: null };
    },
  };
}

/**
 * `exec` gia: khop theo (file, args[0]) va tra ve ket qua da soan san.
 * @param {Array<{ file?: string, arg?: string, match?: (f: string, a: ReadonlyArray<string>) => boolean, result: Record<string, any> }>} rules
 */
export function fakeExec(rules) {
  /** @type {Array<{ file: string, args: string[] }>} */
  const calls = [];
  /** @type {import('../src/exec.mjs').ExecFn} */
  const exec = async (file, args) => {
    calls.push({ file, args: [...args] });
    for (const rule of rules) {
      const fileOk = rule.file === undefined || rule.file === file;
      const argOk = rule.arg === undefined || args.includes(rule.arg);
      const matchOk = rule.match === undefined || rule.match(file, args);
      if (fileOk && argOk && matchOk) {
        return {
          ok: true,
          code: 0,
          signal: null,
          stdout: '',
          stderr: '',
          errorCode: null,
          ...rule.result,
        };
      }
    }
    return { ok: true, code: 0, signal: null, stdout: '', stderr: '', errorCode: null };
  };
  return Object.assign(exec, { calls });
}

/** Doc `--help` that cua Claude CLI da chup lai lam fixture. */
export function realClaudeHelpFixture() {
  return {
    help: fs.readFileSync(path.join(HERE, 'fixtures/claude-help-2.1.263.txt'), 'utf8'),
    version: fs.readFileSync(path.join(HERE, 'fixtures/claude-version-2.1.263.txt'), 'utf8'),
  };
}

/** `exec` gia tra ve dung `--version`/`--help` that cua CLI dang cai. */
export function fakeClaudeProbeExec(extraRules = []) {
  const { help, version } = realClaudeHelpFixture();
  return fakeExec([
    ...extraRules,
    { arg: '--version', result: { stdout: version } },
    { arg: '--help', result: { stdout: help } },
  ]);
}

/** Logger thu gom dong log de doi chieu, khong in ra man hinh. */
export function collectingLogger() {
  /** @type {Array<Record<string, unknown>>} */
  const lines = [];
  return {
    lines,
    /** @param {string} event @param {Record<string, unknown>} [fields] */
    log(event, fields = {}) {
      const record = { ...fields, event };
      lines.push(record);
      return record;
    },
  };
}

/**
 * Mot executable "Claude" THAT: node chay mot script, script ghi lai argv/cwd/stdin ra JSON.
 * Tra ve `{ bin, binPrefixArgs, reportFile }` de nhet thang vao cau hinh.
 * @param {string} dir thu muc tam so huu script va tep bao cao
 * @param {{ exitCode?: number, stdout?: string, hang?: boolean }} [behaviour]
 */
export function makeFakeClaude(dir, behaviour = {}) {
  const reportFile = path.join(dir, 'claude-invocation.json');
  const script = path.join(dir, 'fake-claude.mjs');
  const body = `
import fs from 'node:fs';
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const stdin = Buffer.concat(chunks).toString('utf8');
fs.writeFileSync(${JSON.stringify(reportFile)}, JSON.stringify({
  argv: process.argv.slice(2),
  cwd: process.cwd(),
  stdinBytes: Buffer.byteLength(stdin, 'utf8'),
  stdin,
}, null, 2));
process.stdout.write(${JSON.stringify(behaviour.stdout ?? '{"type":"result","subtype":"success","is_error":false}')});
${behaviour.hang ? 'setInterval(() => {}, 1000);' : `process.exit(${behaviour.exitCode ?? 0});`}
`;
  fs.writeFileSync(script, body, 'utf8');
  return {
    bin: process.execPath,
    binPrefixArgs: [script],
    reportFile,
    read() {
      return JSON.parse(fs.readFileSync(reportFile, 'utf8'));
    },
  };
}

/**
 * Mot repo git THAT: mot remote bare + mot clone lam ban sao lam viec, da co mot commit tren main.
 * @param {string} dir
 */
export function makeGitRepo(dir) {
  const origin = path.join(dir, 'origin.git');
  const work = path.join(dir, 'work');
  // `gitSafeEnv` chu khong phai `process.env`: khi bo test nay chay duoi mot hook `pre-push`,
  // git da dat san `GIT_DIR` tro vao REPO THAT — va `git init` trong thu muc tam se di sua
  // `.git/config` cua repo do. Do la dieu da xay ra that.
  const env = gitSafeEnv();
  const git = (args, cwd) =>
    execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  fs.mkdirSync(origin, { recursive: true });
  git(['init', '--bare', '--initial-branch=main', '.'], origin);
  fs.mkdirSync(work, { recursive: true });
  git(['init', '--initial-branch=main', '.'], work);
  git(['config', 'user.email', 'test@example.invalid'], work);
  git(['config', 'user.name', 'Dispatcher Test'], work);
  git(['config', 'commit.gpgsign', 'false'], work);
  fs.writeFileSync(path.join(work, 'README.md'), '# fixture\n', 'utf8');
  git(['add', 'README.md'], work);
  git(['commit', '-m', 'seed'], work);
  git(['remote', 'add', 'origin', origin], work);
  git(['push', '-u', 'origin', 'main'], work);
  git(['fetch', 'origin', '--prune'], work);
  const baseSha = git(['rev-parse', 'refs/remotes/origin/main'], work).trim();
  return { origin, work, baseSha, git };
}
