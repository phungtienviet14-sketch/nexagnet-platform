import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { channelMessageSchema, loadEnv, type ChannelMessage } from '@ultty/shared';
import { callBotApi, normalizeUpdates, type BotUpdate } from '../channels/zalo-bot.client.js';
import { PipelineService } from '../pipeline/pipeline.service.js';

/** Chuyen 1 update Zalo -> ChannelMessage chuan; null neu bo qua (tin bot, thieu noi dung). */
export function updateToChannelMessage(update: BotUpdate): ChannelMessage | null {
  const m = update.message;
  if (!m || !m.chat?.id || m.from?.is_bot) return null;
  const text = m.text ?? m.caption;
  if (!text) return null;

  const chatType = (m.chat.chat_type ?? '').toUpperCase() === 'PRIVATE' ? 'private' : 'group';
  const candidate = {
    externalMessageId: m.message_id ?? `${m.chat.id}-${m.date ?? Date.now()}`,
    platform: 'zalo',
    source: 'bot_webhook',
    chatType,
    externalChatId: m.chat.id,
    senderExternalId: m.from?.id,
    senderDisplayName: m.from?.display_name,
    text,
    imageUrl: m.photo_url,
    sentAt: m.date ? new Date(m.date) : new Date(),
  };
  const parsed = channelMessageSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/**
 * Tang 2 — worker doc tin Zalo Bot (long polling). Chi chay khi BOT_MODE=on.
 * Luu y: Zalo khong phat lai tin luc bot offline -> production nen dung webhook always-on.
 */
@Injectable()
export class BotPoller implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('BotPoller');
  private running = false;
  private readonly seen = new Set<string>();

  constructor(private readonly pipeline: PipelineService) {}

  onModuleInit(): void {
    const env = loadEnv();
    if (env.BOT_MODE !== 'on' || !env.ZALO_BOT_TOKEN) {
      this.logger.log('BOT_MODE=off -> khong doc Zalo (dung /demo/simulate de demo).');
      return;
    }
    this.running = true;
    void this.loop(env.ZALO_BOT_TOKEN, env.BOT_NAME);
    this.logger.log('BOT_MODE=on -> bat dau long polling getUpdates.');
  }

  onModuleDestroy(): void {
    this.running = false;
  }

  private async loop(token: string, botName: string): Promise<void> {
    while (this.running) {
      try {
        const res = await callBotApi(token, 'getUpdates', { timeout: 20 });
        if (!res.ok) {
          if (res.error_code === 408) continue; // idle binh thuong
          this.logger.warn(`getUpdates loi ${res.error_code}: ${res.description}`);
          await sleep(3000);
          continue;
        }
        for (const update of normalizeUpdates(res.result)) {
          const message = updateToChannelMessage(update);
          if (!message || this.seen.has(message.externalMessageId)) continue;
          this.seen.add(message.externalMessageId);
          try {
            const view = await this.pipeline.process(message, botName);
            this.logger.log(`Da xu ly tin ${message.externalMessageId} -> intent=${view.intent}`);
          } catch (error) {
            this.logger.error(`Loi xu ly tin: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      } catch (error) {
        this.logger.warn(`Loi mang getUpdates: ${error instanceof Error ? error.message : String(error)}`);
        await sleep(3000);
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
