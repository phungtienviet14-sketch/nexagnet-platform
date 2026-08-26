import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  collectGd1TestPreflight,
  formatDeploymentPlan,
  hashZaloGroupId,
  validateGd1TestPreflight,
} from './gd1-test-preflight.mjs';

const digest = (character) =>
  `asia-southeast1-docker.pkg.dev/example/netviet/app@sha256:${character.repeat(64)}`;

const secretInventoryOutput = (status = 'nonempty|0|0') =>
  Array.from({ length: 13 }, (_, index) => `${index}|${status}`).join('\n') + '\n';

function collectorEnv(rawGroups, overrides = {}) {
  return {
    TENANT: 'ultty',
    ENVIRONMENT: 'gd1-test',
    GCP_PROJECT_ID: 'example',
    GCP_REGION: 'asia-southeast1',
    GCP_ZONE: 'asia-southeast1-b',
    VM_NAME: 'netviet',
    GIT_SHA: 'a'.repeat(40),
    GITHUB_REF: 'refs/heads/main',
    GD1_TEST_TARGET_CONFIRMED: '1',
    GD1_TEST_CI_CONCLUSION: 'success',
    GD1_TEST_APPROVED_GROUP_HASHES: rawGroups.map(hashZaloGroupId).join(','),
    ...overrides,
  };
}

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

test('collector builds a validated redacted snapshot from live read-only probes', async () => {
  const commands = [];
  const rawGroups = ['5418371951945064288', '6732452832330077759'];
  const appImage = digest('d');
  const flowiseImage = digest('e');
  const env = collectorEnv(rawGroups);
  const run = async (program, args) => {
    commands.push([program, ...args].join(' '));
    const commandText = args.join(' ');
    if (commandText.includes('addresses describe')) return '203.0.113.10\n';
    if (commandText.includes('.runtime/secrets.env') && commandText.includes('test -f')) {
      return 'present\n';
    }
    if (commandText.includes('loadEnv')) {
      return [
        'PERSISTENCE=prisma',
        'CHANNEL_MODE=zca',
        'PARSER_MODE=deepseek',
        'MEDIA_STORE=gcs',
        'AUTH_MODE=session',
        'AUTO_SEND=off',
        'DATA_CLASSIFICATION=test',
      ].join('\n');
    }
    if (commandText.includes('zalo-allowed-groups.json')) {
      return rawGroups.map(hashZaloGroupId).join('\n');
    }
    if (commandText.includes('zalo-cred.json')) return 'regular file|600|512\n';
    if (commandText.includes('runtime_value APP_IMAGE')) return `${appImage}\n`;
    if (commandText.includes('runtime_value FLOWISE_IMAGE')) return `${flowiseImage}\n`;
    if (commandText.includes('secrets versions list')) return '1\n';
    if (commandText.includes('secrets versions access')) return secretInventoryOutput();
    if (commandText.includes('smoke-test.mjs')) return 'Pilot smoke OK\n';
    throw new Error(`unexpected command: ${commandText}`);
  };

  const result = await collectGd1TestPreflight({ env, run });

  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.equal(result.plan.approvedAllowedGroupCount, 2);
  assert.equal(result.input.deployment.rollback.appImage, appImage);
  assert.equal(result.input.deployment.providerProof.healthPassed, true);
  assert.equal(result.input.deployment.providerProof.fallbackDisabled, true);
  assert.deepEqual(result.input.deployment.approvedAllowedGroups, rawGroups.map(hashZaloGroupId));
  assert.deepEqual(result.input.deployment.observedAllowedGroups, rawGroups.map(hashZaloGroupId));
  const commandLog = commands.join('\n');
  assert.match(commandLog, /smoke-test\.mjs/);
  assert.match(commandLog, /sudo -n true/);
  assert.match(commandLog, /sudo -n test -f/);
  const privilegedRuntimeProbes = commands.filter((command) =>
    [
      'loadEnv',
      'zalo-allowed-groups.json',
      'zalo-cred.json',
      'runtime_value APP_IMAGE',
      'runtime_value FLOWISE_IMAGE',
      'smoke-test.mjs',
    ].some((marker) => command.includes(marker)),
  );
  assert.equal(privilegedRuntimeProbes.length, 6);
  for (const command of privilegedRuntimeProbes) assert.match(command, /sudo -n bash -c/);
  for (const rawGroup of rawGroups) assert.doesNotMatch(commandLog, new RegExp(rawGroup));
  const secretInventoryProbes = commands.filter((command) =>
    command.includes('secrets versions access'),
  );
  assert.equal(
    secretInventoryProbes.length,
    1,
    'the full secret inventory must use one IAP session, not one tunnel per secret',
  );
});

test('collector reports IAP transport failure instead of inventing missing secrets', async () => {
  const rawGroups = ['5418371951945064288', '6732452832330077759'];
  const env = collectorEnv(rawGroups);
  const run = async (_program, args) => {
    const commandText = args.join(' ');
    if (commandText.includes('addresses describe')) return '203.0.113.10\n';
    if (commandText.includes('.runtime/secrets.env') && commandText.includes('test -f')) {
      return 'absent\n';
    }
    if (commandText.includes('secrets versions access')) {
      throw new Error("IAP tunnel failed: 4033 'not authorized'");
    }
    throw new Error(`unexpected command: ${commandText}`);
  };

  const result = await collectGd1TestPreflight({ env, run });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /preflight collection failed.*secret inventory.*transport/i);
  assert.doesNotMatch(result.errors.join('\n'), /secret #\d+ does not exist/);
});

test('collector does not classify a stack-probe transport failure as first release', async () => {
  const rawGroups = ['5418371951945064288', '6732452832330077759'];
  const env = collectorEnv(rawGroups);
  const run = async (_program, args) => {
    const commandText = args.join(' ');
    if (commandText.includes('addresses describe')) return '203.0.113.10\n';
    if (commandText.includes('.runtime/secrets.env') && commandText.includes('test -f')) {
      throw new Error("IAP tunnel failed: 4033 'not authorized'");
    }
    throw new Error(`unexpected command: ${commandText}`);
  };

  const result = await collectGd1TestPreflight({ env, run });

  assert.equal(result.ok, false);
  assert.equal(result.plan, undefined);
  assert.match(result.errors.join('\n'), /preflight collection failed.*stack existence.*transport/i);
});

test('collector rejects an incomplete existing stack instead of treating it as first release', async () => {
  const rawGroups = ['5418371951945064288', '6732452832330077759'];
  const env = collectorEnv(rawGroups);
  const run = async (_program, args) => {
    const commandText = args.join(' ');
    if (commandText.includes('addresses describe')) return '203.0.113.10\n';
    if (commandText.includes('.runtime/secrets.env') && commandText.includes('sudo -n test -f')) {
      return 'incomplete\n';
    }
    throw new Error(`unexpected command: ${commandText}`);
  };

  const result = await collectGd1TestPreflight({ env, run });

  assert.equal(result.ok, false);
  assert.equal(result.plan, undefined);
  assert.match(result.errors.join('\n'), /stack existence probe returned invalid metadata/i);
});

test('collector rejects shell metacharacters before starting any remote probe', async () => {
  let probeCount = 0;
  const rawGroups = ['5418371951945064288', '6732452832330077759'];
  const result = await collectGd1TestPreflight({
    env: collectorEnv(rawGroups, {
      GCP_PROJECT_ID: "example'; touch /tmp/injected; echo '",
    }),
    run: async () => {
      probeCount += 1;
      throw new Error('must not run');
    },
  });

  assert.equal(result.ok, false);
  assert.equal(probeCount, 0);
  assert.match(result.errors.join('\n'), /GCP_PROJECT_ID contains unsafe characters/);
});

test('collector rejects incomplete batched secret evidence', async () => {
  const rawGroups = ['5418371951945064288', '6732452832330077759'];
  const env = collectorEnv(rawGroups);
  const run = async (_program, args) => {
    const commandText = args.join(' ');
    if (commandText.includes('addresses describe')) return '203.0.113.10\n';
    if (commandText.includes('.runtime/secrets.env') && commandText.includes('test -f')) {
      return 'absent\n';
    }
    if (commandText.includes('secrets versions access')) {
      return secretInventoryOutput().split('\n').filter((line) => !line.startsWith('10|')).join('\n');
    }
    throw new Error(`unexpected command: ${commandText}`);
  };

  const result = await collectGd1TestPreflight({ env, run });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /preflight collection failed.*invalid metadata/i);
  assert.doesNotMatch(result.errors.join('\n'), /secret #10 does not exist/);
});

test('collector keeps a real denied secret fail-closed after batching', async () => {
  const rawGroups = ['5418371951945064288', '6732452832330077759'];
  const env = collectorEnv(rawGroups);
  const run = async (_program, args) => {
    const commandText = args.join(' ');
    if (commandText.includes('addresses describe')) return '203.0.113.10\n';
    if (commandText.includes('.runtime/secrets.env') && commandText.includes('test -f')) {
      return 'absent\n';
    }
    if (commandText.includes('secrets versions access')) {
      return secretInventoryOutput().replace('9|nonempty|0|0', '9|denied|0|0');
    }
    throw new Error(`unexpected command: ${commandText}`);
  };

  const result = await collectGd1TestPreflight({ env, run });
  const errors = result.errors.join('\n');

  assert.equal(result.ok, false);
  assert.match(errors, /required secret #10 does not exist/);
  assert.match(errors, /VM cannot read required secret #10/);
});

test('collector fails closed without approved TEST group hashes', async () => {
  const result = await collectGd1TestPreflight({
    env: collectorEnv([]),
    run: async () => {
      throw new Error('collector should not probe remote state before static inputs are complete');
    },
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /approved TEST group hashes/);
});

test('deploy-ci runs Ultty GD1-test preflight before any image build or push', async () => {
  const deployCi = await readFile(new URL('./deploy-ci.sh', import.meta.url), 'utf8');
  const preflightIndex = deployCi.indexOf('node deploy/netviet/run-gd1-test-preflight.mjs');
  const buildIndex = deployCi.indexOf('docker build');
  const pushIndex = deployCi.indexOf('docker push');

  assert.ok(preflightIndex > 0, 'deploy-ci must invoke the GD1-test preflight');
  assert.ok(preflightIndex < buildIndex, 'preflight must run before app image build');
  assert.ok(preflightIndex < pushIndex, 'preflight must run before image push');
  assert.match(deployCi, /\$\{DEPLOYMENT_ENVIRONMENT\}"\s*==\s*"gd1-test"/);
  assert.ok(deployCi.indexOf('GCP_PROJECT_ID khong hop le') < buildIndex);
  assert.ok(deployCi.indexOf('GIT_SHA phai la full SHA') < buildIndex);
});

test('deploy-ci uses one archive transfer and one post-transfer IAP session', async () => {
  const deployCi = await readFile(new URL('./deploy-ci.sh', import.meta.url), 'utf8');
  const afterArchive = deployCi.slice(deployCi.indexOf('tar -czf'));

  assert.equal((afterArchive.match(/\bscp_vm\s+"/g) ?? []).length, 1);
  assert.equal((afterArchive.match(/\bssh_vm\s+"/g) ?? []).length, 1);
  assert.match(afterArchive, /scp_vm "\$\{staging\}\/payload\.tar\.gz" "\$\{remote_archive\}"/);
  assert.match(
    afterArchive,
    /ssh_vm "install -d[^\n]+tar -xzf[^\n]+rm -f[^\n]+deploy-remote\.sh/,
  );
});

// Cong "chi ultty moi co gd1-test" khong con nam trong deploy-ci.sh: deploy-ci gate theo MOI
// TRUONG, con rang buoc khach nam o hai cho khong the di vong — registry (chi dang ky
// ultty/gd1-test) va render-secrets.sh (tu choi render profile gd1-test cho khach khac).
// Kiem o day de mot lan "don dep" khong lang le go mat cong do.
test('the gd1-test runtime profile is refused for any tenant other than Ultty', async () => {
  const renderSecrets = await readFile(new URL('./render-secrets.sh', import.meta.url), 'utf8');
  const profileIndex = renderSecrets.indexOf("DEPLOYMENT_ENVIRONMENT}\" == 'gd1-test'");

  assert.ok(profileIndex > 0, 'render-secrets must carry an explicit gd1-test profile');
  assert.match(renderSecrets, /\$\{TENANT_SLUG\}"\s*==\s*'ultty'/);
  assert.match(renderSecrets, /AUTO_SEND='off'/);
  assert.match(renderSecrets, /CHANNEL_MODE='zca'/);
});

test('a first release is collectable and names what it has not proved yet', async () => {
  const rawGroups = ['5418371951945064288', '6732452832330077759'];
  const env = collectorEnv(rawGroups);
  const run = async (program, args) => {
    const commandText = args.join(' ');
    if (commandText.includes('addresses describe')) return '203.0.113.10\n';
    // The stack does not exist yet: this is what the probe really returns on a first release.
    if (commandText.includes('.runtime/secrets.env') && commandText.includes('test -f')) {
      return 'absent\n';
    }
    if (commandText.includes('secrets versions list')) return '1\n';
    if (commandText.includes('secrets versions access')) return secretInventoryOutput();
    throw new Error(`probe must not run against a stack that does not exist: ${commandText}`);
  };

  const result = await collectGd1TestPreflight({ env, run });

  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.equal(result.plan.firstRelease, true);
  assert.equal(result.plan.stack, 'ultty-gd1-test');
  assert.equal(result.plan.composeProject, 'zalo-ultty-gd1-test');
  assert.equal(result.input.deployment.rollback.firstRelease, true);
  // Nothing may be reported as proved on a first release just because it could not be probed.
  assert.ok(result.plan.deferredToPostDeploy.includes('zca session ready'));
  assert.ok(result.plan.deferredToPostDeploy.includes('live provider call'));
  assert.match(formatDeploymentPlan(result.plan), /NOT PROVED YET/);
});

test('a first release still targets a stack of its own, never the live one', async () => {
  const identityProbes = [];
  const rawGroups = ['5418371951945064288', '6732452832330077759'];
  const env = collectorEnv(rawGroups);
  const run = async (program, args) => {
    const commandText = args.join(' ');
    identityProbes.push(commandText);
    if (commandText.includes('addresses describe')) return '203.0.113.10\n';
    if (commandText.includes('.runtime/secrets.env') && commandText.includes('test -f')) {
      return 'absent\n';
    }
    if (commandText.includes('secrets versions list')) return '1\n';
    if (commandText.includes('secrets versions access')) return secretInventoryOutput();
    throw new Error(`unexpected: ${commandText}`);
  };

  const result = await collectGd1TestPreflight({ env, run });

  assert.equal(result.ok, true, result.errors.join('\n'));
  const target = result.input.deployment.target;
  assert.equal(target.appDir, '/srv/netviet/apps/zalo-ultty-gd1-test');
  assert.equal(target.composeProject, 'zalo-ultty-gd1-test');
  assert.equal(target.network, 'zalo-ultty-gd1-test_backend');
  assert.equal(target.secretPrefix, 'zalo-ultty-gd1-test-');
  assert.equal(target.hostname, 'operator-ultty-gd1-test.203-0-113-10.sslip.io');
  // The live stack's paths must never appear in a gd1-test probe.
  const probeLog = identityProbes.join('\n');
  assert.doesNotMatch(probeLog, /apps\/zalo-ultty\//);
  assert.doesNotMatch(probeLog, /--secret zalo-ultty-(?!gd1-test-)/);
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

test('rejects GD1-test snapshots that do not name exactly two approved TEST groups', () => {
  const base = validInput();
  const input = {
    ...base,
    deployment: {
      ...base.deployment,
      approvedAllowedGroups: ['group-test-a'],
      observedAllowedGroups: ['group-test-a'],
    },
  };

  const result = validateGd1TestPreflight(input);

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /exactly two approved TEST groups/);
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
  assert.match(result.errors.join('\n'), /VM cannot read required secret/);
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

// Su co 20/08/2026: preflight CHAY DUNG va in ra ke hoach, nhung deploy chet ngay sau do khi doc
// lai chinh ket qua cua no. `mktemp` tao tep KHONG CO DUOI, va `require()` nap tep khong duoi
// nhu JavaScript chu khong phai JSON -> "SyntaxError: Unexpected token ':'". Lop bao ve dat sai
// cho nay tu no lam hong lan deploy ma no sinh ra de bao ve.
test('deploy-ci doc ket qua preflight bang JSON.parse, khong bang require()', async () => {
  const deployCi = await readFile(new URL('./deploy-ci.sh', import.meta.url), 'utf8');
  const preflightReads = deployCi
    .split('\n')
    .filter((line) => line.includes('preflight_output') && line.includes('node -e'));

  assert.ok(preflightReads.length >= 3, 'phai co it nhat 3 lan doc ket qua preflight');
  for (const line of preflightReads) {
    assert.doesNotMatch(
      line,
      /require\(process\.argv\[1\]\)/,
      'khong duoc nap ket qua preflight bang require(): tep tam khong co duoi .json',
    );
    assert.match(line, /JSON\.parse/, 'phai parse JSON tuong minh');
  }
});

// Su co 21/08/2026: mot ban va duoc ap MOT NUA. deploy-ci.sh biet lan nay la first release va bo
// qua yeu cau rollback digest, nhung deploy-remote.sh tren VM van giu cong CU va chan dung lan
// deploy do — dinh nghia `first_release` chua bao gio duoc ghi vao tep. Hai nua phai di cung nhau:
// mot nua khong co nua kia thi hoac chan nham, hoac (te hon) mo nham.
test('deploy-remote nhan va ton trong co first release cua deploy-ci', async () => {
  const deployRemote = await readFile(new URL('./deploy-remote.sh', import.meta.url), 'utf8');
  const deployCi = await readFile(new URL('./deploy-ci.sh', import.meta.url), 'utf8');

  // deploy-ci phai TRUYEN co xuong VM.
  assert.match(deployCi, /GD1_FIRST_RELEASE='\$\{first_release:-0\}'/);

  // deploy-remote phai NHAN co, va mac dinh phai la '0' (siet chat hon, khong phai long hon).
  assert.match(deployRemote, /first_release="\$\{GD1_FIRST_RELEASE:-0\}"/);

  // ...va cong rollback digest phai thuc su doc co do.
  const guard = deployRemote.match(
    /if \[\[ "\$deployment_environment" == 'gd1-test'[^\n]*\]\]; then\n {2}for digest in/,
  );
  assert.ok(guard, 'khong tim thay cong rollback digest cua gd1-test');
  assert.match(
    guard[0],
    /first_release" != '1'/,
    'cong rollback digest phai bo qua khi la first release, neu khong lan deploy dau bi chan',
  );
});
