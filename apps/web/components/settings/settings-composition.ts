import type { SettingsTabId } from './SettingsTabs';
import type { PublicTenantDescriptor } from '../../lib/tenant-runtime';
import { hasCapability, hasZaloIntegration } from '../../lib/tenant-runtime';

const OPERATIONS_TAB_ORDER = [
  'zalo',
  'members',
  'source-truth',
  'rules',
  'campaigns',
  'content',
  'automation',
  'notifications',
  'readiness',
  'users',
  'audit',
] as const satisfies readonly SettingsTabId[];

export function selectSettingsTabIds(
  tenant: PublicTenantDescriptor,
): readonly SettingsTabId[] {
  if (tenant.experience === 'knowledge-workspace') {
    return hasCapability(tenant, 'knowledge') ? ['content'] : [];
  }

  const visible = new Set<SettingsTabId>();
  if (hasZaloIntegration(tenant)) visible.add('zalo');
  if (hasCapability(tenant, 'messaging')) visible.add('members');
  if (hasCapability(tenant, 'sales-order')) {
    visible.add('source-truth');
    visible.add('rules');
    visible.add('automation');
  }
  if (hasCapability(tenant, 'campaign')) visible.add('campaigns');
  if (hasCapability(tenant, 'knowledge')) visible.add('content');
  if (hasCapability(tenant, 'notifications')) visible.add('notifications');
  if (hasCapability(tenant, 'operations')) {
    visible.add('readiness');
    visible.add('users');
    visible.add('audit');
  }
  return OPERATIONS_TAB_ORDER.filter((id) => visible.has(id));
}

export function resolveActiveSettingsTab(
  visibleTabs: readonly SettingsTabId[],
  requested?: string,
): SettingsTabId {
  const requestedTab = visibleTabs.find((id) => id === requested);
  const activeTab = requestedTab ?? visibleTabs[0];
  if (!activeTab) throw new Error('Experience khong co settings panel nao duoc bat');
  return activeTab;
}
