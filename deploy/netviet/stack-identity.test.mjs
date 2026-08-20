import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  LEGACY_STACK_ENVIRONMENTS,
  resolveStackIdentity,
  resolveStackSlug,
} from './stack-identity.mjs';

const registry = JSON.parse(readFileSync('.github/deployment-targets.json', 'utf8'));

function deploymentFor(tenant, environment) {
  return registry.deployments.find(
    (entry) => entry.tenant === tenant && entry.environment === environment,
  );
}

// The whole safety story of adding a second Ultty stack rests on this test: the compose project
// name decides the volume names, so any environment that already runs on the VM must keep
// resolving to the bare tenant slug. A regression here silently renames
// `zalo-ultty_postgres-data` and orphans the customer's live PostgreSQL data.
test('environments that already run on the VM keep the bare tenant slug', () => {
  for (const environment of LEGACY_STACK_ENVIRONMENTS) {
    assert.equal(resolveStackSlug('ultty', environment), 'ultty');
    assert.equal(resolveStackSlug('amico', environment), 'amico');
  }
});

test('a non-legacy environment gets its own stack slug', () => {
  assert.equal(resolveStackSlug('ultty', 'gd1-test'), 'ultty-gd1-test');
});

test('identity derives every infrastructure name from the one stack slug', () => {
  const identity = resolveStackIdentity({ tenant: 'ultty', environment: 'gd1-test' });

  assert.equal(identity.tenantSlug, 'ultty');
  assert.equal(identity.stackSlug, 'ultty-gd1-test');
  assert.equal(identity.appDir, '/srv/netviet/apps/zalo-ultty-gd1-test');
  assert.equal(identity.composeProject, 'zalo-ultty-gd1-test');
  assert.equal(identity.secretPrefix, 'zalo-ultty-gd1-test-');
  assert.equal(identity.backendNetwork, 'zalo-ultty-gd1-test_backend');
  assert.equal(identity.dataNetwork, 'zalo-ultty-gd1-test_data');
  assert.equal(identity.postgresVolume, 'zalo-ultty-gd1-test_postgres-data');
  assert.equal(identity.flowiseVolume, 'zalo-ultty-gd1-test_flowise-data');
  assert.equal(identity.backupPrefix, 'stacks/ultty-gd1-test');
});

test('the live Ultty stack keeps every name it already has on disk', () => {
  const identity = resolveStackIdentity({ tenant: 'ultty', environment: 'dev' });

  assert.equal(identity.stackSlug, 'ultty');
  assert.equal(identity.appDir, '/srv/netviet/apps/zalo-ultty');
  assert.equal(identity.composeProject, 'zalo-ultty');
  assert.equal(identity.secretPrefix, 'zalo-ultty-');
  assert.equal(identity.postgresVolume, 'zalo-ultty_postgres-data');
});

// `OPERATOR_DOMAIN` feeds `PUBLIC_BASE_URL` and Zalo fetches catalog images from it, so the
// primary tenant must keep the bare hostname. Only the stack that IS the primary tenant may.
test('only the primary tenant stack keeps the bare hostnames', () => {
  const live = resolveStackIdentity({
    tenant: 'ultty',
    environment: 'dev',
    primaryTenant: 'ultty',
    hostSuffix: '35-187-235-82.sslip.io',
  });
  assert.equal(live.operatorDomain, 'operator.35-187-235-82.sslip.io');
  assert.equal(live.demoDomain, 'demo.35-187-235-82.sslip.io');

  const gd1Test = resolveStackIdentity({
    tenant: 'ultty',
    environment: 'gd1-test',
    primaryTenant: 'ultty',
    hostSuffix: '35-187-235-82.sslip.io',
  });
  assert.equal(gd1Test.operatorDomain, 'operator-ultty-gd1-test.35-187-235-82.sslip.io');
  assert.equal(gd1Test.demoDomain, 'demo-ultty-gd1-test.35-187-235-82.sslip.io');
  assert.notEqual(gd1Test.operatorDomain, live.operatorDomain);
});

test('the gd1-test stack shares no infrastructure name with the live dev stack', () => {
  const live = resolveStackIdentity({ tenant: 'ultty', environment: 'dev' });
  const gd1Test = resolveStackIdentity({ tenant: 'ultty', environment: 'gd1-test' });

  for (const field of [
    'stackSlug',
    'appDir',
    'composeProject',
    'secretPrefix',
    'backendNetwork',
    'dataNetwork',
    'postgresVolume',
    'flowiseVolume',
    'backupPrefix',
  ]) {
    assert.notEqual(gd1Test[field], live[field], `${field} must not be shared between stacks`);
  }
});

test('unsafe tenant or environment input is rejected instead of concatenated', () => {
  for (const bad of ['', 'Ultty', 'ultty/../amico', 'ultty ', '../etc']) {
    assert.throws(() => resolveStackSlug(bad, 'gd1-test'), /tenant/i);
    assert.throws(() => resolveStackSlug('ultty', bad), /environment/i);
  }
});

// The registry is what the workflow actually reads. Keeping the declared value and the derived
// value in lockstep means a hand-edited registry cannot quietly point a new environment at the
// live stack's volumes.
test('every registry deployment declares the stack slug the rule derives', () => {
  for (const deployment of registry.deployments) {
    assert.equal(
      deployment.stackSlug,
      resolveStackSlug(deployment.tenant, deployment.environment),
      `${deployment.tenant}/${deployment.environment} declares a stack slug the rule does not derive`,
    );
  }
});

test('no two registry deployments claim the same stack slug', () => {
  const seen = new Map();
  for (const deployment of registry.deployments) {
    const previous = seen.get(deployment.stackSlug);
    // dev and production intentionally share one stack today; they are the same infrastructure
    // under two approval gates, which is exactly why gd1-test needed a stack of its own.
    if (previous && previous.tenant !== deployment.tenant) {
      assert.fail(
        `stack slug ${deployment.stackSlug} is claimed by two different tenants`,
      );
    }
    seen.set(deployment.stackSlug, deployment);
  }
});
