import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const registry = JSON.parse(readFileSync('.github/deployment-targets.json', 'utf8'));
const deployTenant = readFileSync('.github/workflows/deploy-tenant.yml', 'utf8');
const reusableDeploy = readFileSync('.github/workflows/reusable-deploy-tenant.yml', 'utf8');

function deploymentFor(tenant, environment) {
  return registry.deployments.find((entry) => entry.tenant === tenant && entry.environment === environment);
}

test('registry maps Ultty GD1-test to the current shared VM target only', () => {
  const deployment = deploymentFor('ultty', 'gd1-test');

  assert.ok(deployment, 'ultty/gd1-test must be explicitly registered');
  assert.equal(deployment.target, 'current-shared-vm');
  assert.equal(deployment.githubEnvironment, 'gd1-test');
  assert.equal(deployment.preflight, 'gd1-test');
  assert.equal(registry.targets['current-shared-vm'].vmName, 'netviet');
  assert.equal(registry.targets['current-shared-vm'].gcpProjectId, 'netviet-host-968934832433');
  assert.equal(registry.targets['current-shared-vm'].zone, 'asia-southeast1-b');
});

test('registry preserves existing dev/production deployability but rejects Amico GD1-test', () => {
  for (const tenant of ['ultty', 'amico']) {
    assert.ok(deploymentFor(tenant, 'dev'), `${tenant}/dev must remain deployable`);
    assert.ok(deploymentFor(tenant, 'production'), `${tenant}/production must remain deployable`);
  }

  assert.equal(deploymentFor('amico', 'gd1-test'), undefined);
});

test('production keeps the GitHub environment approval boundary', () => {
  for (const tenant of ['ultty', 'amico']) {
    assert.equal(deploymentFor(tenant, 'production').githubEnvironment, 'production');
  }
});

test('manual deploy workflow exposes gd1-test while reusable workflow validates the registry', () => {
  assert.match(deployTenant, /-\s+gd1-test/);
  assert.match(reusableDeploy, /\.github\/deployment-targets\.json/);
  assert.match(reusableDeploy, /Unsupported deployment target/);
});

test('GD1-test verifies exact-SHA CI and passes fail-closed preflight inputs to deploy-ci', () => {
  const preflightIndex = reusableDeploy.indexOf('Verify exact main SHA passed CI');
  // Neo vao `id:` chu khong vao TEN HIEN THI cua buoc. Ten hien thi la van ban cho nguoi doc va
  // no doi that (26/08/2026, khi buoc nay duoc dat ten theo cac tang tin hieu no phu trach);
  // `id` la thu ma cac buoc khac tham chieu, nen doi no la mot thay doi co y thuc.
  const buildIndex = reusableDeploy.indexOf('id: rollout');

  assert.notEqual(preflightIndex, -1, 'workflow must verify exact-SHA CI before GD1-test deploy');
  assert.notEqual(buildIndex, -1, 'workflow must still build and deploy through the existing step');
  assert.ok(preflightIndex < buildIndex, 'CI proof must run before build/push');
  assert.match(reusableDeploy, /GD1_TEST_TARGET_CONFIRMED:/);
  assert.match(reusableDeploy, /GD1_TEST_CI_CONCLUSION:/);
  assert.match(reusableDeploy, /vars\.GD1_TEST_APPROVED_GROUP_HASHES/);
});
