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
const SAFE_IDENTIFIER = /^[a-z0-9][a-z0-9_-]*$/;
const SAFE_GROUP_ID = /^[A-Za-z0-9_-]+$/;

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
