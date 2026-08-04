import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GroupParticipantsService } from './group-participants.service.js';
import { GroupParticipantNotFoundError } from './group-participants.service.js';
import { GroupParticipantsController } from './group-participants.controller.js';

describe('GroupParticipantsController', () => {
  const list = vi.fn(async () => ({ participants: [], total: 0 }));
  const update = vi.fn(async () => ({ id: 'participant-1' }));
  const bulkUpdate = vi.fn(async (): Promise<unknown> => ({ participants: [], total: 0 }));
  const service = { list, update, bulkUpdate } as unknown as GroupParticipantsService;
  let controller: GroupParticipantsController;

  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    process.env.API_KEY = 'x'.repeat(32);
    process.env.CORS_ORIGIN = 'https://app.example.com';
    process.env.ZALO_OPERATOR_ORIGIN = 'https://operator.example.com';
    vi.clearAllMocks();
    controller = new GroupParticipantsController(service);
  });

  it('lists participants with strict validated filters', async () => {
    await expect(
      controller.list('group-1', { customerRank: 'ctv', active: 'true' }),
    ).resolves.toEqual({ participants: [], total: 0 });
    expect(list).toHaveBeenCalledWith('group-1', { customerRank: 'ctv', active: true });
  });

  it('rejects invalid path/query without calling the service', async () => {
    await expect(controller.list(' ', { extra: 'unsafe' })).rejects.toThrow(BadRequestException);
    expect(list).not.toHaveBeenCalled();
  });

  it('updates only classification fields from the configured UI origin', async () => {
    await expect(
      controller.update(
        'group-1',
        'participant-1',
        { operationalRole: 'sale', handlingMode: 'ignore' },
        'https://app.example.com',
      ),
    ).resolves.toEqual({ id: 'participant-1' });
    expect(update).toHaveBeenCalledWith('group-1', 'participant-1', {
      operationalRole: 'sale',
      handlingMode: 'ignore',
    });
  });

  // Trang /settings duoc phuc vu tren domain OPERATOR (Caddy chan /settings* o domain demo), nen
  // origin cua mutation la ZALO_OPERATOR_ORIGIN chu khong phai CORS_ORIGIN.
  it('accepts a mutation coming from the Zalo operator origin', async () => {
    await expect(
      controller.update(
        'group-1',
        'participant-1',
        { customerRank: 'dai_ly' },
        'https://operator.example.com',
      ),
    ).resolves.toEqual({ id: 'participant-1' });
    await expect(
      controller.bulkUpdate(
        'group-1',
        { participantIds: ['participant-1'], changes: { handlingMode: 'ignore' }, preview: true },
        'https://operator.example.com',
      ),
    ).resolves.toEqual({ participants: [], total: 0 });
  });

  it('rejects an empty/unknown update and cross-origin mutation', async () => {
    await expect(
      controller.update('group-1', 'participant-1', {}, 'https://app.example.com'),
    ).rejects.toThrow(BadRequestException);
    await expect(
      controller.update('group-1', 'participant-1', { handlingMode: 'process' }, 'https://evil.example'),
    ).rejects.toThrow(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
  });

  it('maps a missing participant to HTTP 404', async () => {
    update.mockRejectedValueOnce(new GroupParticipantNotFoundError('Khong tim thay participant'));

    await expect(
      controller.update(
        'group-1',
        'missing',
        { customerRank: 'unknown' },
        'https://app.example.com',
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('previews then atomically applies a validated bulk classification update', async () => {
    bulkUpdate.mockResolvedValueOnce({ affectedCount: 2, warnings: [] });
    await expect(
      controller.bulkUpdate(
        'group-1',
        {
          participantIds: ['participant-1', 'participant-2'],
          changes: { handlingMode: 'manual_review' },
          preview: true,
        },
        'https://app.example.com',
      ),
    ).resolves.toEqual({ affectedCount: 2, warnings: [] });

    bulkUpdate.mockResolvedValueOnce({ participants: [], total: 0 });
    await controller.bulkUpdate(
      'group-1',
      {
        participantIds: ['participant-1', 'participant-2'],
        changes: { handlingMode: 'manual_review' },
        preview: false,
        confirmed: true,
      },
      'https://app.example.com',
    );
    expect(bulkUpdate).toHaveBeenLastCalledWith(
      'group-1',
      ['participant-1', 'participant-2'],
      { handlingMode: 'manual_review' },
      false,
      true,
    );
  });

  it('rejects unconfirmed or malformed bulk mutations', async () => {
    await expect(
      controller.bulkUpdate(
        'group-1',
        {
          participantIds: ['participant-1'],
          changes: { handlingMode: 'ignore' },
          preview: false,
        },
        'https://app.example.com',
      ),
    ).rejects.toThrow(BadRequestException);
    expect(bulkUpdate).not.toHaveBeenCalled();
  });
});
