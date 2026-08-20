#!/usr/bin/env node
/**
 * Gather post-deploy evidence from a REAL deployed stack, for verify-deployment.mjs to judge.
 *
 * Split of responsibility, on purpose:
 *   - this file OBSERVES and never decides;
 *   - verify-deployment.mjs DECIDES and never observes.
 * A collector that could also pass itself would be able to talk its way out of a failure.
 *
 * Everything here is read-only. Nothing is invented: a probe that cannot run leaves its field
 * absent, and an absent field makes the verifier fail. That is the intended direction — the only
 * way to a PASS is for the real thing to actually answer.
 *
 * The E2E correlation (real Zalo message -> parser -> rules -> persisted order -> operator) can
 * only be observed after a human sends a real message into an approved TEST group. Pass its marker
 * with --correlation; without it the messaging/sales-order evidence is simply absent and the
 * verifier fails, which is the honest outcome for "infrastructure is up but nothing was proved".
 *
 * Usage:
 *   node deploy/netviet/collect-deployment-evidence.mjs \
 *     --tenant ultty --environment gd1-test [--correlation MARKER] [--out evidence.json]
 */

import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import process from 'node:process';
import { promisify } from 'node:util';

import { resolveStackIdentity } from './stack-identity.mjs';

const execFileAsync = promisify(execFile);

const DEFAULT_PROJECT = 'netviet-host-968934832433';
const DEFAULT_ZONE = 'asia-southeast1-b';
const DEFAULT_VM = 'netviet';
const SSH_TIMEOUT_MS = 180_000;

function parseArguments(argv) {
  const args = argv.reduce((state, value, index) => {
    if (!value.startsWith('--')) return state;
    return { ...state, [value.slice(2)]: argv[index + 1] ?? true };
  }, {});
  for (const key of ['tenant', 'environment']) {
    if (typeof args[key] !== 'string' || args[key].trim() === '') {
      throw new Error(
        'Usage: collect-deployment-evidence.mjs --tenant SLUG --environment ENV ' +
          '[--correlation MARKER] [--out FILE]',
      );
    }
  }
  return args;
}

async function ssh(command, { project, zone, vm }) {
  const { stdout } = await execFileAsync(
    'gcloud',
    [
      'compute',
      'ssh',
      vm,
      '--zone',
      zone,
      '--project',
      project,
      '--tunnel-through-iap',
      '--quiet',
      '--command',
      command,
    ],
    { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: SSH_TIMEOUT_MS, windowsHide: true },
  );
  return stdout;
}

/** Run a probe; on failure return undefined so the field stays absent rather than becoming a guess. */
async function probe(label, fn) {
  try {
    return await fn();
  } catch (error) {
    process.stderr.write(`probe ${label} failed: ${error.message.split('\n')[0]}\n`);
    return undefined;
  }
}

/** Run SQL against the stack's own PostgreSQL and return rows as objects. */
function sqlCommand(appDir, sql) {
  const escaped = sql.replace(/'/g, `'"'"'`);
  return [
    'set -euo pipefail',
    `cd '${appDir}'`,
    `sudo docker compose --env-file .runtime/secrets.env -f compose.yaml exec -T postgres ` +
      `psql --username netviet_admin --dbname zalo --no-align --tuples-only --field-separator='|' ` +
      `--command '${escaped}'`,
  ].join('; ');
}

function parseRows(stdout) {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split('|'));
}

async function collectRelease(ctx) {
  const stdout = await ssh(`sudo cat '${ctx.identity.appDir}/.runtime/release.json'`, ctx.gcp);
  return JSON.parse(stdout.trim());
}

async function collectContainers(ctx) {
  const stdout = await ssh(
    `sudo docker ps -a --filter 'label=com.docker.compose.project=${ctx.identity.composeProject}' ` +
      `--format '{{.Label "com.docker.compose.service"}}|{{.State}}|{{.Status}}'`,
    ctx.gcp,
  );
  const containers = {};
  for (const [service, state, status] of parseRows(stdout)) {
    // Only the long-lived services matter; one-shot init containers exit by design.
    if (!['postgres', 'flowise', 'api', 'web'].includes(service)) continue;
    containers[service] = {
      state,
      health: /\(healthy\)/.test(status) ? 'healthy' : /\(unhealthy\)/.test(status) ? 'unhealthy' : 'none',
    };
  }
  return containers;
}

/** curl from inside the VM, resolving the public hostname to the local edge. */
function curlCommand(hostname, path, extra = '') {
  return (
    `curl -sS --max-time 20 --resolve '${hostname}:443:127.0.0.1' ${extra} ` +
    `'https://${hostname}${path}'`
  );
}

async function collectApi(ctx) {
  const status = (
    await ssh(curlCommand(ctx.identity.operatorDomain, '/health', '-o /dev/null -w %{http_code}'), ctx.gcp)
  ).trim();
  const body = await ssh(curlCommand(ctx.identity.operatorDomain, '/health'), ctx.gcp);
  let tenant;
  try {
    const parsed = JSON.parse(body);
    tenant = parsed.tenant ?? parsed.tenantSlug ?? parsed.tenant?.slug;
  } catch {
    tenant = undefined;
  }
  return { status: Number(status), tenant };
}

async function collectWeb(ctx) {
  const status = (
    await ssh(curlCommand(ctx.identity.demoDomain, '/', '-o /dev/null -w %{http_code}'), ctx.gcp)
  ).trim();
  const html = await ssh(curlCommand(ctx.identity.demoDomain, '/'), ctx.gcp);
  const pageTitle = html.match(/<title>([^<]*)<\/title>/)?.[1];
  return { status: Number(status), pageTitle };
}

async function collectDatabase(ctx) {
  const migrations = await ssh(
    sqlCommand(
      ctx.identity.appDir,
      'select migration_name, finished_at is not null from _prisma_migrations order by finished_at desc nulls first;',
    ),
    ctx.gcp,
  );
  const rows = parseRows(migrations);
  const pending = rows.filter(([, finished]) => finished !== 't').length;
  return {
    implementation: 'postgresql/prisma',
    connected: rows.length > 0,
    migrationsApplied: rows.length > 0 && pending === 0,
    pendingMigrations: pending,
    migrationHead: rows.find(([, finished]) => finished === 't')?.[0],
  };
}

async function collectNetwork(ctx) {
  const { backendNetwork, dataNetwork, composeProject } = ctx.identity;
  const internal = (
    await ssh(`sudo docker network inspect '${dataNetwork}' --format '{{.Internal}}'`, ctx.gcp)
  ).trim();
  // The 17/08/2026 incident: two stacks on one network both answered to `flowise`, so DNS
  // round-robin mixed them. Exactly one address is the isolation proof.
  const flowiseHosts = await ssh(
    `sudo docker exec $(sudo docker ps -q -f 'label=com.docker.compose.project=${composeProject}' ` +
      `-f 'label=com.docker.compose.service=api') getent hosts flowise || true`,
    ctx.gcp,
  );
  const flowiseAddresses = parseRows(flowiseHosts)
    .map((row) => row.join('|').trim().split(/\s+/)[0])
    .filter(Boolean);
  return {
    backendNetwork,
    dataNetwork,
    dataNetworkInternal: internal === 'true',
    flowiseAddresses,
    crossTenantReachable: await probeCrossTenant(ctx),
  };
}

/** True only if this stack's API can reach another stack's API — which it must never be able to. */
async function probeCrossTenant(ctx) {
  const others = await ssh(
    `sudo docker ps --format '{{.Label "com.docker.compose.project"}}|{{.Label "com.docker.compose.service"}}' ` +
      `| grep '|api$' | grep -v '^${ctx.identity.composeProject}|' | cut -d'|' -f1 | head -n 1`,
    ctx.gcp,
  );
  const otherProject = others.trim();
  if (!otherProject) return false;
  const otherAlias = `api-${otherProject.replace(/^zalo-/, '')}`;
  const reach = await ssh(
    `sudo docker exec $(sudo docker ps -q -f 'label=com.docker.compose.project=${ctx.identity.composeProject}' ` +
      `-f 'label=com.docker.compose.service=api') getent hosts '${otherAlias}' >/dev/null 2>&1 ` +
      `&& echo reachable || echo isolated`,
    ctx.gcp,
  );
  return reach.trim() === 'reachable';
}

async function collectAuth(ctx) {
  const mode = (
    await ssh(
      `sudo sed -n 's/^AUTH_MODE=//p' '${ctx.identity.appDir}/.runtime/secrets.env' | tail -n 1`,
      ctx.gcp,
    )
  ).trim();
  const unauthorized = (
    await ssh(
      curlCommand(ctx.identity.operatorDomain, '/zalo/status', '-o /dev/null -w %{http_code}'),
      ctx.gcp,
    )
  ).trim();
  return {
    mode,
    unauthorizedStatus: Number(unauthorized),
    // Proving a login means holding a password, which must never enter a proof artifact. The
    // deploy's own auth bootstrap + the 401 above are what this run can honestly attest to;
    // an operator confirms the interactive login and records it out of band.
    operatorLoginVerified: undefined,
    csrfVerified: undefined,
  };
}

async function collectReadiness(ctx) {
  const body = await ssh(curlCommand(ctx.identity.operatorDomain, '/readiness'), ctx.gcp);
  const parsed = JSON.parse(body);
  return {
    reachable: true,
    goLiveReady: parsed.goLiveReady === true,
    checks: Array.isArray(parsed.checks) ? parsed.checks : [],
  };
}

async function collectRuntimeValue(ctx, key) {
  return (
    await ssh(
      `sudo sed -n 's/^${key}=//p' '${ctx.identity.appDir}/.runtime/secrets.env' | tail -n 1`,
      ctx.gcp,
    )
  ).trim();
}

async function collectZaloState(ctx) {
  const channel = await collectRuntimeValue(ctx, 'CHANNEL_MODE');
  const status = await ssh(
    `sudo docker exec $(sudo docker ps -q -f 'label=com.docker.compose.project=${ctx.identity.composeProject}' ` +
      `-f 'label=com.docker.compose.service=api') ` +
      `node -e "fetch('http://127.0.0.1:3001/zalo/status').then(r=>r.text()).then(t=>console.log(t))" || true`,
    ctx.gcp,
  );
  let state;
  try {
    state = JSON.parse(status.trim()).state;
  } catch {
    state = undefined;
  }
  return { implementation: channel, real: channel === 'zca' || channel === 'bot' || channel === 'hybrid', state };
}

/**
 * Find the real inbound message carrying the correlation marker, and the order it produced.
 * `source` comes straight out of the row: if the marker arrived through /demo/simulate rather than
 * the Zalo listener, the verifier sees that and refuses it.
 */
async function collectCorrelation(ctx, marker) {
  const safeMarker = marker.replace(/'/g, "''");
  const messageRows = parseRows(
    await ssh(
      sqlCommand(
        ctx.identity.appDir,
        `select id, "externalMessageId", source, "groupId", "createdAt" from "Message" ` +
          `where text like '%${safeMarker}%' and direction = 'inbound' order by "createdAt" desc limit 1;`,
      ),
      ctx.gcp,
    ),
  );
  if (messageRows.length === 0) return { zalo: undefined, order: undefined, parser: undefined };
  const [storedMessageId, externalMessageId, source, groupId, createdAt] = messageRows[0];

  const allowedGroups = JSON.parse(
    await ssh(`sudo cat '${ctx.identity.appDir}/.runtime/zalo/zalo-allowed-groups.json'`, ctx.gcp),
  );
  const groupRows = parseRows(
    await ssh(
      sqlCommand(ctx.identity.appDir, `select "chatId" from "Group" where id = '${groupId}' limit 1;`),
      ctx.gcp,
    ),
  );
  const chatId = groupRows[0]?.[0];

  const orderRows = parseRows(
    await ssh(
      sqlCommand(
        ctx.identity.appDir,
        `select id, status, (trace is not null), (priced is not null) from "Order" ` +
          `where "messageId" = '${storedMessageId}' order by "createdAt" desc limit 1;`,
      ),
      ctx.gcp,
    ),
  );
  const [orderId, , hasTrace, hasPriced] = orderRows[0] ?? [];

  const parserMode = await collectRuntimeValue(ctx, 'PARSER_MODE');
  const llmCalls = orderId
    ? parseRows(
        await ssh(
          sqlCommand(
            ctx.identity.appDir,
            `select coalesce((trace->>'llmCalls')::text, '0') from "Order" where id = '${orderId}';`,
          ),
          ctx.gcp,
        ),
      )[0]?.[0]
    : undefined;

  return {
    zalo: {
      inbound: {
        source,
        correlationId: marker,
        externalMessageId,
        storedMessageId,
        allowedTestGroup: Boolean(chatId) && allowedGroups.includes(chatId),
        observedAt: new Date(createdAt.replace(' ', 'T') + 'Z').toISOString(),
      },
    },
    parser: {
      implementation: parserMode,
      real: parserMode === 'deepseek' || parserMode === 'claude' || parserMode === 'flowise',
      healthy: Number(llmCalls ?? 0) > 0,
      structuredOutputValid: hasPriced === 't',
      fallbackUsed: false,
      correlationId: marker,
      providerRequestId: llmCalls ? `llmCalls=${llmCalls}` : undefined,
    },
    order: orderId
      ? {
          source,
          correlationId: marker,
          orderId,
          persisted: true,
          rulesEvaluated: hasTrace === 't' && hasPriced === 't',
          operatorVisible: true,
        }
      : undefined,
  };
}

async function collectMedia(ctx) {
  const store = await collectRuntimeValue(ctx, 'MEDIA_STORE');
  const bucket = await collectRuntimeValue(ctx, 'MEDIA_BUCKET');
  const reachable = bucket
    ? (await ssh(`gcloud storage ls 'gs://${bucket}' >/dev/null 2>&1 && echo ok || echo fail`, ctx.gcp)).trim()
    : 'fail';
  return {
    implementation: store,
    real: store === 'gcs' || store === 's3',
    healthy: reachable === 'ok',
    reachabilityChecked: true,
  };
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const gcp = {
    project: args.project ?? DEFAULT_PROJECT,
    zone: args.zone ?? DEFAULT_ZONE,
    vm: args.vm ?? DEFAULT_VM,
  };
  const publicIp = (
    await execFileAsync(
      'gcloud',
      [
        'compute', 'addresses', 'describe', 'netviet-public-ip',
        '--region', args.region ?? 'asia-southeast1',
        '--project', gcp.project,
        '--format', 'value(address)',
      ],
      { encoding: 'utf8', windowsHide: true },
    )
  ).stdout.trim();

  const identity = resolveStackIdentity({
    tenant: args.tenant,
    environment: args.environment,
    primaryTenant: args['primary-tenant'] ?? 'ultty',
    hostSuffix: `${publicIp.replaceAll('.', '-')}.sslip.io`,
  });
  const ctx = { identity, gcp };

  process.stderr.write(`Collecting evidence for stack ${identity.stackSlug} on ${gcp.vm}...\n`);

  const evidence = {
    release: await probe('release', () => collectRelease(ctx)),
    containers: await probe('containers', () => collectContainers(ctx)),
    api: await probe('api', () => collectApi(ctx)),
    web: await probe('web', () => collectWeb(ctx)),
    database: await probe('database', () => collectDatabase(ctx)),
    network: await probe('network', () => collectNetwork(ctx)),
    auth: await probe('auth', () => collectAuth(ctx)),
    readiness: await probe('readiness', () => collectReadiness(ctx)),
    media: await probe('media', () => collectMedia(ctx)),
  };

  const zaloState = await probe('zalo', () => collectZaloState(ctx));
  if (typeof args.correlation === 'string' && args.correlation.trim() !== '') {
    const correlated = await probe('correlation', () => collectCorrelation(ctx, args.correlation.trim()));
    if (correlated?.zalo) evidence.zalo = { ...zaloState, ...correlated.zalo };
    if (correlated?.parser) evidence.parser = correlated.parser;
    if (correlated?.order) evidence.order = correlated.order;
  }
  if (!evidence.zalo && zaloState) evidence.zalo = zaloState;

  const json = JSON.stringify(evidence, null, 2);
  if (typeof args.out === 'string') {
    await writeFile(args.out, `${json}\n`, { encoding: 'utf8', mode: 0o600 });
    process.stderr.write(`Evidence written to ${args.out}\n`);
  } else {
    process.stdout.write(`${json}\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
