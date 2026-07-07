import { Logger } from '@nestjs/common';
import { ChannelAdapter } from './channel-adapter.js';
import { callBotApi } from './zalo-bot.client.js';

/**
 * Adapter Zalo Bot Platform that (BOT_MODE=on). Gui tin xac nhan vao nhom.
 */
export class BotPlatformAdapter extends ChannelAdapter {
  readonly name = 'bot_platform';
  private readonly logger = new Logger('BotPlatformAdapter');

  constructor(private readonly token: string) {
    super();
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    const res = await callBotApi(this.token, 'sendMessage', { chat_id: chatId, text });
    if (!res.ok) {
      this.logger.error(`Gui that bai (${res.error_code}): ${res.description}`);
      throw new Error(`Zalo sendMessage that bai: ${res.description ?? res.error_code}`);
    }
  }
}
