import assert from 'node:assert/strict';
import test from 'node:test';

import { formatDeploymentPlan, validateGd1TestPreflight } from './gd1-test-preflight.mjs';

const digest = (character) =>
  `asia-southeast1-docker.pkg.dev/example/netviet/app@sha256:${character.repeat(64)}`;

function validInput() {
  const secretSuffixes = [
    'postgres-admin-password',
    'zalo-db-password',
    'flowise-db-password',
    'deepseek-api-key',
    'api-key',
    'operator-password',
    'flowise-secretkey',
    'flowise-admin-email',
    'flowise-admin-password',
    'flowise-jwt-secret',
    'flowise-refresh-secret',
    'flowise-session-secret',
    'flowise-token-hash-secret',
  ];
  return {
    tenant: {
      schemaVersion: 2,
      slug: 'ultty',
      experience: 'operations-console',
      capabilities: [
        'knowledge',
        'messaging',
        'sales-order',
        'campaign',
        'operations',
        'notifications',
      ],
      integrations: {
        channel: { allowedAdapters: ['zca'] },
        parser: { allowedAdapters: ['deepseek'] },
      },
    },
    deployment: {
      environment: 'gd1-test',
      targetConfirmed: true,
      target: {
        id: 'current-shared-vm',
        server: 'netviet',
        gcpProjectId: 'example',
        region: 'asia-southeast1',
        zone: 'asia-southeast1-b',
        appDir: '/srv/netviet/apps/zalo-ultty',
        composeProject: 'zalo-ultty',
        database: 'zalo',
        network: 'zalo-ultty_backend',
        hostname: 'demo.example.test',
        secretPrefix: 'zalo-ultty-',
      },
      git: {
        ref: 'refs/heads/main',
        sha: 'a'.repeat(40),
        ciConclusion: 'success',
      },
      runtime: {
        persistence: 'prisma',
        channel: 'zca',
        parser: 'deepseek',
        mediaStore: 'gcs',
        auth: 'session',
        autoSend: 'off',
        dataClassification: 'test',
      },
      approvedAllowedGroups: ['group-test-a', 'group-test-b'],
      observedAllowedGroups: ['group-test-b', 'group-test-a'],
      providerProof: {
        adapter: 'deepseek',
        credentialReady: true,
        healthPassed: true,
        structuredOutputPassed: true,
        timeoutConfigured: true,
        retryConfigured: true,
        fallbackDisabled: true,
      },
      credentials: {
        zcaSession: { exists: true, regularFile: true, mode: '600', nonEmpty: true },
        requiredSecrets: secretSuffixes.map((suffix) => ({
            name: `zalo-ultty-${suffix}`,
            exists: true,
            enabledVersion: true,
            vmCanAccess: true,
            nonEmpty: true,
            hasCarriageReturn: false,
            hasLineFeed: false,
          })),
      },
      rollback: {
        appImage: digest('b'),
        flowiseImage: digest('c'),
      },
    },
  };
}

test('accepts an explicit no-mock Ultty GD1-test deployment contract', () => {
  const result = validateGd1TestPreflight(validInput());

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.plan.tenant, 'ultty');
  assert.equal(result.plan.environment, 'gd1-test');
  assert.equal(result.plan.expectedIntegrations, 'channel=zca, parser=deepseek, media=gcs');
});

test('rejects an unconfirmed or ambiguous deployment target', () => {
  const base = validInput();
  const input = {
    ...base,
    deployment: {
      ...base.deployment,
      targetConfirmed: false,
      environment: 'production',
    },
  };

  const result = validateGd1TestPreflight(input);

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /environment must be gd1-test/);
  assert.match(result.errors.join('\n'), /target must be explicitly confirmed/);
});

test('rejects every mock, in-memory, none or unsafe runtime mode', () => {
  const rejected = [
    ['persistence', 'memory'],
    ['channel', 'mock'],
    ['parser', 'mock'],
    ['mediaStore', 'none'],
    ['auth', 'none'],
    ['autoSend', 'on'],
    ['dataClassification', 'customer'],
  ];

  for (const [field, value] of rejected) {
    const base = validInput();
    const input = {
      ...base,
      deployment: {
        ...base.deployment,
        runtime: { ...base.deployment.runtime, [field]: value },
      },
    };
    const result = validateGd1TestPreflight(input);
    assert.equal(result.ok, false, `${field}=${value} must fail`);
    assert.match(result.errors.join('\n'), new RegExp(field, 'i'));
  }
});

test('rejects adapter selections not permitted by the tenant pack', () => {
  const base = validInput();
  const input = {
    ...base,
    tenant: {
      ...base.tenant,
      integrations: {
        channel: { allowedAdapters: ['bot'] },
        parser: { allowedAdapters: ['claude'] },
      },
    },
  };

  const result = validateGd1TestPreflight(input);

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /selected channel is not allowed/);
  assert.match(result.errors.join('\n'), /selected parser is not allowed/);
});

test('rejects an unapproved Zalo group or an incomplete approved set', () => {
  const base = validInput();
  const input = {
    ...base,
    deployment: {
      ...base.deployment,
      observedAllowedGroups: ['group-test-a', 'group-production'],
    },
  };

  const result = validateGd1TestPreflight(input);

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /allowed groups do not exactly match/);
});

test('rejects missing ZCA credentials and unhealthy secret metadata', () => {
  const base = validInput();
  const input = {
    ...base,
    deployment: {
      ...base.deployment,
      credentials: {
        ...base.deployment.credentials,
        zcaSession: { ...base.deployment.credentials.zcaSession, nonEmpty: false },
        requiredSecrets: base.deployment.credentials.requiredSecrets.map((secret, index) =>
          index === 0 ? { ...secret, vmCanAccess: false, hasCarriageReturn: true } : secret,
        ),
      },
    },
  };

  const result = validateGd1TestPreflight(input);

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /ZCA session credential/);
  assert.match(result.errors.join('\n'), /VM cannot access/);
  assert.match(result.errors.join('\n'), /CR\/LF/);
});

test('rejects non-main, non-green or unidentified rollback state', () => {
  const base = validInput();
  const input = {
    ...base,
    deployment: {
      ...base.deployment,
      git: {
        ...base.deployment.git,
        ref: 'refs/heads/feature',
        ciConclusion: 'failure',
      },
      rollback: { ...base.deployment.rollback, flowiseImage: 'latest' },
    },
  };

  const result = validateGd1TestPreflight(input);

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /main/);
  assert.match(result.errors.join('\n'), /CI.*success/);
  assert.match(result.errors.join('\n'), /Flowise rollback image/);
});

test('formats a redacted plan without credential metadata or secret names', () => {
  const base = validInput();
  const input = {
    ...base,
    deployment: {
      ...base.deployment,
      credentials: {
        ...base.deployment.credentials,
        requiredSecrets: base.deployment.credentials.requiredSecrets.map((secret, index) =>
          index === 0 ? { ...secret, name: 'must-not-appear' } : secret,
        ),
      },
    },
  };
  const { plan } = validateGd1TestPreflight(input);

  const output = formatDeploymentPlan(plan);

  assert.match(output, /Tenant: ultty/);
  assert.match(output, /Environment: gd1-test/);
  assert.match(output, /Expected integrations: channel=zca, parser=deepseek, media=gcs/);
  assert.match(output, /Allowed Zalo groups: 2 approved IDs \(redacted\)/);
  assert.doesNotMatch(output, /must-not-appear/);
  assert.doesNotMatch(output, /group-test-a|group-test-b/);
});

test('rejects a missing tenant, target and secret inventory without throwing', () => {
  const result = validateGd1TestPreflight({
    deployment: {
      environment: 'gd1-test',
      targetConfirmed: true,
      git: { ref: 'refs/heads/main', sha: 'a'.repeat(40), ciConclusion: 'success' },
      runtime: {
        persistence: 'prisma',
        channel: 'zca',
        parser: 'deepseek',
        mediaStore: 'gcs',
        auth: 'session',
        autoSend: 'off',
        dataClassification: 'test',
      },
      approvedAllowedGroups: [],
      observedAllowedGroups: [],
      credentials: {
        zcaSession: { exists: false },
        requiredSecrets: [],
      },
      rollback: { appImage: 'latest', flowiseImage: 'latest' },
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.plan, undefined);
  assert.match(result.errors.join('\n'), /tenant schemaVersion/);
  assert.match(result.errors.join('\n'), /deployment target id/);
  assert.match(result.errors.join('\n'), /required secret metadata/);
  assert.match(result.errors.join('\n'), /allowed groups/);
});

test('rejects duplicate allowed groups, invalid SHA and invalid app rollback digest', () => {
  const base = validInput();
  const input = {
    ...base,
    deployment: {
      ...base.deployment,
      git: { ...base.deployment.git, sha: 'short' },
      approvedAllowedGroups: ['group-test-a', 'group-test-a'],
      observedAllowedGroups: ['group-test-a'],
      rollback: { ...base.deployment.rollback, appImage: 'latest' },
    },
  };

  const result = validateGd1TestPreflight(input);

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /40-character/);
  assert.match(result.errors.join('\n'), /app rollback image/);
  assert.match(result.errors.join('\n'), /allowed groups/);
});

test('rejects missing secret attributes and an unnamed secret safely', () => {
  const base = validInput();
  const input = {
    ...base,
    deployment: {
      ...base.deployment,
      credentials: {
        ...base.deployment.credentials,
        requiredSecrets: [
          {},
          ...base.deployment.credentials.requiredSecrets.slice(1),
        ],
      },
    },
  };

  const result = validateGd1TestPreflight(input);

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /secret #1 does not exist/);
  assert.match(result.errors.join('\n'), /has no enabled version/);
  assert.match(result.errors.join('\n'), /is empty/);
});

test('rejects blank Zalo group IDs and incomplete parser provider proof', () => {
  const base = validInput();
  const input = {
    ...base,
    deployment: {
      ...base.deployment,
      approvedAllowedGroups: [''],
      observedAllowedGroups: [''],
      providerProof: {
        ...base.deployment.providerProof,
        healthPassed: false,
        fallbackDisabled: false,
      },
    },
  };

  const result = validateGd1TestPreflight(input);

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /allowed groups/);
  assert.match(result.errors.join('\n'), /healthPassed/);
  assert.match(result.errors.join('\n'), /fallbackDisabled/);
});

test('rejects a missing observed Zalo group inventory without throwing', () => {
  const base = validInput();
  const input = {
    ...base,
    deployment: {
      ...base.deployment,
      observedAllowedGroups: undefined,
    },
  };

  const result = validateGd1TestPreflight(input);

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /allowed groups/);
});

test('refuses to print an absent deployment plan', () => {
  assert.throws(() => formatDeploymentPlan(undefined), /validated deployment plan/);
});
