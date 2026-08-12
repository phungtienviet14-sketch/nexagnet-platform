import { Inject, Injectable } from '@nestjs/common';
import type { ChannelCapabilities, OutboundContent, ReplyChannel } from '@netviet/shared';
import { ChannelAdapter } from './channel-adapter.js';
import {
  BOT_CHANNEL_ADAPTER,
  MOCK_CHANNEL_ADAPTER,
  ZCA_CHANNEL_ADAPTER,
} from './channel.tokens.js';

/** Gui phan hoi ve dung kenh da nhan tin, khong suy doan trong hybrid mode. */
@Injectable()
export class OutboundChannelRouter {
  constructor(
    @Inject(BOT_CHANNEL_ADAPTER) private readonly bot: ChannelAdapter,
    @Inject(ZCA_CHANNEL_ADAPTER) private readonly zca: ChannelAdapter,
    @Inject(MOCK_CHANNEL_ADAPTER) private readonly mock: ChannelAdapter,
  ) {}

  async sendMessage(
    replyChannel: ReplyChannel | undefined,
    chatId: string,
    text: string,
  ): Promise<void> {
    if (!replyChannel) throw new Error('Thieu replyChannel: tu choi doan kenh gui');
    await this.adapter(replyChannel).sendMessage(chatId, text);
  }

  capabilities(replyChannel: ReplyChannel): ChannelCapabilities {
    return this.adapter(replyChannel).capabilities;
  }

  async sendContent(
    replyChannel: ReplyChannel | undefined,
    chatId: string,
    content: OutboundContent,
  ): Promise<void> {
    if (!replyChannel) throw new Error('Thieu replyChannel: tu choi doan kenh gui');
    const adapter = this.adapter(replyChannel);
    if (content.image && !adapter.capabilities.image) {
      throw new Error(`Kênh ${adapter.name} không hỗ trợ ảnh outbound`);
    }
    await adapter.sendContent(chatId, content);
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
