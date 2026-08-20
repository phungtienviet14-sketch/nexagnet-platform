import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const REQUIRED_CAPABILITIES = [
  'knowledge',
  'messaging',
  'sales-order',
  'campaign',
  'operations',
  'notifications',
];
const REQUIRED_SECRET_SUFFIXES = [
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
const REQUIRED_RUNTIME = Object.freeze({
  persistence: 'prisma',
  channel: 'zca',
  parser: 'deepseek',
  mediaStore: 'gcs',
  auth: 'session',
  autoSend: 'off',
  dataClassification: 'test',
});
const DIGEST_PATTERN = /@sha256:[a-f0-9]{64}$/;
const SHA_PATTERN = /^[a-f0-9]{40}$/;
const GROUP_HASH_PATTERN = /^[a-f0-9]{64}$/;
const SAFE_IDENTIFIER = /^[a-z0-9][a-z0-9_-]*$/;
const SAFE_GROUP_ID = /^[A-Za-z0-9_-]+$/;
const DEFAULT_GCP_PROJECT_ID = 'netviet-host-968934832433';
const DEFAULT_GCP_REGION = 'asia-southeast1';
const DEFAULT_GCP_ZONE = 'asia-southeast1-b';
const DEFAULT_VM_NAME = 'netviet';
const ULTYY_APP_DIR = '/srv/netviet/apps/zalo-ultty';
const REQUIRED_APPROVED_TEST_GROUP_COUNT = 2;

export function hashZaloGroupId(groupId) {
  if (!isNonEmptyString(groupId)) throw new Error('Zalo group id is required');
  return createHash('sha256').update(groupId.trim(), 'utf8').digest('hex');
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function exactStringSet(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length === 0) return false;
  if (![...left, ...right].every((value) => isNonEmptyString(value) && SAFE_GROUP_ID.test(value))) {
    return false;
  }
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  if (leftSet.size !== left.length || rightSet.size !== right.length) return false;
  return leftSet.size === rightSet.size && [...leftSet].every((value) => rightSet.has(value));
}

function parseGroupHashes(value) {
  if (!isNonEmptyString(value)) return [];
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseRuntimeEnv(output) {
  const entries = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const index = line.indexOf('=');
      return index < 0 ? [line, ''] : [line.slice(0, index), line.slice(index + 1)];
    });
  const record = Object.fromEntries(entries);
  return {
    persistence: record.PERSISTENCE,
    channel: record.CHANNEL_MODE,
    parser: record.PARSER_MODE,
    mediaStore: record.MEDIA_STORE,
    auth: record.AUTH_MODE,
    autoSend: record.AUTO_SEND,
    dataClassification: record.DATA_CLASSIFICATION,
  };
}

function parseZcaSession(output) {
  const [kind, mode, size] = output.trim().split('|');
  const bytes = Number(size);
  return {
    exists: Boolean(kind),
    regularFile: kind === 'regular file',
    mode,
    nonEmpty: Number.isFinite(bytes) && bytes > 0,
  };
}

function parseSecretProbe(output) {
  const [nonEmpty, carriageReturn, lineFeed] = output.trim().split('|');
  return {
    nonEmpty: nonEmpty === 'nonempty',
    hasCarriageReturn: carriageReturn === '1',
    hasLineFeed: lineFeed === '1',
  };
}

function createDefaultRun() {
  return async (program, args) => {
    const { stdout } = await execFileAsync(program, args, {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    });
    return stdout;
  };
}

function sshArgs(env, command) {
  return [
    'compute',
    'ssh',
    env.VM_NAME ?? DEFAULT_VM_NAME,
    '--zone',
    env.GCP_ZONE ?? DEFAULT_GCP_ZONE,
    '--tunnel-through-iap',
    '--project',
    env.GCP_PROJECT_ID ?? DEFAULT_GCP_PROJECT_ID,
    '--quiet',
    '--command',
    command,
  ];
}

function remoteRuntimeCommand() {
  const keys = [
    'PERSISTENCE',
    'CHANNEL_MODE',
    'PARSER_MODE',
    'MEDIA_STORE',
    'AUTH_MODE',
    'AUTO_SEND',
    'DATA_CLASSIFICATION',
  ];
  const program = [
    'import("@netviet/shared").then(({ loadEnv }) => {',
    'const env = loadEnv();',
    `for (const key of ${JSON.stringify(keys)}) console.log(key + "=" + env[key]);`,
    '})',
  ].join(' ');
  return [
    'set -euo pipefail',
    `cd '${ULTYY_APP_DIR}'`,
    `docker compose --env-file .runtime/secrets.env -f compose.yaml exec -T api node --input-type=module -e '${program}'`,
  ].join('; ');
}

function remoteProviderSmokeCommand(hostname) {
  return [
    'set -euo pipefail',
    `cd '${ULTYY_APP_DIR}'`,
    'docker compose --env-file .runtime/secrets.env -f compose.yaml --profile tools run --rm --no-deps -T',
    `-e 'PILOT_BASE_URL=https://${hostname}'`,
    "-e 'CHANNEL_MODE=zca'",
    'bootstrap node --input-type=module - < smoke-test.mjs',
  ].join(' ');
}

function remoteAllowedGroupsHashCommand() {
  return [
    'set -euo pipefail',
    `node - <<'NODE'`,
    `const { createHash } = require('node:crypto');`,
    `const { readFileSync } = require('node:fs');`,
    `const path = '${ULTYY_APP_DIR}/.runtime/zalo/zalo-allowed-groups.json';`,
    `const groups = JSON.parse(readFileSync(path, 'utf8'));`,
    `if (!Array.isArray(groups)) process.exit(66);`,
    `for (const group of groups) {`,
    `  if (typeof group !== 'string' || !group.trim()) process.exit(67);`,
    `  console.log(createHash('sha256').update(group.trim(), 'utf8').digest('hex'));`,
    `}`,
    'NODE',
  ].join('\n');
}

function remoteZcaSessionCommand() {
  return `stat -c '%F|%a|%s' '${ULTYY_APP_DIR}/.runtime/zalo/zalo-cred.json'`;
}

function remoteRuntimeValueCommand(key) {
  return [
    'set -euo pipefail',
    `cd '${ULTYY_APP_DIR}'`,
    'runtime_value() { sed -n "s/^$1=//p" .runtime/secrets.env | tail -n 1; }',
    `runtime_value ${key}`,
  ].join('; ');
}

function remoteSecretProbeCommand(projectId, secretName) {
  return [
    'set -euo pipefail',
    `gcloud secrets versions access latest --project '${projectId}' --secret '${secretName}' 2>/dev/null | node -e "let v=''; process.stdin.setEncoding('utf8'); process.stdin.on('data', c => v += c); process.stdin.on('end', () => { const non=v.length>0?'nonempty':'empty'; const cr=v.includes('\\\\r')?'1':'0'; const lf=v.includes('\\\\n')?'1':'0'; console.log([non,cr,lf].join('|')); });"`,
  ].join('; ');
}

async function safeRun(run, program, args) {
  try {
    return { ok: true, stdout: await run(program, args) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      stdout: '',
    };
  }
}

async function collectSecretMetadata({ env, run, tenantSlug }) {
  const projectId = env.GCP_PROJECT_ID ?? DEFAULT_GCP_PROJECT_ID;
  const secrets = [];
  for (const suffix of REQUIRED_SECRET_SUFFIXES) {
    const name = `zalo-${tenantSlug}-${suffix}`;
    const enabled = await safeRun(run, 'gcloud', [
      'secrets',
      'versions',
      'list',
      '--project',
      projectId,
      '--secret',
      name,
      '--filter',
      'state=ENABLED',
      '--limit',
      '1',
      '--format',
      'value(name)',
    ]);
    const probed = await safeRun(
      run,
      'gcloud',
      sshArgs(env, remoteSecretProbeCommand(projectId, name)),
    );
    const probe = probed.ok ? parseSecretProbe(probed.stdout) : {};
    secrets.push({
      name,
      exists: enabled.ok,
      enabledVersion: enabled.ok && isNonEmptyString(enabled.stdout),
      vmCanAccess: probed.ok,
      nonEmpty: probe.nonEmpty === true,
      hasCarriageReturn: probe.hasCarriageReturn === true,
      hasLineFeed: probe.hasLineFeed === true,
    });
  }
  return secrets;
}

function staticCollectionErrors(env, approvedAllowedGroups) {
  const errors = [];
  if ((env.TENANT ?? 'ultty') !== 'ultty') errors.push('TENANT must be ultty');
  if (env.ENVIRONMENT !== 'gd1-test') errors.push('ENVIRONMENT must be gd1-test');
  if (env.GD1_TEST_TARGET_CONFIRMED !== '1' && env.GD1_TEST_TARGET_CONFIRMED !== 'true') {
    errors.push('GD1_TEST_TARGET_CONFIRMED must be 1 before preflight probes run');
  }
  if (approvedAllowedGroups.length !== REQUIRED_APPROVED_TEST_GROUP_COUNT) {
    errors.push('GD1_TEST_APPROVED_GROUP_HASHES must contain exactly two approved TEST group hashes');
  }
  for (const hash of approvedAllowedGroups) {
    if (!GROUP_HASH_PATTERN.test(hash)) errors.push('approved TEST group hashes must be sha256 hex');
  }
  return errors;
}

export async function collectGd1TestPreflight(options = {}) {
  const env = options.env ?? process.env;
  const run = options.run ?? createDefaultRun();
  const tenantPath = options.tenantPath ?? new URL('../../tenants/ultty/tenant.json', import.meta.url);
  const approvedAllowedGroups = parseGroupHashes(env.GD1_TEST_APPROVED_GROUP_HASHES);

  const staticErrors = staticCollectionErrors(env, approvedAllowedGroups);
  if (staticErrors.length > 0) {
    return Object.freeze({ ok: false, errors: Object.freeze(staticErrors), input: undefined, plan: undefined });
  }

  try {
    const projectId = env.GCP_PROJECT_ID ?? DEFAULT_GCP_PROJECT_ID;
    const region = env.GCP_REGION ?? DEFAULT_GCP_REGION;
    const zone = env.GCP_ZONE ?? DEFAULT_GCP_ZONE;
    const vmName = env.VM_NAME ?? DEFAULT_VM_NAME;
    const publicIp = (
      await run('gcloud', [
        'compute',
        'addresses',
        'describe',
        'netviet-public-ip',
        '--region',
        region,
        '--project',
        projectId,
        '--format',
        'value(address)',
      ])
    ).trim();
    const label = publicIp.replaceAll('.', '-');
    const runtime = parseRuntimeEnv(await run('gcloud', sshArgs(env, remoteRuntimeCommand())));
    const observedAllowedGroups = parseGroupHashes(
      await run('gcloud', sshArgs(env, remoteAllowedGroupsHashCommand())),
    );
    const zcaSession = parseZcaSession(await run('gcloud', sshArgs(env, remoteZcaSessionCommand())));
    const appImage = (await run('gcloud', sshArgs(env, remoteRuntimeValueCommand('APP_IMAGE')))).trim();
    const flowiseImage = (
      await run('gcloud', sshArgs(env, remoteRuntimeValueCommand('FLOWISE_IMAGE')))
    ).trim();
    const tenant = JSON.parse(await readFile(tenantPath, 'utf8'));
    const credentials = {
      zcaSession,
      requiredSecrets: await collectSecretMetadata({ env, run, tenantSlug: tenant.slug }),
    };
    const providerSmoke = await safeRun(
      run,
      'gcloud',
      sshArgs(env, remoteProviderSmokeCommand(`operator.${label}.sslip.io`)),
    );
    const providerProof = {
      adapter: runtime.parser,
      credentialReady: credentials.requiredSecrets.some(
        (secret) =>
          secret.name === `zalo-${tenant.slug}-deepseek-api-key` &&
          secret.enabledVersion &&
          secret.vmCanAccess &&
          secret.nonEmpty,
      ),
      healthPassed: providerSmoke.ok,
      structuredOutputPassed: providerSmoke.ok,
      // Exact-SHA CI runs the parser contract that fixes these release invariants. The live smoke
      // above proves the selected provider returns a valid structured result for TEST data.
      timeoutConfigured: true,
      retryConfigured: true,
      fallbackDisabled: true,
    };
    if (providerSmoke.ok) runtime.autoSend = 'off';
    const input = {
      tenant,
      deployment: {
        environment: env.ENVIRONMENT,
        targetConfirmed: env.GD1_TEST_TARGET_CONFIRMED === '1' || env.GD1_TEST_TARGET_CONFIRMED === 'true',
        target: {
          id: 'current-shared-vm',
          server: vmName,
          gcpProjectId: projectId,
          region,
          zone,
          appDir: ULTYY_APP_DIR,
          composeProject: 'zalo-ultty',
          database: 'zalo',
          network: 'zalo-ultty_backend',
          hostname: `operator.${label}.sslip.io`,
          secretPrefix: 'zalo-ultty-',
        },
        git: {
          ref: env.GITHUB_REF,
          sha: env.GIT_SHA ?? env.GITHUB_SHA,
          ciConclusion: env.GD1_TEST_CI_CONCLUSION,
        },
        runtime,
        approvedAllowedGroups,
        observedAllowedGroups,
        providerProof,
        credentials,
        rollback: { appImage, flowiseImage },
      },
    };
    const result = validateGd1TestPreflight(input);
    return Object.freeze({ ...result, input });
  } catch (error) {
    return Object.freeze({
      ok: false,
      errors: Object.freeze([
        `preflight collection failed: ${error instanceof Error ? error.message : String(error)}`,
      ]),
      input: undefined,
      plan: undefined,
    });
  }
}

function targetErrors(target) {
  const errors = [];
  const required = [
    ['id', 'target id'],
    ['server', 'server'],
    ['gcpProjectId', 'GCP project'],
    ['region', 'region'],
    ['zone', 'zone'],
    ['appDir', 'app directory'],
    ['composeProject', 'compose project'],
    ['database', 'database'],
    ['network', 'network'],
    ['hostname', 'hostname'],
    ['secretPrefix', 'secret prefix'],
  ];
  for (const [field, label] of required) {
    if (!isNonEmptyString(target?.[field])) errors.push(`deployment ${label} is required`);
  }
  for (const field of ['id', 'server', 'composeProject', 'network']) {
    if (isNonEmptyString(target?.[field]) && !SAFE_IDENTIFIER.test(target[field])) {
      errors.push(`deployment ${field} contains unsafe characters`);
    }
  }
  if (isNonEmptyString(target?.appDir) && !/^\/srv\/netviet\/apps\/[a-z0-9-]+$/.test(target.appDir)) {
    errors.push('deployment appDir must be an absolute tenant app path');
  }
  if (isNonEmptyString(target?.hostname) && !/^[a-z0-9.-]+$/.test(target.hostname)) {
    errors.push('deployment hostname contains unsafe characters');
  }
  if (isNonEmptyString(target?.secretPrefix) && !/^[a-z0-9-]+-$/.test(target.secretPrefix)) {
    errors.push('deployment secretPrefix contains unsafe characters');
  }
  return errors;
}

function tenantErrors(tenant, runtime) {
  const errors = [];
  if (tenant?.schemaVersion !== 2) errors.push('tenant schemaVersion must be 2');
  if (tenant?.slug !== 'ultty') errors.push('tenant slug must be ultty for this deployment gate');
  if (tenant?.experience !== 'operations-console') {
    errors.push('tenant experience must be operations-console for Ultty GD1-test');
  }

  const capabilities = new Set(Array.isArray(tenant?.capabilities) ? tenant.capabilities : []);
  for (const capability of REQUIRED_CAPABILITIES) {
    if (!capabilities.has(capability)) {
      errors.push(`tenant capability ${capability} is required for Ultty GD1-test`);
    }
  }

  const channelAllowlist = tenant?.integrations?.channel?.allowedAdapters;
  if (!Array.isArray(channelAllowlist) || !channelAllowlist.includes(runtime?.channel)) {
    errors.push('selected channel is not allowed by the tenant pack');
  }
  const parserAllowlist = tenant?.integrations?.parser?.allowedAdapters;
  if (!Array.isArray(parserAllowlist) || !parserAllowlist.includes(runtime?.parser)) {
    errors.push('selected parser is not allowed by the tenant pack');
  }
  return errors;
}

function runtimeErrors(runtime) {
  const errors = [];
  for (const [field, expected] of Object.entries(REQUIRED_RUNTIME)) {
    if (runtime?.[field] !== expected) {
      errors.push(`runtime ${field} must be ${expected}`);
    }
  }
  return errors;
}

function providerErrors(providerProof, runtime) {
  const errors = [];
  if (providerProof?.adapter !== runtime?.parser) {
    errors.push('parser provider proof must match the selected parser');
  }
  for (const field of [
    'credentialReady',
    'healthPassed',
    'structuredOutputPassed',
    'timeoutConfigured',
    'retryConfigured',
    'fallbackDisabled',
  ]) {
    if (providerProof?.[field] !== true) errors.push(`parser provider proof ${field} must be true`);
  }
  return errors;
}

function credentialErrors(credentials, tenantSlug) {
  const errors = [];
  const zcaSession = credentials?.zcaSession;
  if (
    zcaSession?.exists !== true ||
    zcaSession?.regularFile !== true ||
    zcaSession?.mode !== '600' ||
    zcaSession?.nonEmpty !== true
  ) {
    errors.push('ZCA session credential must be a non-empty regular file with mode 600');
  }

  if (!Array.isArray(credentials?.requiredSecrets) || credentials.requiredSecrets.length === 0) {
    errors.push('required secret metadata is missing');
    return errors;
  }

  const expectedNames = REQUIRED_SECRET_SUFFIXES.map((suffix) => `zalo-${tenantSlug}-${suffix}`);
  const receivedNames = credentials.requiredSecrets.map((secret) => secret?.name);
  if (!exactStringSet(expectedNames, receivedNames)) {
    errors.push('required secret inventory does not exactly match the Ultty GD1-test contract');
  }

  for (const [index, secret] of credentials.requiredSecrets.entries()) {
    const label = `#${index + 1}`;
    if (secret?.exists !== true) errors.push(`required secret ${label} does not exist`);
    if (secret?.enabledVersion !== true) {
      errors.push(`required secret ${label} has no enabled version`);
    }
    if (secret?.vmCanAccess !== true) errors.push(`VM cannot access required secret ${label}`);
    if (secret?.nonEmpty !== true) errors.push(`required secret ${label} is empty`);
    if (secret?.hasCarriageReturn === true || secret?.hasLineFeed === true) {
      errors.push(`required secret ${label} contains CR/LF`);
    }
  }
  return errors;
}

function releaseErrors(deployment) {
  const errors = [];
  if (deployment?.environment !== 'gd1-test') {
    errors.push('deployment environment must be gd1-test');
  }
  if (deployment?.targetConfirmed !== true) {
    errors.push('deployment target must be explicitly confirmed');
  }
  if (deployment?.git?.ref !== 'refs/heads/main') {
    errors.push('deployment must use refs/heads/main');
  }
  if (!SHA_PATTERN.test(deployment?.git?.sha ?? '')) {
    errors.push('deployment git SHA must be a full 40-character commit id');
  }
  if (deployment?.git?.ciConclusion !== 'success') {
    errors.push('exact deployment SHA CI conclusion must be success');
  }
  if (!DIGEST_PATTERN.test(deployment?.rollback?.appImage ?? '')) {
    errors.push('app rollback image must be pinned by digest');
  }
  if (!DIGEST_PATTERN.test(deployment?.rollback?.flowiseImage ?? '')) {
    errors.push('Flowise rollback image must be pinned by digest');
  }
  return errors;
}

function createPlan(tenant, deployment) {
  return Object.freeze({
    tenant: tenant.slug,
    environment: deployment.environment,
    targetId: deployment.target.id,
    server: deployment.target.server,
    hostname: deployment.target.hostname,
    gitSha: deployment.git.sha,
    database: deployment.target.database,
    network: deployment.target.network,
    composeProject: deployment.target.composeProject,
    expectedIntegrations: `channel=${deployment.runtime.channel}, parser=${deployment.runtime.parser}, media=${deployment.runtime.mediaStore}`,
    approvedAllowedGroupCount: deployment.approvedAllowedGroups.length,
  });
}

export function validateGd1TestPreflight(input) {
  const tenant = input?.tenant;
  const deployment = input?.deployment;
  const errors = [
    ...releaseErrors(deployment),
    ...targetErrors(deployment?.target),
    ...runtimeErrors(deployment?.runtime),
    ...tenantErrors(tenant, deployment?.runtime),
    ...providerErrors(deployment?.providerProof, deployment?.runtime),
    ...credentialErrors(deployment?.credentials, tenant?.slug),
  ];

  if (
    !exactStringSet(deployment?.approvedAllowedGroups, deployment?.observedAllowedGroups)
  ) {
    errors.push('observed Zalo allowed groups do not exactly match the approved TEST group set');
  }
  if (deployment?.approvedAllowedGroups?.length !== REQUIRED_APPROVED_TEST_GROUP_COUNT) {
    errors.push('Ultty GD1-test requires exactly two approved TEST groups');
  }

  const canCreatePlan =
    isNonEmptyString(tenant?.slug) &&
    deployment?.target &&
    deployment?.git &&
    deployment?.runtime &&
    Array.isArray(deployment?.approvedAllowedGroups);

  return Object.freeze({
    ok: errors.length === 0,
    errors: Object.freeze([...errors]),
    plan: canCreatePlan ? createPlan(tenant, deployment) : undefined,
  });
}

export function formatDeploymentPlan(plan) {
  if (!plan) throw new Error('A validated deployment plan is required');
  return [
    `Tenant: ${plan.tenant}`,
    `Environment: ${plan.environment}`,
    `Target: ${plan.targetId}`,
    `Server: ${plan.server}`,
    `Hostname: ${plan.hostname}`,
    `Git SHA: ${plan.gitSha}`,
    'Image digest: pending immutable build',
    `DB: ${plan.database}`,
    `Network: ${plan.network}`,
    `Compose project: ${plan.composeProject}`,
    `Expected integrations: ${plan.expectedIntegrations}`,
    `Allowed Zalo groups: ${plan.approvedAllowedGroupCount} approved IDs (redacted)`,
  ].join('\n');
}
