import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  GroupParticipant,
  GroupParticipantProfile,
  GroupParticipantsQuery,
  GroupParticipantUpdate,
} from '@ultty/shared';

export interface GroupParticipantRepositorySyncInput {
  groupId: string;
  members: readonly GroupParticipantProfile[];
  complete: boolean;
  syncedAt: string;
}

export interface GroupParticipantRepositorySyncResult {
  upsertedCount: number;
  deactivatedCount: number;
}

export interface GroupParticipantListResult {
  participants: GroupParticipant[];
  total: number;
}

export abstract class GroupParticipantsRepository {
  abstract synchronize(
    input: GroupParticipantRepositorySyncInput,
  ): Promise<GroupParticipantRepositorySyncResult>;
  abstract list(groupId: string, filters: GroupParticipantsQuery): Promise<GroupParticipantListResult>;
  abstract update(
    groupId: string,
    participantId: string,
    changes: GroupParticipantUpdate,
    updatedAt: string,
  ): Promise<GroupParticipant | null>;
  abstract updateMany(
    groupId: string,
    participantIds: readonly string[],
    changes: GroupParticipantUpdate,
    updatedAt: string,
  ): Promise<GroupParticipant[] | null>;
  abstract findBySender(
    externalChatId: string,
    externalUserId: string,
  ): Promise<GroupParticipant | null>;
}

@Injectable()
export class InMemoryGroupParticipantsRepository extends GroupParticipantsRepository {
  private store: readonly GroupParticipant[] = [];

  async synchronize(
    input: GroupParticipantRepositorySyncInput,
  ): Promise<GroupParticipantRepositorySyncResult> {
    const existingByExternalId = new Map(
      this.store
        .filter((participant) => participant.groupId === input.groupId)
        .map((participant) => [participant.externalUserId, participant]),
    );
    const observedIds = new Set(input.members.map((member) => member.externalUserId));
    const upsertedParticipants = input.members.map((profile) => {
      const existing = existingByExternalId.get(profile.externalUserId);
      return existing
        ? refreshParticipant(existing, profile, input.syncedAt)
        : createParticipant(input.groupId, profile, input.syncedAt);
    });
    const unchangedGroups = this.store.filter((participant) => participant.groupId !== input.groupId);
    const absentParticipants = this.store
      .filter(
        (participant) =>
          participant.groupId === input.groupId && !observedIds.has(participant.externalUserId),
      )
      .map((participant) =>
        input.complete
          ? { ...participant, active: false, syncedAt: input.syncedAt, updatedAt: input.syncedAt }
          : participant,
      );
    const deactivatedCount = input.complete
      ? absentParticipants.filter((participant) => {
          const previous = existingByExternalId.get(participant.externalUserId);
          return previous?.active && !participant.active;
        }).length
      : 0;
    this.store = [...unchangedGroups, ...upsertedParticipants, ...absentParticipants];
    return { upsertedCount: input.members.length, deactivatedCount };
  }

  async list(groupId: string, filters: GroupParticipantsQuery): Promise<GroupParticipantListResult> {
    const participants = this.store
      .filter((participant) => participant.groupId === groupId)
      .filter((participant) => matchesFilters(participant, filters))
      .sort(compareParticipants)
      .map((participant) => ({ ...participant }));
    return { participants, total: participants.length };
  }

  async update(
    groupId: string,
    participantId: string,
    changes: GroupParticipantUpdate,
    updatedAt: string,
  ): Promise<GroupParticipant | null> {
    const participant = this.store.find(
      (candidate) => candidate.groupId === groupId && candidate.id === participantId,
    );
    if (!participant) return null;
    const updated = { ...participant, ...changes, source: 'manual' as const, updatedAt };
    this.store = this.store.map((candidate) => (candidate.id === participantId ? updated : candidate));
    return { ...updated };
  }

  async updateMany(
    groupId: string,
    participantIds: readonly string[],
    changes: GroupParticipantUpdate,
    updatedAt: string,
  ): Promise<GroupParticipant[] | null> {
    const ids = new Set(participantIds);
    const existing = this.store.filter(
      (candidate) => candidate.groupId === groupId && ids.has(candidate.id),
    );
    if (existing.length !== ids.size) return null;
    const updated = existing.map((participant) => ({
      ...participant,
      ...changes,
      source: 'manual' as const,
      updatedAt,
    }));
    const updatedById = new Map(updated.map((participant) => [participant.id, participant]));
    this.store = this.store.map((participant) => updatedById.get(participant.id) ?? participant);
    return updated.map((participant) => ({ ...participant }));
  }

  async findBySender(
    externalChatId: string,
    externalUserId: string,
  ): Promise<GroupParticipant | null> {
    const participant = this.store.find(
      (candidate) =>
        candidate.groupId === externalChatId &&
        candidate.externalUserId === externalUserId &&
        candidate.active,
    );
    return participant ? { ...participant } : null;
  }
}

function createParticipant(
  groupId: string,
  profile: GroupParticipantProfile,
  syncedAt: string,
): GroupParticipant {
  return {
    id: randomUUID(),
    groupId,
    externalUserId: profile.externalUserId,
    displayName: profile.displayName,
    ...(profile.zaloName ? { zaloName: profile.zaloName } : {}),
    ...(profile.avatarUrl ? { avatarUrl: profile.avatarUrl } : {}),
    customerRank: 'unknown',
    operationalRole: 'unknown',
    handlingMode: 'inherit_group',
    active: true,
    source: 'zca_sync',
    lastSeenAt: syncedAt,
    syncedAt,
    createdAt: syncedAt,
    updatedAt: syncedAt,
  };
}

function refreshParticipant(
  participant: GroupParticipant,
  profile: GroupParticipantProfile,
  syncedAt: string,
): GroupParticipant {
  return {
    ...participant,
    displayName: profile.displayName,
    ...(profile.zaloName ? { zaloName: profile.zaloName } : {}),
    ...(profile.avatarUrl ? { avatarUrl: profile.avatarUrl } : {}),
    active: true,
    lastSeenAt: syncedAt,
    syncedAt,
    updatedAt: syncedAt,
  };
}

function matchesFilters(participant: GroupParticipant, filters: GroupParticipantsQuery): boolean {
  if (filters.customerRank && participant.customerRank !== filters.customerRank) return false;
  if (filters.operationalRole && participant.operationalRole !== filters.operationalRole) return false;
  if (filters.handlingMode && participant.handlingMode !== filters.handlingMode) return false;
  if (filters.active !== undefined && participant.active !== filters.active) return false;
  if (!filters.search) return true;
  const needle = filters.search.toLocaleLowerCase('vi');
  return [participant.displayName, participant.zaloName, participant.externalUserId].some((value) =>
    value?.toLocaleLowerCase('vi').includes(needle),
  );
}

function compareParticipants(left: GroupParticipant, right: GroupParticipant): number {
  if (left.active !== right.active) return left.active ? -1 : 1;
  return left.displayName.localeCompare(right.displayName, 'vi') || left.id.localeCompare(right.id);
}
