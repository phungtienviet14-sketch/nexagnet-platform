import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../config/prisma.service.js';
import { GroupParticipantIdentityConflictError } from './participant-identity-merge.js';
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

  it('keeps the classified participant when a new account reports a different routing UID', async () => {
    const update = vi.fn(async () => undefined);
    const create = vi.fn(async () => undefined);
    const tx = {
      group: { findUnique: vi.fn(async () => ({ id: 'group-db-1' })) },
      groupParticipant: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({
            id: 'participant-classified',
            globalId: 'stable-user-1',
          })
          .mockResolvedValueOnce(null),
        update,
        create,
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (run: (client: typeof tx) => unknown) => run(tx)),
    } as unknown as PrismaService;

    await new PrismaGroupParticipantsRepository(prisma).synchronize({
      groupId: 'chat-from-account-2',
      members: [
        {
          externalUserId: 'uid-from-account-2',
          globalId: 'stable-user-1',
          displayName: 'Khach A',
        },
      ],
      complete: true,
      syncedAt: '2026-08-14T01:00:00.000Z',
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'participant-classified' },
        data: expect.objectContaining({ externalUserId: 'uid-from-account-2' }),
      }),
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('removes only an unclassified message-stream route row before rebinding the stable participant', async () => {
    const update = vi.fn(async () => undefined);
    const deleteParticipant = vi.fn(async () => undefined);
    const tx = {
      group: { findUnique: vi.fn(async () => ({ id: 'group-db-1' })) },
      groupParticipant: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ id: 'participant-stable', globalId: 'stable-user-1' })
          .mockResolvedValueOnce({
            id: 'participant-route-temp',
            globalId: null,
            source: 'message_stream',
            customerRank: 'unknown',
            operationalRole: 'unknown',
            handlingMode: 'inherit_group',
          }),
        delete: deleteParticipant,
        update,
        create: vi.fn(),
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (run: (client: typeof tx) => unknown) => run(tx)),
    } as unknown as PrismaService;

    await new PrismaGroupParticipantsRepository(prisma).synchronize({
      groupId: 'chat-from-account-2',
      members: [
        {
          externalUserId: 'uid-from-account-2',
          globalId: 'stable-user-1',
          displayName: 'Khach A',
        },
      ],
      complete: true,
      syncedAt: '2026-08-14T01:00:00.000Z',
    });

    expect(deleteParticipant).toHaveBeenCalledWith({ where: { id: 'participant-route-temp' } });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'participant-stable' } }),
    );
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

/**
 * Duong da lam hong dong bo tren pilot (18/08/2026): Sale phan loai dung nhung hang do luong tin
 * sinh ra — chinh la viec tab "Thanh vien" ton tai de lam — roi bam Dong bo va nhan 502
 * "Xung dot globalId va routing UID". Cang dung dung tinh nang cang chac chan hong.
 */
describe('gop danh tinh khi mot nguoi bi tach thanh hai hang', () => {
  const makeTx = (
    stableMatch: Record<string, unknown> | null,
    routeMatch: Record<string, unknown> | null,
  ) => ({
    group: { findUnique: vi.fn(async () => ({ id: 'group-db-1' })) },
    groupParticipant: {
      findUnique: vi.fn().mockResolvedValueOnce(stableMatch).mockResolvedValueOnce(routeMatch),
      delete: vi.fn(async () => undefined),
      update: vi.fn(async () => undefined),
      create: vi.fn(async () => undefined),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
  });
  const asPrisma = (tx: ReturnType<typeof makeTx>) =>
    ({
      $transaction: vi.fn(async (run: (client: typeof tx) => unknown) => run(tx)),
    }) as unknown as PrismaService;

  const member = {
    externalUserId: 'uid-tu-luong-tin',
    globalId: 'stable-user-1',
    displayName: 'Chi Phuong',
  };
  const sync = (prisma: PrismaService) =>
    new PrismaGroupParticipantsRepository(prisma).synchronize({
      groupId: 'chat-1',
      members: [member],
      complete: true,
      syncedAt: '2026-08-18T01:00:00.000Z',
    });

  it('KHONG con nem loi khi hang route da duoc Sale phan loai', async () => {
    const tx = makeTx(
      {
        id: 'participant-stable',
        globalId: 'stable-user-1',
        source: 'zca_sync',
        customerRank: 'unknown',
        operationalRole: 'unknown',
        handlingMode: 'inherit_group',
      },
      {
        id: 'participant-da-phan-loai',
        globalId: null,
        source: 'manual',
        customerRank: 'dai_ly',
        operationalRole: 'khach_hang',
        handlingMode: 'manual_review',
      },
    );

    await expect(sync(asPrisma(tx))).resolves.toMatchObject({ upsertedCount: 1 });

    // Phan loai cua Sale phai chay sang hang song, khong duoc bien mat.
    expect(tx.groupParticipant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'participant-stable' },
        data: expect.objectContaining({
          externalUserId: 'uid-tu-luong-tin',
          customerRank: 'dai_ly',
          operationalRole: 'khach_hang',
          handlingMode: 'manual_review',
          source: 'manual',
        }),
      }),
    );
    expect(tx.groupParticipant.delete).toHaveBeenCalledWith({
      where: { id: 'participant-da-phan-loai' },
    });
  });

  it('phan loai san co tren hang song khong bi hang kia de len', async () => {
    const tx = makeTx(
      {
        id: 'participant-stable',
        globalId: 'stable-user-1',
        source: 'manual',
        customerRank: 'dai_ly',
        operationalRole: 'khach_hang',
        handlingMode: 'manual_review',
      },
      {
        id: 'participant-route',
        globalId: null,
        source: 'message_stream',
        customerRank: 'unknown',
        operationalRole: 'unknown',
        handlingMode: 'inherit_group',
      },
    );

    await sync(asPrisma(tx));

    expect(tx.groupParticipant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customerRank: 'dai_ly',
          operationalRole: 'khach_hang',
          handlingMode: 'manual_review',
          source: 'manual',
        }),
      }),
    );
  });

  it('van nem — co ten thanh vien — khi routing UID thuoc ve mot globalId KHAC', async () => {
    const tx = makeTx(null, {
      id: 'participant-nguoi-khac',
      globalId: 'stable-user-2',
      source: 'zca_sync',
      customerRank: 'unknown',
      operationalRole: 'unknown',
      handlingMode: 'inherit_group',
    });

    await expect(sync(asPrisma(tx))).rejects.toThrow(GroupParticipantIdentityConflictError);
    await expect(sync(asPrisma(makeTx(null, {
      id: 'participant-nguoi-khac',
      globalId: 'stable-user-2',
      source: 'zca_sync',
      customerRank: 'unknown',
      operationalRole: 'unknown',
      handlingMode: 'inherit_group',
    })))).rejects.toThrow(/Chi Phuong[\s\S]*participant-nguoi-khac|participant-nguoi-khac[\s\S]*Chi Phuong/);
  });

  it('khong gop nham khi chi co mot hang — duong binh thuong van nguyen', async () => {
    const tx = makeTx(null, null);
    await sync(asPrisma(tx));
    expect(tx.groupParticipant.delete).not.toHaveBeenCalled();
    expect(tx.groupParticipant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ groupId: 'group-db-1', globalId: 'stable-user-1' }),
      }),
    );
  });
});
