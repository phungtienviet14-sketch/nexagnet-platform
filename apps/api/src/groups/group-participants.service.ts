import { Injectable, Optional } from '@nestjs/common';
import {
  groupParticipantSyncSnapshotSchema,
  type GroupParticipantSyncResult,
  type GroupParticipantsQuery,
  type GroupParticipantUpdate,
} from '@ultty/shared';
import {
  GroupParticipantsRepository,
  type GroupParticipantListResult,
} from './group-participants.repository.js';
import { AuditLogService } from '../audit/audit-log.service.js';

export class GroupParticipantNotFoundError extends Error {}

@Injectable()
export class GroupParticipantsService {
  constructor(
    private readonly repository: GroupParticipantsRepository,
    @Optional() private readonly audit?: AuditLogService,
  ) {}

  async synchronize(snapshot: unknown, now = new Date()): Promise<GroupParticipantSyncResult> {
    const parsed = groupParticipantSyncSnapshotSchema.parse(snapshot);
    const syncedAt = now.toISOString();
    const persisted = await this.repository.synchronize({
      groupId: parsed.groupId,
      members: parsed.members,
      complete: parsed.complete,
      syncedAt,
    });
    const result = {
      groupId: parsed.groupId,
      complete: parsed.complete,
      expectedCount: parsed.expectedCount,
      fetchedCount: parsed.members.length,
      failedCount: parsed.failedMemberIds.length,
      upsertedCount: persisted.upsertedCount,
      deactivatedCount: persisted.deactivatedCount,
      syncedAt,
    };
    await this.audit?.append({
      actor: 'operator',
      action: 'participant.sync',
      entityType: 'GroupParticipant',
      entityId: parsed.groupId,
      after: result,
    });
    return result;
  }

  list(groupId: string, filters: GroupParticipantsQuery): Promise<GroupParticipantListResult> {
    return this.repository.list(groupId, filters);
  }

  async update(groupId: string, participantId: string, changes: GroupParticipantUpdate) {
    const before = (await this.repository.list(groupId, {})).participants.find(
      (participant) => participant.id === participantId,
    );
    const participant = await this.repository.update(
      groupId,
      participantId,
      changes,
      new Date().toISOString(),
    );
    if (!participant) {
      throw new GroupParticipantNotFoundError('Khong tim thay thanh vien trong nhom');
    }
    await this.audit?.append({
      actor: 'operator',
      action: 'participant.classification.update',
      entityType: 'GroupParticipant',
      entityId: participantId,
      before,
      after: participant,
    });
    return participant;
  }

  async bulkUpdate(
    groupId: string,
    participantIds: readonly string[],
    changes: GroupParticipantUpdate,
    preview: boolean,
    confirmed: boolean,
  ) {
    const current = await this.repository.list(groupId, {});
    const selected = current.participants.filter((participant) => participantIds.includes(participant.id));
    if (selected.length !== participantIds.length) {
      throw new GroupParticipantNotFoundError('Co thanh vien khong con ton tai trong nhom');
    }
    if (preview) return { affectedCount: selected.length, warnings: [] as string[] };
    if (!confirmed) throw new Error('Bulk update chua duoc xac nhan');
    const updated = await this.repository.updateMany(
      groupId,
      participantIds,
      changes,
      new Date().toISOString(),
    );
    if (!updated) throw new GroupParticipantNotFoundError('Co thanh vien khong con ton tai trong nhom');
    await this.audit?.append({
      actor: 'operator',
      action: 'participant.classification.bulk_update',
      entityType: 'GroupParticipant',
      entityId: groupId,
      before: { affectedCount: selected.length },
      after: { affectedCount: updated.length, changes },
    });
    return this.repository.list(groupId, {});
  }
}
