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
  type ConversationContext,
  type Intent,
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
import { AdviceComposer } from '../content/advice-composer.js';
import { OrdersRepository } from '../orders/orders.repository.js';
import type { OrderParser } from '../pipeline/order-parser.js';
import { ORDER_PARSER } from '../pipeline/parser.tokens.js';
import { AgentEventsService } from './agent-events.service.js';
import { DEFAULT_RULES_CONFIG, type RulesConfig } from '../rules/config.js';
import { priceOrder, routeStatus } from '../rules/rules.js';
import { formatVnd, normalize } from '../rules/text.js';
import { DEFAULT_AGENTS_CONFIG, type AgentsConfig } from './agents.config.js';
import { RuleConfigService } from '../rule-config/rule-config.service.js';
import { ContentService } from '../content/content.service.js';
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
    @Optional() private readonly composer?: AdviceComposer,
  ) {}

  /**
   * Soan lai cau tra loi tu van bang LLM tren dung nhung manh DA DUYET (Uu tien 2 — bao cao
   * 15/08/2026). Truoc day `text` la `body.join('\n')`, tuc noi nguyen van FAQ.
   *
   * Fail-safe hai lop: khong co composer / khong co manh nao / ban soan rong hoac lo noi con so
   * tien -> `compose()` tra `null` -> giu NGUYEN ban tra bang. Khach luon nhan duoc noi dung da
   * duyet; ban soan chi lam no muot hon chu khong phai dieu kien de tra loi.
   */
  private async composeAdvice(
    dispatch: DispatchResult,
    intent: Intent,
    customerText: string,
    context: ConversationContext | undefined,
    now: Date,
  ): Promise<{ dispatch: DispatchResult; composed: boolean }> {
    const advice = dispatch.outbound as ProductAdviceResult | undefined;
    if (intent !== 'hoi_san_pham' || !this.composer || !advice?.snippets?.length) {
      return { dispatch, composed: false };
    }
    const text = await this.composer.compose({
      customerText,
      productNames: advice.productNames ?? [],
      snippets: advice.snippets,
      context,
      now,
    });
    if (!text) return { dispatch, composed: false };
    return {
      dispatch: { ...dispatch, reply: text, outbound: { ...advice, text } },
      composed: true,
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
    });
    const parseResult = validateContextualParse(
      rawParseResult,
      message.text,
      this.knowledge.products(),
      opts?.conversationContext,
    );
    const usedLlm = this.parser.name !== 'mock';
    const intent = parseResult.intent;
    const primaryRole = INTENT_TO_ROLE[intent];
    const normText = normalize(message.text);

    // DISPATCH worker theo intent (dong bo), roi phat tung vai theo thu tu.
    const dispatched = this.dispatch(parseResult, resolved, normText, rulesConfig, agentsConfig);
    const { dispatch, composed } = await this.composeAdvice(
      dispatched,
      intent,
      message.text,
      opts?.conversationContext,
      message.sentAt,
    );
    if (composed) {
      const advisor = dispatch.roles.get('product_advisor');
      if (advisor) {
        dispatch.roles.set('product_advisor', {
          ...advisor,
          action: 'Soạn tư vấn từ nội dung đã duyệt (LLM soạn văn, không tự ra số)',
          source: 'llm',
          usedLlm: true,
        });
      }
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
    const status =
      supervisor.escalate && dispatch.status === 'pending_review' ? 'needs_edit' : dispatch.status;

    const llmCalls = (usedLlm ? 1 : 0) + (composed ? 1 : 0);
    const trace = this.buildTrace(
      dispatch.roles,
      primaryRole,
      resolved,
      llmCalls,
      supervisor,
      dispatch.reply,
      dispatch.outbound,
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
      trace,
      ...(activeRuleConfig ? { ruleConfigVersion: activeRuleConfig.version } : {}),
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
      const baseAdvice = this.content?.productAdvice(normText, this.knowledge.products()) ?? {
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
