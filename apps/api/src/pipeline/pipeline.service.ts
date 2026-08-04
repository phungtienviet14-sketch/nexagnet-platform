import { Injectable, Logger, Optional } from '@nestjs/common';
import { loadEnv, type ChannelMessage, type OrderView, type SenderType } from '@ultty/shared';
import { AgentOrchestrator } from '../agents/agent-orchestrator.service.js';
import { GroupParticipantsRepository } from '../groups/group-participants.repository.js';
import { MessagesRepository, type SaveMessageResult } from '../messages/messages.repository.js';
import { OrdersService } from '../orders/orders.service.js';
import { RuntimeSettingsService } from '../runtime/runtime-settings.service.js';

/**
 * Tang 3+4 — adapter mong uy quyen cho AgentOrchestrator (multi-agent 6 con).
 * Giu chu ky process(message, botName) de DemoController/BotPoller khong doi.
 *
 * AUTO_SEND (GD2): neu bat, AI TU CHOT don + gui xac nhan vao nhom (khong can Sale) —
 * CHI khi Giam sat khong phat hien rui ro; co van de -> giu Sale duyet. Mac dinh off.
 */
@Injectable()
export class PipelineService {
  private readonly logger = new Logger('PipelineService');

  constructor(
    private readonly orchestrator: AgentOrchestrator,
    @Optional() private readonly orders?: OrdersService,
    @Optional() private readonly messages?: MessagesRepository,
    @Optional() private readonly settings?: RuntimeSettingsService,
    @Optional() private readonly participants?: GroupParticipantsRepository,
  ) {}

  async process(
    message: ChannelMessage,
    botName: string | undefined,
    opts: { orderId?: string; rerun?: boolean; allowDuplicateSkip: true },
  ): Promise<OrderView | null>;
  async process(
    message: ChannelMessage,
    botName?: string,
    opts?: { orderId?: string; rerun?: boolean },
  ): Promise<OrderView>;
  async process(
    message: ChannelMessage,
    botName?: string,
    opts?: { orderId?: string; rerun?: boolean; allowDuplicateSkip?: boolean },
  ): Promise<OrderView | null> {
    const participant =
      message.senderExternalId && this.participants
        ? await this.participants.findBySender(message.externalChatId, message.senderExternalId)
        : null;
    if (participant?.handlingMode === 'ignore') {
      this.logger.log(
        `Bo qua tin cua thanh vien ignore: group=${message.externalChatId}, sender=${message.senderExternalId}`,
      );
      return null;
    }
    // Luu tin TRUOC khi qua pipeline (NĐ13 + chong mat don khi Zalo khoa kenh);
    // rerun khong phai tin moi -> khong luu lai. Loi luu KHONG chan xu ly.
    const saved = opts?.rerun ? null : await this.saveMessage(message);
    // Kho ben vung la cong idempotency giua hai worker/qua restart. Tin da co nghia la
    // mot worker khac da nhan quyen xu ly; khong goi LLM va khong tao don thu hai.
    if (saved?.duplicate) return null;
    const senderTypeOverride = participantRankToSenderType(participant?.customerRank);
    const view = await this.orchestrator.run(message, botName, {
      ...opts,
      ...(senderTypeOverride ? { senderTypeOverride } : {}),
    });
    if (saved) await this.linkOrder(view.id, saved.id);

    if (this.shouldAutoSend(view, participant?.handlingMode === 'manual_review') && this.orders) {
      try {
        this.logger.log(`[AUTO_SEND] AI tu chot ${view.id} (Giam sat: khong rui ro)`);
        // approve = gui xac nhan Zalo + day KiotViet + phat order.updated. Loi gui (H1) ->
        // giu pending_review de Sale duyet lai (khong ket, khong mat don).
        return await this.orders.approve(view.id);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        this.logger.warn(`[AUTO_SEND] that bai cho ${view.id} — giu Sale duyet: ${detail}`);
        return view;
      }
    }
    return view;
  }

  /** Luu tin qua MessagesRepository (neu co cau hinh); that bai chi log — pipeline van chay. */
  private async saveMessage(message: ChannelMessage): Promise<SaveMessageResult | null> {
    if (!this.messages) return null;
    try {
      const result = await this.messages.save(message);
      if (result.duplicate) {
        this.logger.warn(
          `Tin trung ${message.platform}:${message.externalMessageId} — da co trong DB, khong tao dong moi.`,
        );
      }
      return result;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.error(`Luu tin ${message.externalMessageId} that bai (pipeline van chay): ${detail}`);
      return null;
    }
  }

  /** Noi don voi tin goc (FK orders.messageId); khong co dong don (vd hoi dap) -> bo qua. */
  private async linkOrder(orderId: string, messageId: string): Promise<void> {
    try {
      await this.messages?.attachOrder(orderId, messageId);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Noi don ${orderId} voi tin ${messageId} that bai: ${detail}`);
    }
  }

  /**
   * Auto-send chi khi: bat AUTO_SEND, la DON da dinh gia, va Giam sat (rule engine tat dinh)
   * bao KHONG rui ro. watch/escalate deu coi la "co van de" -> giu Sale duyet.
   */
  private shouldAutoSend(view: OrderView, manualReview = false): boolean {
    return (
      !manualReview &&
      (this.settings?.autoSend() ?? loadEnv().AUTO_SEND) === 'on' &&
      view.intent === 'dat_don' &&
      view.priced !== null &&
      view.trace?.supervisor.riskLevel === 'none'
    );
  }
}

function participantRankToSenderType(
  rank: 'dai_ly' | 'ctv' | 'khach_le' | 'unknown' | undefined,
): SenderType | undefined {
  return rank && rank !== 'unknown' ? rank : undefined;
}
