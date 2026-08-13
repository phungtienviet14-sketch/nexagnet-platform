import {
  Injectable,
  Logger,
  Optional,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import {
  channelMessageSchema,
  loadEnv,
  type AppEnv,
  type ChannelMessage,
  type Intent,
} from '@netviet/shared';
import { AUTO_LABEL } from '../channels/auto-label.js';
import { OutboundChannelRouter } from '../channels/outbound-channel.router.js';
import {
  callBotApi,
  normalizeUpdates,
  type BotQuotedMessage,
  type BotUpdate,
} from '../channels/zalo-bot.client.js';
import { ZaloUserClient } from '../channels/zalo-user.client.js';
import { resolveBotName } from '../channels/bot-name.js';
import { PipelineService } from '../pipeline/pipeline.service.js';
import { toHttpUrl } from './http-url.js';
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

export function isBotChannelActive(mode: AppEnv['CHANNEL_MODE']): boolean {
  return mode === 'bot' || mode === 'hybrid';
}

export interface BotPollerStatus {
  state: 'disabled' | 'running' | 'degraded';
  transport: 'long_poll';
  received: number;
  processed: number;
  failed: number;
  lastSuccessfulPollAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
}

/**
 * Bot chinh thuc chi doc tin NHOM. Cong "nhom da map dai ly" da chuyen xuong
 * PipelineService.intake (04/08/2026): truoc day no chan ca viec LUU tin, ma Zalo khong phat lai
 * -> tin @mention cua nhom chua map mat vinh vien.
 */
export function isAllowedBotMessage(message: ChannelMessage): boolean {
  return message.chatType === 'group';
}

/**
 * Trong hybrid, allowlist ma nguoi van hanh chon luc dang nhap phai chi phoi CA HAI kenh.
 * Truoc 04/08/2026 chi ZcaListener kiem allowlist, nen mot nhom operator CO Y khong chon van
 * duoc xu ly qua kenh Bot neu tinh co da map trong DB.
 *
 * Bot thuan (khong co phien zca -> allowlist rong) thi KHONG ap: ap vao la chan sach ca kenh.
 * Vi vay dieu kien la "allowlist dang co hieu luc", khong phai "co trong allowlist".
 */
export function shouldAcceptBotMessage(
  message: ChannelMessage,
  ctx: {
    mode: AppEnv['CHANNEL_MODE'];
    allowlistActive: boolean;
    isAllowed: (chatId: string) => boolean;
  },
): boolean {
  if (!isAllowedBotMessage(message)) return false;
  if (ctx.mode !== 'hybrid' || !ctx.allowlistActive) return true;
  return ctx.isAllowed(message.externalChatId);
}

/**
 * Chuyen 1 update Zalo -> ChannelMessage chuan; null neu bo qua (tin bot, khong co ca chu lan anh).
 *
 * Anh gui TRAN (khong caption) van duoc GIU voi `text` rong (Dot A' 11/08/2026): link anh Zalo
 * bi xoa phia server sau <=35 ngay, khong luu hom nay la mat vinh vien.
 */
export function updateToChannelMessage(update: BotUpdate): ChannelMessage | null {
  const m = update.message;
  if (!m || !m.chat?.id || m.from?.is_bot) return null;
  const text = m.text ?? m.caption ?? '';
  // photo_url la can cu duy nhat de giu tin khong caption, nen phai kiem TRUOC: mot URL hong
  // di thang vao schema se lam safeParse rot CA tin — ke ca tin co chu (song song toHttpUrl
  // ben zca-message.ts).
  const imageUrl = toHttpUrl(m.photo_url);
  if (!text.trim() && !imageUrl) return null;

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
    imageUrl,
    sentAt: m.date ? new Date(m.date) : new Date(),
    replyTo: quoteToReply(m.reply_to_message),
  };
  const parsed = channelMessageSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/**
 * Song song `quoteToReply` ben zca-message.ts: tin tra loi la can cu de parser hieu "them 5 cai
 * nua" tro ve dung SKU. Thieu du lieu thi tra undefined — khong co ngu canh con an toan hon
 * ngu canh doan bua (contextual-parse se fail-safe ve intent `khac`).
 */
function quoteToReply(quote: BotQuotedMessage | undefined): ChannelMessage['replyTo'] {
  if (!quote) return undefined;
  const text = (quote.text ?? quote.caption)?.trim() || undefined;
  const imageUrl = toHttpUrl(quote.photo_url);
  if (!quote.message_id && !text && !imageUrl) return undefined;
  return {
    externalMessageId: quote.message_id,
    text,
    imageUrl,
    senderExternalId: quote.from?.id,
    senderDisplayName: quote.from?.display_name,
    sentAt: quote.date ? new Date(quote.date) : undefined,
  };
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
  private telemetry: BotPollerStatus = {
    state: 'disabled',
    transport: 'long_poll',
    received: 0,
    processed: 0,
    failed: 0,
    lastSuccessfulPollAt: null,
    lastErrorAt: null,
    lastError: null,
  };

  constructor(
    private readonly pipeline: PipelineService,
    private readonly outbound: OutboundChannelRouter,
    // Chi de doc allowlist trong hybrid. @Optional() vi bot thuan khong co phien zca nao.
    @Optional() private readonly zca?: ZaloUserClient,
  ) {}

  onModuleInit(): void {
    const env = loadEnv();
    if (!isBotChannelActive(env.CHANNEL_MODE) || !env.ZALO_BOT_TOKEN) {
      this.logger.log('BotPoller nghi: kenh hien tai khong bat Bot Platform hoac thieu token.');
      return;
    }
    this.running = true;
    this.telemetry = { ...this.telemetry, state: 'running' };
    void this.loop(env.ZALO_BOT_TOKEN, resolveBotName(), env.AUTO_ACK, env.CHANNEL_MODE);
    this.logger.log(`BOT_MODE=on -> bat dau long polling getUpdates. Auto-ack=${env.AUTO_ACK}.`);
  }

  onModuleDestroy(): void {
    this.running = false;
    this.telemetry = { ...this.telemetry, state: 'disabled' };
  }

  status(): BotPollerStatus {
    return { ...this.telemetry };
  }

  private async loop(
    token: string,
    botName: string,
    autoAck: 'on' | 'off',
    mode: AppEnv['CHANNEL_MODE'],
  ): Promise<void> {
    while (this.running) {
      try {
        const res = await callBotApi(token, 'getUpdates', { timeout: 20 });
        if (!res.ok) {
          if (res.error_code === 408) {
            // Long-poll timeout rong la heartbeat THANH CONG: API Bot da nhan request va khong co
            // update. Ghi lai de readiness phan biet poll loop moi khoi dong voi transport da duoc
            // chung minh song.
            this.recordPollSuccess();
            continue;
          }
          this.recordFailure(`getUpdates ${res.error_code}: ${res.description}`);
          this.logger.warn(`getUpdates loi ${res.error_code}: ${res.description}`);
          await sleep(3000);
          continue;
        }
        this.recordPollSuccess();
        for (const update of normalizeUpdates(res.result)) {
          const message = updateToChannelMessage(update);
          if (!message) continue;
          this.telemetry = { ...this.telemetry, received: this.telemetry.received + 1 };
          const allowedGroupIds = this.zca?.status().allowedGroupIds ?? [];
          const accepted = shouldAcceptBotMessage(message, {
            mode,
            allowlistActive: allowedGroupIds.length > 0,
            isAllowed: (chatId) => allowedGroupIds.includes(chatId),
          });
          if (!accepted) {
            this.logger.warn(
              `Bo qua tin Bot Platform (khong phai nhom hoac ngoai allowlist): ${message.externalChatId}`,
            );
            continue;
          }
          const id = message.externalMessageId;
          if (!this.guard.claim(id)) continue;

          const result = await processWithRetry(
            () => this.pipeline.intake(message, botName),
            id,
            this.logger,
          );
          if (!result) {
            // That bai het luot -> KHONG danh dau. Tin con duong chay lai (khong nuot don im lang).
            this.guard.release(id);
            this.recordFailure(`Pipeline that bai sau retry: ${id}`);
            continue;
          }
          // Bo qua CO CHU Y (da luu chua map / trung / thanh vien ignore) van la "xong".
          this.guard.complete(id);
          this.telemetry = { ...this.telemetry, processed: this.telemetry.processed + 1 };
          if (result.outcome !== 'processed') {
            this.logger.log(`Tin ${id} -> ${result.outcome} (khong tao don)`);
            continue;
          }
          this.logger.log(`Da xu ly tin ${id} -> intent=${result.view.intent}`);
          if (shouldAutoAck(result.view.intent, autoAck)) {
            await this.sendAutoAck(message.externalChatId);
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.recordFailure(message);
        this.logger.warn(`Loi mang getUpdates: ${message}`);
        await sleep(3000);
      }
    }
  }

  private recordPollSuccess(): void {
    this.telemetry = {
      ...this.telemetry,
      state: 'running',
      lastSuccessfulPollAt: new Date().toISOString(),
      lastError: null,
    };
  }

  private recordFailure(message: string): void {
    this.telemetry = {
      ...this.telemetry,
      state: 'degraded',
      failed: this.telemetry.failed + 1,
      lastErrorAt: new Date().toISOString(),
      lastError: message,
    };
  }

  /** Gui tin auto-ack (best-effort): loi khong lam gian doan doc tin, tin da luu tren app. */
  private async sendAutoAck(chatId: string): Promise<void> {
    try {
      await this.outbound.sendMessage('bot', chatId, AUTO_ACK_TEXT + AUTO_LABEL);
      this.logger.log(`Da gui auto-ack (intent=khac) toi ${chatId}`);
    } catch (error) {
      this.logger.warn(`Gui auto-ack that bai: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
