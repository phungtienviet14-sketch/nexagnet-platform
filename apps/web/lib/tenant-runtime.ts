import type { CapabilityId, ExperienceId, TenantConfig } from '@netviet/tenant';
import type { Branding } from './branding';

export interface PublicTenantDescriptor {
  readonly branding: Branding;
  readonly experience: ExperienceId;
  readonly capabilities: readonly CapabilityId[];
  /** Adapter identifiers are safe for UI composition. Credentials are deliberately omitted. */
  readonly integrationAdapters: {
    readonly channel: readonly string[];
    readonly parser: readonly string[];
    readonly erp?: string;
    readonly contentSource?: string;
  };
}

/**
 * Build the only tenant shape that may cross the Server Component -> browser boundary.
 * Select fields explicitly so a future credential reference cannot leak through object spreading.
 */
export function toPublicTenantDescriptor(config: TenantConfig): PublicTenantDescriptor {
  return {
    branding: { ...config.branding, shortName: config.identity.shortName },
    experience: config.experience,
    capabilities: [...config.capabilities],
    integrationAdapters: {
      channel: [...(config.integrations.channel?.allowedAdapters ?? [])],
      parser: [...(config.integrations.parser?.allowedAdapters ?? [])],
      ...(config.integrations.erp ? { erp: config.integrations.erp.adapter } : {}),
      ...(config.integrations.contentSource
        ? { contentSource: config.integrations.contentSource.adapter }
        : {}),
    },
  };
}

export function hasCapability(
  tenant: PublicTenantDescriptor,
  capability: CapabilityId,
): boolean {
  return tenant.capabilities.includes(capability);
}

export function hasZaloIntegration(tenant: PublicTenantDescriptor): boolean {
  if (!hasCapability(tenant, 'messaging')) return false;
  return tenant.integrationAdapters.channel.some((adapter) =>
    ['bot', 'zca', 'hybrid'].includes(adapter),
  );
}
