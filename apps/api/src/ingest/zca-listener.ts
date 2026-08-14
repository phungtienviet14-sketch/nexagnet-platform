import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { loadEnv, type AppEnv } from '@netviet/shared';
import type { Message } from 'zca-js';
import { AUTO_LABEL } from '../channels/auto-label.js';
import { resolveBotName } from '../channels/bot-name.js';
import { BotIdentityService } from '../channels/bot-identity.service.js';
import { OutboundChannelRouter } from '../channels/outbound-channel.router.js';
import { ZaloUserClient } from '../channels/zalo-user.client.js';
import { PipelineService } from '../pipeline/pipeline.service.js';
import { AUTO_ACK_TEXT, shouldAutoAck } from './bot-poller.js';
import { MessageGuard, processWithRetry } from './message-guard.js';
import { decideZcaMessageOwnership } from './message-ownership.js';
import { zcaMessageToChannelMessage } from './zca-message.js';

export function isZcaChannelActive(mode: AppEnv['CHANNEL_MODE']): boolean {
  return mode === 'zca' || mode === 'hybrid';
}

/**
 * Tang 2 — worker doc tin qua zca-js (userbot ca nhan). Chi chay khi CHANNEL_MODE=zca.
 * Khac Bot Platform: nghe MOI tin trong nhom (khong bi mention-gating) -> tin nao cung vao pipeline.
 * Dang ky handler voi ZaloUserClient (client lo dang nhap + giu phien); map -> pipeline.process.
 *
 * Chong mat tin: tin CHI duoc danh dau da xu ly khi pipeline chay xong THANH CONG (xem MessageGuard).
 */
@Injectable()
export class ZcaListener implements OnModuleInit {
  private readonly logger = new Logger('ZcaListener');
  private readonly guard = new MessageGuard();
  private identityWarningEmitted = false;

  constructor(
    private readonly pipeline: PipelineService,
    private readonly client: ZaloUserClient,
    private readonly outbound: OutboundChannelRouter,
    private readonly botIdentity: BotIdentityService,
  ) {}

  onModuleInit(): void {
    const env = loadEnv();
    if (!isZcaChannelActive(env.CHANNEL_MODE)) {
      this.logger.log(`CHANNEL_MODE=${env.CHANNEL_MODE} -> khong nghe tin qua zca-js.`);
      return;
    }
    const selfListen = env.ZALO_SELF_LISTEN === 'on';
    this.client.setMessageHandler((message) =>
      this.handle(message, resolveBotName(), env.AUTO_ACK, selfListen, env.CHANNEL_MODE === 'hybrid'),
    );
    this.logger.log(
      `CHANNEL_MODE=${env.CHANNEL_MODE} -> nghe tin nhom qua zca-js. Auto-ack=${env.AUTO_ACK}`,
    );
  }

  private async handle(
    message: Message,
    botName: string,
    autoAck: 'on' | 'off',
    selfListen: boolean,
    hybrid: boolean,
  ): Promise<void> {
    if (hybrid) {
      const officialBotId = await this.botIdentity.resolveId();
      const ownership = decideZcaMessageOwnership(message, officialBotId);
      if (ownership === 'identity_unavailable') {
        if (!this.identityWarningEmitted) {
          this.identityWarningEmitted = true;
          this.logger.error('Khong xac dinh duoc Bot ID -> zca fail closed, khong xu ly tin hybrid.');
        }
        return;
      }
      if (ownership !== 'process_with_zca') return;
    }
    const channelMessage = zcaMessageToChannelMessage(message, selfListen);
    if (!channelMessage) return;
    // ZCA thay moi tin cua tai khoan. Mac dinh deny: chi nhom operator da chon moi duoc
    // luu/dua sang Flowise + DeepSeek, tranh ro tin ca nhan va dot chi phi ngoai y muon.
    if (!this.client.isGroupAllowed(channelMessage.externalChatId)) return;
    // Cong "nhom da map dai ly" KHONG con o day: no chan ca viec LUU tin, ma Zalo khong phat
    // lai -> tin cua nhom chua map mat vinh vien (phat hien 04/08/2026). Gio PipelineService.intake
    // luu truoc roi moi quyet dinh co dua noi dung sang parser hay khong.
    const id = channelMessage.externalMessageId;
    if (!this.guard.claim(id)) return;

    const result = await processWithRetry(
      (attempt) =>
        this.pipeline.intake(channelMessage, botName, { retryPersisted: attempt > 1 }),
      id,
      this.logger,
    );
    if (!result) {
      // That bai het luot -> KHONG danh dau. Tin con duong chay lai (khong nuot don im lang).
      this.guard.release(id);
      return;
    }
    // Bo qua CO CHU Y (da luu chua map / trung / thanh vien ignore) van la "xong" — danh dau de
    // khong chay lai vo han. Ngoai le duy nhat khong danh dau la nhanh `!result` o tren.
    this.guard.complete(id);
    if (result.outcome !== 'processed') {
      this.logger.log(`Tin ${id} -> ${result.outcome} (khong tao don)`);
      return;
    }
    this.logger.log(`Da xu ly tin ${id} -> intent=${result.view.intent}`);
    if (shouldAutoAck(result.view.intent, autoAck)) {
      await this.sendAutoAck(channelMessage.externalChatId);
    }
  }

  /** Gui tin auto-ack (best-effort): loi khong lam gian doan doc tin. */
  private async sendAutoAck(chatId: string): Promise<void> {
    try {
      await this.outbound.sendMessage('zca', chatId, AUTO_ACK_TEXT + AUTO_LABEL);
      this.logger.log(`Da gui auto-ack (intent=khac) toi ${chatId}`);
    } catch (error) {
      this.logger.warn(`Gui auto-ack that bai: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
