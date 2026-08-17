import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ZaloGroupNotAllowedError,
  ZaloNotConnectedError,
  type ZaloUserClient,
} from './zalo-user.client.js';
import type { AuditLogService } from '../audit/audit-log.service.js';
import type { BotIdentityService } from './bot-identity.service.js';
import type { GroupParticipantsService } from '../groups/group-participants.service.js';
import { GroupParticipantGroupNotFoundError } from '../groups/prisma-group-participants.repository.js';
import { ZaloController } from './zalo.controller.js';

describe('ZaloController', () => {
  const apiCredentialFixture = 'x'.repeat(32);
  const startQrLogin = vi.fn();
  const setAllowedGroupIds = vi.fn();
  const listGroupIdentities = vi.fn(async () => [
    {
      id: 'group-1',
      globalId: 'stable-group-1',
      name: 'Nhom 1',
      memberCount: 3,
      allowed: false,
    },
  ]);
  const logout = vi.fn(async () => undefined);
  const fetchGroupMembers = vi.fn(async () => ({
    groupId: 'group-1',
    complete: true,
    expectedCount: 1,
    failedMemberIds: [],
    members: [{ externalUserId: 'user-1', displayName: 'Dai ly An' }],
  }));
  const client = {
    status: vi.fn(() => ({ channelMode: 'zca', state: 'logged_out', allowedGroupIds: [] })),
    startQrLogin,
    listGroups: vi.fn(async () => []),
    listGroupIdentities,
    setAllowedGroupIds,
    logout,
    fetchGroupMembers,
    qrDataUrl: vi.fn(() => 'data:image/png;base64,abc'),
  } as unknown as ZaloUserClient;
  const identity = {
    status: vi.fn(() => ({ state: 'ready', id: 'official-bot-1', name: 'Bot Ultty' })),
  } as unknown as BotIdentityService;
  const synchronize = vi.fn(async () => ({
    groupId: 'group-1',
    complete: true,
    expectedCount: 1,
    fetchedCount: 1,
    failedCount: 0,
    upsertedCount: 1,
    deactivatedCount: 0,
    syncedAt: '2026-08-03T01:00:00.000Z',
  }));
  const participants = { synchronize } as unknown as GroupParticipantsService;
  const reconcileAllowedGroups = vi.fn(async () => undefined);
  let controller: ZaloController;

  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    process.env.API_KEY = apiCredentialFixture;
    process.env.CHANNEL_MODE = 'zca';
    process.env.PERSISTENCE = 'memory';
    process.env.ZALO_OPERATOR_ORIGIN = 'https://operator.example.com';
    vi.clearAllMocks();
    controller = new ZaloController(client, identity, participants);
  });

  it('status gom ca zca va danh tinh Bot Platform', () => {
    expect(controller.status()).toMatchObject({
      state: 'logged_out',
      botIdentity: { state: 'ready', id: 'official-bot-1' },
    });
  });

  it('khong tao QR neu operator chua xac nhan rui ro zca', async () => {
    await expect(
      controller.login(
        { acceptedRisk: false, acceptedSecondaryAccount: true },
        'https://operator.example.com',
      ),
    ).rejects.toThrow(BadRequestException);
    expect(startQrLogin).not.toHaveBeenCalled();
  });

  // D20: xac nhan tai khoan phu la mot xac nhan RIENG. Tick moi o rui ro ToS ma bo qua o nay la
  // van co the dang nhap bang tai khoan Sale chinh — dung thu phai tranh.
  it('khong tao QR neu chua xac nhan dang dung tai khoan phu/SIM rieng', async () => {
    await expect(
      controller.login(
        { acceptedRisk: true, acceptedSecondaryAccount: false },
        'https://operator.example.com',
      ),
    ).rejects.toThrow(BadRequestException);
    expect(startQrLogin).not.toHaveBeenCalled();
  });

  it('chan mutation tu origin khac de chong CSRF', async () => {
    await expect(
      controller.login(
        { acceptedRisk: true, acceptedSecondaryAccount: true },
        'https://evil.example',
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(startQrLogin).not.toHaveBeenCalled();
  });

  it('bat dau QR khi da xac nhan CA HAI va origin dung', async () => {
    await controller.login(
      { acceptedRisk: true, acceptedSecondaryAccount: true },
      'https://operator.example.com',
    );
    expect(startQrLogin).toHaveBeenCalledTimes(1);
  });

  it('ghi lai ai xac nhan rui ro, TRUOC khi tao QR', async () => {
    const append = vi.fn().mockResolvedValue(undefined);
    const audited = new ZaloController(client, identity, participants, {
      append,
    } as unknown as AuditLogService);

    await audited.login(
      { acceptedRisk: true, acceptedSecondaryAccount: true },
      'https://operator.example.com',
      'nguoi-van-hanh',
    );

    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: 'nguoi-van-hanh',
        action: 'zalo.login.risk_accepted',
        after: expect.objectContaining({ acceptedRisk: true, acceptedSecondaryAccount: true }),
      }),
    );
    expect(append.mock.invocationCallOrder[0]!).toBeLessThan(
      startQrLogin.mock.invocationCallOrder[0]!,
    );
  });

  it('validate allowlist toi da 10 group id', async () => {
    await expect(
      controller.allowGroups(
        { groupIds: Array.from({ length: 11 }, (_, index) => `group-${index}`) },
        'https://operator.example.com',
      ),
    ).rejects.toThrow(BadRequestException);
    expect(setAllowedGroupIds).not.toHaveBeenCalled();
  });

  it('reconciles stable group identities before enabling the new account allowlist', async () => {
    const append = vi.fn(async () => undefined);
    const controllerWithIdentity = new ZaloController(
      client,
      identity,
      participants,
      { append } as unknown as AuditLogService,
      { reconcileAllowedGroups } as never,
    );

    await controllerWithIdentity.allowGroups(
      { groupIds: ['group-1'] },
      'https://operator.example.com',
    );

    expect(listGroupIdentities).toHaveBeenCalledWith(['group-1']);
    expect(reconcileAllowedGroups).toHaveBeenCalledWith(
      [expect.objectContaining({ id: 'group-1', globalId: 'stable-group-1' })],
      ['group-1'],
      [],
    );
    expect(setAllowedGroupIds).toHaveBeenNthCalledWith(1, []);
    expect(setAllowedGroupIds).toHaveBeenNthCalledWith(2, ['group-1']);
    expect(reconcileAllowedGroups.mock.invocationCallOrder[0]!).toBeLessThan(
      setAllowedGroupIds.mock.invocationCallOrder[1]!,
    );
  });

  it('fails closed in prisma mode when identity or audit wiring is missing', async () => {
    process.env.PERSISTENCE = 'prisma';
    const unwired = new ZaloController(client, identity, participants);

    await expect(
      unwired.allowGroups({ groupIds: ['group-1'] }, 'https://operator.example.com'),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(setAllowedGroupIds).not.toHaveBeenCalled();
  });

  it('audits an explicit legacy link request before reconciliation can mutate group identity', async () => {
    const append = vi.fn(async () => undefined);
    const controllerWithIdentity = new ZaloController(
      client,
      identity,
      participants,
      { append } as unknown as AuditLogService,
      { reconcileAllowedGroups } as never,
    );

    await controllerWithIdentity.allowGroups(
      {
        groupIds: ['group-1'],
        links: [{ currentChatId: 'group-1', existingGroupId: 'group-db-old' }],
      },
      'https://operator.example.com',
      'manager-1',
      'req-1',
    );

    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: 'manager-1',
        action: 'zalo.group_identity.reconcile.requested',
        requestId: 'req-1',
      }),
    );
    expect(append.mock.invocationCallOrder[0]!).toBeLessThan(
      reconcileAllowedGroups.mock.invocationCallOrder[0]!,
    );
  });

  it('dang xuat chi khi origin operator hop le va co xac nhan', async () => {
    await expect(
      controller.logout({ confirmed: true }, 'https://operator.example.com'),
    ).resolves.toMatchObject({ state: 'logged_out' });
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('khong dang xuat neu thieu xac nhan', async () => {
    await expect(
      controller.logout({ confirmed: false }, 'https://operator.example.com'),
    ).rejects.toThrow(BadRequestException);
    expect(logout).not.toHaveBeenCalled();
  });

  it('dong bo thanh vien nhom qua snapshot zca da duoc gate va normalize', async () => {
    await expect(
      controller.syncGroupMembers('group-1', {}, 'https://operator.example.com'),
    ).resolves.toMatchObject({ complete: true, fetchedCount: 1 });
    // UID Bot phai di kem de bi loai: Bot la cong cu cua he thong, khong phai nguoi can phan loai.
    expect(fetchGroupMembers).toHaveBeenCalledWith('group-1', ['official-bot-1']);
    expect(synchronize).toHaveBeenCalledWith(expect.objectContaining({ groupId: 'group-1' }));
  });

  it('chap nhan ca CORS_ORIGIN va ZALO_OPERATOR_ORIGIN (co hoac khong co trailing slash)', async () => {
    process.env.CORS_ORIGIN = 'https://demo.example.com';
    controller = new ZaloController(client, identity, participants);

    await expect(
      controller.syncGroupMembers('group-1', {}, 'https://demo.example.com/'),
    ).resolves.toMatchObject({ complete: true });
    await expect(
      controller.syncGroupMembers('group-1', {}, 'https://operator.example.com/'),
    ).resolves.toMatchObject({ complete: true });
  });

  it('rate-limit endpoint dong bo thanh vien nhay cam', () => {
    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', controller.syncGroupMembers)).toBe(5);
    expect(Reflect.getMetadata('THROTTLER:TTLdefault', controller.syncGroupMembers)).toBe(60_000);
  });

  it('chan sync neu origin sai, group id sai hoac body co field la', async () => {
    await expect(
      controller.syncGroupMembers('group-1', {}, 'https://evil.example'),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      controller.syncGroupMembers(' ', {}, 'https://operator.example.com'),
    ).rejects.toThrow(BadRequestException);
    await expect(
      controller.syncGroupMembers('group-1', { complete: true }, 'https://operator.example.com'),
    ).rejects.toThrow(BadRequestException);
    expect(fetchGroupMembers).not.toHaveBeenCalled();
  });

  it('fail-closed khi repository participant chua duoc wire', async () => {
    const controllerWithoutRepository = new ZaloController(client, identity);

    await expect(
      controllerWithoutRepository.syncGroupMembers('group-1', {}, 'https://operator.example.com'),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(fetchGroupMembers).not.toHaveBeenCalled();
  });

  it.each([
    [new ZaloGroupNotAllowedError('not allowed'), ForbiddenException],
    [new ZaloNotConnectedError('logged out'), ServiceUnavailableException],
  ])('maps zca sync gate errors to safe HTTP errors', async (zcaError, httpError) => {
    fetchGroupMembers.mockRejectedValueOnce(zcaError);

    await expect(
      controller.syncGroupMembers('group-1', {}, 'https://operator.example.com'),
    ).rejects.toThrow(httpError);
    expect(synchronize).not.toHaveBeenCalled();
  });

  it('maps an unmapped source-truth group to a safe bad request', async () => {
    synchronize.mockRejectedValueOnce(new GroupParticipantGroupNotFoundError('missing mapping'));

    await expect(
      controller.syncGroupMembers('group-1', {}, 'https://operator.example.com'),
    ).rejects.toThrow(BadRequestException);
  });
});
