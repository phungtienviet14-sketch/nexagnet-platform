import { ChannelAdapter } from './channel-adapter.js';
import type { ZaloUserClient } from './zalo-user.client.js';

/**
 * Adapter GUI tin qua zca-js (userbot tai khoan ca nhan, CHANNEL_MODE=zca).
 * Uy quyen cho ZaloUserClient (giu phien). chatId phia kenh = threadId nhom Zalo.
 * Loi gui (chua dang nhap / mang) nem len -> OrdersService.approve xu ly (giu pending_review).
 */
export class ZcaAdapter extends ChannelAdapter {
  readonly name = 'zca';

  constructor(private readonly client: ZaloUserClient) {
    super();
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    await this.client.sendMessage(chatId, text);
  }
}
