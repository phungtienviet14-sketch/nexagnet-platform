import {
  EXPERIENCE_IDS,
  EXPERIENCE_REQUIREMENTS,
  type CapabilityId,
  type TenantConfig,
} from '@netviet/tenant';
import { describe, expect, it } from 'vitest';
import { EXPERIENCE_REGISTRY, resolveExperience } from '../experiences/experience-registry';
import {
  resolveActiveSettingsTab,
  selectSettingsTabIds,
} from '../components/settings/settings-composition';
import { hasZaloIntegration, toPublicTenantDescriptor } from './tenant-runtime';

const operationsTenant = {
  schemaVersion: 2,
  slug: 'fixture-operations',
  identity: { displayName: 'Fixture Operations', shortName: 'Operations' },
  branding: {
    productName: 'Operations Fixture',
    installName: 'Operations Fixture',
    pageTitle: 'Operations Fixture',
    pageDescription: 'Operations fixture',
    themeColor: '#315b7d',
    backgroundColor: '#f5f7fb',
    monogram: 'O',
    composerPlaceholder: 'Nhap tin nhan',
  },
  experience: 'operations-console',
  capabilities: [
    'knowledge',
    'messaging',
    'turn-processing',
    'sales-order',
    'campaign',
    'operations',
    'notifications',
  ],
  policies: {
    salesOrder: {
      supportedDealerPolicies: ['thanh_toan_ngay'],
      automation: null,
      retailAdvice: { priceField: 'retailPrice', qualifier: 'Gia test' },
    },
    campaign: {
      defaultWindow: { start: '08:00', end: '12:00' },
      minSpacingSeconds: 30,
      maxTargets: 10,
      rateLimitPerMinute: 10,
      claimLeaseSeconds: 60,
      tickIntervalSeconds: 10,
      retry: { maxAttempts: 2, baseBackoffSeconds: 30 },
      features: { lunarCalendarEnabled: false },
    },
    readiness: { blockedCapabilities: [] },
  },
  integrations: {
    channel: { allowedAdapters: ['mock', 'zca'] },
    parser: { allowedAdapters: ['claude'] },
    erp: { adapter: 'none' },
    contentSource: { adapter: 'local_manifest' },
  },
  persona: {
    messaging: { botName: 'Fixture Bot', mentionName: 'Fixture Bot' },
    turnProcessing: { parserIntro: 'Fixture parser' },
    knowledge: { productFallbackDescription: 'Fixture product' },
  },
  bootstrap: {
    knowledge: { path: 'data/knowledge.json' },
    salesOrder: { path: 'data/knowledge.json' },
  },
  smoke: null,
} as const satisfies TenantConfig;

const knowledgeTenant = {
  ...operationsTenant,
  slug: 'fixture-knowledge',
  identity: { displayName: 'Fixture Knowledge', shortName: 'Knowledge' },
  experience: 'knowledge-workspace',
  capabilities: ['knowledge'],
  policies: { readiness: { blockedCapabilities: [] } },
  integrations: { contentSource: { adapter: 'local_manifest' } },
  persona: {},
  bootstrap: { knowledge: { path: 'data/knowledge.json' } },
} as const satisfies TenantConfig;

const workforceTenant = {
  ...operationsTenant,
  slug: 'fixture-workforce',
  identity: { displayName: 'Fixture Workforce', shortName: 'Workforce' },
  experience: 'agent-workforce',
  capabilities: ['knowledge', 'operations'],
  policies: { readiness: { blockedCapabilities: [] } },
  integrations: { contentSource: { adapter: 'local_manifest' } },
  persona: {},
  bootstrap: { knowledge: { path: 'data/knowledge.json' } },
} as const satisfies TenantConfig;

const leanOperationsTenant = {
  ...operationsTenant,
  slug: 'fixture-lean-operations',
  capabilities: ['knowledge', 'messaging', 'turn-processing', 'sales-order', 'operations'],
  policies: {
    salesOrder: operationsTenant.policies.salesOrder,
    readiness: { blockedCapabilities: [] },
  },
  integrations: {
    ...operationsTenant.integrations,
    channel: { allowedAdapters: ['mock'] },
  },
} as const satisfies TenantConfig;

describe('ExperienceRegistry', () => {
  it('implements every experience admitted by the tenant contract', () => {
    expect(Object.keys(EXPERIENCE_REGISTRY).sort()).toEqual([...EXPERIENCE_IDS].sort());
    for (const experience of EXPERIENCE_IDS) {
      expect(EXPERIENCE_REGISTRY[experience].requiredCapabilities).toBe(
        EXPERIENCE_REQUIREMENTS[experience],
      );
    }
  });

  it('resolves all reusable compositions without falling back to another experience', () => {
    expect(resolveExperience('operations-console').id).toBe('operations-console');
    expect(resolveExperience('knowledge-workspace').id).toBe('knowledge-workspace');
    expect(resolveExperience('agent-workforce').id).toBe('agent-workforce');
    expect(() => resolveExperience('missing' as never)).toThrow(/experience/i);
  });

  it('does not require optional campaign and notification settings for operations console', () => {
    const required = resolveExperience(leanOperationsTenant.experience).requiredCapabilities;
    const enabled = new Set<CapabilityId>(leanOperationsTenant.capabilities);
    expect(required.every((capability) => enabled.has(capability))).toBe(true);
  });
});

describe('public tenant runtime descriptor', () => {
  it('exposes only branding, experience, capabilities and public adapter IDs', () => {
    const descriptor = toPublicTenantDescriptor(operationsTenant);

    expect(descriptor).toEqual({
      branding: { ...operationsTenant.branding, shortName: 'Operations' },
      experience: 'operations-console',
      capabilities: operationsTenant.capabilities,
      integrationAdapters: {
        channel: ['mock', 'zca'],
        parser: ['claude'],
        erp: 'none',
        contentSource: 'local_manifest',
      },
    });
    expect(JSON.stringify(descriptor)).not.toMatch(/credential|secret|token/i);
  });

  it('does not expose the Zalo operator route without messaging and a Zalo adapter', () => {
    expect(hasZaloIntegration(toPublicTenantDescriptor(operationsTenant))).toBe(true);
    expect(hasZaloIntegration(toPublicTenantDescriptor(knowledgeTenant))).toBe(false);
  });
});

describe('settings composition', () => {
  it('preserves the complete operations-console tab order', () => {
    expect(selectSettingsTabIds(toPublicTenantDescriptor(operationsTenant))).toEqual([
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
    ]);
  });

  it('keeps a knowledge-only experience free of Zalo, order, price and campaign panels', () => {
    const tabs = selectSettingsTabIds(toPublicTenantDescriptor(knowledgeTenant));

    expect(tabs).toEqual(['content']);
    expect(tabs).not.toEqual(expect.arrayContaining(['zalo', 'source-truth', 'campaigns']));
  });

  it('keeps an agent-workforce experience focused on content, readiness, users, and audit without Zalo or sales-order panels', () => {
    const tabs = selectSettingsTabIds(toPublicTenantDescriptor(workforceTenant));

    expect(tabs).toEqual(['content', 'readiness', 'users', 'audit']);
    expect(tabs).not.toEqual(
      expect.arrayContaining([
        'zalo',
        'members',
        'source-truth',
        'rules',
        'campaigns',
        'automation',
        'notifications',
      ]),
    );
  });

  it('chooses the first visible panel when Zalo or a requested tab is unavailable', () => {
    const tabs = selectSettingsTabIds(toPublicTenantDescriptor(leanOperationsTenant));

    expect(tabs).not.toContain('zalo');
    expect(resolveActiveSettingsTab(tabs, 'zalo')).toBe('members');
    expect(resolveActiveSettingsTab(tabs, 'campaigns')).toBe('members');
  });
});
