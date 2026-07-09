import type { Provider } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { loadEnv } from '@ultty/shared';
import { ChannelAdapter } from './channel-adapter.js';
import { BotPlatformAdapter } from './bot-platform.adapter.js';
import { MockAdapter } from './mock.adapter.js';
import { ZcaAdapter } from './zca.adapter.js';
import { ZaloUserClient } from './zalo-user.client.js';

/**
 * Chon kenh GUI theo CHANNEL_MODE:
 *   zca  -> ZcaAdapter (userbot ca nhan qua ZaloUserClient)
 *   bot  -> BotPlatformAdapter (can ZALO_BOT_TOKEN; thieu token -> Mock + canh bao)
 *   mock -> MockAdapter (khong gui Zalo)
 * Doc tin (ingest) do BotPoller / ZcaListener tu chon theo cung CHANNEL_MODE.
 */
export const channelProvider: Provider = {
  provide: ChannelAdapter,
  inject: [ZaloUserClient],
  useFactory: (zaloUser: ZaloUserClient): ChannelAdapter => {
    const env = loadEnv();
    const logger = new Logger('ChannelProvider');
    switch (env.CHANNEL_MODE) {
      case 'zca':
        logger.log('Kenh gui: ZcaAdapter (zca-js — userbot tai khoan ca nhan)');
        return new ZcaAdapter(zaloUser);
      case 'bot':
        if (env.ZALO_BOT_TOKEN) {
          logger.log('Kenh gui: BotPlatformAdapter (Zalo Bot Platform)');
          return new BotPlatformAdapter(env.ZALO_BOT_TOKEN);
        }
        logger.warn('CHANNEL_MODE=bot nhung thieu ZALO_BOT_TOKEN -> dung MockAdapter.');
        return new MockAdapter();
      default:
        logger.log('Kenh gui: MockAdapter (khong gui Zalo)');
        return new MockAdapter();
    }
  },
};
