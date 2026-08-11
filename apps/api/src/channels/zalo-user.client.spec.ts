import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { groupParticipantSyncSnapshotSchema } from '@netviet/shared';
import { LoginQRCallbackEventType, ThreadType, type API, type LoginQRCallback } from 'zca-js';
import { isCredentials, normalizeAllowedGroupIds } from './zalo-user.client.js';

const zcaMocks = vi.hoisted(() => ({
  login: vi.fn(),
  loginQR: vi.fn(),
}));

vi.mock('zca-js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('zca-js')>();
  return {
    ...actual,
    Zalo: class {
      login = zcaMocks.login;
      loginQR = zcaMocks.loginQR;
    },
  };
});

describe('isCredentials (validate phien zca da luu truoc khi login)', () => {
  it('chap nhan cred hop le (imei + userAgent chuoi + co cookie)', () => {
    expect(isCredentials({ imei: 'abc', userAgent: 'UA', cookie: [] })).toBe(true);
  });

  it('tu choi null / khong phai object', () => {
    expect(isCredentials(null)).toBe(false);
    expect(isCredentials('chuoi')).toBe(false);
    expect(isCredentials(123)).toBe(false);
  });

  it('tu choi khi imei khong phai chuoi (VD so) -> buoc quet QR lai', () => {
    expect(isCredentials({ imei: 123, userAgent: 'UA', cookie: [] })).toBe(false);
  });

  it('tu choi khi thieu userAgent', () => {
    expect(isCredentials({ imei: 'abc', cookie: [] })).toBe(false);
  });

  it('tu choi khi thieu cookie', () => {
    expect(isCredentials({ imei: 'abc', userAgent: 'UA' })).toBe(false);
  });
});

describe('normalizeAllowedGroupIds', () => {
  it('trim, loai trung va khong mutate input', () => {
    const input = [' group-2 ', 'group-1', 'group-2'];

    expect(normalizeAllowedGroupIds(input)).toEqual(['group-1', 'group-2']);
    expect(input).toEqual([' group-2 ', 'group-1', 'group-2']);
  });

  it('tu choi id rong hoac vuot gioi han an toan', () => {
    expect(() => normalizeAllowedGroupIds([''])).toThrow('ID nhom');
    expect(() => normalizeAllowedGroupIds(Array.from({ length: 11 }, (_, index) => `group-${index}`))).toThrow(
      '10 nhom',
    );
  });
});

describe('ZaloUserClient runtime', () => {
  const savedEnv: Record<string, string | undefined> = {};
  const keys = [
    'NODE_ENV',
    'CHANNEL_MODE',
    'ZALO_BOT_TOKEN',
    'ZALO_CRED_PATH',
    'ZALO_ALLOWED_GROUPS_PATH',
  ] as const;
  let runtimeDir = '';

  beforeEach(async () => {
    for (const key of keys) savedEnv[key] = process.env[key];
    runtimeDir = await mkdtemp(join(tmpdir(), 'netviet-zca-test-'));
    process.env.NODE_ENV = 'test';
    process.env.CHANNEL_MODE = 'zca';
    process.env.ZALO_CRED_PATH = join(runtimeDir, 'zalo-cred.json');
    process.env.ZALO_ALLOWED_GROUPS_PATH = join(runtimeDir, 'zalo-allowed-groups.json');
    zcaMocks.login.mockReset();
    zcaMocks.loginQR.mockReset();
  });

  afterEach(async () => {
    for (const key of keys) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
    await rm(runtimeDir, { recursive: true, force: true });
  });

  it('khong tu tao QR khi boot ma chua co phien', async () => {
    const { ZaloUserClient } = await import('./zalo-user.client.js');
    const client = new ZaloUserClient();

    await client.onModuleInit();
    await vi.waitFor(() => expect(client.status().state).toBe('logged_out'));

    expect(zcaMocks.loginQR).not.toHaveBeenCalled();
    expect(client.qrDataUrl()).toBeNull();
    await expect(client.sendMessage('group-1', 'hello')).rejects.toThrow('chua dang nhap');
  });

  it('hybrid van khoi tao nhanh zca va cho operator quet QR', async () => {
    process.env.CHANNEL_MODE = 'hybrid';
    process.env.ZALO_BOT_TOKEN = 'test-token';
    const { ZaloUserClient } = await import('./zalo-user.client.js');
    const client = new ZaloUserClient();

    await client.onModuleInit();
    await vi.waitFor(() => expect(client.status().state).toBe('logged_out'));

    expect(client.status().channelMode).toBe('hybrid');
    expect(zcaMocks.loginQR).not.toHaveBeenCalled();
  });

  it('tao QR theo yeu cau, ket noi, liet ke nhom va gui tin', async () => {
    const callbacks: LoginQRCallback[] = [];
    let finishLogin!: (api: API) => void;
    const loginPending = new Promise<API>((resolve) => (finishLogin = resolve));
    const listener = { on: vi.fn(), start: vi.fn(), stop: vi.fn() };
    const fakeApi = {
      listener,
      sendMessage: vi.fn(async () => undefined),
      getAllGroups: vi.fn(async () => ({ version: '1', gridVerMap: { g1: '1', g2: '1' } })),
      getGroupInfo: vi.fn(async () => ({
        removedsGroup: [],
        unchangedsGroup: [],
        gridInfoMap: {
          g1: { groupId: 'g1', name: 'Nhóm demo', totalMember: 12 },
          g2: { groupId: 'g2', name: 'Nhóm riêng', totalMember: 3 },
        },
      })),
    } as unknown as API;
    zcaMocks.loginQR.mockImplementation(async (_options, callback?: LoginQRCallback) => {
      if (callback) callbacks.push(callback);
      callback?.({
        type: LoginQRCallbackEventType.QRCodeGenerated,
        data: { code: 'code', image: 'base64qr', options: { enabledCheckOCR: false, enabledMultiLayer: false }, token: 'token' },
        actions: { saveToFile: vi.fn(async () => undefined), retry: vi.fn(), abort: vi.fn() },
      });
      return loginPending;
    });
    const { ZaloUserClient } = await import('./zalo-user.client.js');
    const client = new ZaloUserClient();
    await client.onModuleInit();
    await vi.waitFor(() => expect(client.status().state).toBe('logged_out'));

    client.startQrLogin();
    await vi.waitFor(() => expect(client.status().state).toBe('qr_ready'));
    expect(client.qrDataUrl()).toBe('data:image/png;base64,base64qr');
    expect(callbacks).toHaveLength(1);

    await client.setAllowedGroupIds(['g1']);
    expect(client.isGroupAllowed('g1')).toBe(true);
    expect(JSON.parse(await readFile(join(runtimeDir, 'zalo-allowed-groups.json'), 'utf8'))).toEqual(['g1']);

    finishLogin(fakeApi);
    await vi.waitFor(() => expect(client.status().state).toBe('ready'));
    const groups = await client.listGroups();
    expect(groups).toEqual([
      { id: 'g1', name: 'Nhóm demo', memberCount: 12, allowed: true },
      { id: 'g2', name: 'Nhóm riêng', memberCount: 3, allowed: false },
    ]);
    await client.sendMessage('g1', 'xin chao', ThreadType.Group);
    expect(fakeApi.sendMessage).toHaveBeenCalledWith('xin chao', 'g1', ThreadType.Group);
    client.onModuleDestroy();
    expect(listener.stop).toHaveBeenCalled();
  });

  it('dang xuat dung listener, xoa credential va xoa allowlist', async () => {
    const listener = { on: vi.fn(), start: vi.fn(), stop: vi.fn() };
    const fakeApi = { listener } as unknown as API;
    await writeFile(
      join(runtimeDir, 'zalo-cred.json'),
      JSON.stringify({ imei: 'imei-test', userAgent: 'UA', cookie: [] }),
      'utf8',
    );
    await writeFile(join(runtimeDir, 'zalo-allowed-groups.json'), JSON.stringify(['g1']), 'utf8');
    zcaMocks.login.mockResolvedValue(fakeApi);

    const { ZaloUserClient } = await import('./zalo-user.client.js');
    const client = new ZaloUserClient();
    await client.onModuleInit();
    await vi.waitFor(() => expect(client.status().state).toBe('ready'));

    await client.logout();

    expect(client.status()).toMatchObject({ state: 'logged_out', allowedGroupIds: [] });
    expect(listener.stop).toHaveBeenCalled();
    await expect(readFile(join(runtimeDir, 'zalo-cred.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    expect(JSON.parse(await readFile(join(runtimeDir, 'zalo-allowed-groups.json'), 'utf8'))).toEqual([]);
  });

  it('chi fetch thanh vien khi da dang nhap va nhom nam trong allowlist', async () => {
    const getGroupInfo = vi.fn();
    const fakeApi = {
      listener: { on: vi.fn(), start: vi.fn(), stop: vi.fn() },
      getGroupInfo,
    } as unknown as API;
    await writeFile(
      join(runtimeDir, 'zalo-cred.json'),
      JSON.stringify({ imei: 'imei-test', userAgent: 'UA', cookie: [] }),
      'utf8',
    );
    zcaMocks.login.mockResolvedValue(fakeApi);
    const { ZaloUserClient } = await import('./zalo-user.client.js');
    const client = new ZaloUserClient();
    await client.onModuleInit();
    await vi.waitFor(() => expect(client.status().state).toBe('ready'));

    await expect(client.fetchGroupMembers('not-allowed')).rejects.toThrow('allowlist');
    expect(getGroupInfo).not.toHaveBeenCalled();
    await client.logout();
    await expect(client.fetchGroupMembers('not-allowed')).rejects.toThrow('chua dang nhap');
  });

  it('loai tai khoan cua chinh minh va Bot Platform khoi danh sach thanh vien', async () => {
    const memberIds = ['own-uid', 'official-bot-1', 'user-1'];
    const getGroupMembersInfo = vi.fn(async (ids: string[]) => ({
      profiles: Object.fromEntries(
        ids.map((id) => [
          id,
          { id, displayName: `Display ${id}`, zaloName: `Zalo ${id}`, avatar: '' },
        ]),
      ),
      unchangeds_profile: [],
    }));
    const fakeApi = {
      listener: { on: vi.fn(), start: vi.fn(), stop: vi.fn() },
      getOwnId: vi.fn(() => 'own-uid'),
      getGroupInfo: vi.fn(async () => ({
        removedsGroup: [],
        unchangedsGroup: [],
        gridInfoMap: { 'group-1': { groupId: 'group-1', memberIds } },
      })),
      getGroupMembersInfo,
    } as unknown as API;
    await writeFile(
      join(runtimeDir, 'zalo-cred.json'),
      JSON.stringify({ imei: 'imei-test', userAgent: 'UA', cookie: [] }),
      'utf8',
    );
    await writeFile(join(runtimeDir, 'zalo-allowed-groups.json'), JSON.stringify(['group-1']), 'utf8');
    zcaMocks.login.mockResolvedValue(fakeApi);
    const { ZaloUserClient } = await import('./zalo-user.client.js');
    const client = new ZaloUserClient();
    await client.onModuleInit();
    await vi.waitFor(() => expect(client.status().state).toBe('ready'));

    const result = await client.fetchGroupMembers('group-1', ['official-bot-1']);

    // Khong duoc ton request lay ho so cua chinh minh/Bot, va snapshot chi con nguoi that.
    expect(getGroupMembersInfo).toHaveBeenCalledWith(['user-1']);
    expect(result).toMatchObject({ complete: true, expectedCount: 1, failedMemberIds: [] });
    expect(result.members.map((member) => member.externalUserId)).toEqual(['user-1']);
  });

  // Nhom that trong pilot (04/08/2026) tra memberIds RONG va do thanh vien vao currentMems.
  // Truoc khi sua, dong bo tra 0 nguoi nhung van bao complete -> hong am tham.
  it('lay thanh vien tu currentMems khi Zalo tra memberIds rong', async () => {
    const getGroupMembersInfo = vi.fn();
    const fakeApi = {
      listener: { on: vi.fn(), start: vi.fn(), stop: vi.fn() },
      getOwnId: vi.fn(() => 'own-uid'),
      getGroupInfo: vi.fn(async () => ({
        removedsGroup: [],
        unchangedsGroup: [],
        gridInfoMap: {
          'group-1': {
            groupId: 'group-1',
            memberIds: [],
            totalMember: 3,
            currentMems: [
              { id: 'own-uid', dName: 'Nhan Vien AI', zaloName: 'nhanvienai', avatar: '' },
              { id: 'official-bot-1', dName: 'Bot', zaloName: 'bot', avatar: '' },
              { id: 'user-1', dName: ' Chi Phuong ', zaloName: ' phuong ', avatar: ' https://img.test/1.jpg ' },
            ],
          },
        },
      })),
      getGroupMembersInfo,
    } as unknown as API;
    await writeFile(
      join(runtimeDir, 'zalo-cred.json'),
      JSON.stringify({ imei: 'imei-test', userAgent: 'UA', cookie: [] }),
      'utf8',
    );
    await writeFile(join(runtimeDir, 'zalo-allowed-groups.json'), JSON.stringify(['group-1']), 'utf8');
    zcaMocks.login.mockResolvedValue(fakeApi);
    const { ZaloUserClient } = await import('./zalo-user.client.js');
    const client = new ZaloUserClient();
    await client.onModuleInit();
    await vi.waitFor(() => expect(client.status().state).toBe('ready'));

    const result = await client.fetchGroupMembers('group-1', ['official-bot-1']);

    // Ho so da nam san trong currentMems -> khong duoc goi them API lay ho so.
    expect(getGroupMembersInfo).not.toHaveBeenCalled();
    expect(result).toMatchObject({ complete: true, expectedCount: 1, failedMemberIds: [] });
    expect(result.members).toEqual([
      {
        externalUserId: 'user-1',
        displayName: 'Chi Phuong',
        zaloName: 'phuong',
        avatarUrl: 'https://img.test/1.jpg',
      },
    ]);
  });

  // An toan du lieu: Zalo bao nhom co nguoi nhung khong tra danh sach -> KHONG duoc coi la dong bo
  // day du, vi tang persistence se danh inactive toan bo thanh vien da phan loai.
  it('coi la dong bo THIEU khi Zalo bao co thanh vien nhung khong tra danh sach', async () => {
    const fakeApi = {
      listener: { on: vi.fn(), start: vi.fn(), stop: vi.fn() },
      getOwnId: vi.fn(() => 'own-uid'),
      getGroupInfo: vi.fn(async () => ({
        removedsGroup: [],
        unchangedsGroup: [],
        gridInfoMap: {
          'group-1': { groupId: 'group-1', memberIds: [], currentMems: [], totalMember: 4 },
        },
      })),
      getGroupMembersInfo: vi.fn(),
    } as unknown as API;
    await writeFile(
      join(runtimeDir, 'zalo-cred.json'),
      JSON.stringify({ imei: 'imei-test', userAgent: 'UA', cookie: [] }),
      'utf8',
    );
    await writeFile(join(runtimeDir, 'zalo-allowed-groups.json'), JSON.stringify(['group-1']), 'utf8');
    zcaMocks.login.mockResolvedValue(fakeApi);
    const { ZaloUserClient } = await import('./zalo-user.client.js');
    const client = new ZaloUserClient();
    await client.onModuleInit();
    await vi.waitFor(() => expect(client.status().state).toBe('ready'));

    const result = await client.fetchGroupMembers('group-1');

    expect(result.complete).toBe(false);
    // Bat bien cua schema: members + failedMemberIds === expectedCount. Khong duoc nhet so
    // totalMember cua Zalo vao day, nhu vay snapshot se truot Zod va endpoint tra 500.
    expect(result.expectedCount).toBe(0);
    expect(result.members).toEqual([]);
    expect(result.failedMemberIds).toEqual([]);
    expect(() => groupParticipantSyncSnapshotSchema.parse(result)).not.toThrow();
  });

  it('nhom that su rong (totalMember = so tai khoan he thong) van la dong bo day du', async () => {
    const fakeApi = {
      listener: { on: vi.fn(), start: vi.fn(), stop: vi.fn() },
      getOwnId: vi.fn(() => 'own-uid'),
      getGroupInfo: vi.fn(async () => ({
        removedsGroup: [],
        unchangedsGroup: [],
        gridInfoMap: {
          'group-1': {
            groupId: 'group-1',
            memberIds: ['own-uid'],
            currentMems: [],
            totalMember: 1,
          },
        },
      })),
      getGroupMembersInfo: vi.fn(),
    } as unknown as API;
    await writeFile(
      join(runtimeDir, 'zalo-cred.json'),
      JSON.stringify({ imei: 'imei-test', userAgent: 'UA', cookie: [] }),
      'utf8',
    );
    await writeFile(join(runtimeDir, 'zalo-allowed-groups.json'), JSON.stringify(['group-1']), 'utf8');
    zcaMocks.login.mockResolvedValue(fakeApi);
    const { ZaloUserClient } = await import('./zalo-user.client.js');
    const client = new ZaloUserClient();
    await client.onModuleInit();
    await vi.waitFor(() => expect(client.status().state).toBe('ready'));

    await expect(client.fetchGroupMembers('group-1')).resolves.toMatchObject({
      complete: true,
      expectedCount: 0,
    });
  });

  it('van dong bo duoc khi api khong co getOwnId (chua dang nhap xong hoac mock cu)', async () => {
    const getGroupMembersInfo = vi.fn(async (ids: string[]) => ({
      profiles: Object.fromEntries(
        ids.map((id) => [
          id,
          { id, displayName: `Display ${id}`, zaloName: `Zalo ${id}`, avatar: '' },
        ]),
      ),
      unchangeds_profile: [],
    }));
    const fakeApi = {
      listener: { on: vi.fn(), start: vi.fn(), stop: vi.fn() },
      getGroupInfo: vi.fn(async () => ({
        removedsGroup: [],
        unchangedsGroup: [],
        gridInfoMap: { 'group-1': { groupId: 'group-1', memberIds: ['user-1'] } },
      })),
      getGroupMembersInfo,
    } as unknown as API;
    await writeFile(
      join(runtimeDir, 'zalo-cred.json'),
      JSON.stringify({ imei: 'imei-test', userAgent: 'UA', cookie: [] }),
      'utf8',
    );
    await writeFile(join(runtimeDir, 'zalo-allowed-groups.json'), JSON.stringify(['group-1']), 'utf8');
    zcaMocks.login.mockResolvedValue(fakeApi);
    const { ZaloUserClient } = await import('./zalo-user.client.js');
    const client = new ZaloUserClient();
    await client.onModuleInit();
    await vi.waitFor(() => expect(client.status().state).toBe('ready'));

    await expect(client.fetchGroupMembers('group-1')).resolves.toMatchObject({
      complete: true,
      expectedCount: 1,
    });
  });

  it('normalizes member profiles in batches and exposes a partial snapshot without hiding failures', async () => {
    const memberIds = Array.from({ length: 51 }, (_, index) => `user-${index + 1}`);
    const getGroupMembersInfo = vi
      .fn()
      .mockResolvedValueOnce({
        profiles: Object.fromEntries(
          memberIds.slice(0, 50).map((id) => [
            id,
            {
              id,
              displayName: ` Display ${id} `,
              zaloName: ` Zalo ${id} `,
              avatar: ` https://img.test/${id}.jpg `,
            },
          ]),
        ),
        unchangeds_profile: [],
      })
      .mockRejectedValueOnce(new Error('rate limited'));
    const fakeApi = {
      listener: { on: vi.fn(), start: vi.fn(), stop: vi.fn() },
      getGroupInfo: vi.fn(async () => ({
        removedsGroup: [],
        unchangedsGroup: [],
        gridInfoMap: { 'group-1': { groupId: 'group-1', memberIds } },
      })),
      getGroupMembersInfo,
    } as unknown as API;
    await writeFile(
      join(runtimeDir, 'zalo-cred.json'),
      JSON.stringify({ imei: 'imei-test', userAgent: 'UA', cookie: [] }),
      'utf8',
    );
    await writeFile(join(runtimeDir, 'zalo-allowed-groups.json'), JSON.stringify(['group-1']), 'utf8');
    zcaMocks.login.mockResolvedValue(fakeApi);
    const { ZaloUserClient } = await import('./zalo-user.client.js');
    const client = new ZaloUserClient();
    await client.onModuleInit();
    await vi.waitFor(() => expect(client.status().state).toBe('ready'));

    const result = await client.fetchGroupMembers('group-1');

    expect(getGroupMembersInfo).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      groupId: 'group-1',
      complete: false,
      expectedCount: 51,
      failedMemberIds: ['user-51'],
    });
    expect(result.members).toHaveLength(50);
    expect(result.members[0]).toEqual({
      externalUserId: 'user-1',
      displayName: 'Display user-1',
      zaloName: 'Zalo user-1',
      avatarUrl: 'https://img.test/user-1.jpg',
    });
  });

  it('marks missing profiles as partial instead of treating the snapshot as complete', async () => {
    const fakeApi = {
      listener: { on: vi.fn(), start: vi.fn(), stop: vi.fn() },
      getGroupInfo: vi.fn(async () => ({
        removedsGroup: [],
        unchangedsGroup: [],
        gridInfoMap: { 'group-1': { groupId: 'group-1', memberIds: ['user-1', 'user-2'] } },
      })),
      getGroupMembersInfo: vi.fn(async () => ({
        profiles: { 'user-1': { id: 'user-1', displayName: 'User 1', zaloName: '', avatar: '' } },
        unchangeds_profile: [],
      })),
    } as unknown as API;
    await writeFile(
      join(runtimeDir, 'zalo-cred.json'),
      JSON.stringify({ imei: 'imei-test', userAgent: 'UA', cookie: [] }),
      'utf8',
    );
    await writeFile(join(runtimeDir, 'zalo-allowed-groups.json'), JSON.stringify(['group-1']), 'utf8');
    zcaMocks.login.mockResolvedValue(fakeApi);
    const { ZaloUserClient } = await import('./zalo-user.client.js');
    const client = new ZaloUserClient();
    await client.onModuleInit();
    await vi.waitFor(() => expect(client.status().state).toBe('ready'));

    await expect(client.fetchGroupMembers('group-1')).resolves.toMatchObject({
      complete: false,
      expectedCount: 2,
      failedMemberIds: ['user-2'],
    });
  });

  it('returns a complete snapshot and falls back to zaloName for an empty display name', async () => {
    const fakeApi = {
      listener: { on: vi.fn(), start: vi.fn(), stop: vi.fn() },
      getGroupInfo: vi.fn(async () => ({
        removedsGroup: [],
        unchangedsGroup: [],
        gridInfoMap: { alias: { groupId: 'group-1', memberIds: ['user-1'] } },
      })),
      getGroupMembersInfo: vi.fn(async () => ({
        profiles: {
          'user-1': { id: 'user-1', displayName: ' ', zaloName: ' Zalo User ', avatar: 'file:///unsafe' },
        },
        unchangeds_profile: [],
      })),
    } as unknown as API;
    await writeFile(
      join(runtimeDir, 'zalo-cred.json'),
      JSON.stringify({ imei: 'imei-test', userAgent: 'UA', cookie: [] }),
      'utf8',
    );
    await writeFile(join(runtimeDir, 'zalo-allowed-groups.json'), JSON.stringify(['group-1']), 'utf8');
    zcaMocks.login.mockResolvedValue(fakeApi);
    const { ZaloUserClient } = await import('./zalo-user.client.js');
    const client = new ZaloUserClient();
    await client.onModuleInit();
    await vi.waitFor(() => expect(client.status().state).toBe('ready'));

    await expect(client.fetchGroupMembers('group-1')).resolves.toEqual({
      groupId: 'group-1',
      complete: true,
      expectedCount: 1,
      failedMemberIds: [],
      members: [{ externalUserId: 'user-1', displayName: 'Zalo User', zaloName: 'Zalo User' }],
    });
  });

  it('fails the whole snapshot before persistence when group metadata is missing', async () => {
    const fakeApi = {
      listener: { on: vi.fn(), start: vi.fn(), stop: vi.fn() },
      getGroupInfo: vi.fn(async () => ({ removedsGroup: [], unchangedsGroup: [], gridInfoMap: {} })),
    } as unknown as API;
    await writeFile(
      join(runtimeDir, 'zalo-cred.json'),
      JSON.stringify({ imei: 'imei-test', userAgent: 'UA', cookie: [] }),
      'utf8',
    );
    await writeFile(join(runtimeDir, 'zalo-allowed-groups.json'), JSON.stringify(['group-1']), 'utf8');
    zcaMocks.login.mockResolvedValue(fakeApi);
    const { ZaloUserClient } = await import('./zalo-user.client.js');
    const client = new ZaloUserClient();
    await client.onModuleInit();
    await vi.waitFor(() => expect(client.status().state).toBe('ready'));

    await expect(client.fetchGroupMembers('group-1')).rejects.toThrow('Khong tim thay nhom');
  });

  // Hinh dang THAT tu VM 04/08/2026: totalMember=4 nhung memberIds=[] va currentMems=[], nhom
  // KHONG khoa (lockViewMember=0). Truoc do dong bo tra ve 0 nguoi; `memVerList` van co UID.
  it('lay lai UID tu memVerList khi Zalo bo trong memberIds lan currentMems', async () => {
    const fakeApi = {
      listener: { on: vi.fn(), start: vi.fn(), stop: vi.fn() },
      getOwnId: vi.fn(() => 'own-uid'),
      getGroupInfo: vi.fn(async () => ({
        removedsGroup: [],
        unchangedsGroup: [],
        gridInfoMap: {
          'group-1': {
            groupId: 'group-1',
            memberIds: [],
            currentMems: [],
            totalMember: 3,
            memVerList: ['user-1_7', 'user-2_3', 'own-uid_1'],
            setting: { lockViewMember: 0 },
          },
        },
      })),
      getGroupMembersInfo: vi.fn(async (ids: string[]) => ({
        profiles: Object.fromEntries(
          ids.map((id) => [id, { id, displayName: `Display ${id}`, zaloName: '', avatar: '' }]),
        ),
        unchangeds_profile: [],
      })),
    } as unknown as API;
    await writeFile(
      join(runtimeDir, 'zalo-cred.json'),
      JSON.stringify({ imei: 'imei-test', userAgent: 'UA', cookie: [] }),
      'utf8',
    );
    await writeFile(join(runtimeDir, 'zalo-allowed-groups.json'), JSON.stringify(['group-1']), 'utf8');
    zcaMocks.login.mockResolvedValue(fakeApi);
    const { ZaloUserClient } = await import('./zalo-user.client.js');
    const client = new ZaloUserClient();
    await client.onModuleInit();
    await vi.waitFor(() => expect(client.status().state).toBe('ready'));

    const result = await client.fetchGroupMembers('group-1');

    // `own-uid` bi loai vi la chinh tai khoan chay listener, khong phai nguoi can phan loai.
    expect(result.members.map((member) => member.externalUserId)).toEqual(['user-1', 'user-2']);
    expect(result).toMatchObject({ complete: true, expectedCount: 2, failedMemberIds: [] });
  });

  // memVerList la nguon vet vat: mot phan tu la khong duoc lam hong ca lan dong bo.
  it('bo qua phan tu memVerList di dang thay vi lam hong ca lan dong bo', async () => {
    const fakeApi = {
      listener: { on: vi.fn(), start: vi.fn(), stop: vi.fn() },
      getGroupInfo: vi.fn(async () => ({
        removedsGroup: [],
        unchangedsGroup: [],
        gridInfoMap: {
          'group-1': {
            groupId: 'group-1',
            memberIds: [],
            currentMems: [],
            totalMember: 2,
            memVerList: ['', '_9', `${'x'.repeat(200)}_1`, 'user-1_2'],
          },
        },
      })),
      getGroupMembersInfo: vi.fn(async (ids: string[]) => ({
        profiles: Object.fromEntries(
          ids.map((id) => [id, { id, displayName: `Display ${id}`, zaloName: '', avatar: '' }]),
        ),
        unchangeds_profile: [],
      })),
    } as unknown as API;
    await writeFile(
      join(runtimeDir, 'zalo-cred.json'),
      JSON.stringify({ imei: 'imei-test', userAgent: 'UA', cookie: [] }),
      'utf8',
    );
    await writeFile(join(runtimeDir, 'zalo-allowed-groups.json'), JSON.stringify(['group-1']), 'utf8');
    zcaMocks.login.mockResolvedValue(fakeApi);
    const { ZaloUserClient } = await import('./zalo-user.client.js');
    const client = new ZaloUserClient();
    await client.onModuleInit();
    await vi.waitFor(() => expect(client.status().state).toBe('ready'));

    const result = await client.fetchGroupMembers('group-1');

    expect(result.members.map((member) => member.externalUserId)).toEqual(['user-1']);
  });
});

/**
 * Duong VET VAT cuoi cung khi `getGroupInfo` bo trong ca ba truong UID.
 * `getGroupLinkInfo` (endpoint `group/link/ginfo`) van tra `currentMems` kem ho so — nhung doi
 * nhom co LINK MOI dang bat. Zalo dang siet duong nay (issue zca-js #349/#359), nen moi test o
 * day deu phai chung minh: that bai KHONG duoc lam hong lan dong bo.
 */
describe('ZaloUserClient.fetchGroupMembers — duong link moi', () => {
  const savedEnv: Record<string, string | undefined> = {};
  const keys = ['NODE_ENV', 'CHANNEL_MODE', 'ZALO_CRED_PATH', 'ZALO_ALLOWED_GROUPS_PATH'] as const;
  let runtimeDir = '';

  beforeEach(async () => {
    for (const key of keys) savedEnv[key] = process.env[key];
    runtimeDir = await mkdtemp(join(tmpdir(), 'netviet-zca-link-'));
    process.env.NODE_ENV = 'test';
    process.env.CHANNEL_MODE = 'zca';
    process.env.ZALO_CRED_PATH = join(runtimeDir, 'zalo-cred.json');
    process.env.ZALO_ALLOWED_GROUPS_PATH = join(runtimeDir, 'zalo-allowed-groups.json');
    zcaMocks.login.mockReset();
    zcaMocks.loginQR.mockReset();
    await writeFile(
      join(runtimeDir, 'zalo-cred.json'),
      JSON.stringify({ imei: 'imei-test', userAgent: 'UA', cookie: [] }),
      'utf8',
    );
    await writeFile(join(runtimeDir, 'zalo-allowed-groups.json'), JSON.stringify(['group-1']), 'utf8');
  });

  afterEach(async () => {
    for (const key of keys) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
    await rm(runtimeDir, { recursive: true, force: true });
  });

  function emptyGroupInfo(totalMember = 3) {
    return vi.fn(async () => ({
      removedsGroup: [],
      unchangedsGroup: [],
      gridInfoMap: {
        'group-1': {
          groupId: 'group-1',
          memberIds: [],
          currentMems: [],
          memVerList: [],
          totalMember,
          setting: { lockViewMember: 0 },
        },
      },
    }));
  }

  async function connect(fakeApi: API) {
    zcaMocks.login.mockResolvedValue(fakeApi);
    const { ZaloUserClient } = await import('./zalo-user.client.js');
    const client = new ZaloUserClient();
    await client.onModuleInit();
    await vi.waitFor(() => expect(client.status().state).toBe('ready'));
    return client;
  }

  it('getGroupInfo rong -> lay thanh vien qua link moi dang bat', async () => {
    const getGroupLinkInfo = vi.fn(async (_payload: { link: string }) => ({
      groupId: 'group-1',
      currentMems: [
        { id: 'user-1', dName: ' Chi Phuong ', zaloName: ' phuong ', avatar: 'https://img.test/1.jpg' },
        { id: 'user-2', dName: 'Anh Nam', zaloName: 'nam', avatar: '' },
      ],
      hasMoreMember: 0,
      totalMember: 3,
    }));
    const client = await connect({
      listener: { on: vi.fn(), start: vi.fn(), stop: vi.fn() },
      getOwnId: vi.fn(() => 'own-uid'),
      getGroupInfo: emptyGroupInfo(),
      getGroupLinkDetail: vi.fn(async () => ({ link: 'https://zalo.me/g/abc123', enabled: 1 })),
      getGroupLinkInfo,
      getGroupMembersInfo: vi.fn(),
    } as unknown as API);

    const result = await client.fetchGroupMembers('group-1');

    expect(getGroupLinkInfo).toHaveBeenCalledWith({ link: 'https://zalo.me/g/abc123' });
    expect(result).toMatchObject({ complete: true, expectedCount: 2, failedMemberIds: [] });
    expect(result.members).toEqual([
      {
        externalUserId: 'user-1',
        displayName: 'Chi Phuong',
        zaloName: 'phuong',
        avatarUrl: 'https://img.test/1.jpg',
      },
      { externalUserId: 'user-2', displayName: 'Anh Nam', zaloName: 'nam' },
    ]);
  });

  // Bat link moi = ai co link deu vao duoc nhom cua khach. Do la quyet dinh cua nguoi van hanh.
  it('link moi dang TAT -> KHONG tu bat, khong doi cai dat nhom cua khach', async () => {
    const getGroupLinkInfo = vi.fn();
    const enableGroupLink = vi.fn();
    const client = await connect({
      listener: { on: vi.fn(), start: vi.fn(), stop: vi.fn() },
      getGroupInfo: emptyGroupInfo(),
      getGroupLinkDetail: vi.fn(async () => ({ enabled: 0 })),
      getGroupLinkInfo,
      enableGroupLink,
    } as unknown as API);

    const result = await client.fetchGroupMembers('group-1');

    expect(enableGroupLink).not.toHaveBeenCalled();
    expect(getGroupLinkInfo).not.toHaveBeenCalled();
    expect(result).toMatchObject({ complete: false, expectedCount: 0, members: [] });
  });

  it('link moi loi -> lan dong bo van tra snapshot an toan, khong nem', async () => {
    const client = await connect({
      listener: { on: vi.fn(), start: vi.fn(), stop: vi.fn() },
      getGroupInfo: emptyGroupInfo(),
      getGroupLinkDetail: vi.fn(async () => {
        throw new Error('Zalo tu choi');
      }),
      getGroupLinkInfo: vi.fn(),
    } as unknown as API);

    await expect(client.fetchGroupMembers('group-1')).resolves.toMatchObject({
      complete: false,
      expectedCount: 0,
      members: [],
    });
  });

  // Con trang sau ma bao complete=true thi tang persistence se danh INACTIVE nhung nguoi chua doc toi.
  it('con trang thanh vien chua doc -> complete=false', async () => {
    const client = await connect({
      listener: { on: vi.fn(), start: vi.fn(), stop: vi.fn() },
      getGroupInfo: emptyGroupInfo(200),
      getGroupLinkDetail: vi.fn(async () => ({ link: 'https://zalo.me/g/abc123', enabled: 1 })),
      getGroupLinkInfo: vi.fn(async () => ({
        currentMems: [{ id: 'user-1', dName: 'User 1', zaloName: '', avatar: '' }],
        hasMoreMember: 1,
        totalMember: 200,
      })),
      getGroupMembersInfo: vi.fn(),
    } as unknown as API);

    const result = await client.fetchGroupMembers('group-1');

    expect(result.members).toHaveLength(1);
    expect(result.complete).toBe(false);
  });

  it('duong chinh co du lieu -> KHONG dong toi link moi', async () => {
    const getGroupLinkDetail = vi.fn();
    const client = await connect({
      listener: { on: vi.fn(), start: vi.fn(), stop: vi.fn() },
      getGroupInfo: vi.fn(async () => ({
        removedsGroup: [],
        unchangedsGroup: [],
        gridInfoMap: {
          'group-1': {
            groupId: 'group-1',
            memberIds: [],
            currentMems: [{ id: 'user-1', dName: 'User 1', zaloName: '', avatar: '' }],
            totalMember: 1,
          },
        },
      })),
      getGroupLinkDetail,
      getGroupMembersInfo: vi.fn(),
    } as unknown as API);

    await client.fetchGroupMembers('group-1');

    expect(getGroupLinkDetail).not.toHaveBeenCalled();
  });
});
