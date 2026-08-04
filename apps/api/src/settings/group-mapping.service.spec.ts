import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AuditLogService } from '../audit/audit-log.service.js';
import type { PrismaService } from '../config/prisma.service.js';
import type { KnowledgeService } from '../knowledge/knowledge.service.js';
import { GroupMappingService } from './group-mapping.service.js';

interface GroupUpsertArgs {
  where: unknown;
  create: Record<string, unknown>;
  update: Record<string, unknown>;
}

function build(
  options: { dealerExists?: boolean; existingGroup?: Record<string, unknown> | null } = {},
) {
  const upsert = vi.fn(async (_args: GroupUpsertArgs) => ({ id: 'grp-1', chatId: 'chat-1' }));
  const update = vi.fn(async (_args: { where: unknown; data: Record<string, unknown> }) => ({
    id: 'grp-1',
    chatId: 'chat-1',
  }));
  const findUniqueGroup = vi.fn(async () => options.existingGroup ?? null);
  const findUniqueDealer = vi.fn(async () =>
    options.dealerExists === false ? null : { id: 'meta-hn', name: 'Meta HN' },
  );
  const prisma = {
    group: { upsert, update, findUnique: findUniqueGroup },
    dealer: { findUnique: findUniqueDealer },
  } as unknown as PrismaService;
  const reload = vi.fn(async () => undefined);
  const knowledge = { reload } as unknown as KnowledgeService;
  const append = vi.fn(async (_entry: Record<string, unknown>) => undefined);
  const audit = { append } as unknown as AuditLogService;
  return {
    service: new GroupMappingService(prisma, knowledge, audit),
    upsert,
    update,
    findUniqueDealer,
    reload,
    append,
  };
}

describe('GroupMappingService', () => {
  beforeEach(() => {
    process.env.PERSISTENCE = 'prisma';
  });

  it('chon dai ly -> upsert theo platform_chatId, khong can biet id cuid', async () => {
    const { service, upsert } = build();

    await service.setMapping(
      'chat-1',
      { dealerId: 'meta-hn', name: 'Meta HN - Nhom don' },
      'operator',
      null,
    );

    const args = upsert.mock.calls[0]![0];
    expect(args.where).toEqual({ platform_chatId: { platform: 'zalo', chatId: 'chat-1' } });
  });

  it('chon dai ly -> status mapped + luu ten nhom lay tu Zalo', async () => {
    const { service, upsert } = build();

    await service.setMapping(
      'chat-1',
      { dealerId: 'meta-hn', name: 'Meta HN - Nhom don' },
      'operator',
      null,
    );

    const args = upsert.mock.calls[0]![0];
    expect(args.update).toMatchObject({
      dealerId: 'meta-hn',
      status: 'mapped',
      source: 'manual',
      name: 'Meta HN - Nhom don',
    });
    expect(args.create).toMatchObject({ platform: 'zalo', chatId: 'chat-1', status: 'mapped' });
  });

  it('bo chon dai ly -> ve pending, KHONG xoa hang (tin cu van tro ve nhom nay)', async () => {
    const { service, upsert } = build();

    await service.setMapping('chat-1', { dealerId: null }, 'operator', null);

    const args = upsert.mock.calls[0]![0];
    expect(args.update).toMatchObject({ dealerId: null, status: 'pending' });
  });

  it('khong gui ten -> khong ghi de ten dang co trong DB', async () => {
    const { service, upsert } = build();

    await service.setMapping('chat-1', { dealerId: 'meta-hn' }, 'operator', null);

    expect(upsert.mock.calls[0]![0].update).not.toHaveProperty('name');
  });

  it('dai ly khong ton tai -> 400 va KHONG ghi gi', async () => {
    const { service, upsert } = build({ dealerExists: false });

    await expect(
      service.setMapping('chat-1', { dealerId: 'khong-co-that' }, 'operator', null),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('bo chon dai ly -> khong can tra dealer', async () => {
    const { service, findUniqueDealer } = build();

    await service.setMapping('chat-1', { dealerId: null }, 'operator', null);

    expect(findUniqueDealer).not.toHaveBeenCalled();
  });

  it('ghi xong -> reload nguon su that de pipeline thay ngay', async () => {
    const { service, reload } = build();

    await service.setMapping('chat-1', { dealerId: 'meta-hn' }, 'operator', null);

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('ghi audit kem trang thai truoc va sau', async () => {
    const { service, append } = build({
      existingGroup: { id: 'grp-1', chatId: 'chat-1', dealerId: null, status: 'pending' },
    });

    await service.setMapping('chat-1', { dealerId: 'meta-hn' }, 'chi-phuong', 'req-9');

    expect(append).toHaveBeenCalledTimes(1);
    const entry = append.mock.calls[0]![0];
    expect(entry).toMatchObject({
      actor: 'chi-phuong',
      action: 'group.mapping.update',
      entityType: 'Group',
      entityId: 'chat-1',
      requestId: 'req-9',
    });
    expect(entry.before).toMatchObject({ dealerId: null, status: 'pending' });
  });

  it('PERSISTENCE=memory -> tu choi ro rang thay vi ghi vao hu khong', async () => {
    process.env.PERSISTENCE = 'memory';
    const { service, upsert } = build();

    await expect(
      service.setMapping('chat-1', { dealerId: 'meta-hn' }, 'operator', null),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(upsert).not.toHaveBeenCalled();
  });
});

// Hai nhom `source=seed` con sot tu dot test truoc khong co duong nao go khoi bang; day la duong do.
describe('GroupMappingService.setHidden (go nhom khoi danh sach)', () => {
  beforeEach(() => {
    process.env.PERSISTENCE = 'prisma';
  });

  it('go nhom -> status ignored, KHONG xoa hang va KHONG dung toi dealerId', async () => {
    const { service, update } = build({
      existingGroup: { id: 'grp-1', chatId: 'chat-1', dealerId: 'meta-hn', status: 'mapped' },
    });

    await expect(service.setHidden('chat-1', true, 'operator', null)).resolves.toEqual({
      chatId: 'chat-1',
      status: 'ignored',
    });
    const args = update.mock.calls[0]![0];
    expect(args.where).toEqual({ platform_chatId: { platform: 'zalo', chatId: 'chat-1' } });
    expect(args.data).toEqual({ status: 'ignored' });
  });

  it('dua lai nhom con dai ly -> ve mapped, khong bat chon lai', async () => {
    const { service, update } = build({
      existingGroup: { id: 'grp-1', chatId: 'chat-1', dealerId: 'meta-hn', status: 'ignored' },
    });

    await expect(service.setHidden('chat-1', false, 'operator', null)).resolves.toEqual({
      chatId: 'chat-1',
      status: 'mapped',
    });
    expect(update.mock.calls[0]![0].data).toEqual({ status: 'mapped' });
  });

  it('dua lai nhom khong con dai ly -> ve pending chu khong doan bua', async () => {
    const { service } = build({
      existingGroup: { id: 'grp-1', chatId: 'chat-1', dealerId: null, status: 'ignored' },
    });

    await expect(service.setHidden('chat-1', false, 'operator', null)).resolves.toMatchObject({
      status: 'pending',
    });
  });

  it('nhom khong co trong DB -> 404 va KHONG ghi gi', async () => {
    const { service, update } = build({ existingGroup: null });

    await expect(service.setHidden('khong-co', true, 'operator', null)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('go xong -> reload de pipeline thoi dinh tuyen nhom nay ngay', async () => {
    const { service, reload } = build({
      existingGroup: { id: 'grp-1', chatId: 'chat-1', dealerId: 'meta-hn', status: 'mapped' },
    });

    await service.setHidden('chat-1', true, 'operator', null);

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('ghi audit kem trang thai truoc de con lan ra ai go nhom nao', async () => {
    const { service, append } = build({
      existingGroup: { id: 'grp-1', chatId: 'chat-1', dealerId: 'meta-hn', status: 'mapped' },
    });

    await service.setHidden('chat-1', true, 'chi-phuong', 'req-12');

    const entry = append.mock.calls[0]![0];
    expect(entry).toMatchObject({
      actor: 'chi-phuong',
      action: 'group.hidden.set',
      entityType: 'Group',
      entityId: 'chat-1',
      requestId: 'req-12',
    });
    expect(entry.before).toMatchObject({ status: 'mapped' });
  });

  it('PERSISTENCE=memory -> tu choi ro rang thay vi ghi vao hu khong', async () => {
    process.env.PERSISTENCE = 'memory';
    const { service, update } = build({
      existingGroup: { id: 'grp-1', chatId: 'chat-1', dealerId: null, status: 'mapped' },
    });

    await expect(service.setHidden('chat-1', true, 'operator', null)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(update).not.toHaveBeenCalled();
  });
});
