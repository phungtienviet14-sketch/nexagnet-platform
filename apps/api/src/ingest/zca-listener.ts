import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { loadEnv } from '@ultty/shared';
import type { Message } from 'zca-js';
import { AUTO_LABEL } from '../channels/auto-label.js';
import { ChannelAdapter } from '../channels/channel-adapter.js';
import { ZaloUserClient } from '../channels/zalo-user.client.js';
import { PipelineService } from '../pipeline/pipeline.service.js';
import { AUTO_ACK_TEXT, shouldAutoAck } from './bot-poller.js';
import { zcaMessageToChannelMessage } from './zca-message.js';

/** Tran so tin da xu ly giu lai de chong trung. zca doc MOI tin nhom -> can chan phinh bo nho. */
const MAX_SEEN = 2000;

/**
 * Tang 2 — worker doc tin qua zca-js (userbot ca nhan). Chi chay khi CHANNEL_MODE=zca.
 * Khac Bot Platform: nghe MOI tin trong nhom (khong bi mention-gating) -> tin nao cung vao pipeline.
 * Dang ky handler voi ZaloUserClient (client lo dang nhap + giu phien); map -> pipeline.process.
 */
@Injectable()
export class ZcaListener implements OnModuleInit {
  private readonly logger = new Logger('ZcaListener');
  private readonly seen = new Set<string>();
  /** Chat da in ID (in 1 lan/nhom) — giup lay threadId that de map vao seed.ts. */
  private readonly announced = new Set<string>();

  constructor(
    private readonly pipeline: PipelineService,
    private readonly client: ZaloUserClient,
    private readonly channel: ChannelAdapter,
  ) {}

  onModuleInit(): void {
    const env = loadEnv();
    if (env.CHANNEL_MODE !== 'zca') {
      this.logger.log(`CHANNEL_MODE=${env.CHANNEL_MODE} -> khong nghe tin qua zca-js.`);
      return;
    }
    const selfListen = env.ZALO_SELF_LISTEN === 'on';
    this.client.setMessageHandler((message) =>
      this.handle(message, env.BOT_NAME, env.AUTO_ACK, selfListen),
    );
    this.logger.log('CHANNEL_MODE=zca -> nghe MOI tin nhom qua zca-js (khong can @mention). Auto-ack=' + env.AUTO_ACK);
  }

  private async handle(
    message: Message,
    botName: string,
    autoAck: 'on' | 'off',
    selfListen: boolean,
  ): Promise<void> {
    const channelMessage = zcaMessageToChannelMessage(message, selfListen);
    if (!channelMessage) return;
    this.announceGroup(channelMessage.externalChatId, channelMessage.chatType);
    if (this.seen.has(channelMessage.externalMessageId)) return;
    this.remember(channelMessage.externalMessageId);
    try {
      const view = await this.pipeline.process(channelMessage, botName);
      this.logger.log(`Da xu ly tin ${channelMessage.externalMessageId} -> intent=${view.intent}`);
      if (shouldAutoAck(view.intent, autoAck)) {
        await this.sendAutoAck(channelMessage.externalChatId);
      }
    } catch (error) {
      this.logger.error(`Loi xu ly tin: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * In ID nhom (1 lan/nhom) de lay threadId THAT cua zca -> dan vao seed.ts groups[].chatId
   * (map nhom -> dai ly la theo ID nay, KHONG theo TEN nhom).
   */
  private announceGroup(chatId: string, chatType: string): void {
    if (this.announced.has(chatId)) return;
    this.announced.add(chatId);
    this.logger.log(
      `📌 Nhom (${chatType}) chatId="${chatId}" — copy ID nay vao seed.ts groups[] de map dai ly.`,
    );
  }

  /** Nho id da xu ly (chong trung), chan phinh: qua tran thi bo id cu nhat (Set giu thu tu chen). */
  private remember(id: string): void {
    this.seen.add(id);
    if (this.seen.size > MAX_SEEN) {
      const oldest = this.seen.values().next().value;
      if (oldest !== undefined) this.seen.delete(oldest);
    }
  }

  /** Gui tin auto-ack (best-effort): loi khong lam gian doan doc tin. */
  private async sendAutoAck(chatId: string): Promise<void> {
    try {
      await this.channel.sendMessage(chatId, AUTO_ACK_TEXT + AUTO_LABEL);
      this.logger.log(`Da gui auto-ack (intent=khac) toi ${chatId}`);
    } catch (error) {
      this.logger.warn(`Gui auto-ack that bai: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
