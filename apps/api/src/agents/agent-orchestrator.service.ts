import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { tenantRetailAdvice } from '@netviet/tenant';
import {
  AGENT_ROLES,
  INTENT_LABELS,
  INTENT_TO_ROLE,
  ROLE_LABELS,
  SENDER_LABELS,
  loadEnv,
  type AgentRole,
  type AgentSource,
  type AgentStep,
  type AgentStepStatus,
  type AgentStreamEvent,
  type AgentTrace,
  type ChannelMessage,
  type ClarifySlot,
  type ConversationContext,
  type Intent,
  type OrderDraft,
  type OrderStatus,
  type OrderView,
  type OutboundContent,
  type ParseResult,
  type ProductAdviceResult,
  type PricedOrder,
  type ReplyChannel,
  type SenderType,
  type SupervisorSummary,
} from '@netviet/shared';
import { KnowledgeService, type ResolvedGroup } from '../knowledge/knowledge.service.js';
import { AdvisorAgent } from '../advisor/advisor-agent.js';
import { ORDER_COMMANDS } from '../advisor/order-commands.token.js';
import type { OrderCommandPort } from '../advisor/order-tools.js';
import { ContentService } from '../content/content.service.js';
import { mergeConversationTurn } from '../conversations/conversation-merge.js';
import type { ClosedOrderContext } from '../conversations/conversation-thread.js';
import type { AmendSignal } from '../pipeline/amend-detect.js';
import { OrdersRepository } from '../orders/orders.repository.js';
import type { OrderParser } from '../pipeline/order-parser.js';
import { ORDER_PARSER } from '../pipeline/parser.tokens.js';
import { AgentEventsService } from './agent-events.service.js';
import { DEFAULT_RULES_CONFIG, type RulesConfig } from '../rules/config.js';
import { matchProduct, priceOrder, routeStatus } from '../rules/rules.js';
import { formatVnd, normalize } from '../rules/text.js';
import { DEFAULT_AGENTS_CONFIG, type AgentsConfig } from './agents.config.js';
import { RuleConfigService } from '../rule-config/rule-config.service.js';
import { toAgentsConfig, toRulesConfig } from '../rule-config/rule-config.defaults.js';
import { validateContextualParse } from '../pipeline/contextual-parse.js';
import {
  POLICY_LABELS,
  annotatePolicy,
  assessRisk,
  buildQuoteLines,
  classifyWarranty,
  quotePriceField,
  quoteQualifier,
} from './risk-rules.js';

/** Du lieu 1 vai da chay (de dung 1 AgentStep). */
interface RoleData {
  action: string;
  notes: string[];
  source: AgentSource;
  handoff?: boolean;
  usedLlm?: boolean;
}

interface DispatchResult {
  priced: PricedOrder | null;
  status: OrderStatus;
  reply?: string;
  outbound?: OutboundContent;
  roles: Map<AgentRole, RoleData>;
}

export function replyChannelForSource(source: ChannelMessage['source']): ReplyChannel {
  switch (source) {
    case 'bot_webhook':
      return 'bot';
    case 'zca_listener':
      return 'zca';
    case 'copilot_paste':
      return 'mock';
    case 'system_outbound':
      // Tin HE THONG DA GUI khong bao gio di nguoc vao duong tra loi. Toi day la loi lap trinh,
      // khong phai tinh huong runtime — nem ro thay vi doan bua mot kenh (cung tinh than voi
      // `Thieu replyChannel: tu choi doan kenh gui` trong OutboundChannelRouter).
      throw new Error('system_outbound khong phai tin den: khong co kenh tra loi');
  }
}

/**
 * Tang 3 — Multi-agent 6 con (§5.1) duoi 1 orchestrator, 1 lan goi LLM (Router parse).
 * Router -> dispatch worker theo intent -> Supervisor (rules, 0 LLM) -> AgentTrace.
 * Nguyen tac bat bien: DUY NHAT SalesAgent goi priceOrder; cac vai khac chi doc/format.
 */
@Injectable()
export class AgentOrchestrator {
  private readonly logger = new Logger('AgentOrchestrator');

  private readonly stepDelayMs = loadEnv().STREAM_STEP_DELAY_MS;

  constructor(
    @Inject(ORDER_PARSER) private readonly parser: OrderParser,
    private readonly knowledge: KnowledgeService,
    private readonly orders: OrdersRepository,
    @Optional() private readonly events?: AgentEventsService,
    @Optional() private readonly ruleConfigs?: RuleConfigService,
    @Optional() private readonly content?: ContentService,
    @Optional() private readonly advisor?: AdvisorAgent,
    /** Cong GHI cho agent. Vang mat -> agent chi co quyen doc (mac dinh cua test/CI). */
    @Optional()
    @Inject(ORDER_COMMANDS)
    private readonly orderCommands?: OrderCommandPort,
  ) {}

  /**
   * Cau tra loi do AGENT CO CONG CU sinh ra (Pha 6 — 21/08/2026).
   *
   * Truoc day cho nay chi soan lai nhung manh FAQ ma `dispatch()` da tra cuu san, va CHI cho
   * `hoi_san_pham` khi da co snippet. Hai hau qua that: (1) san pham chua duyet noi dung thi moi
   * cau hoi khac nhau deu ra dung mot chuoi hard-code; (2) cac intent con lai khong bao gio di
   * qua LLM. Nay agent TU goi cong cu tra cuu nguon su that roi tu viet cau tra loi.
   *
   * Fail-safe khong doi: `reply()` tra `null` (tat, hong, het vong, hoac lo mot con so tien khong
   * co trong ket qua cong cu) -> GIU NGUYEN duong tat dinh cu. Khach luon nhan duoc mot cau tra
   * loi; agent chi lam no dung nguoi dung viec hon.
   */
  private async composeReply(
    dispatch: DispatchResult,
    input: ComposeReplyInput,
  ): Promise<{ dispatch: DispatchResult; composed: boolean; handoff: boolean }> {
    // `dat_don` DA DU du kien di duong tat dinh: van ban xac nhan la mot chung tu, khong phai mot
    // cau tro chuyen — de LLM viet lai no la mo mot cho khong can thiet cho con so di lac.
    //
    // TRU luot SUA DON: luc do van ban tho van boc ra mot don hoan chinh ("... lay 5 cai thoi" ->
    // 5 ghe Felix), nhung gui thang xac nhan cua no se de don CU song nguyen — Sale go ca hai vao
    // KiotViet va khach nhan 25 cai ghe. Luot do phai qua agent de no goi `sua_don`.
    const orderIsComplete = input.intent === 'dat_don' && dispatch.priced !== null;
    if (!this.advisor || (orderIsComplete && !input.amendRequest)) {
      return { dispatch, composed: false, handoff: false };
    }

    const reply = await this.advisor.reply({
      customerText: input.customerText,
      ...(input.context ? { context: input.context } : {}),
      ...(input.senderDisplayName ? { senderDisplayName: input.senderDisplayName } : {}),
      ...(input.draft ? { pendingDraft: input.draft } : {}),
      ...(input.missingSlots?.length ? { missingSlots: input.missingSlots } : {}),
      ...(input.closedOrder ? { closedOrder: input.closedOrder } : {}),
      ...(input.amendRequest ? { amendRequest: input.amendRequest } : {}),
      tools: {
        knowledge: this.knowledge,
        ...(this.content ? { content: this.content } : {}),
        resolved: input.resolved,
        senderType: input.resolved.senderType,
        chatId: input.chatId,
        ...(input.senderExternalId ? { senderExternalId: input.senderExternalId } : {}),
        // Quyen GHI chi duoc cap khi biet CHAC nguoi dang noi la ai. Kenh khong cap uid nguoi gui
        // thi khong the chung minh don thuoc ve ho — luc do agent chi con quyen doc.
        ...(this.orderCommands && input.senderExternalId
          ? {
              orderCommands: {
                port: this.orderCommands,
                scope: { chatId: input.chatId, senderExternalId: input.senderExternalId },
                resolveSku: (keyword: string) =>
                  matchProduct(keyword, this.knowledge.products())?.sku ?? null,
              },
            }
          : {}),
      },
      now: input.now,
    });
    if (!reply) return { dispatch, composed: false, handoff: false };

    /*
     * Ban soan cua agent THAY THE phan quyet tat dinh, khong chong len no.
     *
     * Cong tat dinh (`productAdvice`) chi nhin van ban tin HIEN TAI. Mot cau noi tiep khong nhac
     * ten SP — "co den ngu khong", "bao hanh bao lau", "loc duoc bao nhieu m2" — luon bi no cham
     * la thieu du lieu, du danh muc co san FAQ da duyet cho dung san pham do. Agent thi co ca
     * lich su hoi thoai lan cong cu tra cuu; khi no tra loi xong ma KHONG tu xin chuyen Sale thi
     * ket luan cu da het gia tri. Giu lai ket luan cu chinh la loi khien khach hoi mot loat cau
     * tra loi duoc ma bot im lang (21/08/2026).
     */
    const advice = dispatch.outbound as ProductAdviceResult | undefined;
    // Dung bien co kieu thay vi object literal ngay trong spread: `ProductAdviceResult` co them
    // truong so voi `OutboundContent`, ma literal thi bi TS chan boi excess-property check.
    const composedOutbound: ProductAdviceResult = {
      ...(advice ?? {}),
      ready: !reply.handoff,
      productSkus: advice?.productSkus ?? [],
      missing: reply.handoff ? (advice?.missing ?? ['agent_handoff']) : [],
      text: reply.text,
    };
    return {
      dispatch: {
        ...dispatch,
        reply: reply.text,
        // MOI intent tu van deu can `outbound`, khong rieng `hoi_san_pham`: khong co no thi duong
        // gui khong co gi de gui, va cau tra loi da soan xong se nam lai trong DB.
        //
        // LUOT SUA DON: cong cu `sua_don` da tao don thay the roi. Bo `priced` cua ban boc tho
        // di, neu khong `run()` se luu them MOT don nua cho cung mot y dinh — va don thua do se
        // duoc Sale go vao KiotViet nhu that.
        ...(input.amendRequest ? { priced: null, status: 'pending_review' as const } : {}),
        // Tru `dat_don`: luot chot don da co duong rieng — mach hoi thoai gui CAU HOI LAI. Dat
        // them `outbound` o day se thanh hai tin cho cung mot y.
        ...(input.intent === 'dat_don' && !input.amendRequest
          ? {}
          : {
              outbound: composedOutbound,
              status: reply.handoff ? ('needs_edit' as const) : ('pending_review' as const),
            }),
      },
      composed: true,
      handoff: reply.handoff,
    };
  }

  /**
   * Xu ly 1 tin. Phat su kien STREAMING (order.created -> agent.progress tung vai ->
   * order.finalized) neu co client SSE. Van TRA VE OrderView day du (backward-compatible).
   * opts.orderId: dung lai id (nut "Chay lai" -> cap nhat DUNG don, khong tao don moi).
   */
  async run(
    message: ChannelMessage,
    botName?: string,
    opts?: {
      orderId?: string;
      rerun?: boolean;
      senderTypeOverride?: SenderType;
      conversationContext?: ConversationContext;
      /** Don nhap dang do cua CHINH nguoi gui tin nay (mach hoi thoai — Pha 6). */
      pendingDraft?: OrderDraft;
      /** Bot vua hoi va dang cho dung nguoi nay tra loi. */
      answeringQuestion?: boolean;
      /** Don VUA CHOT cua nguoi nay — ngu canh chi doc, de hieu "cai do"/"don cu". */
      closedOrder?: ClosedOrderContext;
      /** Tin nay la mot yeu cau SUA/HUY don da chot, khong phai mot don moi. */
      amendRequest?: AmendSignal;
    },
  ): Promise<OrderView> {
    const orderId = opts?.orderId ?? randomUUID();
    const createdAt = new Date().toISOString();
    const baseResolved = this.knowledge.resolveByChatId(message.externalChatId);
    const resolved = opts?.senderTypeOverride
      ? { ...baseResolved, senderType: opts.senderTypeOverride }
      : baseResolved;
    const senderKnown = resolved.dealer !== null;
    const activeRuleConfig = await this.ruleConfigs?.getActive();
    const rulesConfig = activeRuleConfig
      ? toRulesConfig(activeRuleConfig.payload)
      : DEFAULT_RULES_CONFIG;
    const agentsConfig = activeRuleConfig
      ? toAgentsConfig(activeRuleConfig.payload)
      : DEFAULT_AGENTS_CONFIG;

    const emit = (e: AgentStreamEvent): void => this.events?.emit(e);
    // Chi gian nhip khi CO client dang xem (tranh them do tre khi khong ai coi/test).
    const streaming = Boolean(this.events?.hasSubscribers());
    const pace = (): Promise<void> => (streaming ? sleep(this.stepDelayMs) : Promise.resolve());
    const NO_SUP: SupervisorSummary = { riskLevel: 'none', escalate: false, reasons: [] };

    emit({
      type: 'order.created',
      order: {
        orderId,
        chatId: message.externalChatId,
        groupName: resolved.groupName ?? undefined,
        dealerName: resolved.dealer?.name ?? undefined,
        senderType: resolved.senderType,
        rawText: message.text,
        imageUrl: message.imageUrl,
        createdAt,
        rerun: opts?.rerun,
      },
    });

    // ROUTER — 1 lan parse (LLM hoac mock). do tre THAT nam o day.
    emit({ type: 'agent.progress', orderId, role: 'router', phase: 'active' });
    const rawParseResult = await this.parser.parse({
      text: message.text,
      imageUrl: message.imageUrl,
      products: this.knowledge.products(),
      glossary: this.knowledge.glossary(),
      dealerNameRaw: resolved.dealer?.name,
      botName,
      context: opts?.conversationContext,
      // Moc de tinh thoi gian tuong doi trong lich su ("5 phut truoc"). Lay tu tin, khong
      // lay dong ho may chu: tin co the vao muon, va rerun phai cho ra cung mot prompt.
      sentAt: message.sentAt,
      // Mach hoi thoai (Pha 6): don nhap + "dang cho tra loi" nam trong PHAN BIEN DONG cua prompt,
      // nen chung khong pha prompt cache cua phan tinh.
      ...(opts?.pendingDraft ? { pendingDraft: opts.pendingDraft } : {}),
      ...(opts?.answeringQuestion ? { awaitingAnswer: true } : {}),
    });
    const validated = validateContextualParse(
      rawParseResult,
      message.text,
      this.knowledge.products(),
      opts?.conversationContext,
      // Mach dang cho khach tra loi thi ke thua ngu canh la CO CO SO, khong phai LLM tu doan:
      // chinh he thong vua hoi va dang giu don nhap. Guard chi con canh truong hop khong co mach.
      Boolean(opts?.answeringQuestion),
    );
    // GHEP luot tin vao mach chot don: "20" sau cau hoi "may cai a?" thanh so luong cua don dang do.
    const turn = mergeConversationTurn({
      result: validated,
      text: message.text,
      pendingDraft: opts?.pendingDraft ?? null,
      answeringQuestion: Boolean(opts?.answeringQuestion),
      products: this.knowledge.products(),
      dealerKnown: senderKnown,
    });
    const parseResult = turn.result;
    const usedLlm = this.parser.name !== 'mock';
    const intent = parseResult.intent;
    const primaryRole = INTENT_TO_ROLE[intent];
    const normText = normalize(message.text);

    // DISPATCH worker theo intent (dong bo), roi phat tung vai theo thu tu.
    const dispatched = this.dispatch(parseResult, resolved, normText, rulesConfig, agentsConfig);
    const { dispatch, composed, handoff } = await this.composeReply(dispatched, {
      intent,
      customerText: message.text,
      resolved,
      chatId: message.externalChatId,
      now: message.sentAt,
      ...(opts?.conversationContext ? { context: opts.conversationContext } : {}),
      ...(message.senderDisplayName ? { senderDisplayName: message.senderDisplayName } : {}),
      ...(message.senderExternalId ? { senderExternalId: message.senderExternalId } : {}),
      ...(turn.draft ? { draft: turn.draft } : {}),
      ...(turn.gaps ? { missingSlots: turn.gaps.askable } : {}),
      ...(opts?.closedOrder ? { closedOrder: opts.closedOrder } : {}),
      ...(opts?.amendRequest ? { amendRequest: opts.amendRequest } : {}),
    });
    if (composed) {
      markComposedRole(dispatch, primaryRole, handoff);
    }
    dispatch.roles.set('router', {
      action: `Phân loại: ${INTENT_LABELS[intent]} · người gửi: ${SENDER_LABELS[resolved.senderType]} → ${ROLE_LABELS[primaryRole]}`,
      notes: [resolved.groupName ? `Nhóm: ${resolved.groupName}` : 'Nhóm chưa map đại lý'],
      source: usedLlm ? 'llm' : 'router',
      usedLlm,
    });
    emit({
      type: 'agent.progress',
      orderId,
      role: 'router',
      phase: 'done',
      step: this.buildStep('router', dispatch.roles.get('router'), NO_SUP),
    });

    // WORKER — cac vai tham gia (rules/knowledge, tuc thi; gian nhe cho de nhin).
    for (const role of AGENT_ROLES) {
      if (role === 'router' || role === 'supervisor') continue;
      const data = dispatch.roles.get(role);
      if (!data) continue;
      await pace();
      emit({ type: 'agent.progress', orderId, role, phase: 'active' });
      await pace();
      emit({
        type: 'agent.progress',
        orderId,
        role,
        phase: 'done',
        step: this.buildStep(role, data, NO_SUP),
      });
    }

    // SUPERVISOR — rules tat dinh, 0 LLM.
    const intentConfidence = parseResult.confidence.intent ?? 0.8;
    await pace();
    emit({ type: 'agent.progress', orderId, role: 'supervisor', phase: 'active' });
    const supervisor = assessRisk(
      dispatch.priced,
      intentConfidence,
      senderKnown,
      normText,
      agentsConfig,
    );
    dispatch.roles.set('supervisor', {
      action:
        supervisor.riskLevel === 'none'
          ? 'Không phát hiện rủi ro'
          : `Rủi ro: ${supervisor.reasons.join('; ')}`,
      notes: supervisor.reasons,
      source: 'rules',
      handoff: supervisor.escalate,
    });
    emit({
      type: 'agent.progress',
      orderId,
      role: 'supervisor',
      phase: 'done',
      step: this.buildStep('supervisor', dispatch.roles.get('supervisor'), supervisor),
    });
    // Don con thieu du kien KHONG duoc dung o `pending_review`: o trang thai do no du dieu kien
    // auto-send, tuc gui cho khach mot xac nhan cua mot don chua ai chot.
    const incomplete = turn.gaps !== null && !turn.gaps.complete;
    const status =
      (supervisor.escalate || incomplete) && dispatch.status === 'pending_review'
        ? 'needs_edit'
        : dispatch.status;

    const llmCalls = (usedLlm ? 1 : 0) + (composed ? 1 : 0);
    const trace = this.buildTrace(
      dispatch.roles,
      primaryRole,
      resolved,
      llmCalls,
      supervisor,
      dispatch.reply,
      dispatch.outbound,
      composed,
    );
    this.logStep(intent, resolved, supervisor);

    const view: OrderView = {
      id: orderId,
      status,
      createdAt,
      chatId: message.externalChatId,
      replyChannel: replyChannelForSource(message.source),
      groupName: resolved.groupName ?? undefined,
      dealerName: resolved.dealer?.name ?? undefined,
      rawText: message.text,
      imageUrl: message.imageUrl,
      intent,
      parsed: parseResult.order ?? null,
      priced: dispatch.priced,
      confidence: parseResult.confidence,
      senderType: resolved.senderType,
      // Neo don vao NGUOI da dat no: khong co no thi cong cu ghi cua LLM khong the kiem tra
      // pham vi, va `lich_su_don` khong the loc theo nguoi.
      ...(message.senderExternalId ? { senderExternalId: message.senderExternalId } : {}),
      trace,
      ...(activeRuleConfig ? { ruleConfigVersion: activeRuleConfig.version } : {}),
      // De xac nhan gui ra la mot cau TRA LOI dung tin nay, khong phai mot cau troi noi
      // giua nhom 200 dai ly dang ban tin.
      ...(message.quoteTarget ? { quoteTarget: message.quoteTarget } : {}),
      ...(turn.draft ? { pendingDraft: turn.draft } : {}),
      ...(turn.gaps
        ? { draftGaps: { askable: turn.gaps.askable, blocking: turn.gaps.blocking } }
        : {}),
    };
    const saved = await this.orders.create(view);
    emit({ type: 'order.finalized', order: saved });
    return saved;
  }

  /** Dispatch tin toi vai chuyen trach; DUY NHAT nhanh dat_don goi priceOrder. */
  private dispatch(
    parseResult: ParseResult,
    resolved: ResolvedGroup,
    normText: string,
    rulesConfig: RulesConfig,
    agentsConfig: AgentsConfig,
  ): DispatchResult {
    const roles = new Map<AgentRole, RoleData>();
    const intent = parseResult.intent;

    if (intent === 'dat_don' && parseResult.order) {
      const priced = priceOrder(parseResult.order, {
        dealer: resolved.dealer,
        branch: resolved.branch,
        products: this.knowledge.products(),
        prices: this.knowledge.prices(),
        priceOverrides: this.knowledge.priceOverrides(),
        cfg: rulesConfig,
      });
      roles.set('sales', {
        action: `Bóc ${priced.lines.length} dòng, áp giá ${SENDER_LABELS[resolved.senderType]}, dựng xác nhận ${priced.orderType}`,
        notes: [
          `Tổng (rules engine): ${formatVnd(priced.grandTotal)}`,
          'Số lượng: trích xuất · đơn giá/tổng: rules',
        ],
        source: 'rules',
      });
      // Collaborator: Chinh sach & tai chinh chu thich cho don (chi format tu priced)
      roles.set('policy_finance', {
        action: 'Chú thích chính sách & tài chính cho đơn',
        notes: annotatePolicy(priced),
        source: 'rules',
      });
      return { priced, status: routeStatus(priced), reply: priced.confirmationText, roles };
    }

    if (intent === 'hoi_san_pham') {
      const baseAdvice = this.content?.productAdvice(normText, this.knowledge.products(), this.knowledge.glossary()) ?? {
        ready: false,
        productSkus: [],
        missing: ['approved_product_content'],
        text: 'Thông tin đã duyệt chưa đủ để trả lời chính xác. Sale sẽ xác minh và phản hồi anh/chị sớm ạ.',
      };
      const asksPrice = /(^|\s)(gia|bao nhieu|bao gia|price)(\s|$)/.test(normText);
      const strategy = tenantRetailAdvice();
      const quote = asksPrice
        ? buildQuoteLines(
            normText,
            this.knowledge.products(),
            this.knowledge.prices(),
            strategy,
            resolved.senderType,
          )
        : [];
      const pricingReady = !asksPrice || quote.length >= baseAdvice.productSkus.length;
      const advice = {
        ...baseAdvice,
        ready: baseAdvice.ready && pricingReady,
        missing: pricingReady
          ? baseAdvice.missing
          : [...baseAdvice.missing, 'current_retail_price'],
        text:
          baseAdvice.ready && !pricingReady
            ? 'Bảng giá hiện hành chưa đủ để tư vấn chính xác. Sale sẽ kiểm tra và phản hồi anh/chị sớm ạ.'
            : asksPrice && quote.length
              ? `${baseAdvice.text}\n${quote.map((item) => `• ${item.name}: ${formatVnd(item.unitPrice)}`).join('\n')}\n${quoteQualifier(strategy, resolved.senderType)}`
              : baseAdvice.text,
      };
      roles.set('product_advisor', {
        action: advice.ready
          ? 'Tư vấn sản phẩm từ nội dung đã duyệt'
          : 'Thiếu nội dung đã duyệt — chuyển Sale xác minh',
        notes: advice.ready ? advice.productSkus : advice.missing,
        source: 'knowledge',
        handoff: !advice.ready,
      });
      return {
        priced: null,
        status: advice.ready ? 'pending_review' : 'needs_edit',
        reply: advice.text,
        outbound: advice,
        roles,
      };
    }

    if (intent === 'hoi_gia') {
      const strategy = tenantRetailAdvice();
      const quote = buildQuoteLines(
        normText,
        this.knowledge.products(),
        this.knowledge.prices(),
        strategy,
        resolved.senderType,
      );
      const quotedField = quotePriceField(strategy, resolved.senderType);
      roles.set('policy_finance', {
        // Nhan phai noi dung truong gia da tra cuu. Truoc day luon ghi "theo cap <X>" trong khi
        // code khong he doc `senderType` — Sale doc nhan tuong he thong da phan cap san.
        action: `Báo giá cho ${SENDER_LABELS[resolved.senderType]} — tra cột ${quotedField === 'wholesale' ? 'Đơn giá CTV (giá sỉ)' : 'giá lẻ'}`,
        notes: quote.map((q) => `${q.name}: ${formatVnd(q.unitPrice)}`),
        source: 'knowledge',
      });
      const reply = quote.length
        ? `${quote.map((q) => `• ${q.name}: ${formatVnd(q.unitPrice)}`).join('\n')}\n${quoteQualifier(strategy, resolved.senderType)}`
        : 'Em chưa có bảng giá hiện hành hoặc chưa nhận diện đủ sản phẩm; Sale sẽ kiểm tra và phản hồi ạ.';
      return { priced: null, status: 'pending_review', reply, roles };
    }

    if (intent === 'chinh_sach_cong_no') {
      const policy = resolved.dealer?.defaultPolicy;
      roles.set('policy_finance', {
        action: 'Trả lời chính sách công nợ/ký gửi',
        notes: policy ? [POLICY_LABELS[policy]] : ['Chưa xác định cấp đại lý'],
        source: 'knowledge',
      });
      const reply = policy
        ? `Chính sách áp dụng cho ${resolved.dealer?.name}: ${POLICY_LABELS[policy]}.`
        : 'Em kiểm tra chính sách theo cấp đại lý và phản hồi ngay ạ.';
      return { priced: null, status: 'pending_review', reply, roles };
    }

    if (intent === 'van_chuyen') {
      roles.set('policy_finance', {
        action: 'Tra cứu vận chuyển',
        notes: ['ETA cần API vận đơn (GĐ2) — chuyển Sale xác nhận'],
        source: 'knowledge',
        handoff: true,
      });
      return {
        priced: null,
        status: 'pending_review',
        reply: 'Đơn đang được xử lý vận chuyển. Em kiểm tra và báo thời gian giao sớm ạ.',
        roles,
      };
    }

    if (intent === 'bao_hanh_khieu_nai') {
      const w = classifyWarranty(normText, agentsConfig);
      roles.set('after_sales', {
        action: `Tiếp nhận bảo hành: ${w.branchLabel}`,
        notes: [w.note, 'Định tuyến nhóm kỹ thuật'],
        source: 'knowledge',
        handoff: true,
      });
      return {
        priced: null,
        status: 'pending_review',
        reply: `Tiếp nhận bảo hành (${w.branchLabel}). ${w.note} Em chuyển kỹ thuật hỗ trợ ạ.`,
        roles,
      };
    }

    // khac -> Router giu, khong worker; soan reply lich su de Sale copy (hands-on khong "vo").
    return {
      priced: null,
      status: 'pending_review',
      reply: 'Dạ em đã ghi nhận ạ, Sale sẽ phản hồi anh/chị sớm nhất.',
      roles,
    };
  }

  /** Dung AgentTrace: LUON du 6 hang theo thu tu vai (con khong tham gia = 'skipped'). */
  private buildTrace(
    roles: Map<AgentRole, RoleData>,
    primaryRole: AgentRole,
    resolved: ResolvedGroup,
    llmCalls: number,
    supervisor: SupervisorSummary,
    reply?: string,
    outbound?: OutboundContent,
    composed = false,
  ): AgentTrace {
    const steps: AgentStep[] = AGENT_ROLES.map((role) =>
      this.buildStep(role, roles.get(role), supervisor),
    );
    return {
      steps,
      primaryRole,
      senderType: resolved.senderType,
      llmCalls,
      brainMode: this.parser.name,
      supervisor,
      reply,
      outbound,
      ...(composed ? { composed: true } : {}),
    };
  }

  /** Dung 1 AgentStep tu RoleData (dung chung cho streaming tung buoc + buildTrace). */
  private buildStep(
    role: AgentRole,
    data: RoleData | undefined,
    supervisor: SupervisorSummary,
  ): AgentStep {
    return {
      role,
      label: ROLE_LABELS[role],
      status: this.stepStatus(role, data, supervisor),
      action: data?.action ?? '—',
      notes: data?.notes ?? [],
      source: data?.source ?? 'none',
      usedLlm: data?.usedLlm ?? false,
      handoff: data?.handoff,
    };
  }

  private stepStatus(
    role: AgentRole,
    data: RoleData | undefined,
    supervisor: SupervisorSummary,
  ): AgentStepStatus {
    if (role === 'supervisor') {
      if (supervisor.escalate) return 'handoff';
      return supervisor.riskLevel === 'watch' ? 'flagged' : 'active';
    }
    if (!data) return 'skipped';
    return data.handoff ? 'handoff' : 'active';
  }

  private logStep(intent: Intent, resolved: ResolvedGroup, supervisor: SupervisorSummary): void {
    this.logger.log(
      `[Agent:router] intent=${intent} sender=${resolved.senderType} → ${INTENT_TO_ROLE[intent]}`,
    );
    if (supervisor.riskLevel !== 'none') {
      this.logger.warn(
        `[Agent:supervisor] risk=${supervisor.riskLevel} escalate=${supervisor.escalate}`,
      );
    }
  }
}

/** Du kien mot luot soan cau tra loi. Gom rieng de chu ky `composeReply` khong phinh ra 10 tham so. */
interface ComposeReplyInput {
  readonly intent: Intent;
  readonly customerText: string;
  readonly resolved: ResolvedGroup;
  readonly chatId: string;
  readonly now: Date;
  readonly context?: ConversationContext;
  readonly senderDisplayName?: string;
  readonly senderExternalId?: string;
  readonly draft?: OrderDraft;
  readonly missingSlots?: readonly ClarifySlot[];
  readonly closedOrder?: ClosedOrderContext;
  readonly amendRequest?: AmendSignal;
}

/**
 * Danh dau vai da dung LLM co cong cu. Danh vao vai CHINH cua intent chu khong co dinh
 * `product_advisor`: mot cau hoi cong no do Chinh sach-Tai chinh tra loi, ghi cong cho Tu van SP
 * la ghi sai vet.
 */
function markComposedRole(dispatch: DispatchResult, role: AgentRole, handoff: boolean): void {
  const current = dispatch.roles.get(role);
  dispatch.roles.set(role, {
    action: 'Tra cứu nguồn sự thật bằng công cụ rồi tự soạn câu trả lời (LLM không tự ra số)',
    notes: current?.notes ?? [],
    source: 'llm',
    usedLlm: true,
    // KHONG "OR" voi co cu. Phan quyet tat dinh duoc dua ra TRUOC khi agent chay va chi nhin
    // duoc mot tin le; agent tra loi xong roi thi CHINH NO la nguon su that ve viec co can
    // nguoi that hay khong. Giu lai co cu la giu lai mot ket luan da bi thay the — va do la
    // ly do 6/7 intent khong bao gio tu tra loi duoc truoc 21/08/2026.
    ...(handoff ? { handoff: true } : {}),
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
