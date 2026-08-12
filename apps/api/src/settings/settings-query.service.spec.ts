import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BotIdentityService } from '../channels/bot-identity.service.js';
import type { ZaloUserClient } from '../channels/zalo-user.client.js';
import type { PrismaService } from '../config/prisma.service.js';
import type { KnowledgeService } from '../knowledge/knowledge.service.js';
import type { RuleConfigService } from '../rule-config/rule-config.service.js';
import type { RuntimeSettingsService } from '../runtime/runtime-settings.service.js';
import { SettingsQueryService } from './settings-query.service.js';

describe('SettingsQueryService', () => {
  beforeEach(() => {
    process.env.PERSISTENCE = 'prisma';
  });

  it('keeps stored group/member configuration visible while zca is logged out', async () => {
    const zca = {
      status: () => ({ state: 'logged_out', allowedGroupIds: [] }),
      listGroups: vi.fn(async () => []),
    } as unknown as ZaloUserClient;
    const botIdentity = {
      status: () => ({ state: 'ready', id: 'bot-1' }),
    } as unknown as BotIdentityService;
    const knowledge = {
      products: () => [],
      dealers: () => [],
      groupViews: () => [],
    } as unknown as KnowledgeService;
    const runtime = { autoSend: () => 'off' } as unknown as RuntimeSettingsService;
    const rules = { getActive: vi.fn(async () => null) } as unknown as RuleConfigService;
    const prisma = {
      group: {
        findMany: vi.fn(async () => [
          {
            id: 'group-db-1',
            chatId: 'zca-chat-1',
            name: 'Nhom pilot',
            dealerId: 'dealer-1',
            dealer: { name: 'Dai ly 1' },
            participants: [
              { active: true, syncedAt: new Date('2026-08-03T01:00:00.000Z') },
              { active: false, syncedAt: new Date('2026-08-03T02:00:00.000Z') },
            ],
          },
        ]),
      },
    } as unknown as PrismaService;

    const summary = await new SettingsQueryService(
      zca,
      botIdentity,
      knowledge,
      runtime,
      rules,
      prisma,
    ).summary();

    expect(summary.groups).toEqual([
      expect.objectContaining({
        groupId: 'group-db-1',
        zcaChatId: 'zca-chat-1',
        name: 'Nhom pilot',
        dealerName: 'Dai ly 1',
        activeParticipants: 1,
        inactiveParticipants: 1,
      }),
    ]);
    expect(summary.orderAutomation).toEqual({ enabled: true, maxAutoConfirmQuantity: 50 });
  });

  it('serves every memory source-truth resource and maps live zca groups to dealers', async () => {
    process.env.PERSISTENCE = 'memory';
    const zca = {
      status: () => ({ state: 'ready', allowedGroupIds: ['zca-chat-1'] }),
      listGroups: vi.fn(async () => [
        { id: 'zca-chat-1', name: 'Nhom live', allowed: true, memberCount: 2 },
      ]),
    } as unknown as ZaloUserClient;
    const knowledge = {
      products: () => [{ sku: 'FELIX' }],
      dealers: () => [{ id: 'dealer-1' }],
      groups: () => [{ chatId: 'zca-chat-1' }],
      prices: () => [{ sku: 'FELIX', wholesale: 1_000_000 }],
      priceOverrides: () => [{ dealerId: 'dealer-1', sku: 'FELIX', price: 900_000 }],
      glossary: () => [{ term: 'HN', meaning: 'Ha Noi' }],
      groupViews: () => [{ chatId: 'zca-chat-1', dealerName: 'Dai ly pilot' }],
    } as unknown as KnowledgeService;
    const service = new SettingsQueryService(
      zca,
      { status: () => ({ state: 'disabled' }) } as unknown as BotIdentityService,
      knowledge,
      { autoSend: () => 'off' } as unknown as RuntimeSettingsService,
      { getActive: vi.fn(async () => null) } as unknown as RuleConfigService,
      {} as PrismaService,
    );

    for (const resource of ['dealers', 'groups', 'products', 'prices', 'overrides', 'glossary'] as const) {
      await expect(service.sourceTruth(resource)).resolves.toHaveLength(1);
    }
    await expect(service.summary()).resolves.toMatchObject({
      orderAutomation: { enabled: true, maxAutoConfirmQuantity: 50 },
      groups: [{ zcaChatId: 'zca-chat-1', dealerName: 'Dai ly pilot' }],
      sourceTruth: { status: 'fallback', productCount: 1, dealerCount: 1 },
    });
  });

  it('routes every Prisma source-truth resource to its canonical table', async () => {
    process.env.PERSISTENCE = 'prisma';
    const table = () => ({ findMany: vi.fn(async () => []) });
    const prisma = {
      dealer: table(),
      group: table(),
      product: table(),
      price: table(),
      dealerPriceOverride: table(),
      glossaryEntry: table(),
    } as unknown as PrismaService;
    const service = new SettingsQueryService(
      { status: () => ({ state: 'logged_out', allowedGroupIds: [] }) } as unknown as ZaloUserClient,
      {} as BotIdentityService,
      {} as KnowledgeService,
      {} as RuntimeSettingsService,
      {} as RuleConfigService,
      prisma,
    );

    for (const resource of ['dealers', 'groups', 'products', 'prices', 'overrides', 'glossary'] as const) {
      await expect(service.sourceTruth(resource)).resolves.toEqual([]);
    }
    expect(prisma.dealer.findMany).toHaveBeenCalledWith({ orderBy: { name: 'asc' } });
    expect(prisma.dealerPriceOverride.findMany).toHaveBeenCalled();
  });
});
