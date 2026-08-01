import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
});
