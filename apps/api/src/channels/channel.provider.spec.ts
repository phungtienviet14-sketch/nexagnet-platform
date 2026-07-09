import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChannelAdapter } from './channel-adapter.js';
import { BotPlatformAdapter } from './bot-platform.adapter.js';
import { channelProvider } from './channel.provider.js';
import { MockAdapter } from './mock.adapter.js';
import { ZcaAdapter } from './zca.adapter.js';
import type { ZaloUserClient } from './zalo-user.client.js';

// channelProvider la FactoryProvider — lay useFactory ra goi truc tiep (inject ZaloUserClient gia lap).
const factory = (channelProvider as { useFactory: (c: ZaloUserClient) => ChannelAdapter }).useFactory;
const fakeClient = {} as ZaloUserClient;

describe('channelProvider (chon kenh gui theo CHANNEL_MODE)', () => {
  const KEYS = ['CHANNEL_MODE', 'BOT_MODE', 'ZALO_BOT_TOKEN'] as const;
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('zca -> ZcaAdapter', () => {
    process.env.CHANNEL_MODE = 'zca';
    expect(factory(fakeClient)).toBeInstanceOf(ZcaAdapter);
  });

  it('bot + co token -> BotPlatformAdapter', () => {
    process.env.CHANNEL_MODE = 'bot';
    process.env.ZALO_BOT_TOKEN = 'token-x';
    expect(factory(fakeClient)).toBeInstanceOf(BotPlatformAdapter);
  });

  it('bot NHUNG thieu token -> MockAdapter (fallback an toan, khong gui 401)', () => {
    process.env.CHANNEL_MODE = 'bot';
    expect(factory(fakeClient)).toBeInstanceOf(MockAdapter);
  });

  it('mock -> MockAdapter', () => {
    process.env.CHANNEL_MODE = 'mock';
    expect(factory(fakeClient)).toBeInstanceOf(MockAdapter);
  });

  it('khong dat gi (mac dinh) -> MockAdapter', () => {
    expect(factory(fakeClient)).toBeInstanceOf(MockAdapter);
  });
});
