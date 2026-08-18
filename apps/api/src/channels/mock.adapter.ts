import { Injectable, Logger } from '@nestjs/common';
import type { OutboundReceipt } from '../messages/outbound-recorder.js';
import { ChannelAdapter } from './channel-adapter.js';

export interface SentMessage {
  chatId: string;
  text: string;
}

/**
 * Adapter gia lap (demo offline / test): khong goi Zalo, chi log + luu lai
 * de kiem tra / hien thi. Dung khi BOT_MODE=off.
 */
@Injectable()
export class MockAdapter extends ChannelAdapter {
  readonly name = 'mock';
  override readonly capabilities = { text: true, image: true, video: false, file: false } as const;
  private readonly logger = new Logger('MockAdapter');
  readonly sent: SentMessage[] = [];

  async sendMessage(chatId: string, text: string): Promise<OutboundReceipt> {
    // Mock khong mo phong trich dan: khong co gi de kiem chung, va giu log de doc.
    this.sent.push({ chatId, text });
    this.logger.log(`[MOCK gui -> ${chatId}]\n${text}`);
    // Mock khong co id that; recorder se tu sinh `out:<uuid>`.
    return {};
  }
}
