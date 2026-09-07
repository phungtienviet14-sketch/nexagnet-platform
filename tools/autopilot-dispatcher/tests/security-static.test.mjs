/**
 * Bat bien TINH cua ma nguon dispatcher.
 *
 * Nhung tinh chat o day khong the chung minh bang mot lan chay: "khong o dau trong package nay co
 * mot cong dang nghe" la mot khang dinh ve TOAN BO ma nguon, khong phai ve mot duong chay. Nen
 * chung duoc kiem bang cach doc chinh ma nguon — sau khi da bo chu thich, de mot cau van giai
 * thich vi sao khong duoc lam X khong bi doc thanh viec lam X.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { ALLOWED_LOG_FIELDS, sanitizeLogFields } from '../src/logger.mjs';
import { PACKAGE_ROOT, readSourceFiles, stripComments } from './helpers.mjs';

const sources = readSourceFiles();

test('the source tree is what these invariants claim to cover', () => {
  assert.ok(sources.length >= 12, 'expected the full dispatcher source set');
  for (const name of ['exec.mjs', 'gh.mjs', 'run.mjs', 'claude-launcher.mjs']) {
    assert.ok(
      sources.some((entry) => entry.file === name),
      `missing ${name}`,
    );
  }
});

test('no source file ever enables a shell', () => {
  for (const { file, code } of sources) {
    assert.equal(/shell\s*:\s*true/.test(code), false, `${file} enables a shell`);
    assert.equal(/\bexecSync\s*\(/.test(code), false, `${file} uses execSync`);
    assert.equal(/\bexec\s*\(\s*['"`]/.test(code), false, `${file} runs a command string`);
  }
  const exec = sources.find((entry) => entry.file === 'exec.mjs').code;
  assert.equal((exec.match(/shell:\s*false/g) ?? []).length, 2);
});

test('only exec.mjs may import a process-spawning module', () => {
  for (const { file, code } of sources) {
    if (file === 'exec.mjs') continue;
    assert.equal(
      /from\s+'node:child_process'/.test(code),
      false,
      `${file} imports child_process directly; every spawn must go through exec.mjs`,
    );
  }
});

test('no source file opens an inbound listener of any kind', () => {
  for (const { file, code } of sources) {
    for (const pattern of [
      /createServer\s*\(/,
      /\.listen\s*\(/,
      /new\s+WebSocket(?:Server)?\s*\(/,
      /from\s+'node:(http|https|net|tls|dgram|http2)'/,
      /require\s*\(\s*'node:(http|https|net|tls|dgram|http2)'\s*\)/,
    ]) {
      assert.equal(pattern.test(code), false, `${file} matches inbound pattern ${pattern}`);
    }
  }
});

test('the dispatcher never asks gh for a token, and never reads one from the environment', () => {
  for (const { file, code } of sources) {
    assert.equal(/auth['"\s,\]]*token/i.test(code), false, `${file} looks like it reads a token`);
    for (const variable of [
      'CLAUDE_CODE_OAUTH_TOKEN',
      'ANTHROPIC_API_KEY',
      'GITHUB_TOKEN',
      'GH_TOKEN',
      'OPENAI_API_KEY',
    ]) {
      assert.equal(code.includes(variable), false, `${file} references ${variable}`);
    }
  }
});

test('no source file dumps the environment', () => {
  for (const { file, code } of sources) {
    // Doc `process.env` NGUYEN KHOI (de log/serialise) bi cam. Truyen mot env da dung san cho
    // tien trinh con thi khong — nhung khong tep nao trong package dang lam ca hai.
    assert.equal(/JSON\.stringify\s*\(\s*process\.env/.test(code), false, `${file} serialises env`);
    assert.equal(/\.\.\.process\.env/.test(code), false, `${file} spreads env`);
    assert.equal(
      /Object\.(keys|entries)\s*\(\s*process\.env/.test(code),
      false,
      `${file} enumerates env`,
    );
  }
});

test('no source file runs a destructive or history-rewriting git command', () => {
  const forbidden = [
    /'reset'/,
    /'--hard'/,
    /'clean'/,
    /'stash'/,
    /'rebase'/,
    /'--force'/,
    /'-f'/,
    /'push'/,
    /'--force-with-lease'/,
  ];
  for (const { file, code } of sources) {
    for (const pattern of forbidden) {
      assert.equal(pattern.test(code), false, `${file} contains git argument ${pattern}`);
    }
  }
});

test('no source file puts a permission-bypass flag into an argument list', () => {
  for (const { file, code } of sources) {
    if (file === 'claude-launcher.mjs') continue; // khai bao DANH SACH CAM, doi chieu o duoi
    assert.equal(/dangerously/i.test(code), false, `${file} mentions a bypass flag`);
    assert.equal(/bypassPermissions/.test(code), false, `${file} mentions bypassPermissions`);
  }
  const launcher = sources.find((entry) => entry.file === 'claude-launcher.mjs').code;
  // Trong launcher, chuoi do CHI duoc xuat hien trong danh sach cam — khong trong ham dung argv.
  const argvBuilder = launcher.slice(
    launcher.indexOf('export function buildClaudeArgv'),
    launcher.indexOf('export function classifyResultJson'),
  );
  assert.ok(argvBuilder.length > 0);
  assert.equal(/dangerously/i.test(argvBuilder), false);
});

test('config.mjs names the permission modes it allows, and bypass is not among them', () => {
  const config = sources.find((entry) => entry.file === 'config.mjs').code;
  assert.ok(config.includes('ALLOWED_PERMISSION_MODES'));
  assert.equal(config.includes("'bypassPermissions'"), false);
});

test('the log allowlist cannot carry a prompt, prose or an environment map', () => {
  for (const forbidden of [
    'prompt',
    'goal',
    'context',
    'scope',
    'env',
    'stdout',
    'stderr',
    'body',
  ]) {
    assert.equal(ALLOWED_LOG_FIELDS.includes(forbidden), false, `${forbidden} is loggable`);
  }
  const filtered = sanitizeLogFields({
    issue: 256,
    prompt: 'ROLE: Claude Builder ...',
    env: { PATH: '/usr/bin' },
    goal: 'Do the demo thing.',
    token: 'ghp_secret',
    state: 'CLAIMED',
  });
  assert.deepEqual(Object.keys(filtered).sort(), ['dropped_fields', 'issue', 'state']);
  assert.equal(filtered.dropped_fields, 'env,goal,prompt,token');
  assert.equal(JSON.stringify(filtered).includes('ghp_secret'), false);
});

test('object and array values are dropped, so a response body cannot ride into a log line', () => {
  const filtered = sanitizeLogFields({ issue: [1, 2, 3], reason: { nested: 'x' }, state: 'OK' });
  assert.deepEqual(Object.keys(filtered).sort(), ['dropped_fields', 'state']);
});

test('the example config in the repository is disabled and holds no credential', () => {
  const text = fs.readFileSync(path.join(PACKAGE_ROOT, 'dispatcher.config.example.json'), 'utf8');
  const parsed = JSON.parse(text);
  assert.equal(parsed.enabled, false);
  for (const pattern of [/ghp_/, /github_pat_/, /sk-ant-/, /token/i, /secret/i, /password/i]) {
    assert.equal(pattern.test(text), false, `example config matches ${pattern}`);
  }
});

test('the package depends only on the protocol package', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'));
  assert.deepEqual(Object.keys(pkg.dependencies), ['@netviet/autopilot-protocol']);
});

test('the comment stripper does not hide real code from these scans', () => {
  assert.equal(stripComments('const a = 1; // shell: true'), 'const a = 1; ');
  assert.equal(stripComments('/* shell: true */const a = 1;'), 'const a = 1;');
  assert.ok(
    stripComments("const url = 'https://example.invalid/x';").includes('https://example.invalid/x'),
  );
});
