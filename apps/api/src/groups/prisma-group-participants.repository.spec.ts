import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../config/prisma.service.js';
import {
  GroupParticipantGroupNotFoundError,
  PrismaGroupParticipantsRepository,
} from './prisma-group-participants.repository.js';

const row = {
  id: 'participant-1',
  groupId: 'group-db-1',
  externalUserId: 'user-1',
  displayName: 'Khach A',
  zaloName: null,
  avatarUrl: null,
  customerRank: 'unknown' as const,
  operationalRole: 'unknown' as const,
  handlingMode: 'inherit_group' as const,
  active: true,
  source: 'zca_sync' as const,
  lastSeenAt: null,
  syncedAt: new Date('2026-08-03T03:00:00.000Z'),
  createdAt: new Date('2026-08-03T03:00:00.000Z'),
  updatedAt: new Date('2026-08-03T03:00:00.000Z'),
};

describe('PrismaGroupParticipantsRepository', () => {
  it('resolve zca chatId sang Group.id, upsert va chi deactivate khi snapshot complete', async () => {
    const tx = {
      group: {
        findUnique: vi.fn(async () => ({ id: 'group-db-1' })),
      },
      groupParticipant: {
        upsert: vi.fn(async () => undefined),
        updateMany: vi.fn(async () => ({ count: 2 })),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (run: (client: typeof tx) => unknown) => run(tx)),
    } as unknown as PrismaService;
    const repo = new PrismaGroupParticipantsRepository(prisma);

    const result = await repo.synchronize({
      groupId: 'zca-chat-1',
      members: [{ externalUserId: 'u1', displayName: 'Khach A' }],
      complete: true,
      syncedAt: '2026-08-03T03:00:00.000Z',
    });

    expect(tx.group.findUnique).toHaveBeenCalledWith({
      where: { platform_chatId: { platform: 'zalo', chatId: 'zca-chat-1' } },
      select: { id: true },
    });
    expect(tx.groupParticipant.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { groupId_externalUserId: { groupId: 'group-db-1', externalUserId: 'u1' } },
      }),
    );
    expect(tx.groupParticipant.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ groupId: 'group-db-1' }) }),
    );
    expect(result).toEqual({ upsertedCount: 1, deactivatedCount: 2 });
  });

  it('snapshot partial khong deactivate thanh vien vang mat', async () => {
    const tx = {
      group: { findUnique: vi.fn(async () => ({ id: 'group-db-1' })) },
      groupParticipant: {
        upsert: vi.fn(async () => undefined),
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (run: (client: typeof tx) => unknown) => run(tx)),
    } as unknown as PrismaService;
    const repo = new PrismaGroupParticipantsRepository(prisma);

    await repo.synchronize({
      groupId: 'zca-chat-1',
      members: [],
      complete: false,
      syncedAt: '2026-08-03T03:00:00.000Z',
    });

    expect(tx.groupParticipant.updateMany).not.toHaveBeenCalled();
  });

  it('fails sync before writes when the zca group is not mapped', async () => {
    const tx = {
      group: { findUnique: vi.fn(async () => null) },
      groupParticipant: { upsert: vi.fn(), updateMany: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (run: (client: typeof tx) => unknown) => run(tx)),
    } as unknown as PrismaService;

    await expect(
      new PrismaGroupParticipantsRepository(prisma).synchronize({
        groupId: 'unmapped',
        members: [],
        complete: true,
        syncedAt: '2026-08-03T03:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(GroupParticipantGroupNotFoundError);
    expect(tx.groupParticipant.upsert).not.toHaveBeenCalled();
  });

  it('lists with strict filters and maps Prisma rows to detached views', async () => {
    const findMany = vi.fn(async () => [row]);
    const count = vi.fn(async () => 1);
    const prisma = { groupParticipant: { findMany, count } } as unknown as PrismaService;

    const result = await new PrismaGroupParticipantsRepository(prisma).list('group-db-1', {
      customerRank: 'unknown',
      operationalRole: 'unknown',
      handlingMode: 'inherit_group',
      active: true,
      search: 'Khach',
    });

    expect(result).toMatchObject({ total: 1, participants: [{ id: 'participant-1' }] });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ groupId: 'group-db-1', active: true }),
      }),
    );
  });

  it('updates one participant and resolves an active sender through group chatId', async () => {
    const prisma = {
      groupParticipant: {
        findFirst: vi.fn().mockResolvedValueOnce({ id: row.id }).mockResolvedValueOnce(row),
        update: vi.fn(async () => ({ ...row, handlingMode: 'ignore', source: 'manual' })),
      },
    } as unknown as PrismaService;
    const repo = new PrismaGroupParticipantsRepository(prisma);

    await expect(
      repo.update('group-db-1', row.id, { handlingMode: 'ignore' }, '2026-08-03T04:00:00.000Z'),
    ).resolves.toMatchObject({ handlingMode: 'ignore', source: 'manual' });
    await expect(repo.findBySender('zca-chat-1', 'user-1')).resolves.toMatchObject({ id: row.id });
  });

  it('returns null for missing single/bulk updates and atomically updates a valid bulk selection', async () => {
    const transaction = {
      groupParticipant: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([{ id: row.id }])
          .mockResolvedValueOnce([{ id: row.id }, { id: 'participant-2' }])
          .mockResolvedValueOnce([row, { ...row, id: 'participant-2', externalUserId: 'user-2' }]),
        updateMany: vi.fn(async () => ({ count: 2 })),
      },
    };
    const prisma = {
      groupParticipant: { findFirst: vi.fn(async () => null) },
      $transaction: vi.fn(async (run: (client: typeof transaction) => unknown) => run(transaction)),
    } as unknown as PrismaService;
    const repo = new PrismaGroupParticipantsRepository(prisma);

    await expect(
      repo.update('group-db-1', 'missing', { handlingMode: 'ignore' }, new Date().toISOString()),
    ).resolves.toBeNull();
    await expect(
      repo.updateMany(
        'group-db-1',
        ['participant-1', 'participant-2'],
        { handlingMode: 'manual_review' },
        '2026-08-03T04:00:00.000Z',
      ),
    ).resolves.toBeNull();
    await expect(
      repo.updateMany(
        'group-db-1',
        ['participant-1', 'participant-2'],
        { handlingMode: 'manual_review' },
        '2026-08-03T04:00:00.000Z',
      ),
    ).resolves.toHaveLength(2);
    expect(transaction.groupParticipant.updateMany).toHaveBeenCalledTimes(1);
  });
});
