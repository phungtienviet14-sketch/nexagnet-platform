import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callBotApi } from './zalo-bot.client.js';
import { BotIdentityService } from './bot-identity.service.js';

vi.mock('./zalo-bot.client.js', () => ({ callBotApi: vi.fn() }));

describe('BotIdentityService', () => {
  const saved = {
    CHANNEL_MODE: process.env.CHANNEL_MODE,
    ZALO_BOT_TOKEN: process.env.ZALO_BOT_TOKEN,
  };

  beforeEach(() => {
    process.env.CHANNEL_MODE = 'hybrid';
    process.env.ZALO_BOT_TOKEN = 'secret-test-token';
    vi.mocked(callBotApi).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
    if (saved.CHANNEL_MODE === undefined) delete process.env.CHANNEL_MODE;
    else process.env.CHANNEL_MODE = saved.CHANNEL_MODE;
    if (saved.ZALO_BOT_TOKEN === undefined) delete process.env.ZALO_BOT_TOKEN;
    else process.env.ZALO_BOT_TOKEN = saved.ZALO_BOT_TOKEN;
  });

  it('lay ID Bot bang getMe va cache ket qua', async () => {
    vi.mocked(callBotApi).mockResolvedValue({
      ok: true,
      result: { id: 'official-bot-1', name: 'Bot Ultty' },
    });
    const service = new BotIdentityService();

    await expect(service.resolveId()).resolves.toBe('official-bot-1');
    await expect(service.resolveId()).resolves.toBe('official-bot-1');

    expect(callBotApi).toHaveBeenCalledTimes(1);
    expect(callBotApi).toHaveBeenCalledWith('secret-test-token', 'getMe');
  });

  it('getMe loi -> tra null de ownership fail closed', async () => {
    vi.mocked(callBotApi).mockResolvedValue({
      ok: false,
      error_code: 401,
      description: 'Unauthorized',
    });

    const service = new BotIdentityService();
    await expect(service.resolveId()).resolves.toBeNull();
    expect(service.status().state).toBe('error');
  });

  it('mode zca don -> identity disabled va khong goi Bot API', async () => {
    process.env.CHANNEL_MODE = 'zca';
    const service = new BotIdentityService();

    await expect(service.resolveId()).resolves.toBeNull();
    expect(service.status()).toEqual({ state: 'disabled' });
    expect(callBotApi).not.toHaveBeenCalled();
  });

  it('onModuleInit preload getMe; loi mang duoc ha cap thanh null', async () => {
    vi.mocked(callBotApi).mockRejectedValue(new Error('network timeout'));
    const service = new BotIdentityService();

    service.onModuleInit();

    await vi.waitFor(() => expect(service.status().state).toBe('error'));
  });
});
