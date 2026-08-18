import { Inject, Injectable, Optional } from '@nestjs/common';
import type { ChannelCapabilities, OutboundContent, ReplyChannel, SenderRole } from '@netviet/shared';
import { OutboundRecorder, type OutboundReceipt } from '../messages/outbound-recorder.js';
import { ChannelAdapter, type SendOptions } from './channel-adapter.js';
import {
  BOT_CHANNEL_ADAPTER,
  MOCK_CHANNEL_ADAPTER,
  ZCA_CHANNEL_ADAPTER,
} from './channel.tokens.js';

/**
 * Gui phan hoi ve dung kenh da nhan tin, khong suy doan trong hybrid mode.
 *
 * Cung la CHOT CHAN duy nhat luu tin outbound (Pha 1): moi duong gui di qua day, nen day la cho
 * dung de ghi lai "he thong da noi gi", thay vi rai lenh luu o tung call-site.
 */
@Injectable()
export class OutboundChannelRouter {
  constructor(
    @Inject(BOT_CHANNEL_ADAPTER) private readonly bot: ChannelAdapter,
    @Inject(ZCA_CHANNEL_ADAPTER) private readonly zca: ChannelAdapter,
    @Inject(MOCK_CHANNEL_ADAPTER) private readonly mock: ChannelAdapter,
    // Optional: thieu recorder thi van gui binh thuong, chi mat lich su (degrade, khong crash).
    @Optional() private readonly recorder?: OutboundRecorder,
  ) {}

  async sendMessage(
    replyChannel: ReplyChannel | undefined,
    chatId: string,
    text: string,
    senderRole: SenderRole = 'bot',
    options?: SendOptions,
  ): Promise<OutboundReceipt> {
    if (!replyChannel) throw new Error('Thieu replyChannel: tu choi doan kenh gui');
    const receipt = await this.adapter(replyChannel).sendMessage(chatId, text, options);
    await this.remember(chatId, text, receipt, senderRole);
    return receipt;
  }

  capabilities(replyChannel: ReplyChannel): ChannelCapabilities {
    return this.adapter(replyChannel).capabilities;
  }

  async sendContent(
    replyChannel: ReplyChannel | undefined,
    chatId: string,
    content: OutboundContent,
    senderRole: SenderRole = 'bot',
    options?: SendOptions,
  ): Promise<OutboundReceipt> {
    if (!replyChannel) throw new Error('Thieu replyChannel: tu choi doan kenh gui');
    const adapter = this.adapter(replyChannel);
    if (content.images?.length && !adapter.capabilities.image) {
      throw new Error(`Kênh ${adapter.name} không hỗ trợ ảnh outbound`);
    }
    const receipt = await adapter.sendContent(chatId, content, options);
    // Luu phan CHU: anh/link da nam trong text hoac di kem, con mach hoi thoai can van ban.
    await this.remember(chatId, content.text, receipt, senderRole);
    return receipt;
  }

  private async remember(
    chatId: string,
    text: string,
    receipt: OutboundReceipt,
    senderRole: SenderRole,
  ): Promise<void> {
    await this.recorder?.record({ chatId, text, receipt, senderRole });
  }

  private adapter(replyChannel: ReplyChannel): ChannelAdapter {
    switch (replyChannel) {
      case 'bot':
        return this.bot;
      case 'zca':
        return this.zca;
      case 'mock':
        return this.mock;
    }
  }
}
