#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const SHA_PATTERN = /^[a-f0-9]{40}$/;
const DIGEST_PATTERN = /@sha256:[a-f0-9]{64}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const SECRET_FIELD_PATTERN =
  /(?:password|secret|token|cookie|authorization|api[-_]?key|credential)/i;
const NON_REAL_PATTERN = /(mock|fake|fixture|none|memory)/i;
const RELEASE_FIELDS = [
  'tenant',
  'environment',
  'target',
  'gitSha',
  'appDigest',
  'flowiseDigest',
  'tenantSchemaVersion',
  'workflowRunId',
  'deployedAt',
];

const component = (status, implementation, detail) => ({ status, implementation, detail });

export function verifyDeployment({ tenant, release, evidence }) {
  const capabilities = new Set(Array.isArray(tenant?.capabilities) ? tenant.capabilities : []);
  const secretErrors = findSecretBearingFields(evidence).map(
    (path) => `proof contains secret-bearing field: ${path}`,
  );
  const releaseErrors = validateRelease(tenant, release, evidence?.release);
  // `release.stack` la nguon; release cu khong co truong nay thi roi ve tenant slug.
  const stackSlug = nonEmpty(release?.stack) ? release.stack : tenant?.slug;
  const baseErrors = validateBaseEvidence(tenant, evidence, stackSlug);
  const messagingErrors = capabilities.has('messaging') ? validateMessaging(evidence) : [];
  const salesErrors = capabilities.has('sales-order') ? validateSalesOrder(evidence) : [];
  const notificationResult = evaluateNotifications(capabilities, evidence?.notifications);
  const errors = [
    ...secretErrors,
    ...releaseErrors,
    ...baseErrors,
    ...messagingErrors,
    ...salesErrors,
    ...notificationResult.errors,
  ];

  return {
    ok: errors.length === 0,
    errors,
    warnings: notificationResult.warnings,
    release: release ?? null,
    readiness: evidence?.readiness ?? null,
    components: buildComponents(capabilities, tenant, evidence, notificationResult),
  };
}

function validateRelease(tenant, release, observedRelease) {
  if (!release || typeof release !== 'object') return ['release identity is required'];
  const requiredErrors = RELEASE_FIELDS.flatMap((field) =>
    release[field] === undefined || release[field] === null || release[field] === ''
      ? [`release ${field} is required`]
      : [],
  );
  const identityErrors = [
    release.tenant !== tenant?.slug
      ? `release tenant must match tenant pack ${tenant?.slug ?? '(missing)'}`
      : null,
    release.tenantSchemaVersion !== tenant?.schemaVersion
      ? `release tenantSchemaVersion must match tenant schemaVersion ${tenant?.schemaVersion ?? '(missing)'}`
      : null,
    !SHA_PATTERN.test(String(release.gitSha ?? ''))
      ? 'release gitSha must be a full 40-character SHA'
      : null,
    !DIGEST_PATTERN.test(String(release.appDigest ?? ''))
      ? 'release appDigest must be immutable name@sha256:digest'
      : null,
    !DIGEST_PATTERN.test(String(release.flowiseDigest ?? ''))
      ? 'release flowiseDigest must be immutable name@sha256:digest'
      : null,
    !/^\d+$/.test(String(release.workflowRunId ?? ''))
      ? 'release workflowRunId must be numeric'
      : null,
    !ISO_DATE_PATTERN.test(String(release.deployedAt ?? ''))
      ? 'release deployedAt must be an ISO UTC timestamp'
      : null,
  ].filter(Boolean);
  return [
    ...requiredErrors,
    ...identityErrors,
    ...compareObservedRelease(release, observedRelease),
  ];
}

function compareObservedRelease(expected, observed) {
  if (!observed || typeof observed !== 'object') return ['observed release identity is required'];
  return RELEASE_FIELDS.flatMap((field) =>
    observed[field] !== expected[field]
      ? [`observed release ${field} does not match declared release identity`]
      : [],
  );
}

function validateBaseEvidence(tenant, evidence, stackSlug) {
  if (!evidence || typeof evidence !== 'object') return ['deployment evidence is required'];
  return [
    ...validateContainers(evidence.containers),
    ...validateHttpIdentity(tenant, evidence.api, evidence.web),
    ...validateDatabase(evidence.database),
    ...validateNetwork(tenant, evidence.network, stackSlug),
    ...validateAuth(evidence.auth),
    ...validateReadiness(evidence.readiness),
  ];
}

function validateContainers(containers) {
  return ['postgres', 'flowise', 'api', 'web'].flatMap((name) => {
    const value = containers?.[name];
    return value?.state === 'running' && value?.health === 'healthy'
      ? []
      : [`container ${name} must be running and healthy`];
  });
}

function validateHttpIdentity(tenant, api, web) {
  return [
    api?.status !== 200 ? 'API health must return HTTP 200' : null,
    api?.tenant !== tenant?.slug ? 'API tenant identity must match tenant pack' : null,
    web?.status !== 200 ? 'web health must return HTTP 200' : null,
    web?.pageTitle !== tenant?.branding?.pageTitle
      ? 'web branding pageTitle must match tenant pack'
      : null,
  ].filter(Boolean);
}

function validateDatabase(database) {
  return [
    !isRealImplementation(database?.implementation, ['postgresql', 'prisma'])
      ? 'database implementation must be real PostgreSQL/Prisma'
      : null,
    database?.connected !== true ? 'database connectivity proof is required' : null,
    database?.migrationsApplied !== true ? 'database migrations must be applied' : null,
    database?.pendingMigrations !== 0 ? 'database must have zero pending migrations' : null,
    !nonEmpty(database?.migrationHead) ? 'database migration head is required' : null,
  ].filter(Boolean);
}

function validateNetwork(tenant, network, stackSlug) {
  // Mang thuoc ve STACK chu khong phai tenant: stack thu hai cua cung mot khach
  // (`ultty-gd1-test`) mang `zalo-ultty-gd1-test_backend`. Mac dinh ve tenant slug de moi
  // release cu — von khong ghi truong `stack` — van kiem dung nhu truoc.
  const expectedPrefix = `zalo-${stackSlug ?? tenant?.slug ?? ''}`;
  return [
    network?.backendNetwork !== `${expectedPrefix}_backend`
      ? 'tenant backend network identity is incorrect'
      : null,
    network?.dataNetwork !== `${expectedPrefix}_data`
      ? 'tenant data network identity is incorrect'
      : null,
    network?.dataNetworkInternal !== true ? 'tenant data network must be internal' : null,
    network?.crossTenantReachable !== false
      ? 'cross-tenant network reachability must be false'
      : null,
    !Array.isArray(network?.flowiseAddresses) || network.flowiseAddresses.length !== 1
      ? 'network proof must resolve exactly one Flowise address'
      : null,
  ].filter(Boolean);
}

function validateAuth(auth) {
  return [
    !nonEmpty(auth?.mode) || auth.mode === 'none'
      ? 'auth mode must be enabled and cannot be none'
      : null,
    auth?.unauthorizedStatus !== 401 ? 'anonymous protected request must return HTTP 401' : null,
    auth?.operatorLoginVerified !== true ? 'operator login must be verified' : null,
    auth?.csrfVerified !== true ? 'CSRF protection must be verified' : null,
  ].filter(Boolean);
}

function validateReadiness(readiness) {
  return [
    readiness?.reachable !== true ? 'readiness endpoint must be reachable' : null,
    typeof readiness?.goLiveReady !== 'boolean'
      ? 'readiness goLiveReady result must be recorded'
      : null,
    !Array.isArray(readiness?.checks) || readiness.checks.length === 0
      ? 'readiness checks must be recorded'
      : null,
  ].filter(Boolean);
}

function validateMessaging(evidence) {
  const zalo = evidence?.zalo;
  const inbound = zalo?.inbound;
  return [
    !isRealImplementation(zalo?.implementation) || zalo?.real !== true
      ? 'Zalo implementation must be real'
      : null,
    zalo?.state !== 'ready' ? 'Zalo runtime state must be ready' : null,
    inbound?.source !== 'zalo_inbound'
      ? 'Zalo inbound source must be zalo_inbound; demo/simulate and synthetic proof are forbidden'
      : null,
    !nonEmpty(inbound?.correlationId) ? 'Zalo inbound correlationId is required' : null,
    !nonEmpty(inbound?.externalMessageId) ? 'Zalo externalMessageId is required' : null,
    !UUID_PATTERN.test(String(inbound?.storedMessageId ?? ''))
      ? 'persisted Zalo message id must be a UUID'
      : null,
    inbound?.allowedTestGroup !== true
      ? 'Zalo inbound must come from an approved TEST group'
      : null,
    !ISO_DATE_PATTERN.test(String(inbound?.observedAt ?? ''))
      ? 'Zalo inbound observedAt must be recorded'
      : null,
  ].filter(Boolean);
}

function validateSalesOrder(evidence) {
  const correlationId = evidence?.zalo?.inbound?.correlationId;
  return [
    ...validateMedia(evidence?.media),
    ...validateParser(evidence?.parser, correlationId),
    ...validateOrder(evidence?.order, correlationId),
  ];
}

function validateParser(parser, correlationId) {
  return [
    !isRealImplementation(parser?.implementation) || parser?.real !== true
      ? 'parser implementation must be real'
      : null,
    parser?.healthy !== true ? 'parser provider health proof is required' : null,
    parser?.structuredOutputValid !== true ? 'parser structured output must be valid' : null,
    parser?.fallbackUsed !== false ? 'parser proof must not use fallback output' : null,
    !nonEmpty(parser?.providerRequestId) ? 'parser provider request id is required' : null,
    parser?.correlationId !== correlationId
      ? 'parser correlation must match real Zalo inbound'
      : null,
  ].filter(Boolean);
}

function validateOrder(order, correlationId) {
  return [
    order?.source !== 'zalo_inbound' ? 'order source must be real Zalo inbound' : null,
    order?.correlationId !== correlationId
      ? 'order correlation must match real Zalo inbound'
      : null,
    !UUID_PATTERN.test(String(order?.orderId ?? '')) ? 'persisted order id must be a UUID' : null,
    order?.persisted !== true ? 'order must be persisted in PostgreSQL' : null,
    order?.rulesEvaluated !== true ? 'deterministic rules evaluation proof is required' : null,
    order?.operatorVisible !== true ? 'order must be visible to the operator experience' : null,
  ].filter(Boolean);
}

function validateMedia(media) {
  return [
    !isRealImplementation(media?.implementation) || media?.real !== true
      ? 'media implementation must be real'
      : null,
    media?.healthy !== true ? 'media store must be healthy' : null,
    media?.reachabilityChecked !== true ? 'media store reachability must be checked' : null,
  ].filter(Boolean);
}

function evaluateNotifications(capabilities, notifications) {
  if (!capabilities.has('notifications')) {
    return {
      status: 'NOT REQUIRED',
      detail: 'notifications capability disabled',
      errors: [],
      warnings: [],
    };
  }
  if (!notifications) {
    const detail = 'notifications unresolved: no explicit GD1 verification scenario supplied';
    return { status: 'UNRESOLVED', detail, errors: [], warnings: [detail] };
  }
  const errors = [
    !nonEmpty(notifications.scenario) ? 'notification scenario name is required' : null,
    !isRealImplementation(notifications.implementation) || notifications.real !== true
      ? 'notification implementation must be real'
      : null,
    notifications.delivered !== true ? 'notification scenario must prove delivery' : null,
    !nonEmpty(notifications.correlationId) ? 'notification correlationId is required' : null,
  ].filter(Boolean);
  return {
    status: errors.length === 0 ? 'REAL' : 'FAILED',
    detail: errors.length === 0 ? notifications.scenario : errors.join('; '),
    errors,
    warnings: [],
  };
}

function buildComponents(capabilities, tenant, evidence, notificationResult) {
  return {
    ...buildCoreComponents(tenant, evidence),
    ...buildCapabilityComponents(capabilities, evidence),
    erp: component(
      'NOT IN GD1 SCOPE',
      null,
      'GD1 creates a manual Sales handoff and does not call ERP',
    ),
    invoice: component('NOT IN GD1 SCOPE', null, 'Invoice integration is outside GD1'),
    notifications: component(
      notificationResult.status,
      evidence?.notifications?.implementation,
      notificationResult.detail,
    ),
  };
}

function buildCoreComponents(tenant, evidence) {
  const containerHealthy = (name) =>
    evidence?.containers?.[name]?.state === 'running' &&
    evidence?.containers?.[name]?.health === 'healthy';
  return {
    web: component(
      evidence?.web?.status === 200 ? 'REAL' : 'FAILED',
      'production Next.js',
      `HTTP ${evidence?.web?.status ?? 'missing'}`,
    ),
    api: component(
      containerHealthy('api') && evidence?.api?.status === 200 ? 'REAL' : 'FAILED',
      'production NestJS',
      `HTTP ${evidence?.api?.status ?? 'missing'}`,
    ),
    flowise: component(
      containerHealthy('flowise') ? 'REAL' : 'FAILED',
      'Flowise container',
      evidence?.containers?.flowise?.health ?? 'missing',
    ),
    postgresql: component(
      validateDatabase(evidence?.database).length === 0 ? 'REAL' : 'FAILED',
      evidence?.database?.implementation,
      evidence?.database?.migrationHead,
    ),
    network: component(
      validateNetwork(tenant, evidence?.network).length === 0 ? 'REAL' : 'FAILED',
      evidence?.network?.backendNetwork,
      'tenant backend/data isolation',
    ),
    auth: component(
      validateAuth(evidence?.auth).length === 0 ? 'REAL' : 'FAILED',
      evidence?.auth?.mode,
      '401 + operator login + CSRF',
    ),
    readiness: component(
      validateReadiness(evidence?.readiness).length === 0 ? 'OBSERVED' : 'FAILED',
      'operational readiness endpoint',
      `goLiveReady=${String(evidence?.readiness?.goLiveReady)}`,
    ),
  };
}

function buildCapabilityComponents(capabilities, evidence) {
  const messaging = capabilities.has('messaging');
  const salesOrder = capabilities.has('sales-order');
  const correlationId = evidence?.zalo?.inbound?.correlationId;
  return {
    media: salesOrder
      ? component(
          validateMedia(evidence?.media).length === 0 ? 'REAL' : 'FAILED',
          evidence?.media?.implementation,
          'real reachability checked',
        )
      : component('NOT REQUIRED', null, 'sales-order capability disabled'),
    zalo: messaging
      ? component(
          validateMessaging(evidence).length === 0 ? 'REAL' : 'FAILED',
          evidence?.zalo?.implementation,
          correlationId,
        )
      : component('NOT REQUIRED', null, 'messaging capability disabled'),
    parser: salesOrder
      ? component(
          validateParser(evidence?.parser, correlationId).length === 0 ? 'REAL' : 'FAILED',
          evidence?.parser?.implementation,
          evidence?.parser?.providerRequestId,
        )
      : component('NOT REQUIRED', null, 'sales-order capability disabled'),
    orders: salesOrder
      ? component(
          validateOrder(evidence?.order, correlationId).length === 0 ? 'REAL' : 'FAILED',
          'deterministic rules + PostgreSQL',
          evidence?.order?.orderId,
        )
      : component('NOT REQUIRED', null, 'sales-order capability disabled'),
  };
}

function isRealImplementation(value, requiredFragments = []) {
  if (!nonEmpty(value) || NON_REAL_PATTERN.test(value)) return false;
  const normalized = value.toLowerCase();
  return requiredFragments.every((fragment) => normalized.includes(fragment));
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function findSecretBearingFields(value, path = 'evidence') {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findSecretBearingFields(item, `${path}[${index}]`));
  }
  return Object.entries(value).flatMap(([key, child]) => {
    const childPath = `${path}.${key}`;
    return SECRET_FIELD_PATTERN.test(key) ? [childPath] : findSecretBearingFields(child, childPath);
  });
}

function parseArguments(argv) {
  const pairs = argv.reduce((state, value, index) => {
    if (!value.startsWith('--')) return state;
    if (value === '--json') return { ...state, json: true };
    const next = argv[index + 1];
    return { ...state, [value.slice(2)]: next };
  }, {});
  const missing = ['tenant-pack', 'release', 'evidence'].filter((key) => !nonEmpty(pairs[key]));
  if (missing.length > 0) {
    throw new Error(
      `Usage: node verify-deployment.mjs --tenant-pack DIR --release FILE --evidence FILE [--json]\nMissing: ${missing.join(', ')}`,
    );
  }
  return pairs;
}

async function loadJson(path, label) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read ${label} JSON at ${path}: ${error.message}`);
  }
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const tenant = await loadJson(
    `${args['tenant-pack'].replace(/[\\/]+$/, '')}/tenant.json`,
    'tenant',
  );
  const release = await loadJson(args.release, 'release identity');
  const evidence = await loadJson(args.evidence, 'deployment evidence');
  const result = verifyDeployment({ tenant, release, evidence });
  const output = args.json ? JSON.stringify(result, null, 2) : humanOutput(result);
  process.stdout.write(`${output}\n`);
  process.exitCode = result.ok ? 0 : 1;
}

function humanOutput(result) {
  const componentLines = Object.entries(result.components).map(
    ([name, value]) =>
      `${name}: ${value.status}${value.implementation ? ` (${value.implementation})` : ''}`,
  );
  const errors = result.errors.map((error) => `ERROR: ${error}`);
  const warnings = result.warnings.map((warning) => `WARNING: ${warning}`);
  return [
    `VERIFY_DEPLOYMENT=${result.ok ? 'PASS' : 'FAIL'}`,
    ...componentLines,
    ...warnings,
    ...errors,
  ].join('\n');
}

const isEntrypoint = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isEntrypoint) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
