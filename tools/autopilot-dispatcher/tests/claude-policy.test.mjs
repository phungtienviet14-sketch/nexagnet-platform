import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertPolicySupported,
  optionBlock,
  parseCapabilities,
  probeClaude,
} from '../src/claude-capabilities.mjs';
import { FORBIDDEN_ARGV_FLAGS, buildClaudeArgv } from '../src/claude-launcher.mjs';
import { REASONS } from '../src/errors.mjs';
import { baseConfig, fakeClaudeProbeExec, fakeExec, realClaudeHelpFixture } from './helpers.mjs';

const POLICY = { model: 'opus', effort: 'max' };

/** @param {ReadonlyArray<string>} lines */
const help = (lines) => lines.join('\n');

test('the capability parser reads the real installed CLI help', () => {
  const caps = parseCapabilities(realClaudeHelpFixture());
  assert.equal(caps.supportsPrint, true);
  assert.equal(caps.supportsModel, true);
  assert.equal(caps.supportsEffort, true);
  assert.equal(caps.mentionsOpusAlias, true);
  assert.ok(caps.effortLevels.includes('max'));
  assert.match(caps.version, /^\d+\.\d+\.\d+/);
  assert.equal(assertPolicySupported(caps, POLICY).ok, true);
});

test('the option block reader stops at the next option', () => {
  const block = optionBlock(realClaudeHelpFixture().help, '--effort');
  assert.ok(block.includes('--effort'));
  assert.ok(block.includes('max'));
  assert.equal(block.includes('--environment'), false);
});

test('a CLI without --effort fails startup instead of running at default effort', () => {
  const caps = parseCapabilities({
    version: '1.0.0',
    help: help(['  -p, --print  non-interactive', '  --model <model>  opus or sonnet']),
  });
  const verdict = assertPolicySupported(caps, POLICY);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, REASONS.CLAUDE_EFFORT_FLAG_UNSUPPORTED);
});

test('a CLI whose --effort has no max level fails startup instead of lowering effort', () => {
  const caps = parseCapabilities({
    version: '1.0.0',
    help: help([
      '  -p, --print  non-interactive',
      '  --model <model>  opus alias',
      '  --effort <level>  (low, medium, high)',
    ]),
  });
  const verdict = assertPolicySupported(caps, POLICY);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, REASONS.CLAUDE_EFFORT_MAX_UNSUPPORTED);
});

test('a CLI that does not document the opus alias fails startup', () => {
  const caps = parseCapabilities({
    version: '1.0.0',
    help: help([
      '  -p, --print  non-interactive',
      '  --model <model>  sonnet or haiku',
      '  --effort <level>  (low, max)',
    ]),
  });
  const verdict = assertPolicySupported(caps, POLICY);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, REASONS.CLAUDE_MODEL_OPUS_UNSUPPORTED);
});

test('a CLI with no non-interactive mode fails startup', () => {
  const caps = parseCapabilities({
    version: '1.0.0',
    help: help(['  --model <model>  opus', '  --effort <level>  (low, max)']),
  });
  const verdict = assertPolicySupported(caps, POLICY);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, REASONS.CLAUDE_NONINTERACTIVE_UNSUPPORTED);
});

test('a missing claude binary is a typed failure, not a crash', async () => {
  const exec = fakeExec([
    { arg: '--version', result: { ok: false, errorCode: 'ENOENT', code: null } },
  ]);
  const probed = await probeClaude({ exec }, { bin: '/nowhere/claude', binPrefixArgs: [] });
  assert.equal(probed.ok, false);
  assert.equal(probed.reason, REASONS.CLAUDE_BIN_MISSING);
});

test('the probe never passes a prompt or a task field to the binary', async () => {
  const exec = fakeClaudeProbeExec();
  await probeClaude({ exec }, { bin: '/usr/bin/claude', binPrefixArgs: [] });
  assert.deepEqual(
    exec.calls.map((call) => call.args),
    [['--version'], ['--help']],
  );
});

test('the launch argv selects Opus and max effort explicitly', () => {
  const argv = buildClaudeArgv(baseConfig().claude);
  assert.deepEqual(argv, [
    '--print',
    '--model',
    'opus',
    '--effort',
    'max',
    '--output-format',
    'json',
    '--permission-prompts',
    'none',
  ]);
  assert.equal(argv[argv.indexOf('--model') + 1], 'opus');
  assert.equal(argv[argv.indexOf('--effort') + 1], 'max');
});

test('the launch argv never contains a permission-weakening or fallback flag', () => {
  for (const policy of [
    baseConfig().claude,
    { ...baseConfig().claude, permissionMode: 'acceptEdits' },
    { ...baseConfig().claude, permissionPrompts: 'host' },
    { ...baseConfig().claude, binPrefixArgs: ['/tmp/fake.mjs'] },
  ]) {
    const argv = buildClaudeArgv(policy);
    for (const flag of FORBIDDEN_ARGV_FLAGS) {
      assert.equal(argv.includes(flag), false, `argv must not contain ${flag}`);
    }
    assert.equal(
      argv.some((a) => /dangerously/i.test(a)),
      false,
    );
  }
});

test('argv is built from policy alone — no task or issue text can reach it', () => {
  const argv = buildClaudeArgv(baseConfig().claude);
  const joined = argv.join(' ');
  for (const leak of ['DEMO_TASK_V0', 'Do the demo thing', 'agent:ready', 'issue', '256']) {
    assert.equal(joined.includes(leak), false, `argv leaked: ${leak}`);
  }
});
