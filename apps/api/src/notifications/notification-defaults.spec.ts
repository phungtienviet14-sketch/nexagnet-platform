import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ZaloNotificationConfig } from '@netviet/shared';
import type { ZaloUserClient } from '../channels/zalo-user.client.js';
import { NotificationSettingsRepository } from './notification-settings.repository.js';
import { ZaloLeadDispatcher } from './zalo-lead-dispatcher.js';

const createdDirs: string[] = [];
const savedDataDir = process.env.DATA_DIR;

afterEach(() => {
  if (savedDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = savedDataDir;
  for (const dir of createdDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('notification defaults fail closed', () => {
  it('fresh tenant starts disabled with no implicit Zalo recipient', () => {
    const dir = mkdtempSync(join(tmpdir(), 'notification-settings-'));
    createdDirs.push(dir);
    process.env.DATA_DIR = dir;

    const settings = new NotificationSettingsRepository().getSettings();

    expect(settings.zalo).toEqual({
      enabled: false,
      targetMemberNames: [],
      targetMemberIds: [],
      targetGroupIds: [],
    });
  });

  it('enabled but empty config does not inspect Zalo or send to anyone', async () => {
    const client = {
      isReady: vi.fn(() => true),
      status: vi.fn(() => ({ state: 'connected', channelMode: 'zca', allowedGroupIds: ['g-1'] })),
      sendMessage: vi.fn(),
    } as unknown as ZaloUserClient;
    const participants = { list: vi.fn() };
    const dispatcher = new ZaloLeadDispatcher(client, participants as never);
    const config: ZaloNotificationConfig = {
      enabled: true,
      targetMemberNames: [],
      targetMemberIds: [],
      targetGroupIds: [],
    };

    const result = await dispatcher.sendTestZalo({}, config);

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/chưa cấu hình người nhận/i);
    expect(client.isReady).not.toHaveBeenCalled();
    expect(client.sendMessage).not.toHaveBeenCalled();
    expect(participants.list).not.toHaveBeenCalled();
  });

  it('keeps sending when an explicit runtime group recipient is configured', async () => {
    const client = {
      isReady: vi.fn(() => true),
      status: vi.fn(() => ({ state: 'connected', channelMode: 'zca', allowedGroupIds: [] })),
      sendMessage: vi.fn(async () => undefined),
    } as unknown as ZaloUserClient;
    const dispatcher = new ZaloLeadDispatcher(client);
    const config: ZaloNotificationConfig = {
      enabled: true,
      targetMemberNames: [],
      targetMemberIds: [],
      targetGroupIds: ['group-configured-at-runtime'],
    };

    const result = await dispatcher.sendTestZalo({}, config);

    expect(result.success).toBe(true);
    expect(client.sendMessage).toHaveBeenCalledTimes(1);
  });
});
