import { Logger } from '@nestjs/common';
import type { OutboundContent } from '@netviet/shared';
import type { OutboundReceipt } from '../messages/outbound-recorder.js';
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

  async sendMessage(chatId: string, text: string): Promise<OutboundReceipt> {
    const res = await callBotApi<{ message_id?: string }>(this.token, 'sendMessage', {
      chat_id: chatId,
      text,
    });
    if (!res.ok) {
      this.logger.error(`Gui that bai (${res.error_code}): ${res.description}`);
      throw new Error(`Zalo sendMessage that bai: ${res.description ?? res.error_code}`);
    }
    return res.result?.message_id ? { externalMessageId: res.result.message_id } : {};
  }

  /**
   * Bot API khong co "send album": moi lan `sendPhoto` la MOT anh. Anh dau mang caption (toan bo
   * noi dung tu van + link), cac anh sau gui tran de khong lap lai chu.
   *
   * Gui TUAN TU co chu y: song song se doi thu tu anh trong nhom, va Zalo co rate limit theo nhom.
   */
  override async sendContent(
    chatId: string,
    content: OutboundContent,
  ): Promise<OutboundReceipt> {
    const links = content.links?.map((link) => `${link.label}: ${link.url}`) ?? [];
    const text = [content.text, ...links].join('\n');
    const images = content.images ?? [];
    if (!images.length) return this.sendMessage(chatId, text);
    let receipt: OutboundReceipt = {};
    for (const [index, image] of images.entries()) {
      const res = await callBotApi<{ message_id?: string }>(this.token, 'sendPhoto', {
        chat_id: chatId,
        photo: image.url,
        ...(index === 0 ? { caption: text } : {}),
      });
      if (!res.ok) {
        this.logger.error(`Gui anh that bai (${res.error_code}): ${res.description}`);
        // Anh dau ROT = khach khong nhan duoc gi ca -> nem de OrdersService giu pending_review.
        // Anh sau rot thi khach DA co noi dung chinh: log roi di tiep, khong huy ca luot gui.
        if (index === 0) {
          throw new Error(`Zalo sendPhoto that bai: ${res.description ?? res.error_code}`);
        }
      }
      // Anh dau mang caption (toan bo noi dung) — do la tin dai dien cho luot gui nay.
      if (index === 0 && res.result?.message_id) {
        receipt = { externalMessageId: res.result.message_id };
      }
    }
    return receipt;
  }
}
