import { BadRequestException, Injectable } from '@nestjs/common';
import { loadEnv } from '@netviet/shared';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { ZaloGroupView } from '../channels/zalo-user.client.js';
import { PrismaService } from '../config/prisma.service.js';
import { KnowledgeService } from '../knowledge/knowledge.service.js';

const externalIdSchema = z.string().trim().min(1).max(128);
const linkSchema = z
  .object({
    currentChatId: externalIdSchema,
    existingGroupId: externalIdSchema,
  })
  .strict();

export type GroupIdentityLink = z.infer<typeof linkSchema>;

export interface ZaloGroupWithLegacyCandidate extends ZaloGroupView {
  legacyCandidate?: {
    groupId: string;
    chatId: string;
    name: string;
    dealerName?: string;
  };
}

type StoredGroup = {
  id: string;
  platform: string;
  chatId: string;
  globalId: string | null;
  name: string | null;
  status: 'pending' | 'mapped' | 'ignored';
  dealerId: string | null;
  dealer?: { name: string } | null;
};

/**
 * Tach identity nhom (`globalId`) khoi routing ID (`chatId`) cua tai khoan zca hien tai.
 * Du lieu legacy thieu globalId chi duoc rebind khi operator gui lien ket xac nhan ro rang.
 */
@Injectable()
export class GroupIdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly knowledge: KnowledgeService,
  ) {}

  async withLegacyCandidates(
    groups: readonly ZaloGroupView[],
  ): Promise<ZaloGroupWithLegacyCandidate[]> {
    if (loadEnv().PERSISTENCE !== 'prisma') return groups.map((group) => ({ ...group }));
    const stored = await this.loadStoredGroups(true);
    const byGlobalId = new Map(
      stored.flatMap((group) => (group.globalId ? [[group.globalId, group] as const] : [])),
    );
    const byChatId = new Map(stored.map((group) => [group.chatId, group]));

    return groups.map((group) => {
      if (group.globalId && byGlobalId.has(group.globalId)) return { ...group };
      if (!group.globalId) return { ...group };
      const chatMatch = byChatId.get(group.id);
      if (chatMatch && !isUnconfiguredDuplicate(chatMatch)) return { ...group };
      const candidates = findLegacyCandidates(stored, group, chatMatch?.id);
      if (candidates.length !== 1) return { ...group };
      const candidate = candidates[0]!;
      return {
        ...group,
        legacyCandidate: {
          groupId: candidate.id,
          chatId: candidate.chatId,
          name: candidate.name ?? group.name,
          ...(candidate.dealer?.name ? { dealerName: candidate.dealer.name } : {}),
        },
      };
    });
  }

  async reconcileAllowedGroups(
    groups: readonly ZaloGroupView[],
    selectedChatIds: readonly string[],
    links: readonly GroupIdentityLink[] = [],
  ): Promise<void> {
    if (loadEnv().PERSISTENCE !== 'prisma') return;
    const normalizedGroups = groups.map((group) => ({
      ...group,
      id: externalIdSchema.parse(group.id),
      ...(group.globalId ? { globalId: externalIdSchema.parse(group.globalId) } : {}),
    }));
    const liveChatIds = normalizedGroups.map((group) => group.id);
    if (new Set(liveChatIds).size !== liveChatIds.length) {
      throw new BadRequestException('Zalo tra trung chatId trong cung mot lan dong bo');
    }
    const liveGlobalIds = normalizedGroups.flatMap((group) =>
      group.globalId ? [group.globalId] : [],
    );
    if (new Set(liveGlobalIds).size !== liveGlobalIds.length) {
      throw new BadRequestException('Zalo tra trung globalId trong cung mot lan dong bo');
    }
    const selected = new Set(selectedChatIds.map((chatId) => externalIdSchema.parse(chatId)));
    const selectedGroups = normalizedGroups.filter((group) => selected.has(group.id));
    if (selectedGroups.length !== selected.size) {
      throw new BadRequestException('Co nhom duoc chon khong con ton tai trong tai khoan Zalo nay');
    }
    const parsedLinks = links.map((link) => linkSchema.parse(link));
    const linkByChatId = new Map(parsedLinks.map((link) => [link.currentChatId, link]));
    const linkedTargets = new Set(parsedLinks.map((link) => link.existingGroupId));
    if (linkByChatId.size !== parsedLinks.length || linkedTargets.size !== parsedLinks.length) {
      throw new BadRequestException('Moi lien ket nhom phai la quan he mot-mot');
    }
    if ([...linkByChatId.keys()].some((chatId) => !selected.has(chatId))) {
      throw new BadRequestException('Lien ket nhom phai thuoc danh sach dang duoc cho phep');
    }

    let changed = false;
    try {
      changed = await this.prisma.$transaction(
        async (transaction) =>
          this.reconcileInTransaction(transaction, selectedGroups, linkByChatId),
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        'Khong the hop nhat nhom an toan vi du lieu lien quan dang xung dot; chua thay doi ban ghi nao',
        { cause: error },
      );
    }
    if (changed) await this.knowledge.reload();
  }

  private async reconcileInTransaction(
    transaction: Prisma.TransactionClient,
    selectedGroups: readonly ZaloGroupView[],
    linkByChatId: ReadonlyMap<string, GroupIdentityLink>,
  ): Promise<boolean> {
    const stored = await this.loadStoredGroups(false, transaction);
    const byGlobalId = new Map(
      stored.flatMap((group) => (group.globalId ? [[group.globalId, group] as const] : [])),
    );
    const byChatId = new Map(stored.map((group) => [group.chatId, group]));
    const byId = new Map(stored.map((group) => [group.id, group]));
    let changed = false;

    for (const live of selectedGroups) {
      const globalId = live.globalId;
      const explicit = linkByChatId.get(live.id);
      const globalMatch = globalId ? byGlobalId.get(globalId) : undefined;
      const chatMatch = byChatId.get(live.id);
      const explicitTarget = explicit ? byId.get(explicit.existingGroupId) : undefined;

      if (explicit && !explicitTarget) {
        throw new BadRequestException(`Nhom cu ${explicit.existingGroupId} khong con ton tai`);
      }
      if (explicit && !globalId) {
        throw new BadRequestException('Zalo khong tra globalId nen chua the lien ket nhom an toan');
      }
      if (explicitTarget && explicitTarget.globalId !== null) {
        throw new BadRequestException('Chi duoc lien ket vao nhom legacy chua co globalId');
      }
      if (explicitTarget) {
        const candidates = findLegacyCandidates(stored, live, chatMatch?.id);
        if (candidates.length !== 1 || candidates[0]!.id !== explicitTarget.id) {
          throw new BadRequestException(
            'Lien ket khong khop ung vien legacy duy nhat cua he thong',
          );
        }
      }
      if (explicitTarget && globalMatch && explicitTarget.id !== globalMatch.id) {
        throw new BadRequestException('Lien ket nhom xung dot voi globalId da luu');
      }

      const canonical = globalMatch ?? explicitTarget;
      if (canonical && chatMatch && chatMatch.id !== canonical.id) {
        if (!isUnconfiguredDuplicate(chatMatch)) {
          throw new BadRequestException(
            'Ban ghi trung da co cau hinh rieng, khong tu dong hop nhat',
          );
        }
        await this.mergeAndRebind(transaction, chatMatch, canonical, live, globalId);
        changed = true;
        continue;
      }

      const matched = canonical ?? chatMatch;
      if (!matched) {
        await transaction.group.create({
          data: {
            platform: 'zalo',
            chatId: live.id,
            ...(globalId ? { globalId } : {}),
            name: live.name,
            status: 'pending',
            source: 'auto_suggest',
          },
        });
        changed = true;
        continue;
      }
      if (
        matched.chatId !== live.id ||
        matched.globalId !== (globalId ?? null) ||
        matched.name !== live.name
      ) {
        await this.retargetCampaigns(
          transaction,
          [matched.id],
          [matched.chatId],
          matched.id,
          live.id,
        );
        await transaction.group.update({
          where: { id: matched.id },
          data: {
            chatId: live.id,
            ...(globalId ? { globalId } : {}),
            name: live.name,
          },
        });
        changed = true;
      }
    }
    return changed;
  }

  private async mergeAndRebind(
    transaction: Prisma.TransactionClient,
    duplicate: StoredGroup,
    canonical: StoredGroup,
    live: ZaloGroupView,
    globalId: string | undefined,
  ): Promise<void> {
    await this.retargetCampaigns(
      transaction,
      [duplicate.id, canonical.id],
      [duplicate.chatId, canonical.chatId],
      canonical.id,
      live.id,
    );
    const move = { where: { groupId: duplicate.id }, data: { groupId: canonical.id } };
    // UID thanh vien cung phu thuoc tai khoan. Khong doan hai profile la mot; neu unique conflict,
    // transaction se rollback va yeu cau operator xu ly thay vi lam mat phan loai cu.
    await transaction.groupParticipant.updateMany(move);
    await Promise.all([
      transaction.message.updateMany(move),
      transaction.order.updateMany(move),
      transaction.groupMappingHistory.updateMany(move),
    ]);
    await transaction.group.delete({ where: { id: duplicate.id } });
    await transaction.group.update({
      where: { id: canonical.id },
      data: {
        chatId: live.id,
        ...(globalId ? { globalId } : {}),
        name: live.name,
      },
    });
  }

  private async retargetCampaigns(
    transaction: Prisma.TransactionClient,
    groupIds: readonly string[],
    oldChatIds: readonly string[],
    canonicalGroupId: string,
    currentChatId: string,
  ): Promise<void> {
    const targetWhere = {
      OR: [{ groupId: { in: [...groupIds] } }, { groupId: null, chatId: { in: [...oldChatIds] } }],
    } satisfies Prisma.CampaignTargetWhereInput;
    const targets = await transaction.campaignTarget.findMany({
      where: targetWhere,
      select: { campaignId: true },
    });
    const campaignIds = targets.map((target) => target.campaignId);
    if (new Set(campaignIds).size !== campaignIds.length) {
      throw new BadRequestException(
        'Cung campaign dang co nhieu target cho cac ban ghi nhom can hop nhat',
      );
    }
    const claimed = await transaction.campaignTarget.count({
      where: {
        AND: [targetWhere, { delivery: { is: { status: 'claimed' } } }],
      },
    });
    if (claimed > 0) {
      throw new BadRequestException(
        'Nhom dang co campaign duoc worker xu ly; hay thu lai sau de tranh gui sai nhom',
      );
    }
    if (campaignIds.length > 0) {
      const routingCollision = await transaction.campaignTarget.count({
        where: {
          campaignId: { in: campaignIds },
          chatId: currentChatId,
          groupId: { notIn: [...groupIds] },
        },
      });
      if (routingCollision > 0) {
        throw new BadRequestException('Campaign da co target khac dung chatId hien tai');
      }
    }
    await transaction.campaignTarget.updateMany({
      where: {
        AND: [
          targetWhere,
          {
            OR: [
              { delivery: { is: null } },
              { delivery: { is: { status: { in: ['pending', 'failed', 'cancelled'] } } } },
            ],
          },
        ],
      },
      data: { groupId: canonicalGroupId, chatId: currentChatId },
    });
    const duplicateIds = groupIds.filter((groupId) => groupId !== canonicalGroupId);
    if (duplicateIds.length > 0) {
      await transaction.campaignTarget.updateMany({
        where: {
          groupId: { in: duplicateIds },
          delivery: { is: { status: 'sent' } },
        },
        data: { groupId: canonicalGroupId },
      });
    }
  }

  private loadStoredGroups(
    includeDealer: boolean,
    client: PrismaService | Prisma.TransactionClient = this.prisma,
  ): Promise<StoredGroup[]> {
    return client.group.findMany({
      where: { platform: 'zalo' },
      select: {
        id: true,
        platform: true,
        chatId: true,
        globalId: true,
        name: true,
        status: true,
        dealerId: true,
        ...(includeDealer ? { dealer: { select: { name: true } } } : {}),
      },
    }) as Promise<StoredGroup[]>;
  }
}

function normalizeName(name: string): string {
  return name.trim().normalize('NFC').toLocaleLowerCase('vi');
}

function isUnconfiguredDuplicate(group: StoredGroup): boolean {
  return group.globalId === null && group.status === 'pending' && group.dealerId === null;
}

function findLegacyCandidates(
  groups: readonly StoredGroup[],
  live: ZaloGroupView,
  excludedGroupId?: string,
): StoredGroup[] {
  const expectedName = normalizeName(live.name);
  return groups.filter(
    (group) =>
      group.id !== excludedGroupId &&
      group.globalId === null &&
      group.name !== null &&
      normalizeName(group.name) === expectedName &&
      (group.dealerId !== null || group.status !== 'pending'),
  );
}
