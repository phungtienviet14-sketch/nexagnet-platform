/**
 * THE ONE DOOR from a (tenant, environment) request to a deployment plan.
 *
 * This used to be a heredoc inlined into `reusable-deploy-tenant.yml`. Two things followed from
 * that, and both were load-bearing failures:
 *
 *   · nothing could test it, so the registry's `preflight` column was free-form text whose only
 *     validation was a `==` in a workflow `if:`;
 *   · the gate it selected (`preflight`) and the runtime it handed to `deploy-ci.sh`
 *     (`runtimeEnvironment`) were INDEPENDENT columns. A row could claim the isolated `gd1-test`
 *     stack slug, emit `preflight: standard` so the exact-main CI step was skipped outright, and
 *     emit `runtimeEnvironment: dev` so the preflight never ran and AUTO_SEND stayed at its `on`
 *     default. Verified against 213af13; the resolver returned exit 0.
 *
 * Now the profile decides both, the environment decides the gate, and every disagreement is a
 * refusal rather than a reconciliation.
 */

import { resolveStackSlug } from './stack-identity.mjs';
import {
  describeSecretContract,
  isGatedEnvironment,
  resolveDeploymentProfile,
  validateProfileForEntry,
} from './deployment-profiles.mjs';

/**
 * Distinct exit codes per refusal. A deploy that dies at 3am should say WHICH invariant it hit
 * without anyone re-reading this file.
 */
export const RESOLVE_EXIT_CODES = Object.freeze({
  unsupportedTarget: 64,
  environmentMismatch: 65,
  unknownTargetId: 66,
  incompleteTarget: 67,
  stackSlugMismatch: 68,
  unknownProfile: 69,
  profileRejected: 70,
});

const REQUIRED_TARGET_FIELDS = Object.freeze([
  'vmName',
  'gcpProjectId',
  'region',
  'zone',
  'primaryTenant',
]);

export class DeploymentResolutionError extends Error {
  constructor(exitCode, reasons) {
    super(reasons.join('; '));
    this.name = 'DeploymentResolutionError';
    this.exitCode = exitCode;
    this.reasons = Object.freeze([...reasons]);
  }
}

/**
 * Resolve and validate one deployment request.
 *
 * `switches` are the dispatch-time toggles; they only widen the secret contract that gets
 * printed, never the gate.
 */
export function resolveDeploymentTarget(registry, request, switches = {}) {
  const tenant = request?.tenant;
  const environment = request?.environment;

  const entry = (registry?.deployments ?? []).find(
    (candidate) => candidate.tenant === tenant && candidate.environment === environment,
  );
  if (!entry) {
    throw new DeploymentResolutionError(RESOLVE_EXIT_CODES.unsupportedTarget, [
      `Unsupported deployment target: tenant=${tenant} environment=${environment}`,
    ]);
  }

  if (entry.githubEnvironment !== environment) {
    throw new DeploymentResolutionError(RESOLVE_EXIT_CODES.environmentMismatch, [
      `Deployment registry mismatch: ${tenant}/${environment} maps to GitHub environment ${entry.githubEnvironment}`,
    ]);
  }

  const target = registry?.targets?.[entry.target];
  if (!target) {
    throw new DeploymentResolutionError(RESOLVE_EXIT_CODES.unknownTargetId, [
      `Unsupported deployment target id: ${entry.target}`,
    ]);
  }

  for (const field of REQUIRED_TARGET_FIELDS) {
    if (typeof target[field] !== 'string' || target[field].trim() === '') {
      throw new DeploymentResolutionError(RESOLVE_EXIT_CODES.incompleteTarget, [
        `Deployment target ${entry.target} is missing ${field}`,
      ]);
    }
  }

  // The stack slug decides the compose project name, and the compose project name decides the
  // volume names. A registry entry that disagrees with the rule would point a new environment at
  // a running stack's PostgreSQL volume, so refuse rather than reconcile.
  const stackSlug = resolveStackSlug(tenant, environment);
  if (entry.stackSlug !== stackSlug) {
    throw new DeploymentResolutionError(RESOLVE_EXIT_CODES.stackSlugMismatch, [
      `Deployment registry declares stack ${entry.stackSlug} but the rule derives ${stackSlug}`,
    ]);
  }

  let profile;
  try {
    profile = resolveDeploymentProfile(entry.profile);
  } catch (error) {
    throw new DeploymentResolutionError(RESOLVE_EXIT_CODES.unknownProfile, [
      error instanceof Error ? error.message : String(error),
    ]);
  }

  const profileErrors = validateProfileForEntry(profile, entry);
  if (profileErrors.length > 0) {
    throw new DeploymentResolutionError(RESOLVE_EXIT_CODES.profileRejected, profileErrors);
  }

  return Object.freeze({
    tenant,
    environment,
    stackSlug,
    profileId: profile.id,
    gate: profile.gate,
    // Derived from the ENVIRONMENT. A registry author cannot set this, which is the point.
    requiresExactMainCi: isGatedEnvironment(environment),
    runtimeEnvironment: entry.runtimeEnvironment,
    targetId: entry.target,
    vmName: target.vmName,
    gcpProjectId: target.gcpProjectId,
    gcpRegion: target.region,
    gcpZone: target.zone,
    primaryTenant: target.primaryTenant,
    secretContract: describeSecretContract(profile, stackSlug, switches),
  });
}

/** Flat `key=value` step outputs for GitHub Actions. Secret NAMES only; never values. */
export function toStepOutputs(plan) {
  return Object.freeze({
    stack_slug: plan.stackSlug,
    target_id: plan.targetId,
    vm_name: plan.vmName,
    gcp_project_id: plan.gcpProjectId,
    gcp_region: plan.gcpRegion,
    gcp_zone: plan.gcpZone,
    primary_tenant: plan.primaryTenant,
    runtime_environment: plan.runtimeEnvironment,
    deployment_profile: plan.profileId,
    deployment_gate: plan.gate,
    requires_exact_main_ci: plan.requiresExactMainCi ? 'true' : 'false',
  });
}
