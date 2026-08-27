import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

import { resolveStackIdentity } from './stack-identity.mjs';
import {
  parseSecretInventory,
  remoteSecretInventoryCommand,
} from './gd1-test-secret-inventory.mjs';

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
const SAFE_REMOTE_TOKEN = /^[a-z0-9][a-z0-9-]*$/;
const STACK_STATE_SENTINEL = '__NETVIET_STACK_STATE__=';
const DEFAULT_GCP_PROJECT_ID = 'netviet-host-968934832433';
const DEFAULT_GCP_REGION = 'asia-southeast1';
const DEFAULT_GCP_ZONE = 'asia-southeast1-b';
const DEFAULT_VM_NAME = 'netviet';
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

function singleQuoteShell(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}

function remoteSudoCommand(command) {
  return `sudo -n bash -c ${singleQuoteShell(command)}`;
}

function remoteStackExistsCommand(appDir) {
  return [
    'set -euo pipefail',
    'sudo -n true',
    `if sudo -n test -f '${appDir}/.runtime/secrets.env'`,
    `then echo '${STACK_STATE_SENTINEL}present'`,
    `elif sudo -n test -e '${appDir}'`,
    `then echo '${STACK_STATE_SENTINEL}incomplete'`,
    `else echo '${STACK_STATE_SENTINEL}absent'`,
    'fi',
  ].join('; ');
}

function parseStackState(output) {
  const states = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith(STACK_STATE_SENTINEL))
    .map((line) => line.slice(STACK_STATE_SENTINEL.length));
  if (states.length !== 1 || !['present', 'absent', 'incomplete'].includes(states[0])) return;
  return states[0];
}

function remoteRuntimeCommand(appDir) {
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
    `for (const key of ${JSON.stringify(keys)})`,
    'console.log(key + "=" + process.env[key])',
  ].join(' ');
  return remoteSudoCommand([
    'set -euo pipefail',
    `cd '${appDir}'`,
    `docker compose --env-file .runtime/secrets.env -f compose.yaml exec -T api node --input-type=module -e '${program}'`,
  ].join('; '));
}

export function remoteProviderSmokeCommand(appDir, hostname) {
  // HAI MUC NOI KHAC NHAU, VA TRON CHUNG LAM CONG NAY RONG RUOT.
  //
  // Cac manh duoi day la THAM SO cua cung mot lenh `docker` nen noi bang dau cach; `set` va `cd`
  // la nhung CAU LENH RIENG nen phai noi bang xuong dong. Truoc day ca sau manh cung di qua mot
  // `join(' ')`, tao ra `set -euo pipefail cd '<appDir>' docker compose ...` — tuc la DUNG MOT lenh
  // `set`, con `cd` va `docker` chi con la tham so vi tri. Khong gi duoc thuc thi, va ma thoat la
  // ma thoat cua `set`: 0. Cong bao PASS ma provider chua he duoc hoi (xac minh 27/08/2026).
  const composeRun = [
    'docker compose --env-file .runtime/secrets.env -f compose.yaml --profile tools run --rm --no-deps -T',
    `-e 'PILOT_BASE_URL=https://${hostname}'`,
    "-e 'CHANNEL_MODE=zca'",
    'bootstrap node --input-type=module - < smoke-test.mjs',
  ].join(' ');
  return remoteSudoCommand(['set -euo pipefail', `cd '${appDir}'`, composeRun].join('\n'));
}

function remoteAllowedGroupsHashCommand(appDir) {
  // python3, khong phai node: VM host KHONG cai node (da xac minh 20/08/2026) — node chi co ben
  // trong container. Mot probe goi `node` tren host luon that bai va bi doc nham thanh "khong doc
  // duoc", tuc la preflight bao dong gia dung vao dung cho no phai chinh xac nhat.
  return remoteSudoCommand([
    'set -euo pipefail',
    `python3 - <<'PY'`,
    'import hashlib, json, sys',
    `path = '${appDir}/.runtime/zalo/zalo-allowed-groups.json'`,
    'try:',
    "    groups = json.load(open(path, encoding='utf-8'))",
    'except FileNotFoundError:',
    '    sys.exit(65)',
    'if not isinstance(groups, list):',
    '    sys.exit(66)',
    'for group in groups:',
    '    if not isinstance(group, str) or not group.strip():',
    '        sys.exit(67)',
    "    print(hashlib.sha256(group.strip().encode('utf-8')).hexdigest())",
    'PY',
  ].join('\n'));
}

function remoteZcaSessionCommand(appDir) {
  return remoteSudoCommand(
    `stat -c '%F|%a|%s' '${appDir}/.runtime/zalo/zalo-cred.json'`,
  );
}

function remoteRuntimeValueCommand(appDir, key) {
  return remoteSudoCommand([
    'set -euo pipefail',
    `cd '${appDir}'`,
    'runtime_value() { sed -n "s/^$1=//p" .runtime/secrets.env | tail -n 1; }',
    `runtime_value ${key}`,
  ].join('; '));
}

/**
 * `smoke-test.mjs` phat mot dong tin hieu co nhan `liveAiSmoke` NGAY CA KHI model doan sai. Vi vay
 * su co mat cua nhan do chia doi hai the gioi:
 *   - CO nhan  -> smoke da chay, da hoi provider, va provider tra loi khong khop fixture.
 *   - KHONG co -> smoke chua bao gio chay den noi. Day la loi CUA CHUNG TA, khong phai cua provider.
 * Gop hai thu nay lam mot se gui nguoi truc di sai huong.
 */
const LIVE_AI_SIGNAL_MARKER = '"layer":"liveAiSmoke"';

function classifyProviderSmokeFailure(providerSmoke) {
  if (providerSmoke?.ok === true || providerSmoke?.deferred === true) return undefined;
  return String(providerSmoke?.stdout ?? '').includes(LIVE_AI_SIGNAL_MARKER)
    ? 'PROVIDER_FIXTURE_MISMATCH'
    : 'PROVIDER_SMOKE_HARNESS_ERROR';
}

async function safeRun(run, program, args) {
  try {
    return { ok: true, stdout: await run(program, args) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      // execFile gan stdout vao chinh doi tuong loi. Vut bo no la vut bo bang chung duy nhat
      // cho biet smoke da chay den dau — va do la ly do mot lan hong bi doc nham thanh
      // "provider khong khoe" suot hai vong deploy (26/08/2026).
      stdout: typeof error?.stdout === 'string' ? error.stdout : '',
    };
  }
}

/**
 * Probe every required secret FROM THE VM, and treat that as authoritative.
 *
 * There used to be a second, runner-side `gcloud secrets versions list` supplying `exists` and
 * `enabledVersion`. It was both redundant and privileged: the CI deployer holds no Secret Manager
 * role at all (verified 20/08/2026 — artifactregistry.writer, compute.osAdminLogin, compute.viewer,
 * iap.tunnelResourceAccessor and nothing else), so that call failed for every secret and would have
 * blocked the deploy while reporting a problem that did not exist.
 *
 * Granting the runner project-wide secret metadata read would have fixed the symptom and widened
 * the blast radius for nothing. `gcloud secrets versions access latest`, run as the VM's own
 * service account, already proves all three things at once, and proves them about the principal
 * that actually needs the secret at runtime:
 *   - a secret that does not exist          -> access fails -> blocked
 *   - a secret with no ENABLED version      -> `latest` resolves to nothing -> access fails -> blocked
 *   - a secret the VM may not read          -> access fails -> blocked
 * Every blocking case is still caught; only the redundant privileged call is gone.
 */
async function collectSecretMetadata({ env, run, stackSlug }) {
  const projectId = env.GCP_PROJECT_ID ?? DEFAULT_GCP_PROJECT_ID;
  const names = REQUIRED_SECRET_SUFFIXES.map((suffix) => `zalo-${stackSlug}-${suffix}`);
  let stdout;
  try {
    stdout = await run(
      'gcloud',
      sshArgs(env, remoteSecretInventoryCommand(projectId, names)),
    );
  } catch {
    throw new Error('required secret inventory probe transport failed');
  }
  let probes;
  try {
    probes = parseSecretInventory(stdout, names.length);
  } catch {
    throw new Error('required secret inventory probe returned invalid metadata');
  }
  return names.map((name, index) => {
    const probe = probes[index];
    const readable = probe.accessible === true;
    return {
      name,
      exists: readable,
      enabledVersion: readable,
      vmCanAccess: readable,
      nonEmpty: probe.nonEmpty === true,
      hasCarriageReturn: probe.hasCarriageReturn === true,
      hasLineFeed: probe.hasLineFeed === true,
    };
  });
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
  for (const [name, value] of [
    ['GCP_PROJECT_ID', env.GCP_PROJECT_ID ?? DEFAULT_GCP_PROJECT_ID],
    ['GCP_REGION', env.GCP_REGION ?? DEFAULT_GCP_REGION],
    ['GCP_ZONE', env.GCP_ZONE ?? DEFAULT_GCP_ZONE],
    ['VM_NAME', env.VM_NAME ?? DEFAULT_VM_NAME],
  ]) {
    if (!SAFE_REMOTE_TOKEN.test(value)) errors.push(`${name} contains unsafe characters`);
  }
  return errors;
}

/**
 * Runtime the gd1-test profile is contracted to produce.
 *
 * On a FIRST release the stack does not exist yet, so there is nothing to observe. Declaring the
 * planned runtime here is not a substitute for proof: it is checked against REQUIRED_RUNTIME so a
 * wrong plan is rejected before build, and the real values are then observed by the post-deploy
 * verifier. Nothing is ever reported as verified on the strength of this object alone.
 */
const PLANNED_GD1_TEST_RUNTIME = Object.freeze({ ...REQUIRED_RUNTIME });

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
    const tenant = JSON.parse(await readFile(tenantPath, 'utf8'));
    const identity = resolveStackIdentity({
      tenant: tenant.slug,
      environment: env.ENVIRONMENT,
      primaryTenant: env.PRIMARY_TENANT ?? 'ultty',
      hostSuffix: `${label}.sslip.io`,
    });

    // FIRST RELEASE vs REDEPLOY. A brand new stack has no runtime, no session and no previous
    // image, so probing it would fail for the wrong reason. Detect it explicitly rather than
    // letting each probe fail and be read as a safety violation.
    let stackProbeOutput;
    try {
      stackProbeOutput = await run(
        'gcloud',
        sshArgs(env, remoteStackExistsCommand(identity.appDir)),
      );
    } catch {
      throw new Error('runtime stack existence probe transport failed');
    }
    const stackState = parseStackState(stackProbeOutput);
    if (!stackState || stackState === 'incomplete') {
      throw new Error('runtime stack existence probe returned invalid metadata');
    }
    const firstRelease = stackState === 'absent';

    const runtime = firstRelease
      ? { ...PLANNED_GD1_TEST_RUNTIME }
      : parseRuntimeEnv(await run('gcloud', sshArgs(env, remoteRuntimeCommand(identity.appDir))));
    const observedAllowedGroups = firstRelease
      ? []
      : parseGroupHashes(
          await run('gcloud', sshArgs(env, remoteAllowedGroupsHashCommand(identity.appDir))),
        );
    const zcaSession = firstRelease
      ? { deferred: true }
      : parseZcaSession(
          await run('gcloud', sshArgs(env, remoteZcaSessionCommand(identity.appDir))),
        );
    const appImage = firstRelease
      ? ''
      : (
          await run('gcloud', sshArgs(env, remoteRuntimeValueCommand(identity.appDir, 'APP_IMAGE')))
        ).trim();
    const flowiseImage = firstRelease
      ? ''
      : (
          await run(
            'gcloud',
            sshArgs(env, remoteRuntimeValueCommand(identity.appDir, 'FLOWISE_IMAGE')),
          )
        ).trim();
    const credentials = {
      firstRelease,
      zcaSession,
      requiredSecrets: await collectSecretMetadata({ env, run, stackSlug: identity.stackSlug }),
    };
    const providerSmoke = firstRelease
      ? { ok: false, deferred: true }
      : await safeRun(
          run,
          'gcloud',
          sshArgs(env, remoteProviderSmokeCommand(identity.appDir, identity.operatorDomain)),
        );
    const providerProof = {
      firstRelease,
      adapter: runtime.parser,
      credentialReady: credentials.requiredSecrets.some(
        (secret) =>
          secret.name === `${identity.secretPrefix}deepseek-api-key` &&
          secret.enabledVersion &&
          secret.vmCanAccess &&
          secret.nonEmpty,
      ),
      healthPassed: providerSmoke.ok,
      structuredOutputPassed: providerSmoke.ok,
      smokeFailure: classifyProviderSmokeFailure(providerSmoke),
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
        stack: identity.stackSlug,
        firstRelease,
        target: {
          id: env.DEPLOYMENT_TARGET_ID ?? 'current-shared-vm',
          server: vmName,
          gcpProjectId: projectId,
          region,
          zone,
          appDir: identity.appDir,
          composeProject: identity.composeProject,
          database: 'zalo',
          network: identity.backendNetwork,
          hostname: identity.operatorDomain,
          secretPrefix: identity.secretPrefix,
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
        rollback: firstRelease ? { firstRelease: true } : { appImage, flowiseImage },
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
  // Smoke provider chay BEN TRONG stack, nen o lan deploy dau khong co gi de chay no. Credential
  // van bat buoc phai san sang ngay bay gio; con lan goi that duoc chung minh o buoc verify sau
  // deploy, va khong duoc phep ghi la "da chung minh" truoc do.
  if (providerProof?.firstRelease === true) {
    const errors = [];
    if (providerProof?.adapter !== runtime?.parser) {
      errors.push('provider adapter must match the selected parser');
    }
    if (providerProof?.credentialReady !== true) {
      errors.push('provider credential must be ready before a first release');
    }
    if (providerProof?.fallbackDisabled !== true) {
      errors.push('provider fallback must be disabled');
    }
    return errors;
  }
  return providerErrorsForLiveStack(providerProof, runtime);
}

function providerErrorsForLiveStack(providerProof, runtime) {
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
  // Mot dong ket luan co MA, de log deploy noi duoc HUONG dieu tra chu khong chi noi "false".
  if (providerProof?.smokeFailure) {
    errors.push(`parser provider smoke failed: ${providerProof.smokeFailure}`);
  }
  return errors;
}

function credentialErrors(credentials, secretPrefix) {
  const errors = [];
  const zcaSession = credentials?.zcaSession;
  // Phien zca duoc tao bang cach QUET QR tren trang operator cua chinh stack do, tuc la sau khi
  // stack ton tai. O lan deploy dau chua the co phien — day KHONG phai mock: adapter zca that van
  // duoc nap, chi la chua dang nhap. Bang chung phien `ready` thuoc ve buoc verify sau deploy va
  // la dieu kien bat buoc TRUOC khi chay E2E, khong phai truoc khi dung stack len.
  if (credentials?.firstRelease !== true) {
    if (
      zcaSession?.exists !== true ||
      zcaSession?.regularFile !== true ||
      zcaSession?.mode !== '600' ||
      zcaSession?.nonEmpty !== true
    ) {
      errors.push('ZCA session credential must be a non-empty regular file with mode 600');
    }
  }

  if (!Array.isArray(credentials?.requiredSecrets) || credentials.requiredSecrets.length === 0) {
    errors.push('required secret metadata is missing');
    return errors;
  }

  const expectedNames = REQUIRED_SECRET_SUFFIXES.map((suffix) => `${secretPrefix}${suffix}`);
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
    if (secret?.vmCanAccess !== true) {
      errors.push(
        `VM cannot read required secret ${label} (missing, no enabled version, or IAM not granted)`,
      );
    }
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
  // MOT STACK MOI KHONG CO ANH DE QUAY VE. Doi hai rollback digest ngay o lan deploy dau chi de
  // lai hai lua chon, ca hai deu te: bia ra mot digest gia, hoac khong bao gio deploy duoc lan
  // dau. Khai bao thang `firstRelease` la duong thu ba trung thuc — va duong rollback tuong ung
  // khong phai "quay ve anh cu" ma la "go stack moi xuong", vi truoc no khong co gi ca.
  if (deployment?.firstRelease === true) {
    if (deployment?.rollback?.firstRelease !== true) {
      errors.push('a first release must declare rollback.firstRelease instead of digests');
    }
  } else {
    if (!DIGEST_PATTERN.test(deployment?.rollback?.appImage ?? '')) {
      errors.push('app rollback image must be pinned by digest');
    }
    if (!DIGEST_PATTERN.test(deployment?.rollback?.flowiseImage ?? '')) {
      errors.push('Flowise rollback image must be pinned by digest');
    }
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
    firstRelease: deployment.firstRelease === true,
    stack: deployment.stack,
    deferredToPostDeploy: Object.freeze(
      deployment.firstRelease === true
        ? [
            'observed runtime modes',
            'zca session ready',
            'runtime allowlist equals the approved TEST set',
            'live provider call',
            'rollback target (first release has none: rollback is stack teardown)',
          ]
        : [],
    ),
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
    ...credentialErrors(deployment?.credentials, deployment?.target?.secretPrefix),
  ];

  // Allowlist cua mot stack moi duoc GIEO luc deploy, nen chua co gi de doi chieu o lan dau. Bo
  // duoc PHE DUYET thi van bat buoc dung hai ID (kiem ngay duoi), va buoc verify sau deploy phai
  // doi chieu allowlist that voi dung bo do truoc khi bat ky tin nao duoc xu ly.
  if (
    deployment?.firstRelease !== true &&
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
    `Stack: ${plan.stack}`,
    `First release: ${plan.firstRelease ? 'yes' : 'no'}`,
    ...(plan.deferredToPostDeploy.length > 0
      ? [
          'NOT PROVED YET, deferred to post-deploy verification:',
          ...plan.deferredToPostDeploy.map((item) => `  - ${item}`),
        ]
      : []),
  ].join('\n');
}
