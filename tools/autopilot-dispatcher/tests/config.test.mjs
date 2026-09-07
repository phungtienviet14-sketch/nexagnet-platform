import assert from 'node:assert/strict';
import test from 'node:test';
import { assertArmed, parseConfig } from '../src/config.mjs';
import { REASONS } from '../src/errors.mjs';
import { baseConfig } from './helpers.mjs';

test('accepts a well-formed armed configuration', () => {
  const result = parseConfig(baseConfig());
  assert.equal(result.ok, true);
  assert.equal(result.config.claude.model, 'opus');
  assert.equal(result.config.claude.effort, 'max');
});

test('the shipped example configuration is disabled', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const path = await import('node:path');
  const file = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../dispatcher.config.example.json',
  );
  const parsed = parseConfig(JSON.parse(readFileSync(file, 'utf8')));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.config.enabled, false);
  assert.equal(assertArmed(parsed.config).ok, false);
});

test('a valid but unarmed configuration still refuses to run', () => {
  const parsed = parseConfig(baseConfig({ enabled: false }));
  assert.equal(parsed.ok, true);
  const armed = assertArmed(parsed.config);
  assert.equal(armed.ok, false);
  assert.equal(armed.reason, REASONS.CONFIG_DISABLED);
});

test('rejects any model that is not Opus, with its own reason code', () => {
  for (const model of ['sonnet', 'haiku', 'fable', 'claude-sonnet-5', 'opusx', 'OPUS']) {
    const result = parseConfig(baseConfig({ claude: { ...baseConfig().claude, model } }));
    assert.equal(result.ok, false, `expected ${model} to be rejected`);
    assert.equal(result.reason, REASONS.CONFIG_MODEL_NOT_OPUS);
  }
});

test('accepts a pinned full Opus model name', () => {
  const result = parseConfig(parseConfigInput({ model: 'claude-opus-5' }));
  assert.equal(result.ok, true);
  assert.equal(result.config.claude.model, 'claude-opus-5');
});

test('rejects any effort that is not max, with its own reason code', () => {
  for (const effort of ['low', 'medium', 'high', 'xhigh', '', 'MAX']) {
    const result = parseConfig(parseConfigInput({ effort }));
    assert.equal(result.ok, false, `expected ${effort} to be rejected`);
    assert.equal(result.reason, REASONS.CONFIG_EFFORT_NOT_MAX);
  }
});

test('rejects bypassPermissions as a permission mode', () => {
  const result = parseConfig(parseConfigInput({ permissionMode: 'bypassPermissions' }));
  assert.equal(result.ok, false);
  assert.equal(result.reason, REASONS.CONFIG_PERMISSION_MODE_FORBIDDEN);
});

test('an empty trusted-principal allowlist is refused, not treated as "anyone"', () => {
  for (const value of [[], undefined, null, 'architect-user']) {
    const result = parseConfig(baseConfig({ trustedTriggerPrincipals: value }));
    assert.equal(result.ok, false);
    assert.equal(result.reason, REASONS.CONFIG_INVALID);
    assert.equal(result.detail.field, 'trustedTriggerPrincipals');
  }
});

test('rejects a config key whose name looks like a secret', () => {
  for (const key of ['token', 'githubToken', 'api_key', 'cookie', 'oauthSecret', 'password']) {
    const result = parseConfig({ ...baseConfig(), [key]: 'anything' });
    assert.equal(result.ok, false, `expected key ${key} to be rejected`);
    assert.equal(result.reason, REASONS.CONFIG_SECRET_FIELD);
    assert.equal(result.detail.at, key);
  }
});

test('rejects a secret-shaped value even under an innocent key name', () => {
  const samples = [
    'ghp_' + 'a'.repeat(36),
    'github_pat_' + 'b'.repeat(30),
    'sk-ant-' + 'c'.repeat(40),
  ];
  for (const value of samples) {
    const result = parseConfig(baseConfig({ branchPrefix: 'ok', note: value }));
    assert.equal(result.ok, false);
    assert.equal(result.reason, REASONS.CONFIG_SECRET_VALUE);
    assert.equal(Object.prototype.hasOwnProperty.call(result.detail, 'value'), false);
  }
});

test('rejects a secret nested deep inside the claude policy', () => {
  const result = parseConfig(
    parseConfigInput({ binPrefixArgs: ['--token', 'ghp_' + 'z'.repeat(36)] }),
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, REASONS.CONFIG_SECRET_VALUE);
});

test('rejects a repository that is not owner/name', () => {
  for (const repo of ['acme', 'acme/widgets/extra', '/widgets', 'acme/', 'a b/c']) {
    const result = parseConfig(baseConfig({ repo }));
    assert.equal(result.ok, false, `expected ${repo} to be rejected`);
  }
});

test('bounds the process timeout', () => {
  assert.equal(parseConfig(parseConfigInput({ timeoutMs: 1000 })).ok, false);
  assert.equal(parseConfig(parseConfigInput({ timeoutMs: 99 * 60 * 60 * 1000 })).ok, false);
  assert.equal(parseConfig(parseConfigInput({ timeoutMs: 600_000 })).ok, true);
});

/** @param {Record<string, unknown>} claudeOverrides */
function parseConfigInput(claudeOverrides) {
  const config = baseConfig();
  return { ...config, claude: { ...config.claude, ...claudeOverrides } };
}
