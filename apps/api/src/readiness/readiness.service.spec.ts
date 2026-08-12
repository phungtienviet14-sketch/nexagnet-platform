import { describe, expect, it, vi } from 'vitest';
import type { CampaignRepository } from '../campaigns/campaign.repository.js';
import type { KnowledgeService } from '../knowledge/knowledge.service.js';
import type { MediaStore } from '../media/media-store.js';
import { ReadinessService } from './readiness.service.js';

interface KnowledgeStub {
  prices: unknown[];
  dealers: unknown[];
  groups: unknown[];
}

function build(knowledge: KnowledgeStub, mediaEnabled = false): ReadinessService {
  return new ReadinessService(
    {
      prices: () => knowledge.prices,
      dealers: () => knowledge.dealers,
      groups: () => knowledge.groups,
    } as unknown as KnowledgeService,
    { list: async () => [] } as unknown as CampaignRepository,
    { enabled: mediaEnabled } as unknown as MediaStore,
  );
}

const FULL: KnowledgeStub = { prices: [{}], dealers: [{}], groups: [{}] };

describe('ReadinessService', () => {
  it('thang chua co bang gia active -> chan go-live, neu ro missing_current_price_period', async () => {
    // Day dung la trang thai that hom nay: seed la ky 2026-07 con thang hien tai la 2026-08,
    // fail-closed cua P2.1 tra ve rong nen KHONG don nao tu xac nhan duoc.
    const result = await build({ ...FULL, prices: [] }).evaluate();

    expect(result.goLiveReady).toBe(false);
    expect(result.reasons).toContain('missing_current_price_period');
    expect(result.checks.find((c) => c.key === 'price.current_period')?.status).toBe('missing');
  });

  it('chua co golden dataset -> khong go-live va neu dung ly do', async () => {
    const result = await build(FULL).evaluate();

    expect(result.goLiveReady).toBe(false);
    expect(result.reasons).toContain('missing_golden_dataset');
  });

  it('parser/media/kenh cua demo deu bi danh missing chu khong tu cho qua', async () => {
    vi.stubEnv('PARSER_MODE', 'mock');
    vi.stubEnv('MEDIA_STORE', 'none');
    vi.stubEnv('CHANNEL_MODE', 'mock');
    try {
      const result = await build(FULL).evaluate();
      const status = (key: string): string | undefined =>
        result.checks.find((c) => c.key === key)?.status;

      expect(status('parser.production')).toBe('missing');
      expect(status('media.production')).toBe('missing');
      expect(status('channel.production')).toBe('missing');
      expect(result.goLiveReady).toBe(false);
      // Code-complete KHAC go-live: thieu du lieu khach khong lam hong phan code.
      expect(result.codeComplete).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('bon nghiep vu BLOCKED hien ro tren checklist nhung khong chan code-complete', async () => {
    const result = await build(FULL).evaluate();
    const blocked = result.checks.filter((c) => c.status === 'blocked');

    expect(blocked.map((c) => c.key)).toEqual([
      'business.vat',
      'business.cod_ship',
      'business.debt_7_days',
      'business.promotions',
    ]);
    expect(blocked.every((c) => c.blocking === false)).toBe(true);
    expect(blocked.every((c) => c.detail.length > 0)).toBe(true);
  });
});
