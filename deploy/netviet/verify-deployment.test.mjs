import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { verifyDeployment } from './verify-deployment.mjs';

const DIGEST = `asia-southeast1-docker.pkg.dev/project/repo/image@sha256:${'a'.repeat(64)}`;
const FLOWISE_DIGEST = `asia-southeast1-docker.pkg.dev/project/repo/flowise@sha256:${'b'.repeat(64)}`;

function tenant(
  capabilities = ['knowledge', 'messaging', 'sales-order', 'operations', 'notifications'],
) {
  return {
    schemaVersion: 2,
    slug: 'ultty',
    branding: { pageTitle: 'Ultty AI — Trung tâm điều hành' },
    capabilities,
  };
}

function release() {
  return {
    tenant: 'ultty',
    environment: 'gd1-test',
    target: 'netviet-shared-vm',
    gitSha: '1'.repeat(40),
    appDigest: DIGEST,
    flowiseDigest: FLOWISE_DIGEST,
    tenantSchemaVersion: 2,
    workflowRunId: '123456789',
    deployedAt: '2026-08-20T10:00:00.000Z',
  };
}

function evidence() {
  return {
    release: release(),
    containers: {
      postgres: { state: 'running', health: 'healthy' },
      flowise: { state: 'running', health: 'healthy' },
      api: { state: 'running', health: 'healthy' },
      web: { state: 'running', health: 'healthy' },
    },
    api: { status: 200, tenant: 'ultty' },
    web: { status: 200, pageTitle: 'Ultty AI — Trung tâm điều hành' },
    database: {
      implementation: 'postgresql/prisma',
      connected: true,
      migrationsApplied: true,
      pendingMigrations: 0,
      migrationHead: '20260820000000_foundation',
    },
    network: {
      backendNetwork: 'zalo-ultty_backend',
      dataNetwork: 'zalo-ultty_data',
      dataNetworkInternal: true,
      flowiseAddresses: ['172.24.0.3'],
      crossTenantReachable: false,
    },
    auth: {
      mode: 'session',
      unauthorizedStatus: 401,
      operatorLoginVerified: true,
      csrfVerified: true,
    },
    media: {
      implementation: 'gcs',
      real: true,
      healthy: true,
      reachabilityChecked: true,
    },
    parser: {
      implementation: 'deepseek',
      real: true,
      healthy: true,
      structuredOutputValid: true,
      fallbackUsed: false,
      correlationId: 'gd1-real-001',
      providerRequestId: 'provider-request-001',
    },
    zalo: {
      implementation: 'zca',
      real: true,
      state: 'ready',
      inbound: {
        source: 'zalo_inbound',
        correlationId: 'gd1-real-001',
        externalMessageId: 'zalo-message-001',
        storedMessageId: '8bf6f7af-a0de-43c0-8a46-a1bb94cab83c',
        allowedTestGroup: true,
        observedAt: '2026-08-20T10:05:00.000Z',
      },
    },
    order: {
      source: 'zalo_inbound',
      correlationId: 'gd1-real-001',
      orderId: 'd4c88984-da9e-4e46-b62d-f77169747234',
      persisted: true,
      rulesEvaluated: true,
      operatorVisible: true,
    },
    readiness: {
      reachable: true,
      goLiveReady: false,
      checks: [
        { key: 'tenant.loaded', status: 'ready' },
        { key: 'channel.production', status: 'ready' },
      ],
    },
  };
}

test('passes a real Ultty GD1-test proof and reports explicit scope decisions', () => {
  const result = verifyDeployment({ tenant: tenant(), release: release(), evidence: evidence() });

  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.equal(result.components.flowise.status, 'REAL');
  assert.equal(result.components.network.status, 'REAL');
  assert.equal(result.components.readiness.status, 'OBSERVED');
  assert.equal(result.components.zalo.status, 'REAL');
  assert.equal(result.components.parser.status, 'REAL');
  assert.equal(result.components.orders.status, 'REAL');
  assert.equal(result.components.erp.status, 'NOT IN GD1 SCOPE');
  assert.equal(result.components.invoice.status, 'NOT IN GD1 SCOPE');
  assert.equal(result.components.notifications.status, 'UNRESOLVED');
  assert.match(result.components.notifications.detail, /scenario/i);
  assert.equal(
    result.readiness.goLiveReady,
    false,
    'technical proof must not promote pilot readiness',
  );
});

test('rejects incomplete or mismatched release identity', () => {
  const badRelease = { ...release(), tenant: 'amico', workflowRunId: '' };
  const badEvidence = evidence();
  badEvidence.release = badRelease;

  const result = verifyDeployment({ tenant: tenant(), release: badRelease, evidence: badEvidence });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /release tenant.*ultty/i);
  assert.match(result.errors.join('\n'), /workflowRunId/i);
});

test('rejects mutable tags and malformed artifact identities', () => {
  const badRelease = {
    ...release(),
    appDigest: 'registry/app:latest',
    flowiseDigest: 'registry/flowise:sha',
    gitSha: 'short',
  };
  const badEvidence = evidence();
  badEvidence.release = badRelease;

  const result = verifyDeployment({ tenant: tenant(), release: badRelease, evidence: badEvidence });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /gitSha/i);
  assert.match(result.errors.join('\n'), /appDigest/i);
  assert.match(result.errors.join('\n'), /flowiseDigest/i);
});

test('does not accept demo/simulate, mock, fake, or fixture evidence as Zalo inbound proof', () => {
  for (const source of ['demo/simulate', 'mock', 'fake', 'fixture']) {
    const badEvidence = evidence();
    badEvidence.zalo.inbound.source = source;
    const result = verifyDeployment({
      tenant: tenant(),
      release: release(),
      evidence: badEvidence,
    });
    assert.equal(result.ok, false, source);
    assert.match(result.errors.join('\n'), /Zalo inbound.*zalo_inbound/i);
  }
});

test('requires one correlation across real Zalo, parser, and persisted sales-order path', () => {
  const badEvidence = evidence();
  badEvidence.parser.correlationId = 'different-parser-correlation';
  badEvidence.order.correlationId = 'different-order-correlation';

  const result = verifyDeployment({ tenant: tenant(), release: release(), evidence: badEvidence });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /parser correlation/i);
  assert.match(result.errors.join('\n'), /order correlation/i);
});

test('requires real messaging proof only when messaging is enabled', () => {
  const knowledgeEvidence = evidence();
  delete knowledgeEvidence.zalo;
  delete knowledgeEvidence.parser;
  delete knowledgeEvidence.order;
  delete knowledgeEvidence.media;

  const result = verifyDeployment({
    tenant: tenant(['knowledge']),
    release: release(),
    evidence: knowledgeEvidence,
  });

  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.equal(result.components.zalo.status, 'NOT REQUIRED');
  assert.equal(result.components.parser.status, 'NOT REQUIRED');
  assert.equal(result.components.orders.status, 'NOT REQUIRED');
  assert.equal(result.components.media.status, 'NOT REQUIRED');
});

test('requires sales-order order correlation only when sales-order is enabled', () => {
  const messagingEvidence = evidence();
  delete messagingEvidence.parser;
  delete messagingEvidence.order;
  delete messagingEvidence.media;

  const result = verifyDeployment({
    tenant: tenant(['knowledge', 'messaging']),
    release: release(),
    evidence: messagingEvidence,
  });

  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.equal(result.components.zalo.status, 'REAL');
  assert.equal(result.components.orders.status, 'NOT REQUIRED');
});

test('fails closed for mock parser, media, auth, or unhealthy infrastructure', () => {
  const badEvidence = evidence();
  badEvidence.parser.implementation = 'mock';
  badEvidence.media.real = false;
  badEvidence.auth.mode = 'none';
  badEvidence.containers.api.health = 'unhealthy';
  badEvidence.network.flowiseAddresses.push('172.99.0.8');

  const result = verifyDeployment({ tenant: tenant(), release: release(), evidence: badEvidence });

  assert.equal(result.ok, false);
  assert.equal(result.components.api.status, 'FAILED');
  assert.equal(result.components.network.status, 'FAILED');
  assert.equal(result.components.auth.status, 'FAILED');
  assert.equal(result.components.media.status, 'FAILED');
  assert.equal(result.components.parser.status, 'FAILED');
  assert.match(result.errors.join('\n'), /parser implementation.*real/i);
  assert.match(result.errors.join('\n'), /media.*real/i);
  assert.match(result.errors.join('\n'), /auth mode/i);
  assert.match(result.errors.join('\n'), /container api/i);
  assert.match(result.errors.join('\n'), /exactly one Flowise address/i);
});

test('verifies notifications only when an explicit real scenario is supplied', () => {
  const withScenario = evidence();
  withScenario.notifications = {
    scenario: 'lead-dispatch-test',
    implementation: 'zca',
    real: true,
    delivered: true,
    correlationId: 'notification-001',
  };

  const result = verifyDeployment({ tenant: tenant(), release: release(), evidence: withScenario });

  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.equal(result.components.notifications.status, 'REAL');
});

test('rejects secret-bearing evidence so proof artifacts are safe to publish', () => {
  const leakingEvidence = evidence();
  leakingEvidence.auth.sessionSecret = 'must-not-appear';

  const result = verifyDeployment({
    tenant: tenant(),
    release: release(),
    evidence: leakingEvidence,
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /secret-bearing field.*sessionSecret/i);
});

test('CLI emits machine-readable proof and returns a failing exit code for forbidden stimulus', () => {
  const directory = mkdtempSync(join(tmpdir(), 'verify-deployment-'));
  const tenantPack = join(directory, 'tenant-pack');
  const releasePath = join(directory, 'release.json');
  const evidencePath = join(directory, 'evidence.json');
  mkdirSync(tenantPack);
  writeFileSync(join(tenantPack, 'tenant.json'), JSON.stringify(tenant()));
  writeFileSync(releasePath, JSON.stringify(release()));
  writeFileSync(evidencePath, JSON.stringify(evidence()));

  try {
    const entrypoint = fileURLToPath(new URL('./verify-deployment.mjs', import.meta.url));
    const valid = spawnSync(
      process.execPath,
      [
        entrypoint,
        '--tenant-pack',
        tenantPack,
        '--release',
        releasePath,
        '--evidence',
        evidencePath,
        '--json',
      ],
      { encoding: 'utf8' },
    );
    assert.equal(valid.status, 0, valid.stderr || valid.stdout);
    assert.equal(JSON.parse(valid.stdout).ok, true);

    const forbidden = evidence();
    forbidden.zalo.inbound.source = 'demo/simulate';
    writeFileSync(evidencePath, JSON.stringify(forbidden));
    const invalid = spawnSync(
      process.execPath,
      [
        entrypoint,
        '--tenant-pack',
        tenantPack,
        '--release',
        releasePath,
        '--evidence',
        evidencePath,
      ],
      { encoding: 'utf8' },
    );
    assert.equal(invalid.status, 1, invalid.stderr || invalid.stdout);
    assert.match(invalid.stdout, /demo\/simulate and synthetic proof are forbidden/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

// Mot khach co the co HAI stack. Mang thuoc ve STACK, nen verifier phai doi
// `zalo-ultty-gd1-test_backend` cho stack gd1-test — neu no van doi theo tenant slug thi chinh
// lan deploy ma no sinh ra de kiem tra se bi bao truot.
test('network identity follows the stack, not the tenant', () => {
  const stackRelease = { ...release(), stack: 'ultty-gd1-test' };
  const stackEvidence = {
    ...evidence(),
    release: stackRelease,
    network: {
      ...evidence().network,
      backendNetwork: 'zalo-ultty-gd1-test_backend',
      dataNetwork: 'zalo-ultty-gd1-test_data',
    },
  };

  const result = verifyDeployment({
    tenant: tenant(),
    release: stackRelease,
    evidence: stackEvidence,
  });
  assert.equal(
    result.errors.filter((error) => error.includes('network identity')).length,
    0,
    result.errors.join('\n'),
  );

  // Va stack gd1-test KHONG duoc di qua bang mang cua stack dang chay.
  const borrowed = verifyDeployment({
    tenant: tenant(),
    release: stackRelease,
    evidence: {
      ...stackEvidence,
      network: {
        ...stackEvidence.network,
        backendNetwork: 'zalo-ultty_backend',
        dataNetwork: 'zalo-ultty_data',
      },
    },
  });
  assert.match(borrowed.errors.join('\n'), /network identity is incorrect/);
});

// Release cu khong ghi truong `stack`; chung phai tiep tuc kiem theo tenant slug nhu truoc.
test('a release without a stack field still verifies against the tenant slug', () => {
  const result = verifyDeployment({
    tenant: tenant(),
    release: release(),
    evidence: evidence(),
  });
  assert.equal(
    result.errors.filter((error) => error.includes('network identity')).length,
    0,
    result.errors.join('\n'),
  );
});
