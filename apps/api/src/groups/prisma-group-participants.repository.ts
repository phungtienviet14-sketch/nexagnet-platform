import { Injectable } from '@nestjs/common';
import type { GroupParticipant, GroupParticipantsQuery, GroupParticipantUpdate } from '@ultty/shared';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../config/prisma.service.js';
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

  async list(groupId: string, filters: GroupParticipantsQuery): Promise<GroupParticipantListResult> {
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
}

function toView(row: {
  id: string;
  groupId: string;
  externalUserId: string;
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
