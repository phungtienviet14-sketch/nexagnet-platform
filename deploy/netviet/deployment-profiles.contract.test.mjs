import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEPLOYMENT_PROFILES,
  GATED_ENVIRONMENTS,
  defineDeploymentProfile,
  isGatedEnvironment,
  requiredSecretNamesFor,
  requiredSecretSuffixesFor,
  resolveDeploymentProfile,
  validateProfileForEntry,
} from './deployment-profiles.mjs';
import { resolveStackIdentity } from './stack-identity.mjs';

/**
 * A preview profile that enables NOTHING it does not need. This is the fixture Issue #186 §5
 * calls for: it exists to prove the mechanism can express "no Zalo channel, no LLM parser"
 * WITHOUT a live registry row, which stays blocked until PR #184 is accepted.
 */
function previewProfile(overrides = {}) {
  return defineDeploymentProfile({
    id: 'preview-fixture',
    gate: 'gd1-test',
    environments: { 'gd1-test': 'gd1-test' },
    tenants: ['transport-preview'],
    subsystems: { flowise: false, parser: 'none', channel: 'none' },
    // Mot ho so BI KHOA CONG phai ghim runtime cua no: thieu hop dong nay thi `AUTO_SEND` roi ve
    // mac dinh `on` cua `render-secrets.sh` — dung cai bay #180 mo ra. `defineDeploymentProfile`
    // tu choi mot ho so gated khong khai `runtime`, va co bai test khoa dieu do.
    runtime: {
      parserMode: 'deepseek',
      channelMode: 'mock',
      adviceComposer: 'off',
      autoSend: 'off',
      dataClassification: 'test',
      mediaStore: 'gcs',
    },
    ...overrides,
  });
}

const ULTTY = DEPLOYMENT_PROFILES['ultty-gd1-test'];

// --- 1. The Ultty profile is preserved, not relaxed -------------------------------------------

test('Ultty GD1-test keeps its gate, its tenant pin, ZCA and DeepSeek', () => {
  assert.equal(ULTTY.gate, 'gd1-test');
  assert.deepEqual(ULTTY.tenants, ['ultty']);
  assert.equal(ULTTY.subsystems.channel, 'zca');
  assert.equal(ULTTY.subsystems.parser, 'deepseek');
  assert.equal(ULTTY.subsystems.flowise, true);
  assert.equal(ULTTY.environments['gd1-test'], 'gd1-test');
  // The readiness/business checks stay where they were; the profile only NAMES their owner.
  assert.equal(ULTTY.preflightModule, 'gd1-test-preflight');
});

test('the Ultty secret contract is still exactly the 13 names it always was', () => {
  // Measured, not asserted as an architectural invariant (Issue #186 §6): 4 base + 8 Flowise +
  // 1 DeepSeek. Change a subsystem and this number moves — that is the point.
  const suffixes = requiredSecretSuffixesFor(ULTTY);
  assert.equal(suffixes.length, 13);
  assert.deepEqual([...suffixes].sort(), [
    'api-key',
    'deepseek-api-key',
    'flowise-admin-email',
    'flowise-admin-password',
    'flowise-db-password',
    'flowise-jwt-secret',
    'flowise-refresh-secret',
    'flowise-secretkey',
    'flowise-session-secret',
    'flowise-token-hash-secret',
    'operator-password',
    'postgres-admin-password',
    'zalo-db-password',
  ]);
});

// --- 2/3. Unknown profiles and wrong tenants fail closed ---------------------------------------

test('an unknown deployment profile fails closed', () => {
  assert.throws(() => resolveDeploymentProfile('transport-preview'), /Unknown deployment profile/);
  assert.throws(() => resolveDeploymentProfile(''), /Unknown deployment profile/);
  assert.throws(() => resolveDeploymentProfile(undefined), /Unknown deployment profile/);
  // Prototype keys are not profiles either.
  assert.throws(() => resolveDeploymentProfile('constructor'), /Unknown deployment profile/);
});

test('the Ultty profile refuses to serve any other tenant', () => {
  const errors = validateProfileForEntry(ULTTY, {
    tenant: 'amico',
    environment: 'gd1-test',
    runtimeEnvironment: 'gd1-test',
  });
  assert.ok(errors.some((error) => /not registered for tenant amico/.test(error)));
});

// --- 4. No profile can select a path that skips the exact-main CI proof ------------------------

test('a gated environment cannot be served by an ungated profile', () => {
  // Refused at construction: such a profile cannot come into existence at all.
  assert.throws(
    () =>
      defineDeploymentProfile({
        id: 'sneaky',
        gate: 'standard',
        environments: { 'gd1-test': 'gd1-test' },
        tenants: null,
        subsystems: { flowise: false, parser: 'none', channel: 'none' },
      }),
    /gated and requires gate=gd1-test/,
  );

  // And refused again at use, so a hand-built object that never went through the constructor
  // still cannot slip past.
  const handBuilt = {
    id: 'hand-built',
    gate: 'standard',
    environments: { 'gd1-test': 'gd1-test' },
    tenants: null,
    subsystems: { flowise: false, parser: 'none', channel: 'none' },
  };
  const errors = validateProfileForEntry(handBuilt, {
    tenant: 'wata',
    environment: 'gd1-test',
    runtimeEnvironment: 'gd1-test',
  });
  assert.ok(errors.some((error) => /is gated and profile hand-built is not/.test(error)));
});

test('the exact-main requirement is derived from the environment, not from any profile field', () => {
  assert.deepEqual([...GATED_ENVIRONMENTS], ['gd1-test']);
  assert.equal(isGatedEnvironment('gd1-test'), true);
  assert.equal(isGatedEnvironment('dev'), false);
  assert.equal(isGatedEnvironment('production'), false);
  // No profile carries a field that could answer this question differently.
  for (const profile of Object.values(DEPLOYMENT_PROFILES)) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(profile, 'requiresExactMainCi'),
      false,
      `${profile.id} must not carry its own exact-main flag`,
    );
  }
});

test('a profile cannot alias a gated environment onto another runtime environment', () => {
  // The shape that resolved with exit 0 on 213af13: gd1-test on paper, `dev` at the runtime layer
  // where deploy-ci.sh derives the real stack slug and where AUTO_SEND stays at its `on` default.
  const errors = validateProfileForEntry(ULTTY, {
    tenant: 'ultty',
    environment: 'gd1-test',
    runtimeEnvironment: 'dev',
  });
  assert.ok(errors.some((error) => /maps gd1-test to runtime gd1-test, not dev/.test(error)));
});

// --- 8/9. Subsystem-scoped secrets, no cross-profile fallback ---------------------------------

test('a profile that enables no Flowise and no LLM parser is charged neither', () => {
  const suffixes = requiredSecretSuffixesFor(previewProfile());
  assert.deepEqual([...suffixes].sort(), [
    'api-key',
    'operator-password',
    'postgres-admin-password',
    'zalo-db-password',
  ]);
  assert.equal(
    suffixes.some((suffix) => suffix.startsWith('flowise-')),
    false,
  );
  assert.equal(suffixes.includes('deepseek-api-key'), false);
});

test('dispatch-time switches add their own secrets and nothing else', () => {
  const off = requiredSecretSuffixesFor(previewProfile());
  const engine = requiredSecretSuffixesFor(previewProfile(), { workflowEngine: true });
  const observed = requiredSecretSuffixesFor(previewProfile(), { observability: true });

  assert.deepEqual(
    engine.filter((suffix) => !off.includes(suffix)),
    ['hatchet-db-password', 'workflow-dashboard-htpasswd'],
  );
  assert.deepEqual(
    observed.filter((suffix) => !off.includes(suffix)),
    ['otlp-ingest-token', 'clickhouse-writer-password', 'clickhouse-reader-password'],
  );
  // An unused subsystem never appears: switches are off by default.
  assert.equal(off.includes('hatchet-db-password'), false);
  assert.equal(off.includes('otlp-ingest-token'), false);
});

test('no profile can name an Ultty-scoped secret: the prefix is the stack, not the tenant', () => {
  const preview = requiredSecretNamesFor(previewProfile(), 'transport-preview-gd1-test');
  const ultty = requiredSecretNamesFor(ULTTY, 'ultty-gd1-test');

  for (const name of preview) {
    assert.match(name, /^zalo-transport-preview-gd1-test-/);
    assert.equal(ultty.includes(name), false, `${name} must not be shared with Ultty`);
  }
  assert.equal(
    preview.some((name) => name.startsWith('zalo-ultty')),
    false,
    'a preview profile must never resolve an Ultty-scoped secret name',
  );
  // There is no fallback path: an unsafe or absent slug throws instead of degrading to a name
  // that belongs to no stack. `undefined` matters most — it coerces to the valid-looking
  // string "undefined", so type-checking has to come before the pattern.
  for (const bad of ['Ultty GD1', '', undefined, null, 7, 'zalo_ultty']) {
    assert.throws(() => requiredSecretNamesFor(previewProfile(), bad), /Invalid stack slug/);
  }
});

// --- 10. Isolation matrix: two profiles, no shared identifier ---------------------------------

test('two gd1-test stacks collide on nothing: every derived identifier is distinct', () => {
  const hostSuffix = '203-0-113-7.sslip.io';
  const ultty = resolveStackIdentity({
    tenant: 'ultty',
    environment: 'gd1-test',
    primaryTenant: 'ultty',
    hostSuffix,
  });
  const preview = resolveStackIdentity({
    tenant: 'transport-preview',
    environment: 'gd1-test',
    primaryTenant: 'ultty',
    hostSuffix,
  });

  // Every field either differs, or is the shared constant it is supposed to be (`environment`).
  const shared = ['environment'];
  for (const key of Object.keys(ultty)) {
    if (shared.includes(key)) continue;
    assert.notEqual(
      ultty[key],
      preview[key],
      `${key} must differ between the Ultty and preview stacks`,
    );
  }

  // Named explicitly so a future rename cannot quietly drop one of them from the matrix.
  for (const key of [
    'stackSlug',
    'appDir',
    'composeProject',
    'secretPrefix',
    'backendNetwork',
    'dataNetwork',
    'postgresVolume',
    'flowiseVolume',
    'apiAlias',
    'webAlias',
    'flowiseAlias',
    'backupPrefix',
    'demoDomain',
    'operatorDomain',
    'flowiseDomain',
  ]) {
    assert.ok(ultty[key], `Ultty identity must define ${key}`);
    assert.ok(preview[key], `preview identity must define ${key}`);
    assert.notEqual(ultty[key], preview[key], `${key} must be stack-scoped`);
  }
});

test('a second stack never takes the primary tenant bare hostname', () => {
  const hostSuffix = '203-0-113-7.sslip.io';
  const preview = resolveStackIdentity({
    tenant: 'transport-preview',
    environment: 'gd1-test',
    primaryTenant: 'ultty',
    hostSuffix,
  });
  assert.equal(preview.operatorDomain, `operator-transport-preview-gd1-test.${hostSuffix}`);
  assert.notEqual(preview.operatorDomain, `operator.${hostSuffix}`);
  // Only the stack whose slug IS the primary tenant keeps the bare name.
  const running = resolveStackIdentity({
    tenant: 'ultty',
    environment: 'production',
    primaryTenant: 'ultty',
    hostSuffix,
  });
  assert.equal(running.operatorDomain, `operator.${hostSuffix}`);
});

test('stack identity is deterministic: the same input always derives the same names', () => {
  const args = { tenant: 'transport-preview', environment: 'gd1-test', primaryTenant: 'ultty' };
  assert.deepEqual(resolveStackIdentity(args), resolveStackIdentity(args));
});

// --- 11. Production stays out of scope ---------------------------------------------------------

test('no profile introduces or gates a production target', () => {
  for (const profile of Object.values(DEPLOYMENT_PROFILES)) {
    if (!Object.prototype.hasOwnProperty.call(profile.environments, 'production')) continue;
    // Production keeps exactly the semantics it had: the pre-existing ungated path.
    assert.equal(profile.gate, 'standard', `${profile.id} must not re-gate production here`);
    assert.equal(profile.environments.production, 'prod');
  }
  assert.equal(
    GATED_ENVIRONMENTS.includes('production'),
    false,
    'production hardening is a separate governance decision, not this change',
  );
});
