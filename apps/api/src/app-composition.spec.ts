import { describe, expect, it } from 'vitest';
import type { CapabilityId } from '@netviet/tenant';
import { buildAppComposition } from './app-composition.js';

const OPERATIONS_CAPABILITIES = [
  'knowledge',
  'messaging',
  'sales-order',
  'campaign',
  'operations',
  'notifications',
] as const satisfies readonly CapabilityId[];

describe('buildAppComposition', () => {
  it('giu day du route graph cua operations tenant hien tai', () => {
    const composition = buildAppComposition(OPERATIONS_CAPABILITIES);

    expect(composition.controllers.map((controller) => controller.name)).toEqual([
      'HealthController',
      'OrdersController',
      'MessagesController',
      'DemoController',
      'ErpController',
      'KnowledgeController',
      'BroadcastController',
      'StreamController',
      'ZaloController',
      'SettingsController',
      'CampaignController',
      'MediaHealthController',
      'CatalogMediaController',
      'MasterDataController',
      'ReadinessController',
      'NotificationsController',
      'SettingsNotificationsController',
    ]);
  });

  it('knowledge-only chi nap foundation + knowledge/content, khong nap order/Zalo/parser/campaign', () => {
    const composition = buildAppComposition(['knowledge']);
    const controllerNames = composition.controllers.map((controller) => controller.name);
    const providerNames = composition.providers.map(providerName);

    expect(controllerNames).toEqual(['HealthController', 'KnowledgeController']);
    expect(providerNames).not.toContain('OrdersService');
    expect(providerNames).not.toContain('ZaloUserClient');
    expect(providerNames).not.toContain('PipelineService');
    expect(providerNames).not.toContain('CampaignService');
    expect(providerNames).not.toContain('ORDER_PARSER');
  });
});

function providerName(provider: unknown): string {
  if (typeof provider === 'function') return provider.name;
  if (provider && typeof provider === 'object' && 'provide' in provider) {
    const token = (provider as { provide: unknown }).provide;
    return typeof token === 'function' ? token.name : String(token);
  }
  return String(provider);
}
