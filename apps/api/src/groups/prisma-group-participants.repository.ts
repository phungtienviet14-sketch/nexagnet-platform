import { Injectable } from '@nestjs/common';
import type {
  GroupParticipant,
  GroupParticipantProfile,
  GroupParticipantsQuery,
  GroupParticipantUpdate,
} from '@netviet/shared';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../config/prisma.service.js';
import {
  GroupParticipantIdentityConflictError,
  mergeClassification,
} from './participant-identity-merge.js';
import {
  GroupParticipantsRepository,
  type GroupParticipantListResult,
  type GroupParticipantRepositorySyncInput,
  type GroupParticipantRepositorySyncResult,
} from './group-participants.repository.js';

export class GroupParticipantGroupNotFoundError extends Error {}

@Injectable()
export class PrismaGroupParticipantsRepository extends GroupParticipantsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async synchronize(
    input: GroupParticipantRepositorySyncInput,
  ): Promise<GroupParticipantRepositorySyncResult> {
    return this.prisma.$transaction(async (transaction) => {
      const group = await transaction.group.findUnique({
        where: { platform_chatId: { platform: 'zalo', chatId: input.groupId } },
        select: { id: true },
      });
      if (!group) {
        throw new GroupParticipantGroupNotFoundError(
          'Nhom zca chua duoc map vao bang Group theo chatId',
        );
      }

      const syncedAt = new Date(input.syncedAt);
      for (const member of input.members) {
        if (member.globalId) {
          const identitySelect = {
            id: true,
            globalId: true,
            source: true,
            customerRank: true,
            operationalRole: true,
            handlingMode: true,
          } as const;
          const [stableMatch, routeMatch] = await Promise.all([
            transaction.groupParticipant.findUnique({
              where: {
                groupId_globalId: { groupId: group.id, globalId: member.globalId },
              },
              select: identitySelect,
            }),
            transaction.groupParticipant.findUnique({
              where: {
                groupId_externalUserId: {
                  groupId: group.id,
                  externalUserId: member.externalUserId,
                },
              },
              select: identitySelect,
            }),
          ]);

          // `groupId_globalId` la unique, nen hang mang dung `member.globalId` chi co the la
          // `stableMatch`. Suy ra hang route khac no thi hoac `globalId = null` (cung mot nguoi,
          // hang sinh tu luong tin), hoac mang globalId KHAC (routing UID thuoc ve nguoi khac).
          const routeBelongsToSomeoneElse = Boolean(
            routeMatch?.globalId && routeMatch.globalId !== member.globalId,
          );
          if (routeMatch && routeBelongsToSomeoneElse) {
            throw new GroupParticipantIdentityConflictError({
              displayName: member.displayName,
              externalUserId: member.externalUserId,
              incomingGlobalId: member.globalId,
              conflictingGlobalId: routeMatch.globalId as string,
              conflictingParticipantId: routeMatch.id,
              ...(stableMatch ? { stableParticipantId: stableMatch.id } : {}),
            });
          }

          // Cung mot nguoi bi tach doi -> GOP: hut phan loai sang hang co globalId roi xoa hang
          // kia. KHONG nem nua — hang route bi tach ra chinh la hang Sale vua phan loai o tab
          // Thanh vien, nen nem loi bien "dung dung tinh nang" thanh "hong dong bo vinh vien".
          const splitIdentity = Boolean(
            stableMatch && routeMatch && stableMatch.id !== routeMatch.id,
          );
          const mergedClassification =
            splitIdentity && stableMatch && routeMatch
              ? mergeClassification(stableMatch, routeMatch)
              : null;
          if (splitIdentity && routeMatch) {
            await transaction.groupParticipant.delete({ where: { id: routeMatch.id } });
          }

          const existing = stableMatch ?? routeMatch;
          const data = {
            externalUserId: member.externalUserId,
            globalId: member.globalId,
            displayName: member.displayName,
            zaloName: member.zaloName ?? null,
            avatarUrl: member.avatarUrl ?? null,
            active: true,
            lastSeenAt: syncedAt,
            syncedAt,
            ...(mergedClassification ?? {}),
          };
          if (existing) {
            await transaction.groupParticipant.update({ where: { id: existing.id }, data });
          } else {
            await transaction.groupParticipant.create({ data: { groupId: group.id, ...data } });
          }
          continue;
        }
        await transaction.groupParticipant.upsert({
          where: {
            groupId_externalUserId: {
              groupId: group.id,
              externalUserId: member.externalUserId,
            },
          },
          update: {
            displayName: member.displayName,
            zaloName: member.zaloName ?? null,
            avatarUrl: member.avatarUrl ?? null,
            active: true,
            lastSeenAt: syncedAt,
            syncedAt,
          },
          create: {
            groupId: group.id,
            externalUserId: member.externalUserId,
            displayName: member.displayName,
            zaloName: member.zaloName ?? null,
            avatarUrl: member.avatarUrl ?? null,
            lastSeenAt: syncedAt,
            syncedAt,
          },
        });
      }

      let deactivatedCount = 0;
      if (input.complete) {
        const observed = input.members.map((member) => member.externalUserId);
        const result = await transaction.groupParticipant.updateMany({
          where: {
            groupId: group.id,
            active: true,
            ...(observed.length ? { externalUserId: { notIn: observed } } : {}),
          },
          data: { active: false, syncedAt },
        });
        deactivatedCount = result.count;
      }
      return { upsertedCount: input.members.length, deactivatedCount };
    });
  }

  async list(
    groupId: string,
    filters: GroupParticipantsQuery,
  ): Promise<GroupParticipantListResult> {
    const where: Prisma.GroupParticipantWhereInput = {
      groupId,
      ...(filters.customerRank ? { customerRank: filters.customerRank } : {}),
      ...(filters.operationalRole ? { operationalRole: filters.operationalRole } : {}),
      ...(filters.handlingMode ? { handlingMode: filters.handlingMode } : {}),
      ...(filters.active !== undefined ? { active: filters.active } : {}),
      ...(filters.search
        ? {
            OR: [
              { displayName: { contains: filters.search, mode: 'insensitive' } },
              { zaloName: { contains: filters.search, mode: 'insensitive' } },
              { externalUserId: { contains: filters.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.groupParticipant.findMany({
        where,
        orderBy: [{ active: 'desc' }, { displayName: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.groupParticipant.count({ where }),
    ]);
    return { participants: rows.map(toView), total };
  }

  async update(
    groupId: string,
    participantId: string,
    changes: GroupParticipantUpdate,
    updatedAt: string,
  ): Promise<GroupParticipant | null> {
    const existing = await this.prisma.groupParticipant.findFirst({
      where: { id: participantId, groupId },
      select: { id: true },
    });
    if (!existing) return null;
    const row = await this.prisma.groupParticipant.update({
      where: { id: participantId },
      data: {
        ...changes,
        source: 'manual',
        // Prisma @updatedAt dat lai tu dong; truyen gia tri nay giu repository contract ro rang.
        updatedAt: new Date(updatedAt),
      },
    });
    return toView(row);
  }

  async updateMany(
    groupId: string,
    participantIds: readonly string[],
    changes: GroupParticipantUpdate,
    updatedAt: string,
  ): Promise<GroupParticipant[] | null> {
    return this.prisma.$transaction(async (transaction) => {
      const uniqueIds = [...new Set(participantIds)];
      const existing = await transaction.groupParticipant.findMany({
        where: { groupId, id: { in: uniqueIds } },
        select: { id: true },
      });
      if (existing.length !== uniqueIds.length) return null;
      await transaction.groupParticipant.updateMany({
        where: { groupId, id: { in: uniqueIds } },
        data: { ...changes, source: 'manual', updatedAt: new Date(updatedAt) },
      });
      const rows = await transaction.groupParticipant.findMany({
        where: { groupId, id: { in: uniqueIds } },
        orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
      });
      return rows.map(toView);
    });
  }

  async findBySender(
    externalChatId: string,
    externalUserId: string,
  ): Promise<GroupParticipant | null> {
    const row = await this.prisma.groupParticipant.findFirst({
      where: {
        externalUserId,
        active: true,
        group: { is: { platform: 'zalo', chatId: externalChatId } },
      },
    });
    return row ? toView(row) : null;
  }

  override async requiresIdentityReview(
    externalChatId: string,
    externalUserId: string,
  ): Promise<boolean> {
    void externalUserId;
    const possibleRestrictiveStableIdentity = await this.prisma.groupParticipant.count({
      where: {
        active: true,
        globalId: { not: null },
        handlingMode: { in: ['ignore', 'manual_review'] },
        group: { is: { platform: 'zalo', chatId: externalChatId } },
      },
    });
    return possibleRestrictiveStableIdentity > 0;
  }

  async recordSeen(
    externalChatId: string,
    profile: GroupParticipantProfile,
    seenAt: string,
  ): Promise<GroupParticipant | null> {
    const group = await this.prisma.group.findUnique({
      where: { platform_chatId: { platform: 'zalo', chatId: externalChatId } },
      select: { id: true },
    });
    // Nhom chua co trong nguon su that -> khong co cho gan. KHONG nem: don hang quan trong hon.
    if (!group) return null;

    const at = new Date(seenAt);
    const row = await this.prisma.groupParticipant.upsert({
      where: {
        groupId_externalUserId: { groupId: group.id, externalUserId: profile.externalUserId },
      },
      // CHI ba truong nay: khong dung toi phan loai cua nguoi van hanh (I3) va khong ha cap
      // `source` (I4). Cung khong co nhanh updateMany danh inactive nhu `synchronize` (I2).
      update: { displayName: profile.displayName, active: true, lastSeenAt: at },
      create: {
        groupId: group.id,
        externalUserId: profile.externalUserId,
        displayName: profile.displayName,
        zaloName: profile.zaloName ?? null,
        avatarUrl: profile.avatarUrl ?? null,
        source: 'message_stream',
        lastSeenAt: at,
        syncedAt: at,
      },
    });
    return toView(row);
  }
}

function toView(row: {
  id: string;
  groupId: string;
  externalUserId: string;
  globalId: string | null;
  displayName: string;
  zaloName: string | null;
  avatarUrl: string | null;
  customerRank: GroupParticipant['customerRank'];
  operationalRole: GroupParticipant['operationalRole'];
  handlingMode: GroupParticipant['handlingMode'];
  active: boolean;
  source: GroupParticipant['source'];
  lastSeenAt: Date | null;
  syncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}): GroupParticipant {
  return {
    id: row.id,
    groupId: row.groupId,
    externalUserId: row.externalUserId,
    ...(row.globalId ? { globalId: row.globalId } : {}),
    displayName: row.displayName,
    ...(row.zaloName ? { zaloName: row.zaloName } : {}),
    ...(row.avatarUrl ? { avatarUrl: row.avatarUrl } : {}),
    customerRank: row.customerRank,
    operationalRole: row.operationalRole,
    handlingMode: row.handlingMode,
    active: row.active,
    source: row.source,
    lastSeenAt: (row.lastSeenAt ?? row.syncedAt).toISOString(),
    syncedAt: row.syncedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
