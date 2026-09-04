/**
 * CLOSED CATALOG OF DEPLOYMENT PROFILES.
 *
 * `gd1-test` used to be one hard-wired path rather than an environment: the runtime gate, the
 * preflight and the secret contract all named Ultty directly, so a second isolated preview stack
 * had exactly two ways in — weaken the Ultty profile, or fall onto `preflight: standard`, which
 * (proven on 213af13, see deployment-targets.contract.test.mjs) SKIPS the exact-main CI proof
 * entirely. Both are the wrong trade.
 *
 * What generalizes here is the CONTROL PLANE, not the Ultty runtime. Ultty keeps every check it
 * had; those checks simply now hang off a NAMED profile instead of off the word "gd1-test"
 * appearing in a shell comparison.
 *
 * Two rules carry the safety of the whole file:
 *
 *   1. The gate is derived from the ENVIRONMENT, never from a registry field. A registry row
 *      cannot opt out of the exact-main proof by naming a weaker profile, because a gated
 *      environment REFUSES any profile that is not itself gated (`validateProfileForEntry`).
 *   2. A profile declares the subsystems it actually enables, and its secret contract is DERIVED
 *      from that declaration. Nothing inherits a credential because some other tenant needs one.
 */

/**
 * Environments that MUST carry the exact-main CI proof.
 *
 * This list — not a registry column — is what makes the gate non-bypassable. Adding an entry here
 * strengthens the platform; nothing a registry author writes can remove one.
 */
export const GATED_ENVIRONMENTS = Object.freeze(['gd1-test']);

/** The only gate values a profile may declare. Unknown => the profile itself is rejected. */
export const DEPLOYMENT_GATES = Object.freeze(['gd1-test', 'standard']);

/** Parser adapters a profile may select. `none` = this profile runs no LLM parser at all. */
export const PARSER_ADAPTERS = Object.freeze(['deepseek', 'flowise', 'none']);

/** Channel adapters a profile may select. `none` = this profile talks to no chat channel. */
export const CHANNEL_ADAPTERS = Object.freeze(['zca', 'bot', 'mock', 'none']);

const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Secrets EVERY stack needs, whatever it runs: its own Postgres, its own API key, its own
 * operator login. Nothing here is tenant-specific, and nothing tenant-specific belongs here.
 */
const BASE_SECRET_SUFFIXES = Object.freeze([
  'postgres-admin-password',
  'zalo-db-password',
  'api-key',
  'operator-password',
]);

/**
 * Secrets a SUBSYSTEM brings with it. A profile that does not enable the subsystem never sees
 * these names, which is the whole point: the previously reported "13 secrets" is not a platform
 * invariant, it is the measured cost of one profile's subsystem set (see PROFILE_SECRET_MATRIX).
 */
const SUBSYSTEM_SECRET_SUFFIXES = Object.freeze({
  flowise: Object.freeze([
    'flowise-db-password',
    'flowise-secretkey',
    'flowise-admin-email',
    'flowise-admin-password',
    'flowise-jwt-secret',
    'flowise-refresh-secret',
    'flowise-session-secret',
    'flowise-token-hash-secret',
  ]),
  deepseekParser: Object.freeze(['deepseek-api-key']),
  workflowEngine: Object.freeze(['hatchet-db-password', 'workflow-dashboard-htpasswd']),
  observability: Object.freeze([
    'otlp-ingest-token',
    'clickhouse-writer-password',
    'clickhouse-reader-password',
  ]),
});

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/** True when this environment must prove exact-main CI before anything is built or shipped. */
export function isGatedEnvironment(environment) {
  return GATED_ENVIRONMENTS.includes(environment);
}

/**
 * The secret contract of a profile, derived from what it actually turns on.
 *
 * `switches` carries the two DISPATCH-TIME toggles (`workflow_engine`, `observability_stack`).
 * They are not profile constants: an operator picks them per run, and `render-secrets.sh` only
 * demands their credentials when they are `on`. Deriving them here keeps the deploy-time contract
 * and the render-time contract from drifting apart.
 */
export function requiredSecretSuffixesFor(profile, switches = {}) {
  if (!profile || typeof profile !== 'object') {
    throw new Error('a deployment profile is required to derive its secret contract');
  }
  const subsystems = profile.subsystems ?? {};
  const suffixes = [...BASE_SECRET_SUFFIXES];
  if (subsystems.flowise === true) suffixes.push(...SUBSYSTEM_SECRET_SUFFIXES.flowise);
  if (subsystems.parser === 'deepseek') suffixes.push(...SUBSYSTEM_SECRET_SUFFIXES.deepseekParser);
  if (switches.workflowEngine === true) suffixes.push(...SUBSYSTEM_SECRET_SUFFIXES.workflowEngine);
  if (switches.observability === true) suffixes.push(...SUBSYSTEM_SECRET_SUFFIXES.observability);
  return Object.freeze(suffixes);
}

/**
 * Fully-qualified secret NAMES for one stack. Never values — this repository stores contracts.
 *
 * The prefix comes from the stack slug, so two profiles can never name the same secret: that is
 * the isolation boundary at the credential layer, one layer with the volume and network names.
 */
export function requiredSecretNamesFor(profile, stackSlug, switches = {}) {
  if (!SAFE_SLUG.test(String(stackSlug))) {
    throw new Error(`Invalid stack slug: ${JSON.stringify(stackSlug)}`);
  }
  return Object.freeze(
    requiredSecretSuffixesFor(profile, switches).map((suffix) => `zalo-${stackSlug}-${suffix}`),
  );
}

/**
 * Validated constructor. Every profile — catalogued or built by a test fixture — goes through
 * here, so a malformed profile cannot exist in the first place.
 */
export function defineDeploymentProfile(input) {
  const errors = [];
  const id = input?.id;
  if (!isNonEmptyString(id) || !SAFE_SLUG.test(id)) errors.push('profile id must be a safe slug');
  if (!DEPLOYMENT_GATES.includes(input?.gate)) {
    errors.push(`profile gate must be one of ${DEPLOYMENT_GATES.join(', ')}`);
  }

  // environment -> runtimeEnvironment. Declaring the pair TOGETHER is what stops a registry row
  // from claiming the isolated `gd1-test` stack slug while handing `deploy-ci.sh` a runtime
  // environment of `dev` — which on 213af13 skipped the preflight AND left AUTO_SEND at its `on`
  // default. One map, one truth.
  const environments = input?.environments;
  if (!environments || typeof environments !== 'object' || Object.keys(environments).length === 0) {
    errors.push('profile must declare at least one environment -> runtimeEnvironment mapping');
  } else {
    for (const [environment, runtimeEnvironment] of Object.entries(environments)) {
      if (!SAFE_SLUG.test(environment)) errors.push(`profile environment ${environment} is unsafe`);
      if (!isNonEmptyString(runtimeEnvironment) || !SAFE_SLUG.test(runtimeEnvironment)) {
        errors.push(`profile runtime environment for ${environment} is unsafe`);
      }
      // A gated environment cannot be served by a profile that does not carry the gate. This is
      // the closure that #180 fell through: `preflight: standard` on a gd1-test row.
      if (isGatedEnvironment(environment) && input?.gate !== 'gd1-test') {
        errors.push(`environment ${environment} is gated and requires gate=gd1-test`);
      }
    }
  }

  const tenants = input?.tenants ?? null;
  if (tenants !== null) {
    if (!Array.isArray(tenants) || tenants.length === 0) {
      errors.push('profile tenants must be null (any) or a non-empty list');
    } else if (!tenants.every((tenant) => isNonEmptyString(tenant) && SAFE_SLUG.test(tenant))) {
      errors.push('profile tenant slugs must be safe slugs');
    }
  }

  const subsystems = input?.subsystems;
  if (!subsystems || typeof subsystems !== 'object') {
    errors.push('profile must declare its subsystems');
  } else {
    if (typeof subsystems.flowise !== 'boolean') errors.push('subsystems.flowise must be boolean');
    if (!PARSER_ADAPTERS.includes(subsystems.parser)) {
      errors.push(`subsystems.parser must be one of ${PARSER_ADAPTERS.join(', ')}`);
    }
    if (!CHANNEL_ADAPTERS.includes(subsystems.channel)) {
      errors.push(`subsystems.channel must be one of ${CHANNEL_ADAPTERS.join(', ')}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid deployment profile: ${errors.join('; ')}`);
  }

  return Object.freeze({
    id,
    gate: input.gate,
    environments: Object.freeze({ ...environments }),
    tenants: tenants === null ? null : Object.freeze([...tenants]),
    subsystems: Object.freeze({ ...subsystems }),
    // Which preflight module owns this profile's business/readiness checks. `null` = none beyond
    // the common gate, which is honest rather than a stub that reports PASS having checked nothing.
    preflightModule: input.preflightModule ?? null,
  });
}

/**
 * THE CLOSED CATALOG. A registry row naming anything not in here is denied before any credential
 * is read, any image is built and any host is touched.
 */
export const DEPLOYMENT_PROFILES = Object.freeze({
  /**
   * ULTTY GD1-TEST — REGRESSION CONTRACT, NOT CLEANUP MATERIAL.
   *
   * Every value below is the one the pilot already ran on: ZCA as the only channel, DeepSeek as
   * the parser, Flowise present, and the readiness checks still owned by
   * `gd1-test-preflight.mjs`. Relocating the declaration does not relax it — the preflight keeps
   * asserting tenant=ultty, experience=b2b-sales-operations and AUTO_SEND=off, and this profile
   * is what selects that preflight.
   */
  'ultty-gd1-test': defineDeploymentProfile({
    id: 'ultty-gd1-test',
    gate: 'gd1-test',
    environments: { 'gd1-test': 'gd1-test' },
    tenants: ['ultty'],
    subsystems: { flowise: true, parser: 'deepseek', channel: 'zca' },
    preflightModule: 'gd1-test-preflight',
  }),

  /**
   * The pre-existing dev/production path, named at last.
   *
   * It carries NO gate, and that is a statement of the world as it is on 213af13 rather than a
   * new permission: `dev` and `production` have never verified exact-main CI. What changed is
   * that this profile can no longer be pointed at a gated environment — `defineDeploymentProfile`
   * refuses it, and so does `validateProfileForEntry`.
   *
   * Production hardening is deliberately out of scope here (Issue #186 §3).
   */
  standard: defineDeploymentProfile({
    id: 'standard',
    gate: 'standard',
    environments: { dev: 'dev', production: 'prod' },
    tenants: null,
    subsystems: { flowise: true, parser: 'deepseek', channel: 'zca' },
    preflightModule: null,
  }),
});

/** Look up a profile by id. Unknown id => throw; there is no permissive default. */
export function resolveDeploymentProfile(profileId) {
  const profile = Object.prototype.hasOwnProperty.call(DEPLOYMENT_PROFILES, profileId)
    ? DEPLOYMENT_PROFILES[profileId]
    : undefined;
  if (!profile) {
    throw new Error(
      `Unknown deployment profile: ${JSON.stringify(profileId)} (known: ${Object.keys(DEPLOYMENT_PROFILES).join(', ')})`,
    );
  }
  return profile;
}

/**
 * Check one registry row against its profile. Returns the list of reasons it is refused; empty
 * means accepted. Reasons are returned rather than thrown so the caller can print all of them.
 */
export function validateProfileForEntry(profile, entry) {
  const errors = [];
  const environment = entry?.environment;

  // A gated environment demands a gated profile — checked HERE too, not only in the profile
  // constructor, so a hand-built profile object cannot slip past by never being constructed.
  if (isGatedEnvironment(environment) && profile?.gate !== 'gd1-test') {
    errors.push(`environment ${environment} is gated and profile ${profile?.id} is not`);
  }

  if (!Object.prototype.hasOwnProperty.call(profile?.environments ?? {}, environment)) {
    errors.push(`profile ${profile?.id} does not serve environment ${environment}`);
  } else if (entry?.runtimeEnvironment !== profile.environments[environment]) {
    // THE ALIASING GUARD. `deploy-ci.sh` derives the real stack slug from the RUNTIME environment,
    // so a row declaring `environment: gd1-test` with `runtimeEnvironment: dev` resolves to the
    // isolated slug on paper and deploys onto the shared `<tenant>` stack in practice.
    errors.push(
      `profile ${profile.id} maps ${environment} to runtime ${profile.environments[environment]}, not ${entry?.runtimeEnvironment}`,
    );
  }

  if (profile?.tenants !== null && !profile?.tenants?.includes(entry?.tenant)) {
    errors.push(`profile ${profile?.id} is not registered for tenant ${entry?.tenant}`);
  }

  return errors;
}

/**
 * Measured secret cost per profile, with the switches an operator can add. Printed by the deploy
 * workflow so the contract is visible in the run log — names only, never values.
 */
export function describeSecretContract(profile, stackSlug, switches = {}) {
  return Object.freeze({
    profile: profile.id,
    stackSlug,
    switches: Object.freeze({
      workflowEngine: switches.workflowEngine === true,
      observability: switches.observability === true,
    }),
    secretNames: requiredSecretNamesFor(profile, stackSlug, switches),
  });
}
