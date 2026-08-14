import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../config/prisma.service.js';
import type { KnowledgeService } from '../knowledge/knowledge.service.js';
import { GroupIdentityService } from './group-identity.service.js';

function build(rows: Array<Record<string, unknown>>) {
  const findMany = vi.fn(async () => rows);
  const update = vi.fn(async (args: { data: Record<string, unknown> }) => ({
    id: 'group-db-1',
    ...args.data,
  }));
  const create = vi.fn(async (args: { data: Record<string, unknown> }) => ({
    id: 'group-db-new',
    ...args.data,
  }));
  const deleteGroup = vi.fn(async () => ({}));
  const updateMany = vi.fn(async () => ({ count: 0 }));
  const campaignTargetFindMany = vi.fn<() => Promise<Array<{ campaignId: string }>>>(
    async () => [],
  );
  const campaignTargetCount = vi.fn(async () => 0);
  const transactionClient = {
    group: { findMany, update, create, delete: deleteGroup },
    groupParticipant: { updateMany },
    message: { updateMany },
    order: { updateMany },
    campaignTarget: {
      updateMany,
      findMany: campaignTargetFindMany,
      count: campaignTargetCount,
    },
    groupMappingHistory: { updateMany },
  };
  const prisma = {
    group: { findMany, update, create, delete: deleteGroup },
    $transaction: vi.fn(async (operation: (client: unknown) => unknown) =>
      operation(transactionClient),
    ),
  } as unknown as PrismaService;
  const reload = vi.fn(async () => undefined);
  const knowledge = { reload } as unknown as KnowledgeService;
  return {
    service: new GroupIdentityService(prisma, knowledge),
    findMany,
    update,
    create,
    deleteGroup,
    updateMany,
    campaignTargetFindMany,
    campaignTargetCount,
    reload,
  };
}

describe('GroupIdentityService', () => {
  beforeEach(() => {
    process.env.PERSISTENCE = 'prisma';
  });

  it('rebinds a legacy mapped group only after an explicit operator-confirmed link', async () => {
    const { service, update, create, reload } = build([
      {
        id: 'group-db-1',
        platform: 'zalo',
        chatId: 'chat-from-account-1',
        globalId: null,
        name: 'Nhóm đại lý An',
        status: 'mapped',
        dealerId: 'dealer-1',
      },
    ]);

    await service.reconcileAllowedGroups(
      [
        {
          id: 'chat-from-account-2',
          globalId: 'stable-group-1',
          name: 'Nhóm đại lý An',
          memberCount: 12,
          allowed: false,
        },
      ],
      ['chat-from-account-2'],
      [{ currentChatId: 'chat-from-account-2', existingGroupId: 'group-db-1' }],
    );

    expect(update).toHaveBeenCalledWith({
      where: { id: 'group-db-1' },
      data: {
        chatId: 'chat-from-account-2',
        globalId: 'stable-group-1',
        name: 'Nhóm đại lý An',
      },
    });
    expect(create).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('matches an already migrated group by globalId even when both account chatIds differ', async () => {
    const { service, update, create } = build([
      {
        id: 'group-db-1',
        platform: 'zalo',
        chatId: 'chat-from-account-1',
        globalId: 'stable-group-1',
        name: 'Tên cũ',
        status: 'mapped',
        dealerId: 'dealer-1',
      },
    ]);

    await service.reconcileAllowedGroups(
      [
        {
          id: 'chat-from-account-2',
          globalId: 'stable-group-1',
          name: 'Tên mới',
          memberCount: 12,
          allowed: false,
        },
      ],
      ['chat-from-account-2'],
    );

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'group-db-1' },
        data: expect.objectContaining({ chatId: 'chat-from-account-2' }),
      }),
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('does not guess by name when globalId and participant evidence are absent', async () => {
    const { service, update, create } = build([
      {
        id: 'group-db-1',
        platform: 'zalo',
        chatId: 'old-1',
        globalId: null,
        name: 'Nhóm bán hàng',
        status: 'mapped',
        dealerId: 'dealer-1',
      },
      {
        id: 'group-db-2',
        platform: 'zalo',
        chatId: 'old-2',
        globalId: null,
        name: 'Nhóm bán hàng',
        status: 'mapped',
        dealerId: 'dealer-2',
      },
    ]);

    await service.reconcileAllowedGroups(
      [
        {
          id: 'chat-new',
          globalId: 'stable-new',
          name: 'Nhóm bán hàng',
          memberCount: 5,
          allowed: false,
        },
      ],
      ['chat-new'],
    );

    expect(update).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        platform: 'zalo',
        chatId: 'chat-new',
        globalId: 'stable-new',
        status: 'pending',
      }),
    });
  });

  it('does not touch Postgres in memory mode', async () => {
    process.env.PERSISTENCE = 'memory';
    const { service, findMany, update, create, reload } = build([]);

    await service.reconcileAllowedGroups([], []);

    expect(findMany).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('merges an already-created duplicate row into the confirmed legacy group before rebinding', async () => {
    const { service, deleteGroup, updateMany } = build([
      {
        id: 'group-db-legacy',
        platform: 'zalo',
        chatId: 'chat-old',
        globalId: null,
        name: 'Nhóm đại lý An',
        status: 'mapped',
        dealerId: 'dealer-1',
      },
      {
        id: 'group-db-duplicate',
        platform: 'zalo',
        chatId: 'chat-new',
        globalId: null,
        name: 'Nhóm đại lý An',
        status: 'pending',
        dealerId: null,
      },
    ]);

    await service.reconcileAllowedGroups(
      [
        {
          id: 'chat-new',
          globalId: 'stable-group-1',
          name: 'Nhóm đại lý An',
          memberCount: 12,
          allowed: false,
        },
      ],
      ['chat-new'],
      [{ currentChatId: 'chat-new', existingGroupId: 'group-db-legacy' }],
    );

    expect(updateMany).toHaveBeenCalledWith({
      where: { groupId: 'group-db-duplicate' },
      data: { groupId: 'group-db-legacy' },
    });
    expect(deleteGroup).toHaveBeenCalledWith({ where: { id: 'group-db-duplicate' } });
  });

  it('offers a unique same-name legacy row as a manual link candidate without linking it', async () => {
    const { service, update } = build([
      {
        id: 'group-db-1',
        platform: 'zalo',
        chatId: 'chat-from-account-1',
        globalId: null,
        name: 'Nhóm đại lý An',
        status: 'mapped',
        dealerId: 'dealer-1',
        dealer: { name: 'Đại lý An' },
      },
    ]);

    const groups = await service.withLegacyCandidates([
      {
        id: 'chat-from-account-2',
        globalId: 'stable-group-1',
        name: 'Nhóm đại lý An',
        memberCount: 12,
        allowed: false,
      },
    ]);

    expect(groups[0]).toMatchObject({
      legacyCandidate: {
        groupId: 'group-db-1',
        chatId: 'chat-from-account-1',
        name: 'Nhóm đại lý An',
        dealerName: 'Đại lý An',
      },
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('still offers the mapped legacy row when the current chatId already has a pending duplicate', async () => {
    const { service } = build([
      {
        id: 'group-db-legacy',
        platform: 'zalo',
        chatId: 'chat-old',
        globalId: null,
        name: 'Nhóm đại lý An',
        status: 'mapped',
        dealerId: 'dealer-1',
        dealer: { name: 'Đại lý An' },
      },
      {
        id: 'group-db-duplicate',
        platform: 'zalo',
        chatId: 'chat-new',
        globalId: null,
        name: 'Nhóm đại lý An',
        status: 'pending',
        dealerId: null,
        dealer: null,
      },
    ]);

    const groups = await service.withLegacyCandidates([
      {
        id: 'chat-new',
        globalId: 'stable-group-1',
        name: 'Nhóm đại lý An',
        memberCount: 12,
        allowed: false,
      },
    ]);

    expect(groups[0]?.legacyCandidate).toMatchObject({
      groupId: 'group-db-legacy',
      chatId: 'chat-old',
    });
  });

  it('rejects duplicate globalIds in one live snapshot before changing data', async () => {
    const { service, update, create } = build([]);

    await expect(
      service.reconcileAllowedGroups(
        [
          { id: 'chat-1', globalId: 'same-global', name: 'Nhóm 1', memberCount: 1, allowed: false },
          { id: 'chat-2', globalId: 'same-global', name: 'Nhóm 2', memberCount: 1, allowed: false },
        ],
        ['chat-1', 'chat-2'],
      ),
    ).rejects.toThrow('globalId');
    expect(update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('retargets unsent campaign targets to the current account chatId during rebind', async () => {
    const { service, updateMany } = build([
      {
        id: 'group-db-1',
        platform: 'zalo',
        chatId: 'chat-old',
        globalId: 'stable-group-1',
        name: 'Nhóm đại lý An',
        status: 'mapped',
        dealerId: 'dealer-1',
      },
    ]);

    await service.reconcileAllowedGroups(
      [
        {
          id: 'chat-new',
          globalId: 'stable-group-1',
          name: 'Nhóm đại lý An',
          memberCount: 12,
          allowed: false,
        },
      ],
      ['chat-new'],
    );

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { groupId: 'group-db-1', chatId: 'chat-new' },
        where: expect.objectContaining({ AND: expect.any(Array) }),
      }),
    );
  });

  it('fails closed while a campaign delivery for the group is actively claimed', async () => {
    const { service, campaignTargetCount, update } = build([
      {
        id: 'group-db-1',
        platform: 'zalo',
        chatId: 'chat-old',
        globalId: 'stable-group-1',
        name: 'Nhóm đại lý An',
        status: 'mapped',
        dealerId: 'dealer-1',
      },
    ]);
    campaignTargetCount.mockResolvedValue(1);

    await expect(
      service.reconcileAllowedGroups(
        [
          {
            id: 'chat-new',
            globalId: 'stable-group-1',
            name: 'Nhóm đại lý An',
            memberCount: 12,
            allowed: false,
          },
        ],
        ['chat-new'],
      ),
    ).rejects.toThrow('campaign');
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects merging two targets from the same campaign instead of creating a duplicate send', async () => {
    const { service, campaignTargetFindMany, update } = build([
      {
        id: 'group-db-legacy',
        platform: 'zalo',
        chatId: 'chat-old',
        globalId: null,
        name: 'Nhóm đại lý An',
        status: 'mapped',
        dealerId: 'dealer-1',
      },
      {
        id: 'group-db-duplicate',
        platform: 'zalo',
        chatId: 'chat-new',
        globalId: null,
        name: 'Nhóm đại lý An',
        status: 'pending',
        dealerId: null,
      },
    ]);
    campaignTargetFindMany.mockResolvedValue([
      { campaignId: 'campaign-1' },
      { campaignId: 'campaign-1' },
    ]);

    await expect(
      service.reconcileAllowedGroups(
        [
          {
            id: 'chat-new',
            globalId: 'stable-group-1',
            name: 'Nhóm đại lý An',
            memberCount: 12,
            allowed: false,
          },
        ],
        ['chat-new'],
        [{ currentChatId: 'chat-new', existingGroupId: 'group-db-legacy' }],
      ),
    ).rejects.toThrow('nhieu target');
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects a crafted link to a different legacy group than the unique server candidate', async () => {
    const { service, update } = build([
      {
        id: 'group-db-candidate',
        platform: 'zalo',
        chatId: 'chat-old-candidate',
        globalId: null,
        name: 'Nhóm đại lý An',
        status: 'mapped',
        dealerId: 'dealer-1',
      },
      {
        id: 'group-db-other',
        platform: 'zalo',
        chatId: 'chat-old-other',
        globalId: null,
        name: 'Nhóm khác',
        status: 'mapped',
        dealerId: 'dealer-2',
      },
    ]);

    await expect(
      service.reconcileAllowedGroups(
        [
          {
            id: 'chat-new',
            globalId: 'stable-group-1',
            name: 'Nhóm đại lý An',
            memberCount: 12,
            allowed: false,
          },
        ],
        ['chat-new'],
        [{ currentChatId: 'chat-new', existingGroupId: 'group-db-other' }],
      ),
    ).rejects.toThrow('ung vien');
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects reusing one legacy target for multiple current chat IDs', async () => {
    const { service, update } = build([
      {
        id: 'group-db-legacy',
        platform: 'zalo',
        chatId: 'chat-old',
        globalId: null,
        name: 'Nhóm',
        status: 'mapped',
        dealerId: 'dealer-1',
      },
    ]);

    await expect(
      service.reconcileAllowedGroups(
        [
          { id: 'chat-new-1', globalId: 'stable-1', name: 'Nhóm', memberCount: 1, allowed: false },
          { id: 'chat-new-2', globalId: 'stable-2', name: 'Nhóm', memberCount: 1, allowed: false },
        ],
        ['chat-new-1', 'chat-new-2'],
        [
          { currentChatId: 'chat-new-1', existingGroupId: 'group-db-legacy' },
          { currentChatId: 'chat-new-2', existingGroupId: 'group-db-legacy' },
        ],
      ),
    ).rejects.toThrow('mot-mot');
    expect(update).not.toHaveBeenCalled();
  });
});
