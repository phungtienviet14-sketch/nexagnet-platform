import { describe, expect, it, vi } from 'vitest';
import type { CampaignRepository } from '../campaigns/campaign.repository.js';
import type { KnowledgeService } from '../knowledge/knowledge.service.js';
import type { MediaStore } from '../media/media-store.js';
import type { BotIdentityService } from '../channels/bot-identity.service.js';
import type { ZaloConnectionState, ZaloUserClient } from '../channels/zalo-user.client.js';
import type { BotPoller } from '../ingest/bot-poller.js';
import { ReadinessService } from './readiness.service.js';

interface KnowledgeStub {
  prices: unknown[];
  dealers: unknown[];
  groups: unknown[];
  pricePeriod?: { status: 'draft' | 'active' | 'archived'; source?: string | null } | null;
}

interface ChannelStub {
  zcaState?: ZaloConnectionState;
  botIdentityState?: 'disabled' | 'unknown' | 'ready' | 'error';
  botPollerState?: 'disabled' | 'running' | 'degraded';
  botLastSuccessfulPollAt?: string | null;
}

function build(
  knowledge: KnowledgeStub,
  mediaHealthy = false,
  channel: ChannelStub = {},
): ReadinessService {
  return new ReadinessService(
    {
      prices: () => knowledge.prices,
      dealers: () => knowledge.dealers,
      groups: () => knowledge.groups,
      pricePeriod: () => knowledge.pricePeriod ?? { status: 'active', source: 'operator' },
    } as unknown as KnowledgeService,
    { list: async () => [] } as unknown as CampaignRepository,
    // Kho anh tra ket qua CHAM THAT (`check`), khong phai co tinh `enabled`: bat MEDIA_STORE ma
    // bucket sai ten/khoa het han thi cong nay phai do.
    {
      check: async () => ({ healthy: mediaHealthy, detail: 'stub' }),
    } as unknown as MediaStore,
    {
      status: () => ({ state: channel.zcaState ?? 'disabled' }),
    } as unknown as ZaloUserClient,
    {
      status: () => ({ state: channel.botIdentityState ?? 'disabled' }),
    } as unknown as BotIdentityService,
    {
      status: () => ({
        state: channel.botPollerState ?? 'disabled',
        lastSuccessfulPollAt: channel.botLastSuccessfulPollAt ?? null,
      }),
    } as unknown as BotPoller,
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

  it('active test-only price period does not satisfy production current price readiness', async () => {
    const result = await build({
      ...FULL,
      prices: [{ sku: 'A' }],
      pricePeriod: { status: 'active', source: 'test_only' },
    }).evaluate();

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

  it.each(['connecting', 'qr_ready', 'error', 'logged_out'] as const)(
    'CHANNEL_MODE=zca voi runtime %s khong duoc bao ready',
    async (state) => {
      vi.stubEnv('CHANNEL_MODE', 'zca');
      try {
        const result = await build(FULL, false, { zcaState: state }).evaluate();
        const check = result.checks.find((item) => item.key === 'channel.production');

        expect(check).toMatchObject({ status: 'missing' });
        expect(check?.detail).toContain(`zca:${state}`);
      } finally {
        vi.unstubAllEnvs();
      }
    },
  );

  it('CHANNEL_MODE=zca chi ready khi listener runtime ready', async () => {
    vi.stubEnv('CHANNEL_MODE', 'zca');
    try {
      const result = await build(FULL, false, { zcaState: 'ready' }).evaluate();
      expect(result.checks.find((item) => item.key === 'channel.production')).toMatchObject({
        status: 'ready',
        detail: 'zca:ready',
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('bot va hybrid fail closed neu mot runtime transport chua san sang', async () => {
    vi.stubEnv('CHANNEL_MODE', 'bot');
    vi.stubEnv('ZALO_BOT_TOKEN', 'test-token');
    try {
      const bot = await build(FULL, false, {
        botIdentityState: 'ready',
        botPollerState: 'degraded',
      }).evaluate();
      expect(bot.checks.find((item) => item.key === 'channel.production')).toMatchObject({
        status: 'missing',
      });
      expect(bot.checks.find((item) => item.key === 'channel.production')?.detail).toContain(
        'poller_degraded',
      );

      vi.stubEnv('CHANNEL_MODE', 'hybrid');
      const hybrid = await build(FULL, false, {
        zcaState: 'ready',
        botIdentityState: 'error',
        botPollerState: 'running',
      }).evaluate();
      expect(hybrid.checks.find((item) => item.key === 'channel.production')).toMatchObject({
        status: 'missing',
      });
      expect(hybrid.checks.find((item) => item.key === 'channel.production')?.detail).toContain(
        'bot_error',
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('bot running chi ready sau khi da co poll heartbeat thanh cong', async () => {
    vi.stubEnv('CHANNEL_MODE', 'bot');
    vi.stubEnv('ZALO_BOT_TOKEN', 'test-token');
    try {
      const starting = await build(FULL, false, {
        botIdentityState: 'ready',
        botPollerState: 'running',
      }).evaluate();
      expect(starting.checks.find((item) => item.key === 'channel.production')).toMatchObject({
        status: 'missing',
      });
      expect(starting.checks.find((item) => item.key === 'channel.production')?.detail).toContain(
        'poller_running_unproven',
      );

      const proven = await build(FULL, false, {
        botIdentityState: 'ready',
        botPollerState: 'running',
        botLastSuccessfulPollAt: '2026-08-13T00:00:00.000Z',
      }).evaluate();
      expect(proven.checks.find((item) => item.key === 'channel.production')).toMatchObject({
        status: 'ready',
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
