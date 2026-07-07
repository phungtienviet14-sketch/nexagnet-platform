import type { Provider } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { loadEnv } from '@ultty/shared';
import { ChannelAdapter } from './channel-adapter.js';
import { BotPlatformAdapter } from './bot-platform.adapter.js';
import { MockAdapter } from './mock.adapter.js';

/**
 * Chon kenh gui theo env: BOT_MODE=on + co token -> Zalo that; nguoc lai -> Mock.
 */
export const channelProvider: Provider = {
  provide: ChannelAdapter,
  useFactory: (): ChannelAdapter => {
    const env = loadEnv();
    const logger = new Logger('ChannelProvider');
    if (env.BOT_MODE === 'on' && env.ZALO_BOT_TOKEN) {
      logger.log('Kenh gui: BotPlatformAdapter (Zalo that)');
      return new BotPlatformAdapter(env.ZALO_BOT_TOKEN);
    }
    logger.log('Kenh gui: MockAdapter (khong gui Zalo)');
    return new MockAdapter();
  },
};
