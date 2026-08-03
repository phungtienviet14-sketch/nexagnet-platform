import { describe, expect, it } from 'vitest';
import { InMemoryGroupParticipantsRepository } from './group-participants.repository.js';
import { GroupParticipantsService } from './group-participants.service.js';

const firstFullSync = {
  groupId: 'group-1',
  complete: true,
  expectedCount: 2,
  failedMemberIds: [],
  members: [
    { externalUserId: 'user-1', displayName: 'Dai ly An', zaloName: 'An', avatarUrl: 'https://img.test/a.jpg' },
    { externalUserId: 'user-2', displayName: 'Sale Binh' },
  ],
} as const;

describe('GroupParticipantsService', () => {
  it('upserts a full zca snapshot with fail-safe classification defaults', async () => {
    const repository = new InMemoryGroupParticipantsRepository();
    const service = new GroupParticipantsService(repository);

    const result = await service.synchronize(firstFullSync, new Date('2026-08-03T01:00:00.000Z'));
    const listed = await service.list('group-1', {});

    expect(result).toMatchObject({ complete: true, fetchedCount: 2, failedCount: 0, upsertedCount: 2 });
    expect(listed).toMatchObject({ total: 2 });
    expect(listed.participants[0]).toMatchObject({
      customerRank: 'unknown',
      operationalRole: 'unknown',
      handlingMode: 'inherit_group',
      active: true,
      source: 'zca_sync',
    });
  });

  it('preserves operator classification on later sync and deactivates absent members only after a full snapshot', async () => {
    const repository = new InMemoryGroupParticipantsRepository();
    const service = new GroupParticipantsService(repository);
    await service.synchronize(firstFullSync, new Date('2026-08-03T01:00:00.000Z'));
    const before = await service.list('group-1', { search: 'An' });
    await service.update('group-1', before.participants[0]!.id, {
      customerRank: 'dai_ly',
      operationalRole: 'khach_hang',
      handlingMode: 'process',
    });

    const result = await service.synchronize(
      {
        groupId: 'group-1',
        complete: true,
        expectedCount: 1,
        failedMemberIds: [],
        members: [{ externalUserId: 'user-1', displayName: 'Dai ly An moi' }],
      },
      new Date('2026-08-03T02:00:00.000Z'),
    );
    const listed = await service.list('group-1', {});

    expect(result.deactivatedCount).toBe(1);
    expect(listed.participants.find((item) => item.externalUserId === 'user-1')).toMatchObject({
      displayName: 'Dai ly An moi',
      customerRank: 'dai_ly',
      operationalRole: 'khach_hang',
      handlingMode: 'process',
      active: true,
    });
    expect(listed.participants.find((item) => item.externalUserId === 'user-2')?.active).toBe(false);
  });

  it('upserts fetched profiles but never deactivates members after a partial snapshot', async () => {
    const repository = new InMemoryGroupParticipantsRepository();
    const service = new GroupParticipantsService(repository);
    await service.synchronize(firstFullSync, new Date('2026-08-03T01:00:00.000Z'));

    const result = await service.synchronize(
      {
        groupId: 'group-1',
        complete: false,
        expectedCount: 2,
        failedMemberIds: ['user-2'],
        members: [{ externalUserId: 'user-1', displayName: 'An partial' }],
      },
      new Date('2026-08-03T02:00:00.000Z'),
    );
    const listed = await service.list('group-1', {});

    expect(result).toMatchObject({ complete: false, failedCount: 1, deactivatedCount: 0 });
    expect(listed.participants).toHaveLength(2);
    expect(listed.participants.every((item) => item.active)).toBe(true);
  });

  it('filters participants and rejects updates outside the requested group', async () => {
    const repository = new InMemoryGroupParticipantsRepository();
    const service = new GroupParticipantsService(repository);
    await service.synchronize(firstFullSync, new Date('2026-08-03T01:00:00.000Z'));
    const listed = await service.list('group-1', {});
    await service.update('group-1', listed.participants[0]!.id, { handlingMode: 'ignore' });

    await expect(service.update('other-group', listed.participants[0]!.id, { handlingMode: 'process' })).rejects.toThrow(
      'Khong tim thay',
    );
    await expect(service.list('group-1', { handlingMode: 'ignore' })).resolves.toMatchObject({ total: 1 });
  });

  it('previews without mutation then applies one atomic bulk classification change', async () => {
    const repository = new InMemoryGroupParticipantsRepository();
    const service = new GroupParticipantsService(repository);
    await service.synchronize(firstFullSync, new Date('2026-08-03T01:00:00.000Z'));
    const before = await service.list('group-1', {});
    const ids = before.participants.map((participant) => participant.id);

    await expect(
      service.bulkUpdate('group-1', ids, { handlingMode: 'manual_review' }, true, false),
    ).resolves.toEqual({ affectedCount: 2, warnings: [] });
    expect((await service.list('group-1', { handlingMode: 'inherit_group' })).total).toBe(2);

    await service.bulkUpdate('group-1', ids, { handlingMode: 'manual_review' }, false, true);
    expect((await service.list('group-1', { handlingMode: 'manual_review' })).total).toBe(2);
  });
});
