import type { CapabilityId, PublicTenantDescriptor } from '@netviet/tenant';

/**
 * PHEP CHIEU CONG KHAI cua goi khach nay song o `@netviet/tenant` (`public-descriptor.ts`) — API
 * dung chinh no cho `GET /auth/client` (ung dung native), nen web va dien thoai doc CUNG mot hinh
 * dang thay vi hai ban chep tay.
 *
 * O day CHI re-export KIEU, co y: tep nay nam trong bundle trinh duyet (`SettingsShell` ->
 * `settings-composition` -> day). Mot import GIA TRI tu `@netviet/tenant` se keo loader (`node:fs`)
 * vao trinh duyet. Server Component can `toPublicTenantDescriptor` thi import thang tu
 * `@netviet/tenant`, canh `loadTenantConfig` ma no von da import.
 */
export type {
  BlockedCapabilityDescriptor,
  PreviewNoticeDescriptor,
  PublicTenantDescriptor,
} from '@netviet/tenant';

export function hasCapability(tenant: PublicTenantDescriptor, capability: CapabilityId): boolean {
  return tenant.capabilities.includes(capability);
}

export function hasZaloIntegration(tenant: PublicTenantDescriptor): boolean {
  if (!hasCapability(tenant, 'messaging')) return false;
  return tenant.integrationAdapters.channel.some((adapter) =>
    ['bot', 'zca', 'hybrid'].includes(adapter),
  );
}
