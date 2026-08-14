import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  GroupParticipant,
  GroupParticipantProfile,
  GroupParticipantsQuery,
  GroupParticipantUpdate,
} from '@netviet/shared';

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

  /**
   * True when an unknown routing UID could belong to an existing stable participant whose
   * restrictive handling policy must not be bypassed after a zca account switch. Implementations
   * must not guess identity: callers only fail closed to manual review until synchronization.
   */
  async requiresIdentityReview(
    externalChatId: string,
    externalUserId: string,
  ): Promise<boolean> {
    void externalChatId;
    void externalUserId;
    return false;
  }

  /**
   * Ghi nhan mot nguoi VUA NHAN TIN trong nhom — nguon danh sach thanh vien duy nhat con dung
   * duoc sau khi Zalo tra `getGroupInfo` rong va Bot Platform khong co API thanh vien (04/08/2026).
   *
   * Khac `synchronize` o ba diem, va ca ba deu la bat bien:
   *  - KHONG BAO GIO danh `active: false` cho ai: day la mot lat cat, khong phai anh chup day du,
   *    nen "khong thay" khong co nghia la "da roi nhom".
   *  - KHONG dung toi customerRank / operationalRole / handlingMode: do la phan loai cua nguoi
   *    van hanh, luong tin khong duoc de len.
   *  - KHONG ha cap `source`: da la `manual` hay `zca_sync` thi giu nguyen.
   *
   * Tra `null` khi khong tim thay nhom (chua map) — KHONG nem, vi loi metadata khong duoc chan
   * viec xu ly don.
   */
  abstract recordSeen(
    externalChatId: string,
    profile: GroupParticipantProfile,
    seenAt: string,
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

  override async requiresIdentityReview(
    externalChatId: string,
    externalUserId: string,
  ): Promise<boolean> {
    void externalUserId;
    return this.store.some(
      (candidate) =>
        candidate.groupId === externalChatId &&
        candidate.active &&
        Boolean(candidate.globalId) &&
        ['ignore', 'manual_review'].includes(candidate.handlingMode),
    );
  }

  async recordSeen(
    externalChatId: string,
    profile: GroupParticipantProfile,
    seenAt: string,
  ): Promise<GroupParticipant | null> {
    const existing = this.store.find(
      (candidate) =>
        candidate.groupId === externalChatId &&
        candidate.externalUserId === profile.externalUserId,
    );
    if (!existing) {
      const created: GroupParticipant = {
        ...createParticipant(externalChatId, profile, seenAt),
        source: 'message_stream',
      };
      this.store = [...this.store, created];
      return { ...created };
    }
    // CHI ba truong nay. Phan loai va source cua nguoi van hanh khong duoc dung toi (I3, I4).
    const updated: GroupParticipant = {
      ...existing,
      displayName: profile.displayName,
      active: true,
      lastSeenAt: seenAt,
      updatedAt: seenAt,
    };
    this.store = this.store.map((candidate) =>
      candidate.id === existing.id ? updated : candidate,
    );
    return { ...updated };
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
    ...(profile.globalId ? { globalId: profile.globalId } : {}),
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
    ...(profile.globalId ? { globalId: profile.globalId } : {}),
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
