import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { channelMessageSchema, loadEnv, type ChannelMessage, type Intent } from '@ultty/shared';
import { AUTO_LABEL } from '../channels/auto-label.js';
import { ChannelAdapter } from '../channels/channel-adapter.js';
import { callBotApi, normalizeUpdates, type BotUpdate } from '../channels/zalo-bot.client.js';
import { PipelineService } from '../pipeline/pipeline.service.js';
import { MessageGuard, processWithRetry } from './message-guard.js';

/** Tin auto-ack khi LLM khong hieu (intent=Khac). Gan them AUTO_LABEL khi gui. */
export const AUTO_ACK_TEXT = 'Đã ghi nhận, Sale sẽ phản hồi anh/chị sớm ạ';

/**
 * Chi auto-ack khi: bat cong tac (AUTO_ACK=on) VA intent la 'khac' (LLM khong hieu).
 * Cac intent khac (hoi gia, van chuyen...) da hieu -> Sale xu ly, khong ack.
 * Ham thuan de test de dang.
 */
export function shouldAutoAck(intent: Intent, mode: 'on' | 'off'): boolean {
  return mode === 'on' && intent === 'khac';
}

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
 *
 * Chong mat tin: tin CHI duoc danh dau da xu ly khi pipeline chay xong THANH CONG (xem MessageGuard).
 */
@Injectable()
export class BotPoller implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('BotPoller');
  private running = false;
  private readonly guard = new MessageGuard();

  constructor(
    private readonly pipeline: PipelineService,
    private readonly channel: ChannelAdapter,
  ) {}

  onModuleInit(): void {
    const env = loadEnv();
    if (env.CHANNEL_MODE !== 'bot' || !env.ZALO_BOT_TOKEN) {
      this.logger.log('CHANNEL_MODE != bot (hoac thieu token) -> BotPoller nghi (dung /demo/simulate hoac kenh zca).');
      return;
    }
    this.running = true;
    void this.loop(env.ZALO_BOT_TOKEN, env.BOT_NAME, env.AUTO_ACK);
    this.logger.log(`BOT_MODE=on -> bat dau long polling getUpdates. Auto-ack=${env.AUTO_ACK}.`);
  }

  onModuleDestroy(): void {
    this.running = false;
  }

  private async loop(token: string, botName: string, autoAck: 'on' | 'off'): Promise<void> {
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
          if (!message) continue;
          const id = message.externalMessageId;
          if (!this.guard.claim(id)) continue;

          const view = await processWithRetry(
            () => this.pipeline.process(message, botName),
            id,
            this.logger,
          );
          if (!view) {
            // That bai het luot -> KHONG danh dau. Tin con duong chay lai (khong nuot don im lang).
            this.guard.release(id);
            continue;
          }
          this.guard.complete(id);
          this.logger.log(`Da xu ly tin ${id} -> intent=${view.intent}`);
          if (shouldAutoAck(view.intent, autoAck)) {
            await this.sendAutoAck(message.externalChatId);
          }
        }
      } catch (error) {
        this.logger.warn(`Loi mang getUpdates: ${error instanceof Error ? error.message : String(error)}`);
        await sleep(3000);
      }
    }
  }

  /** Gui tin auto-ack (best-effort): loi khong lam gian doan doc tin, tin da luu tren app. */
  private async sendAutoAck(chatId: string): Promise<void> {
    try {
      await this.channel.sendMessage(chatId, AUTO_ACK_TEXT + AUTO_LABEL);
      this.logger.log(`Da gui auto-ack (intent=khac) toi ${chatId}`);
    } catch (error) {
      this.logger.warn(`Gui auto-ack that bai: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
