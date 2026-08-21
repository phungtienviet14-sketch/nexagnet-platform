import { Injectable, Logger, Optional, type OnModuleDestroy } from '@nestjs/common';
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
import { ConversationsService } from '../conversations/conversations.service.js';
import type { ThreadKey } from '../conversations/conversation-thread.js';
import { OrdersService } from '../orders/orders.service.js';
import { RuntimeSettingsService } from '../runtime/runtime-settings.service.js';
import { detectAmend } from './amend-detect.js';
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

interface PendingBurst {
  readonly messages: readonly ChannelMessage[];
  readonly saved: readonly SaveMessageResult[];
  readonly botName?: string;
  readonly participant: GroupParticipant | null;
  readonly promise: Promise<OrderView>;
  readonly resolve: (view: OrderView) => void;
  readonly reject: (error: unknown) => void;
  readonly timer: NodeJS.Timeout;
}

const MAX_BURST_MESSAGES = 4;
const MAX_BURST_CHARACTERS = 4_000;

/**
 * Tang 3+4 — adapter mong uy quyen cho AgentOrchestrator (multi-agent 6 con).
 * Giu chu ky process(message, botName) de DemoController/BotPoller khong doi.
 *
 * GĐ1: policy tenant quyet dinh gioi han tu xac nhan; AUTO_SEND chi la kill switch van hanh.
 */
@Injectable()
export class PipelineService implements OnModuleDestroy {
  private readonly logger = new Logger('PipelineService');
  private readonly pendingBursts = new Map<string, PendingBurst>();
  /** Duoi cho theo (kenh, nhom, nguoi gui) — xem `enqueuePerSender`. */
  private readonly senderQueues = new Map<string, Promise<void>>();
  private readonly burstWindowMs: number;

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
    @Optional() private readonly conversations?: ConversationsService,
    @Optional() burstWindowMs?: number,
  ) {
    const env = loadEnv();
    this.burstWindowMs = burstWindowMs ?? (env.NODE_ENV === 'test' ? 0 : env.MESSAGE_BURST_WINDOW_MS);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.pendingBursts.keys()].map((key) => this.flushBurst(key)));
  }

  /**
   * Cong vao cho hai worker doc tin (ZcaListener, BotPoller).
   *
   * Thu tu BAT BUOC — luu truoc, loc parser sau: nhom nam trong allowlist thi tin LUON duoc
   * ghi DB (CLAUDE.md: "Luu moi tin nhan/don ve DB ngay khi nhan"), rieng viec dua NOI DUNG
   * sang parser/LLM moi doi nhom da map dai ly. Truoc 04/08/2026 hai listener chan ca hai buoc
   * cung luc nen tin cua nhom chua map bi VUT — ma Zalo khong phat lai.
   */
  async intake(
    message: ChannelMessage,
    botName?: string,
    options: { retryPersisted?: boolean } = {},
  ): Promise<IntakeResult> {
    const participant = await this.findParticipant(message);
    if (participant?.handlingMode === 'ignore') {
      // Nguoi van hanh CHU DONG loai nguoi nay -> khong luu, khong xu ly (khac han "chua cau hinh").
      this.logger.log(
        `Bo qua tin cua thanh vien ignore: group=${message.externalChatId}, sender=${message.senderExternalId}`,
      );
      return { outcome: 'ignored' };
    }

    const saved = await this.saveMessage(message);
    // A retry owned by this same ingest worker may legitimately see the row written by its
    // first attempt. Only that explicitly-scoped retry may cross the durable idempotency gate.
    if (saved?.duplicate && !options.retryPersisted) return { outcome: 'duplicate' };

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

    const view = await this.enqueueOrRun(message, botName, participant, saved);
    return { outcome: 'processed', view };
  }

  private enqueueOrRun(
    message: ChannelMessage,
    botName: string | undefined,
    participant: GroupParticipant | null,
    saved: SaveMessageResult | null,
  ): Promise<OrderView> {
    const key = burstKey(message);
    const current = this.pendingBursts.get(key);
    // An image normally bypasses the wait window. If text from the same sender is already
    // pending, however, append the image and atomically consume/cancel that pending timer so
    // there is exactly one orchestrator run.
    if (
      message.imageUrl &&
      current &&
      saved &&
      canAppendToBurst(current.messages, message, this.burstWindowMs)
    ) {
      clearTimeout(current.timer);
      this.pendingBursts.set(key, {
        ...current,
        messages: [...current.messages, message],
        saved: [...current.saved, saved],
      });
      void this.flushBurst(key);
      return current.promise;
    }
    if (this.burstWindowMs === 0 || !saved || message.imageUrl) {
      return this.runPipeline(message, botName, participant, saved);
    }
    if (current && canAppendToBurst(current.messages, message, this.burstWindowMs)) {
      clearTimeout(current.timer);
      const next = this.scheduleBurst(key, {
        ...current,
        messages: [...current.messages, message],
        saved: [...current.saved, saved],
      });
      this.pendingBursts.set(key, next);
      return current.promise;
    }
    if (current) void this.flushBurst(key);

    let resolve!: (view: OrderView) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<OrderView>((ok, fail) => {
      resolve = ok;
      reject = fail;
    });
    const pending = this.scheduleBurst(key, {
      messages: [message],
      saved: [saved],
      botName,
      participant,
      promise,
      resolve,
      reject,
      timer: undefined as unknown as NodeJS.Timeout,
    });
    this.pendingBursts.set(key, pending);
    return promise;
  }

  private scheduleBurst(key: string, burst: PendingBurst): PendingBurst {
    return {
      ...burst,
      timer: setTimeout(() => void this.flushBurst(key), this.burstWindowMs),
    };
  }

  private async flushBurst(key: string): Promise<void> {
    const burst = this.pendingBursts.get(key);
    if (!burst) return;
    this.pendingBursts.delete(key);
    clearTimeout(burst.timer);
    try {
      const orderedSaved = burst.messages
        .map((message, index) => ({ message, saved: burst.saved[index]! }))
        .sort((left, right) => left.message.sentAt.getTime() - right.message.sentAt.getTime())
        .map(({ saved }) => saved);
      const view = await this.runPipeline(
        combineBurst(burst.messages),
        burst.botName,
        burst.participant,
        orderedSaved,
        undefined,
        burst.messages.map((message) => message.externalMessageId),
      );
      burst.resolve(view);
    } catch (error) {
      burst.reject(error);
    }
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

  /**
   * Xep hang theo TUNG NGUOI: hai tin cua cung mot khach khong duoc chay chong nhau.
   *
   * Mach hoi thoai la doc-sua-ghi quanh mot lan goi LLM keo dai vai giay. Hai tin cua cung mot
   * nguoi chay song song se cung doc mot trang thai cu roi cung ghi de len nhau — cau tra loi
   * "20" co the ghi de mat don nhap ma tin truoc vua tao. Cua so gom tin lam nhe chuyen nay
   * nhung khong loai bo duoc: hai tin cach nhau hon cua so van chong nhau duoc.
   *
   * Khoa theo (kenh, nhom, NGUOI GUI) chu khong theo nhom: 200 dai ly trong mot nhom van phai
   * duoc tu van SONG SONG — noi dung khoa la mach cua tung nguoi, khong phai ca nhom.
   */
  private enqueuePerSender(message: ChannelMessage, run: () => Promise<OrderView>): Promise<OrderView> {
    const key = burstKey(message);
    const previous = this.senderQueues.get(key) ?? Promise.resolve();
    // Tin truoc HONG khong duoc keo tin sau hong theo — nen nuot loi o MAT XICH, khong o ket qua.
    const current = previous.then(run, run);
    const tail = current.then(
      () => undefined,
      () => undefined,
    );
    this.senderQueues.set(key, tail);
    void tail.then(() => {
      // Chi don khi khong con ai xep sau minh, de Map khong phinh theo so nguoi da tung nhan tin.
      if (this.senderQueues.get(key) === tail) this.senderQueues.delete(key);
    });
    return current;
  }

  /**
   * Phan chung cua `intake` va `process`: chay 6 agent, noi don voi tin, xet auto-send.
   * Di qua duoi cho theo nguoi gui de mach hoi thoai khong bi hai tin cua cung mot khach
   * doc-sua-ghi de len nhau.
   */
  private runPipeline(
    message: ChannelMessage,
    botName: string | undefined,
    participant: GroupParticipant | null,
    saved: SaveMessageResult | readonly SaveMessageResult[] | null,
    opts?: { orderId?: string; rerun?: boolean; allowDuplicateSkip?: boolean },
    contextExclusions: readonly string[] = [],
  ): Promise<OrderView> {
    return this.enqueuePerSender(message, () =>
      this.runPipelineTurn(message, botName, participant, saved, opts, contextExclusions),
    );
  }

  private async runPipelineTurn(
    message: ChannelMessage,
    botName: string | undefined,
    participant: GroupParticipant | null,
    saved: SaveMessageResult | readonly SaveMessageResult[] | null,
    opts?: { orderId?: string; rerun?: boolean; allowDuplicateSkip?: boolean },
    contextExclusions: readonly string[] = [],
  ): Promise<OrderView> {
    const senderTypeOverride = participantRankToSenderType(participant?.customerRank);
    const conversationContext = await this.conversationContext?.build(message, contextExclusions);
    // MACH HOI THOAI cua CHINH nguoi gui tin nay (Pha 6). Doc TRUOC khi parse: don nhap dang do
    // la thu quyet dinh mot tin "20" co nghia gi.
    const threadKey = ConversationsService.keyOf(message);
    const now = new Date();
    const pendingDraft =
      threadKey && !opts?.rerun ? await this.conversations?.pendingDraft(threadKey, now) : null;
    const answeringQuestion = Boolean(
      threadKey && !opts?.rerun && (await this.conversations?.isAnsweringQuestion(threadKey, now)),
    );
    // DON VUA CHOT cua chinh nguoi nay. Doc rieng khoi `pendingDraft` co chu y: mach da chot thi
    // KHONG duoc gop tiep, nhung van phai NHO — khong co no, "cho a lay 5 cai" ngay sau khi chot
    // 20 ghe Felix se den noi ma khong biet "cai" la cai gi (loi khach bao 21/08/2026).
    const closedOrder =
      threadKey && !opts?.rerun ? await this.conversations?.recentlyClosed(threadKey, now) : null;
    const amend = detectAmend(message.text);
    const view = await this.orchestrator.run(message, botName, {
      ...opts,
      ...(senderTypeOverride ? { senderTypeOverride } : {}),
      ...(conversationContext ? { conversationContext } : {}),
      ...(pendingDraft ? { pendingDraft } : {}),
      ...(answeringQuestion ? { answeringQuestion } : {}),
      ...(closedOrder ? { closedOrder } : {}),
      // Chi bao "dang sua don" khi CO don de sua. Mot cau "huy don" khi khong co don nao vua chot
      // la mot cau hoi binh thuong, khong phai mot lenh.
      ...(amend.isAmend && closedOrder ? { amendRequest: amend } : {}),
    });
    const savedMessages = saved ? (Array.isArray(saved) ? saved : [saved]) : [];
    for (const row of savedMessages) await this.linkOrder(view.id, row.id);

    const manualReview = participant?.handlingMode === 'manual_review';
    if (this.shouldAutoSend(view, manualReview) && this.orders) {
      try {
        this.logger.log(`[AUTO_SEND] Tu xac nhan ${view.id} theo policy tenant`);
        const sent = await this.orders.sendConfirmation(view.id);
        return await this.settleThread(threadKey, message, sent, now, true);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        this.logger.warn(`[AUTO_SEND] that bai cho ${view.id} — giu Sale duyet: ${detail}`);
        return this.settleThread(threadKey, message, view, now, false);
      }
    }
    if (this.shouldAutoReplyAdvice(view, manualReview) && this.orders) {
      try {
        this.logger.log(`[AUTO_SEND] Tư vấn ${view.intent} ${view.id}`);
        const replied = await this.orders.sendProductAdvice(view.id);
        return await this.settleThread(threadKey, message, replied, now, false);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        this.logger.warn(`[AUTO_SEND] tư vấn thất bại cho ${view.id}: ${detail}`);
      }
    }
    return this.settleThread(threadKey, message, view, now, false, manualReview);
  }

  /**
   * Chot mach hoi thoai sau khi da xu ly xong tin: cap nhat don nhap, va HOI LAI khach neu con
   * thieu du kien hoi duoc. Kill switch `AUTO_SEND=off` va `manual_review` chan ca duong nay —
   * mot cau hoi tu dong gui vao nhom cung la mot tin tu dong gui vao nhom.
   */
  private async settleThread(
    key: ThreadKey | null,
    message: ChannelMessage,
    view: OrderView,
    now: Date,
    closed: boolean,
    manualReview = false,
  ): Promise<OrderView> {
    if (!key || !this.conversations) return view;
    const autoSendOn = (this.settings?.autoSend() ?? loadEnv().AUTO_SEND) === 'on';
    // Van CAP NHAT mach khi tat cong tac (de Sale nhin duoc don nhap), chi khong GUI.
    // Cau hoi lai do AGENT soan, neu co. `ConversationsService` da nhan tham so nay tu dau nhung
    // KHONG AI TRUYEN, nen ban mau tat dinh luon thang — va do la ly do khach nhan dung mot cau
    // "minh lay san pham nao a?" ba lan lien tiep (log 21/08/2026).
    //
    // Chi lay khi `composed`: chuoi mac dinh cua nhanh `khac` ("Da em da ghi nhan a...") khong
    // phai mot cau hoi, gui no thay cho cau hoi that la lam mach dung han.
    const composedQuestion = view.trace?.composed ? view.trace.reply : undefined;
    const conversation = await this.conversations.settle({
      key,
      message,
      view,
      now,
      closed,
      ...(composedQuestion ? { composedQuestion } : {}),
      ...(autoSendOn && !manualReview ? {} : { muted: true }),
    });
    if (!conversation) return view;
    const updated = { ...view, conversation };
    await this.orders?.patchConversation(view.id, conversation);
    return updated;
  }

  private async findParticipant(message: ChannelMessage): Promise<GroupParticipant | null> {
    if (!message.senderExternalId || !this.participants) return null;
    const participant = await this.participants.findBySender(
      message.externalChatId,
      message.senderExternalId,
    );
    const unclassifiedRoutingIdentity =
      !participant ||
      (participant.source === 'message_stream' &&
        !participant.globalId &&
        participant.customerRank === 'unknown' &&
        participant.operationalRole === 'unknown' &&
        participant.handlingMode === 'inherit_group');
    if (
      unclassifiedRoutingIdentity &&
      await this.participants.requiresIdentityReview(
        message.externalChatId,
        message.senderExternalId,
      )
    ) {
      this.logger.warn(
        `UID routing ${message.senderExternalId} chua reconcile voi stable identity; ` +
          'fail closed manual_review, khong auto-send.',
      );
      return identityReviewParticipant(message);
    }
    return participant;
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

  /**
   * Duoc phep TU TRA LOI mot cau tu van chua.
   *
   * Truoc 21/08/2026 ham nay chi xet `hoi_san_pham` va chi soi vai `product_advisor`. Hau qua:
   * cau hoi bao hanh (`bao_hanh_khieu_nai`), hoi gia, hoi cong no, hoi van chuyen va nhom `khac`
   * KHONG BAO GIO tu tra loi duoc — 6/7 intent — du agent da soan xong cau tra loi tu tai lieu
   * da duyet. Khach hoi mot loat va nhan lai im lang.
   *
   * Nay xet vai CHINH cua intent (`trace.primaryRole`) — dung cai vai da soan cau tra loi.
   * `dat_don` van di duong rieng: don du du kien thi gui XAC NHAN, con thieu thi HOI LAI.
   */
  private shouldAutoReplyAdvice(view: OrderView, manualReview = false): boolean {
    if (manualReview) return false;
    if ((this.settings?.autoSend() ?? loadEnv().AUTO_SEND) !== 'on') return false;
    if (view.intent === 'dat_don') return false;
    const trace = view.trace;
    if (view.status !== 'pending_review' || !trace?.outbound) return false;
    if (trace.supervisor.riskLevel !== 'none') return false;
    // Vai da soan cau tra loi tu xin chuyen nguoi that thi ton trong — do la chot chan cuoi
    // cua chinh LLM, khong phai mot phan quyet tat dinh da cu.
    return trace.steps.find((step) => step.role === trace.primaryRole)?.handoff !== true;
  }
}

function burstKey(message: ChannelMessage): string {
  const sender = message.senderExternalId ?? `anonymous:${message.externalMessageId}`;
  // `source` chi la adapter van chuyen. Trong hybrid, hai tin lien tiep cua cung mot nguoi co
  // the lan luot di qua Bot va zca; tach theo source se cat doi cung mot luot hoi cua khach.
  return `${message.platform}:${message.externalChatId}:${sender}`;
}

function canAppendToBurst(
  current: readonly ChannelMessage[],
  next: ChannelMessage,
  windowMs: number,
): boolean {
  const previous = current.at(-1);
  if (!previous || current.length >= MAX_BURST_MESSAGES) return false;
  const characters = current.reduce((sum, message) => sum + message.text.length, 0) + next.text.length;
  const gapMs = Math.abs(next.sentAt.getTime() - previous.sentAt.getTime());
  return characters <= MAX_BURST_CHARACTERS && gapMs <= Math.max(windowMs * 2, 5_000);
}

function combineBurst(messages: readonly ChannelMessage[]): ChannelMessage {
  const ordered = [...messages].sort((left, right) => left.sentAt.getTime() - right.sentAt.getTime());
  const latest = ordered.at(-1)!;
  if (ordered.length === 1) return latest;
  return {
    ...latest,
    imageUrl: [...ordered].reverse().find((message) => message.imageUrl)?.imageUrl,
    text: ordered
      .map((message, index) => `TIN ${index + 1} [${message.sentAt.toISOString()}]: ${message.text}`)
      .join('\n'),
  };
}

function participantRankToSenderType(
  rank: 'dai_ly' | 'ctv' | 'khach_le' | 'unknown' | undefined,
): SenderType | undefined {
  return rank && rank !== 'unknown' ? rank : undefined;
}

function identityReviewParticipant(message: ChannelMessage): GroupParticipant {
  const timestamp = message.sentAt.toISOString();
  return {
    id: `identity-review:${message.senderExternalId ?? 'unknown'}`,
    groupId: message.externalChatId,
    externalUserId: message.senderExternalId ?? 'unknown',
    displayName: message.senderDisplayName ?? 'Thanh vien chua doi soat',
    customerRank: 'unknown',
    operationalRole: 'unknown',
    handlingMode: 'manual_review',
    active: true,
    source: 'message_stream',
    lastSeenAt: timestamp,
    syncedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
