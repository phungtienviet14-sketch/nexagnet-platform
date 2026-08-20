/**
 * One stack = one tenant running in one environment.
 *
 * Invariant 3 in docs/phat-trien/van-hanh/ci-cd.md says the customer slug is the single source
 * that decides the stack directory, the compose project name (=> the volume names), the secret
 * prefix, the network aliases and the hostname. That invariant is what kept two customers from
 * overwriting each other, and it stays intact here — it is only the *source* that widens.
 *
 * Until now `tenant` was that source, so `ultty/dev` and `ultty/production` resolved to the very
 * same stack: the same directory, the same PostgreSQL volume, the same hostnames. That is fine
 * while both are the same box, but it makes a technical test environment impossible to express —
 * deploying `gd1-test` would just overwrite whatever was already there.
 *
 * The source is now the STACK SLUG, derived from (tenant, environment). Environments that already
 * run on the VM derive back to the bare tenant slug, so nothing about the live stacks moves:
 * `zalo-ultty` stays `zalo-ultty` and keeps its volumes. A new environment gets a slug of its own,
 * and therefore an entire stack of its own.
 */

/**
 * Environments whose stack slug MUST stay the bare tenant slug.
 *
 * These already exist on the VM. `legacy` is the fallback that deploy-remote.sh applies when an
 * older caller passes no environment at all. Adding an environment to this list points it at an
 * existing stack's volumes — do not add one without reading §8 of ci-cd.md first.
 */
export const LEGACY_STACK_ENVIRONMENTS = Object.freeze(['dev', 'production', 'legacy']);

const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function assertSafe(value, label) {
  if (typeof value !== 'string' || !SAFE_SLUG.test(value)) {
    throw new Error(
      `Invalid ${label}: ${JSON.stringify(value)} (expected lowercase a-z, 0-9 and single hyphens)`,
    );
  }
  return value;
}

/**
 * Derive the stack slug. This is the only place the rule lives; everything else asks this
 * function rather than re-deriving, so a stack can never be half-renamed.
 */
export function resolveStackSlug(tenant, environment) {
  assertSafe(tenant, 'tenant');
  assertSafe(environment, 'environment');
  return LEGACY_STACK_ENVIRONMENTS.includes(environment) ? tenant : `${tenant}-${environment}`;
}

/**
 * Every infrastructure name this stack owns, derived from the one slug.
 *
 * `primaryTenant` and `hostSuffix` are optional: callers that only need on-disk names (backup,
 * rollback) can skip them, and the hostname fields are then omitted rather than guessed.
 */
export function resolveStackIdentity({ tenant, environment, primaryTenant, hostSuffix } = {}) {
  const tenantSlug = assertSafe(tenant, 'tenant');
  const stackSlug = resolveStackSlug(tenantSlug, environment);

  const identity = {
    tenantSlug,
    environment,
    stackSlug,
    appDir: `/srv/netviet/apps/zalo-${stackSlug}`,
    composeProject: `zalo-${stackSlug}`,
    secretPrefix: `zalo-${stackSlug}-`,
    backendNetwork: `zalo-${stackSlug}_backend`,
    dataNetwork: `zalo-${stackSlug}_data`,
    postgresVolume: `zalo-${stackSlug}_postgres-data`,
    flowiseVolume: `zalo-${stackSlug}_flowise-data`,
    apiAlias: `api-${stackSlug}`,
    webAlias: `web-${stackSlug}`,
    flowiseAlias: `flowise-${stackSlug}`,
    // Backups used to land in a single `daily/<stamp>/` shared by every stack, and the 7-entry
    // prune counted across all of them — so two stacks halved each other's retention and a dump
    // could not be attributed to a stack. Scoping by slug gives each stack its own window.
    backupPrefix: `stacks/${stackSlug}`,
  };

  if (typeof hostSuffix === 'string' && hostSuffix !== '') {
    // The primary tenant keeps the bare hostname because OPERATOR_DOMAIN feeds PUBLIC_BASE_URL and
    // Zalo fetches catalog images from that URL — renaming it kills the images in every message
    // already sent. Only the stack whose slug IS the primary tenant qualifies, so a second stack
    // for the same tenant can never take the name away from the running one.
    const isPrimary = stackSlug === primaryTenant;
    identity.demoDomain = isPrimary ? `demo.${hostSuffix}` : `demo-${stackSlug}.${hostSuffix}`;
    identity.operatorDomain = isPrimary
      ? `operator.${hostSuffix}`
      : `operator-${stackSlug}.${hostSuffix}`;
    identity.flowiseDomain = isPrimary
      ? `flowise.${hostSuffix}`
      : `flowise-${stackSlug}.${hostSuffix}`;
  }

  return Object.freeze(identity);
}
