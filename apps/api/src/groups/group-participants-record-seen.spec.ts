import { describe, expect, it } from 'vitest';
import { InMemoryGroupParticipantsRepository } from './group-participants.repository.js';

const GROUP = 'chat-1';
const AT = '2026-08-04T09:15:00.000Z';
const LATER = '2026-08-04T11:30:00.000Z';

async function seeded() {
  const repo = new InMemoryGroupParticipantsRepository();
  await repo.recordSeen(GROUP, { externalUserId: 'u1', displayName: 'Chi Phuong' }, AT);
  return repo;
}

describe('GroupParticipantsRepository.recordSeen — hoc thanh vien tu luong tin', () => {
  it('nguoi lan dau nhan tin -> tao ho so moi, nguon message_stream', async () => {
    const repo = await seeded();

    const { participants } = await repo.list(GROUP, {});

    expect(participants).toHaveLength(1);
    expect(participants[0]).toMatchObject({
      externalUserId: 'u1',
      displayName: 'Chi Phuong',
      source: 'message_stream',
      active: true,
    });
  });

  it('thanh vien moi de phan loai MAC DINH, khong doan sang dai ly', async () => {
    const repo = await seeded();

    const { participants } = await repo.list(GROUP, {});

    expect(participants[0]).toMatchObject({
      customerRank: 'unknown',
      operationalRole: 'unknown',
      handlingMode: 'inherit_group',
    });
  });

  it('KHONG BAO GIO danh inactive cho ai (bat bien I2)', async () => {
    const repo = await seeded();
    await repo.recordSeen(GROUP, { externalUserId: 'u2', displayName: 'Anh Nam' }, LATER);

    const { participants } = await repo.list(GROUP, {});

    // u1 khong nhan tin trong lan nay nhung VAN active — day khong phai anh chup day du.
    expect(participants.every((participant) => participant.active)).toBe(true);
    expect(participants).toHaveLength(2);
  });

  it('KHONG de len phan loai cua nguoi van hanh (bat bien I3)', async () => {
    const repo = await seeded();
    const { participants } = await repo.list(GROUP, {});
    await repo.update(
      GROUP,
      participants[0]!.id,
      { customerRank: 'dai_ly', handlingMode: 'process' },
      AT,
    );

    await repo.recordSeen(GROUP, { externalUserId: 'u1', displayName: 'Chi Phuong' }, LATER);

    const after = (await repo.list(GROUP, {})).participants[0]!;
    expect(after.customerRank).toBe('dai_ly');
    expect(after.handlingMode).toBe('process');
  });

  it('KHONG ha cap source: da la manual thi giu manual (bat bien I4)', async () => {
    const repo = await seeded();
    const { participants } = await repo.list(GROUP, {});
    await repo.update(GROUP, participants[0]!.id, { customerRank: 'ctv' }, AT);

    await repo.recordSeen(GROUP, { externalUserId: 'u1', displayName: 'Chi Phuong' }, LATER);

    expect((await repo.list(GROUP, {})).participants[0]!.source).toBe('manual');
  });

  it('doi ten tren Zalo -> cap nhat ten hien thi va lastSeenAt', async () => {
    const repo = await seeded();

    await repo.recordSeen(GROUP, { externalUserId: 'u1', displayName: 'Phuong Ultty' }, LATER);

    const after = (await repo.list(GROUP, {})).participants[0]!;
    expect(after.displayName).toBe('Phuong Ultty');
    expect(after.lastSeenAt).toBe(LATER);
  });

  it('nguoi da bi danh inactive ma nhan tin lai -> hoat dong tro lai', async () => {
    const repo = await seeded();
    // Dong bo day du KHONG thay u1 -> bi danh inactive.
    await repo.synchronize({ groupId: GROUP, members: [], complete: true, syncedAt: LATER });
    expect((await repo.list(GROUP, { active: false })).participants[0]!.active).toBe(false);

    await repo.recordSeen(GROUP, { externalUserId: 'u1', displayName: 'Chi Phuong' }, LATER);

    expect((await repo.list(GROUP, {})).participants[0]!.active).toBe(true);
  });

  it('nhieu nhom doc lap: hoc o nhom nay khong dung toi nhom kia', async () => {
    const repo = await seeded();

    await repo.recordSeen('chat-2', { externalUserId: 'u9', displayName: 'Khach le' }, LATER);

    expect((await repo.list(GROUP, {})).participants).toHaveLength(1);
    expect((await repo.list('chat-2', {})).participants).toHaveLength(1);
  });
});
