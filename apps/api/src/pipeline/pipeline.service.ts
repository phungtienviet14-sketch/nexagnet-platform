import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  loadEnv,
  type ChannelMessage,
  type GroupParticipant,
  type OrderView,
  type SenderType,
} from '@netviet/shared';
import { tenantOrderAutomation } from '@netviet/tenant';
import { AgentOrchestrator } from '../agents/agent-orchestrator.service.js';
import { GroupDiscoveryService } from '../groups/group-discovery.service.js';
import { GroupParticipantsRepository } from '../groups/group-participants.repository.js';
import { KnowledgeService } from '../knowledge/knowledge.service.js';
import { MediaFetcherService } from '../media/media-fetcher.service.js';
import { MessagesRepository, type SaveMessageResult } from '../messages/messages.repository.js';
import { ConversationContextBuilder } from '../messages/conversation-context.js';
import { OrdersService } from '../orders/orders.service.js';
import { RuntimeSettingsService } from '../runtime/runtime-settings.service.js';
import { shouldAutoConfirmOrder } from './order-auto-confirmation.js';

/**
 * Ket qua nhan tin CO NHAN. Truoc 04/08/2026 `process()` tra `null` cho ca "bo qua co chu y"
 * lan "that bai", nen listener goi `guard.release()` cho ca hai — tuc coi viec bo qua la loi
 * va de tin chay lai. Nhan ro rang lam hai truong hop khong the lan nhau nua.
 */
export type IntakeOutcome = 'processed' | 'stored_only' | 'duplicate' | 'ignored';

/**
 * Union phan biet: chi `processed` moi co `view`. Ben goi khong the doc `view` cua mot tin
 * chua qua parser ma khong bi TypeScript chan — bat bien nam trong kieu, khong nam o quy uoc.
 */
export type IntakeResult =
  | { outcome: 'processed'; view: OrderView }
  | { outcome: Exclude<IntakeOutcome, 'processed'>; view?: undefined };

/**
 * Tang 3+4 — adapter mong uy quyen cho AgentOrchestrator (multi-agent 6 con).
 * Giu chu ky process(message, botName) de DemoController/BotPoller khong doi.
 *
 * GĐ1: policy tenant quyet dinh gioi han tu xac nhan; AUTO_SEND chi la kill switch van hanh.
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
    @Optional() private readonly knowledge?: KnowledgeService,
    @Optional() private readonly groupDiscovery?: GroupDiscoveryService,
    @Optional() private readonly media?: MediaFetcherService,
    @Optional() private readonly conversationContext?: ConversationContextBuilder,
  ) {}

  /**
   * Cong vao cho hai worker doc tin (ZcaListener, BotPoller).
   *
   * Thu tu BAT BUOC — luu truoc, loc parser sau: nhom nam trong allowlist thi tin LUON duoc
   * ghi DB (CLAUDE.md: "Luu moi tin nhan/don ve DB ngay khi nhan"), rieng viec dua NOI DUNG
   * sang parser/LLM moi doi nhom da map dai ly. Truoc 04/08/2026 hai listener chan ca hai buoc
   * cung luc nen tin cua nhom chua map bi VUT — ma Zalo khong phat lai.
   */
  async intake(message: ChannelMessage, botName?: string): Promise<IntakeResult> {
    const participant = await this.findParticipant(message);
    if (participant?.handlingMode === 'ignore') {
      // Nguoi van hanh CHU DONG loai nguoi nay -> khong luu, khong xu ly (khac han "chua cau hinh").
      this.logger.log(
        `Bo qua tin cua thanh vien ignore: group=${message.externalChatId}, sender=${message.senderExternalId}`,
      );
      return { outcome: 'ignored' };
    }

    const saved = await this.saveMessage(message);
    if (saved?.duplicate) return { outcome: 'duplicate' };

    await this.observeGroup(message.externalChatId);
    // Chay cho CA nhom chua map: chi noi dung bi chan khoi LLM, con danh tinh nguoi nhan tin thi
    // khong — do la thu duy nhat dung duoc de dung danh sach thanh vien.
    await this.recordSender(message);

    if (!this.isGroupMapped(message.externalChatId)) {
      this.logger.warn(
        `Nhom chua map nguon su that: ${message.externalChatId} — tin DA LUU, chua dua sang parser. ` +
          'Chon dai ly cho nhom nay o /settings de bat xu ly don.',
      );
      return { outcome: 'stored_only' };
    }

    const view = await this.runPipeline(message, botName, participant, saved);
    return { outcome: 'processed', view };
  }

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
    const participant = await this.findParticipant(message);
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
    return this.runPipeline(message, botName, participant, saved, opts);
  }

  /** Phan chung cua `intake` va `process`: chay 6 agent, noi don voi tin, xet auto-send. */
  private async runPipeline(
    message: ChannelMessage,
    botName: string | undefined,
    participant: GroupParticipant | null,
    saved: SaveMessageResult | null,
    opts?: { orderId?: string; rerun?: boolean; allowDuplicateSkip?: boolean },
  ): Promise<OrderView> {
    const senderTypeOverride = participantRankToSenderType(participant?.customerRank);
    const conversationContext = await this.conversationContext?.build(message);
    const view = await this.orchestrator.run(message, botName, {
      ...opts,
      ...(senderTypeOverride ? { senderTypeOverride } : {}),
      ...(conversationContext ? { conversationContext } : {}),
    });
    if (saved) await this.linkOrder(view.id, saved.id);

    if (this.shouldAutoSend(view, participant?.handlingMode === 'manual_review') && this.orders) {
      try {
        this.logger.log(`[AUTO_SEND] Tu xac nhan ${view.id} theo policy tenant`);
        return await this.orders.sendConfirmation(view.id);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        this.logger.warn(`[AUTO_SEND] that bai cho ${view.id} — giu Sale duyet: ${detail}`);
        return view;
      }
    }
    if (
      this.shouldAutoReplyProduct(view, participant?.handlingMode === 'manual_review') &&
      this.orders
    ) {
      try {
        this.logger.log(`[AUTO_SEND] Tư vấn sản phẩm ${view.id} từ content active`);
        return await this.orders.sendProductAdvice(view.id);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        this.logger.warn(`[AUTO_SEND] tư vấn thất bại cho ${view.id}: ${detail}`);
      }
    }
    return view;
  }

  private async findParticipant(message: ChannelMessage): Promise<GroupParticipant | null> {
    if (!message.senderExternalId || !this.participants) return null;
    return this.participants.findBySender(message.externalChatId, message.senderExternalId);
  }

  /**
   * Ghi nhan nhom vao nguon su that. Loi KHONG duoc lam gian doan xu ly tin (bat bien I6):
   * metadata nhom quan trong hon khong don hang.
   */
  private async observeGroup(chatId: string): Promise<void> {
    if (!this.groupDiscovery) return;
    try {
      await this.groupDiscovery.observe(chatId);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Ghi nhan nhom ${chatId} that bai (xu ly tin van tiep tuc): ${detail}`);
    }
  }

  /**
   * Ghi nhan nguoi vua nhan tin vao danh sach thanh vien. Ca zca lan Bot Platform deu kem uid +
   * ten nguoi gui o MOI tin, ma truoc 04/08/2026 hai truong nay chi duoc luu vao bang Message roi
   * bo do — trong khi tab thanh vien khong dung duoc vi Zalo tra danh sach rong.
   *
   * Loi KHONG chan xu ly don (I6).
   */
  private async recordSender(message: ChannelMessage): Promise<void> {
    const externalUserId = message.senderExternalId;
    const displayName = message.senderDisplayName?.trim();
    // Thieu ten thi khong tao ho so rong — de lan sau co ten day du roi ghi.
    if (!externalUserId || !displayName || !this.participants) return;
    try {
      await this.participants.recordSeen(
        message.externalChatId,
        { externalUserId, displayName },
        new Date().toISOString(),
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Ghi nhan nguoi gui ${externalUserId} that bai: ${detail}`);
    }
  }

  /**
   * FAIL CLOSED: khong co KnowledgeService thi KHONG the xac minh nhom da map, ma doan "da map"
   * dong nghia voi day PII cua nhom la sang LLM. Chua xac minh duoc -> coi nhu chua map: tin van
   * duoc LUU day du, chi khong qua parser. Cung nguyen tac voi decideZcaMessageOwnership khi
   * mat Bot ID (message-ownership.ts).
   */
  private isGroupMapped(chatId: string): boolean {
    if (!this.knowledge) return false;
    return this.knowledge.groups().some((group) => group.chatId === chatId);
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
      } else {
        // Chi tin MOI moi tai anh: tin trung nghia la worker khac da tai (hoac dang tai) roi.
        this.scheduleMediaFetch(result.id, message);
      }
      return result;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Luu tin ${message.externalMessageId} that bai (pipeline van chay): ${detail}`,
      );
      return null;
    }
  }

  /**
   * Dat lich tai anh ve kho ben vung (Dot A' Task 2) — KHONG await co chu y.
   *
   * Link anh Zalo chet sau <=35 ngay nen phai tai, nhung tai la viec cua mang: cham hay hong deu
   * khong duoc lam cham hoac lam rot viec chot don. Loi da duoc MediaFetcher nuot vao `mediaError`.
   */
  private scheduleMediaFetch(messageId: string, message: ChannelMessage): void {
    if (!message.imageUrl || !this.media) return;
    this.media.schedule(messageId, message.imageUrl, message.sentAt);
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
   * Policy outbound tach khoi nguong risk cua Giam sat. Du lieu thieu/sai va manual-review van
   * fail-closed; tong so luong so voi nguong tenant theo semantics inclusive.
   */
  private shouldAutoSend(view: OrderView, manualReview = false): boolean {
    return shouldAutoConfirmOrder(view, {
      policy: tenantOrderAutomation(),
      killSwitchEnabled: (this.settings?.autoSend() ?? loadEnv().AUTO_SEND) === 'on',
      manualReview,
    });
  }

  private shouldAutoReplyProduct(view: OrderView, manualReview = false): boolean {
    return (
      !manualReview &&
      (this.settings?.autoSend() ?? loadEnv().AUTO_SEND) === 'on' &&
      view.intent === 'hoi_san_pham' &&
      view.status === 'pending_review' &&
      Boolean(view.trace?.outbound) &&
      view.trace?.steps.find((step) => step.role === 'product_advisor')?.handoff !== true &&
      view.trace?.supervisor.riskLevel === 'none'
    );
  }
}

function participantRankToSenderType(
  rank: 'dai_ly' | 'ctv' | 'khach_le' | 'unknown' | undefined,
): SenderType | undefined {
  return rank && rank !== 'unknown' ? rank : undefined;
}
