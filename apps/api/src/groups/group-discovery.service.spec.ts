import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../config/prisma.service.js';
import { GROUP_SEEN_THROTTLE_MS, GroupDiscoveryService } from './group-discovery.service.js';

interface UpsertArgs {
  where: unknown;
  create: Record<string, unknown>;
  update: Record<string, unknown>;
}

function okUpsert() {
  return vi.fn(async (_args: UpsertArgs) => ({}));
}

function fakePrisma(upsert = okUpsert()) {
  return { prisma: { group: { upsert } } as unknown as PrismaService, upsert };
}

describe('GroupDiscoveryService', () => {
  beforeEach(() => {
    process.env.PERSISTENCE = 'prisma';
  });

  it('creates a pending auto_suggest row for a group seen for the first time', async () => {
    const { prisma, upsert } = fakePrisma();
    const service = new GroupDiscoveryService(prisma);

    await service.observe('chat-1', new Date('2026-08-04T09:15:00.000Z'));

    expect(upsert).toHaveBeenCalledTimes(1);
    const args = upsert.mock.calls[0]![0];
    expect(args.where).toEqual({ platform_chatId: { platform: 'zalo', chatId: 'chat-1' } });
    expect(args.create).toMatchObject({
      platform: 'zalo',
      chatId: 'chat-1',
      status: 'pending',
      source: 'auto_suggest',
    });
  });

  it('only refreshes lastSeenAt on an existing row so a mapped group is never downgraded', async () => {
    const { prisma, upsert } = fakePrisma();
    const service = new GroupDiscoveryService(prisma);

    await service.observe('chat-1', new Date('2026-08-04T09:15:00.000Z'));

    const args = upsert.mock.calls[0]![0];
    // Bat bien: nhom da 'mapped' + da co dealerId KHONG duoc reset ve pending khi co tin moi.
    expect(Object.keys(args.update)).toEqual(['lastSeenAt']);
  });

  it('skips a second write inside the throttle window', async () => {
    const { prisma, upsert } = fakePrisma();
    const service = new GroupDiscoveryService(prisma);
    const first = new Date('2026-08-04T09:15:00.000Z');

    await service.observe('chat-1', first);
    await service.observe('chat-1', new Date(first.getTime() + GROUP_SEEN_THROTTLE_MS - 1));

    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('writes again once the throttle window has elapsed', async () => {
    const { prisma, upsert } = fakePrisma();
    const service = new GroupDiscoveryService(prisma);
    const first = new Date('2026-08-04T09:15:00.000Z');

    await service.observe('chat-1', first);
    await service.observe('chat-1', new Date(first.getTime() + GROUP_SEEN_THROTTLE_MS));

    expect(upsert).toHaveBeenCalledTimes(2);
  });

  it('throttles per group, not globally', async () => {
    const { prisma, upsert } = fakePrisma();
    const service = new GroupDiscoveryService(prisma);
    const now = new Date('2026-08-04T09:15:00.000Z');

    await service.observe('chat-1', now);
    await service.observe('chat-2', now);

    expect(upsert).toHaveBeenCalledTimes(2);
  });

  it('swallows database errors so a metadata write never blocks message handling', async () => {
    const upsert = vi.fn(async (_args: UpsertArgs): Promise<object> => {
      throw new Error('DB sap');
    });
    const { prisma } = fakePrisma(upsert);
    const service = new GroupDiscoveryService(prisma);

    await expect(service.observe('chat-1', new Date())).resolves.toBeUndefined();
  });

  it('retries on the next message when the write failed instead of staying throttled', async () => {
    const upsert = okUpsert();
    upsert.mockRejectedValueOnce(new Error('DB sap'));
    const { prisma } = fakePrisma(upsert);
    const service = new GroupDiscoveryService(prisma);
    const first = new Date('2026-08-04T09:15:00.000Z');

    await service.observe('chat-1', first);
    await service.observe('chat-1', new Date(first.getTime() + 1000));

    expect(upsert).toHaveBeenCalledTimes(2);
  });

  it('does not touch the database in memory mode', async () => {
    process.env.PERSISTENCE = 'memory';
    const { prisma, upsert } = fakePrisma();
    const service = new GroupDiscoveryService(prisma);

    await service.observe('chat-1', new Date());

    expect(upsert).not.toHaveBeenCalled();
  });
});
