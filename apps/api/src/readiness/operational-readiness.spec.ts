import { describe, expect, it } from 'vitest';
import { evaluateOperationalReadiness, type OperationalReadinessInput } from './operational-readiness.js';

const READY: OperationalReadinessInput = {
  tenantLoaded: true,
  currentPricePeriod: true,
  dealerCount: 2,
  enabledGroupMappingCount: 3,
  parser: { provider: 'claude', productionAllowed: true, credentialsPresent: true },
  media: { enabled: true, healthy: true },
  channel: { mode: 'zca', connected: true, productionTransport: true, detail: 'zca:ready' },
  auth: { enabled: true, persistentSessions: true },
  goldenEval: { evaluated: true, passed: true },
  campaignDataCount: 1,
  blockedCapabilities: [],
};

describe('evaluateOperationalReadiness', () => {
  it('is go-live ready only when every mandatory external/runtime gate is ready', () => {
    const result = evaluateOperationalReadiness(READY);

    expect(result.goLiveReady).toBe(true);
    expect(result.checks.filter((check) => check.blocking && check.status !== 'ready')).toEqual([]);
  });

  it('fails closed for stale price, mock parser/media/channel, disabled auth and missing golden data', () => {
    const result = evaluateOperationalReadiness({
      ...READY,
      currentPricePeriod: false,
      parser: { provider: 'mock', productionAllowed: false, credentialsPresent: false },
      media: { enabled: false, healthy: false },
      channel: { mode: 'mock', connected: false, productionTransport: false, detail: 'mock' },
      auth: { enabled: false, persistentSessions: false },
      goldenEval: { evaluated: false, passed: false, reason: 'missing_golden_dataset' },
    });

    expect(result.goLiveReady).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        'missing_current_price_period',
        'parser_not_production_ready',
        'media_not_production_ready',
        'channel_not_production_ready:mock',
        'auth_not_production_ready',
        'missing_golden_dataset',
      ]),
    );
  });

  it('shows tenant-supplied business blockers without hard-coding customer names in core', () => {
    const result = evaluateOperationalReadiness({
      ...READY,
      campaignDataCount: 0,
      blockedCapabilities: [
        { key: 'vat', label: 'VAT', reason: 'Thiếu quyết định nghiệp vụ' },
      ],
    });

    expect(result.goLiveReady).toBe(true);
    expect(result.checks).toContainEqual(
      expect.objectContaining({ key: 'business.vat', status: 'blocked', blocking: false }),
    );
    expect(result.checks).toContainEqual(
      expect.objectContaining({ key: 'campaign.data', status: 'warning', blocking: false }),
    );
  });
});
