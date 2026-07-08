import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  AGENT_ROLES,
  INTENT_LABELS,
  INTENT_TO_ROLE,
  ROLE_LABELS,
  SENDER_LABELS,
  type AgentRole,
  type AgentSource,
  type AgentStep,
  type AgentStepStatus,
  type AgentTrace,
  type ChannelMessage,
  type Intent,
  type OrderStatus,
  type OrderView,
  type ParseResult,
  type PricedOrder,
  type SupervisorSummary,
} from '@ultty/shared';
import { KnowledgeService, type ResolvedGroup } from '../knowledge/knowledge.service.js';
import { OrdersRepository } from '../orders/orders.repository.js';
import type { OrderParser } from '../pipeline/order-parser.js';
import { ORDER_PARSER } from '../pipeline/parser.tokens.js';
import { DEFAULT_RULES_CONFIG } from '../rules/config.js';
import { priceOrder, routeStatus } from '../rules/rules.js';
import { formatVnd, normalize } from '../rules/text.js';
import { DEFAULT_AGENTS_CONFIG } from './agents.config.js';
import {
  POLICY_LABELS,
  annotatePolicy,
  assessRisk,
  buildQuoteLines,
  classifyWarranty,
  describeProducts,
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
  roles: Map<AgentRole, RoleData>;
}

/**
 * Tang 3 — Multi-agent 6 con (§5.1) duoi 1 orchestrator, 1 lan goi LLM (Router parse).
 * Router -> dispatch worker theo intent -> Supervisor (rules, 0 LLM) -> AgentTrace.
 * Nguyen tac bat bien: DUY NHAT SalesAgent goi priceOrder; cac vai khac chi doc/format.
 */
@Injectable()
export class AgentOrchestrator {
  private readonly logger = new Logger('AgentOrchestrator');

  constructor(
    @Inject(ORDER_PARSER) private readonly parser: OrderParser,
    private readonly knowledge: KnowledgeService,
    private readonly orders: OrdersRepository,
  ) {}

  async run(message: ChannelMessage, botName?: string): Promise<OrderView> {
    const resolved = this.knowledge.resolveByChatId(message.externalChatId);
    const senderKnown = resolved.dealer !== null;

    // ROUTER — 1 lan parse (LLM hoac mock)
    const parseResult = await this.parser.parse({
      text: message.text,
      imageUrl: message.imageUrl,
      products: this.knowledge.products(),
      glossary: this.knowledge.glossary(),
      dealerNameRaw: resolved.dealer?.name,
      botName,
    });
    const usedLlm = this.parser.name !== 'mock';
    const intent = parseResult.intent;
    const primaryRole = INTENT_TO_ROLE[intent];
    const normText = normalize(message.text);

    // DISPATCH worker theo intent
    const dispatch = this.dispatch(parseResult, resolved, normText);
    dispatch.roles.set('router', {
      action: `Phân loại: ${INTENT_LABELS[intent]} · người gửi: ${SENDER_LABELS[resolved.senderType]} → ${ROLE_LABELS[primaryRole]}`,
      notes: [resolved.groupName ? `Nhóm: ${resolved.groupName}` : 'Nhóm chưa map đại lý'],
      source: usedLlm ? 'llm' : 'router',
      usedLlm,
    });

    // SUPERVISOR — rules tat dinh, 0 LLM
    const intentConfidence = parseResult.confidence.intent ?? 0.8;
    const supervisor = assessRisk(dispatch.priced, intentConfidence, senderKnown, normText, DEFAULT_AGENTS_CONFIG);
    dispatch.roles.set('supervisor', {
      action: supervisor.riskLevel === 'none' ? 'Không phát hiện rủi ro' : `Rủi ro: ${supervisor.reasons.join('; ')}`,
      notes: supervisor.reasons,
      source: 'rules',
      handoff: supervisor.escalate,
    });
    const status = supervisor.escalate && dispatch.status === 'pending_review' ? 'needs_edit' : dispatch.status;

    const trace = this.buildTrace(dispatch.roles, primaryRole, resolved, usedLlm, supervisor, dispatch.reply);
    this.logStep(intent, resolved, supervisor);

    const view: OrderView = {
      id: randomUUID(),
      status,
      createdAt: new Date().toISOString(),
      chatId: message.externalChatId,
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
    };
    return this.orders.create(view);
  }

  /** Dispatch tin toi vai chuyen trach; DUY NHAT nhanh dat_don goi priceOrder. */
  private dispatch(parseResult: ParseResult, resolved: ResolvedGroup, normText: string): DispatchResult {
    const roles = new Map<AgentRole, RoleData>();
    const intent = parseResult.intent;
    const tier = resolved.dealer?.tier ?? 'dai_ly';

    if (intent === 'dat_don' && parseResult.order) {
      const priced = priceOrder(parseResult.order, {
        dealer: resolved.dealer,
        branch: resolved.branch,
        products: this.knowledge.products(),
        prices: this.knowledge.prices(),
        cfg: DEFAULT_RULES_CONFIG,
      });
      roles.set('sales', {
        action: `Bóc ${priced.lines.length} dòng, áp giá ${SENDER_LABELS[resolved.senderType]}, dựng xác nhận ${priced.orderType}`,
        notes: [`Tổng (rules engine): ${formatVnd(priced.grandTotal)}`, 'Số lượng: trích xuất · đơn giá/tổng: rules'],
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
      const descs = describeProducts(normText, this.knowledge.products());
      roles.set('product_advisor', {
        action: 'Tư vấn sản phẩm từ kho tri thức',
        notes: descs.map((d) => d.name),
        source: 'knowledge',
      });
      const reply = descs.length
        ? descs.map((d) => `• ${d.name}: ${d.description}`).join('\n')
        : 'Anh/chị quan tâm sản phẩm nào ạ? Em gửi thông tin chi tiết.';
      return { priced: null, status: 'pending_review', reply, roles };
    }

    if (intent === 'hoi_gia') {
      const quote = buildQuoteLines(normText, this.knowledge.products(), this.knowledge.prices(), tier);
      roles.set('policy_finance', {
        action: `Báo giá theo cấp ${SENDER_LABELS[resolved.senderType]} (tra bảng giá)`,
        notes: quote.map((q) => `${q.name}: ${formatVnd(q.unitPrice)}`),
        source: 'knowledge',
      });
      const reply = quote.length
        ? quote.map((q) => `• ${q.name}: ${formatVnd(q.unitPrice)}`).join('\n')
        : 'Anh/chị cho em xin tên sản phẩm để báo giá ạ.';
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
      const w = classifyWarranty(normText, DEFAULT_AGENTS_CONFIG);
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
    usedLlm: boolean,
    supervisor: SupervisorSummary,
    reply?: string,
  ): AgentTrace {
    const steps: AgentStep[] = AGENT_ROLES.map((role) => {
      const data = roles.get(role);
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
    });
    return {
      steps,
      primaryRole,
      senderType: resolved.senderType,
      llmCalls: usedLlm ? 1 : 0,
      brainMode: this.parser.name,
      supervisor,
      reply,
    };
  }

  private stepStatus(role: AgentRole, data: RoleData | undefined, supervisor: SupervisorSummary): AgentStepStatus {
    if (role === 'supervisor') {
      if (supervisor.escalate) return 'handoff';
      return supervisor.riskLevel === 'watch' ? 'flagged' : 'active';
    }
    if (!data) return 'skipped';
    return data.handoff ? 'handoff' : 'active';
  }

  private logStep(intent: Intent, resolved: ResolvedGroup, supervisor: SupervisorSummary): void {
    this.logger.log(`[Agent:router] intent=${intent} sender=${resolved.senderType} → ${INTENT_TO_ROLE[intent]}`);
    if (supervisor.riskLevel !== 'none') {
      this.logger.warn(`[Agent:supervisor] risk=${supervisor.riskLevel} escalate=${supervisor.escalate}`);
    }
  }
}
