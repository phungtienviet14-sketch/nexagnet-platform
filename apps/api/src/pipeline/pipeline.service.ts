import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ChannelMessage, OrderStatus, OrderView, PricedOrder } from '@ultty/shared';
import { KnowledgeService } from '../knowledge/knowledge.service.js';
import { DEFAULT_RULES_CONFIG } from '../rules/config.js';
import { priceOrder, routeStatus } from '../rules/rules.js';
import { OrdersRepository } from '../orders/orders.repository.js';
import { ORDER_PARSER } from './parser.tokens.js';
import type { OrderParser } from './order-parser.js';

/**
 * Tang 3+4 ghep lai: parse (LLM/mock) -> rules (tat dinh) -> luu OrderView.
 * LLM chi phan loai + trich xuat; rules engine tinh tien.
 */
@Injectable()
export class PipelineService {
  constructor(
    @Inject(ORDER_PARSER) private readonly parser: OrderParser,
    private readonly knowledge: KnowledgeService,
    private readonly orders: OrdersRepository,
  ) {}

  async process(message: ChannelMessage, botName?: string): Promise<OrderView> {
    const resolved = this.knowledge.resolveByChatId(message.externalChatId);

    const parseResult = await this.parser.parse({
      text: message.text,
      imageUrl: message.imageUrl,
      products: this.knowledge.products(),
      glossary: this.knowledge.glossary(),
      dealerNameRaw: resolved.dealer?.name,
      botName,
    });

    let priced: PricedOrder | null = null;
    let status: OrderStatus = 'pending_review';

    if (parseResult.intent === 'dat_don' && parseResult.order) {
      priced = priceOrder(parseResult.order, {
        dealer: resolved.dealer,
        branch: resolved.branch,
        products: this.knowledge.products(),
        prices: this.knowledge.prices(),
        cfg: DEFAULT_RULES_CONFIG,
      });
      status = routeStatus(priced);
    }

    const view: OrderView = {
      id: randomUUID(),
      status,
      createdAt: new Date().toISOString(),
      chatId: message.externalChatId,
      rawText: message.text,
      imageUrl: message.imageUrl,
      intent: parseResult.intent,
      parsed: parseResult.order ?? null,
      priced,
      confidence: parseResult.confidence,
    };

    return this.orders.create(view);
  }
}
