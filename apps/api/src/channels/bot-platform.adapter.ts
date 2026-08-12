import { Logger } from '@nestjs/common';
import type { OutboundContent } from '@netviet/shared';
import { ChannelAdapter } from './channel-adapter.js';
import { callBotApi } from './zalo-bot.client.js';

/**
 * Adapter Zalo Bot Platform that (BOT_MODE=on). Gui tin xac nhan vao nhom.
 */
export class BotPlatformAdapter extends ChannelAdapter {
  readonly name = 'bot_platform';
  override readonly capabilities = { text: true, image: true, video: false, file: false } as const;
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

  override async sendContent(chatId: string, content: OutboundContent): Promise<void> {
    const links = content.links?.map((link) => `${link.label}: ${link.url}`) ?? [];
    const text = [content.text, ...links].join('\n');
    if (!content.image) {
      await this.sendMessage(chatId, text);
      return;
    }
    const res = await callBotApi(this.token, 'sendPhoto', {
      chat_id: chatId,
      photo: content.image.url,
      caption: text,
    });
    if (!res.ok) {
      this.logger.error(`Gui anh that bai (${res.error_code}): ${res.description}`);
      throw new Error(`Zalo sendPhoto that bai: ${res.description ?? res.error_code}`);
    }
  }
}
