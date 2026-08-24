import { Inject, Injectable, Optional } from '@nestjs/common';
import type { ChannelCapabilities, OutboundContent, ReplyChannel, SenderRole } from '@netviet/shared';
import { OutboundRecorder, type OutboundReceipt } from '../messages/outbound-recorder.js';
import { TelemetryService } from '../observability/telemetry.service.js';
import { CHANNEL_DECISIONS, type ChannelSendReason } from './channel-decisions.js';
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
    /** Vang mat -> khong quan sat, gui van chay y het (muc 20). */
    @Optional() private readonly telemetry?: TelemetryService,
  ) {}

  async sendMessage(
    replyChannel: ReplyChannel | undefined,
    chatId: string,
    text: string,
    senderRole: SenderRole = 'bot',
    options?: SendOptions,
  ): Promise<OutboundReceipt> {
    if (!replyChannel) {
      this.record('unknown', 'REPLY_CHANNEL_MISSING', { textLength: text.length });
      throw new Error('Thieu replyChannel: tu choi doan kenh gui');
    }
    const adapter = this.adapter(replyChannel);
    return this.observed('channel.send', adapter.name, async () => {
      const receipt = await adapter.sendMessage(chatId, text, options);
      await this.remember(chatId, text, receipt, senderRole);
      this.record(adapter.name, 'SENT', {
        // DO DAI, khong phai NOI DUNG: cau hoi o bien gioi nay la "da gui duoc chua, ai tu choi",
        // khong phai "da noi gi" — van ban da nam trong `Message` outbound va o ban ghi advisor.
        textLength: text.length,
        hasQuote: Boolean(options?.quote),
        senderRole,
        ...(receipt.externalMessageId ? { hasExternalId: true } : {}),
      });
      return receipt;
    });
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
    if (!replyChannel) {
      this.record('unknown', 'REPLY_CHANNEL_MISSING', { textLength: content.text.length });
      throw new Error('Thieu replyChannel: tu choi doan kenh gui');
    }
    const adapter = this.adapter(replyChannel);
    if (content.images?.length && !adapter.capabilities.image) {
      this.record(adapter.name, 'CAPABILITY_UNSUPPORTED', { images: content.images.length });
      throw new Error(`Kênh ${adapter.name} không hỗ trợ ảnh outbound`);
    }
    return this.observed('channel.send', adapter.name, async () => {
      const receipt = await adapter.sendContent(chatId, content, options);
      // Luu phan CHU: anh/link da nam trong text hoac di kem, con mach hoi thoai can van ban.
      await this.remember(chatId, content.text, receipt, senderRole);
      this.record(adapter.name, 'SENT', {
        textLength: content.text.length,
        images: content.images?.length ?? 0,
        links: content.links?.length ?? 0,
        senderRole,
      });
      return receipt;
    });
  }

  /**
   * RANH GIOI QUAN SAT cua moi duong gui ra (24/08/2026).
   *
   * Truoc do buoc `outbound.send_confirmation` chi do duoc thanh/bai TONG THE: mot lan hong vi
   * Zalo tra 429 va mot lan hong vi tai khoan chua dang nhap trong y het nhau tren trace, ma hai
   * chuyen do doi hai hanh dong sua khac han. `channel.send` boc dung lan goi adapter, nen ma
   * loi cua adapter tro thanh mot nhanh doc duoc thay vi mot dong `error` chung chung.
   */
  private observed<T>(name: string, adapterName: string, fn: () => Promise<T>): Promise<T> {
    if (!this.telemetry) return fn();
    return this.telemetry.step(name, async () => {
      try {
        return await fn();
      } catch (error) {
        this.record(adapterName, 'ADAPTER_FAILED', {
          errorName: error instanceof Error ? error.name : 'UnknownError',
          // Thong bao loi di qua bo loc telemetry (`sanitizeAttributes`) truoc khi ra ngoai, nen
          // mot chuoi ket noi hay mot `Bearer` lo trong do van bi che.
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    });
  }

  private record(
    adapterName: string,
    reason: ChannelSendReason,
    detail: Readonly<Record<string, unknown>>,
  ): void {
    this.telemetry?.decision({
      vocabulary: CHANNEL_DECISIONS,
      point: 'channel.send',
      outcome: reason === 'SENT' ? 'allowed' : 'denied',
      reason,
      detail: { adapter: adapterName, ...detail },
    });
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
