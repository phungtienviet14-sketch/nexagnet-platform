import { Injectable, Logger } from '@nestjs/common';
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
  private readonly logger = new Logger('MockAdapter');
  readonly sent: SentMessage[] = [];

  async sendMessage(chatId: string, text: string): Promise<void> {
    this.sent.push({ chatId, text });
    this.logger.log(`[MOCK gui -> ${chatId}]\n${text}`);
  }
}
