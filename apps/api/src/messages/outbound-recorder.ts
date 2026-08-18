import { randomUUID } from 'node:crypto';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { channelMessageSchema, type SenderRole } from '@netviet/shared';
import { MessagesRepository } from './messages.repository.js';

/** Cai kenh tra ve sau khi gui. `externalMessageId` co the vang neu kenh khong cap id. */
export interface OutboundReceipt {
  externalMessageId?: string;
}

export interface OutboundRecord {
  chatId: string;
  text: string;
  receipt: OutboundReceipt;
  /** Mac dinh 'bot'. Dat 'sale' khi tin do nguoi that soan va bam gui. */
  senderRole?: SenderRole;
  sentAt?: Date;
}

/**
 * Luu lai tin HE THONG DA GUI, de vong sau bot doc duoc chinh cau tra loi cua no.
 *
 * Truoc Pha 1 (18/08/2026) khong co gi lam viec nay: `messages.save()` chi duoc goi tu
 * pipeline khi nhan tin vao. Nen "lich su hoi thoai" dua cho LLM chi co ve cua khach —
 * mat han ve cua minh. Do la nguyen nhan lon nhat cua "bot lap lai chinh no" va khong hieu
 * "cai do", "vay gia bao nhieu".
 *
 * FAIL-SAFE (cung khuon voi ClaudeAdviceComposer): ghi hong thi CHI log. Tin da den tay khach
 * roi — nem loi o day chi lam vo luong gui, khong cuu duoc gi.
 */
@Injectable()
export class OutboundRecorder {
  private readonly logger = new Logger('OutboundRecorder');

  constructor(@Optional() private readonly messages?: MessagesRepository) {}

  async record(record: OutboundRecord): Promise<void> {
    if (!this.messages) return;
    const text = record.text.trim();
    // Tin rong khong mang thong tin gi cho mach hoi thoai, chi lam ban DB va ton token.
    if (!text) return;
    try {
      const parsed = channelMessageSchema.safeParse({
        // Khong co id tu kenh thi sinh id rieng: van phai luu duoc, khong duoc bo mat tin.
        // Tien to `out:` de nhin la biet day khong phai id Zalo that.
        externalMessageId: record.receipt.externalMessageId ?? `out:${randomUUID()}`,
        platform: 'zalo',
        source: 'system_outbound',
        // GĐ1 chi gui vao nhom da map (xem OrdersService/CampaignService), nen 'group' dung
        // voi moi duong gui hien co. Doi khi mo kenh 1-1 thi truyen vao tu cho goi.
        chatType: 'group',
        externalChatId: record.chatId,
        text,
        sentAt: record.sentAt ?? new Date(),
      });
      if (!parsed.success) {
        this.logger.warn(`Tin outbound khong hop schema, bo qua: ${parsed.error.message}`);
        return;
      }
      await this.messages.save(parsed.data, {
        direction: 'outbound',
        senderRole: record.senderRole ?? 'bot',
      });
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Luu tin da gui that bai (tin VAN da den khach): ${detail}`);
    }
  }
}
