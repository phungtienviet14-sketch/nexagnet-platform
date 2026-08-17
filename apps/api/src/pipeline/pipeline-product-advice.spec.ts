import { describe, expect, it } from 'vitest';
import type { ChannelMessage, ParseResult } from '@netviet/shared';
import { AgentOrchestrator } from '../agents/agent-orchestrator.service.js';
import { MockAdapter } from '../channels/mock.adapter.js';
import { OutboundChannelRouter } from '../channels/outbound-channel.router.js';
import { ContentRepository, InMemoryContentRepository } from '../content/content.repository.js';
import { ContentService } from '../content/content.service.js';
import { KnowledgeService } from '../knowledge/knowledge.service.js';
import { SEED } from '../knowledge/seed.js';
import { InMemoryOrdersRepository } from '../orders/orders.repository.js';
import { OrdersService } from '../orders/orders.service.js';
import type { RuntimeSettingsService } from '../runtime/runtime-settings.service.js';
import { MockParser } from './mock-parser.js';
import type { OrderParser, ParserInput } from './order-parser.js';
import { PipelineService } from './pipeline.service.js';

const CHAT_ID = SEED.groups[0]!.chatId;

function message(text = 'ELNI co tot khong'): ChannelMessage {
  return {
    externalMessageId: `m-${Math.random()}`,
    platform: 'zalo',
    source: 'copilot_paste',
    chatType: 'group',
    externalChatId: CHAT_ID,
    text,
    sentAt: new Date(),
  };
}

async function build(options: {
  autoSend: 'on' | 'off';
  content?: ContentRepository;
  parser?: OrderParser;
  priceClock?: Date;
}) {
  const ordersRepo = new InMemoryOrdersRepository();
  const knowledge = new KnowledgeService(undefined, options.priceClock ?? new Date('2026-08-15'));
  const content = new ContentService(
    options.content ?? new InMemoryContentRepository(activeContent(), ['ELNI']),
  );
  await content.reload();
  const orchestrator = new AgentOrchestrator(
    options.parser ?? new MockParser(),
    knowledge,
    ordersRepo,
    undefined,
    undefined,
    content,
  );
  const bot = new MockAdapter();
  const zca = new MockAdapter();
  const outbound = new MockAdapter();
  const router = new OutboundChannelRouter(bot, zca, outbound);
  const orders = new OrdersService(ordersRepo, router);
  const settings = { autoSend: () => options.autoSend } as RuntimeSettingsService;
  const pipeline = new PipelineService(
    orchestrator,
    orders,
    undefined,
    settings,
    undefined,
    knowledge,
  );
  return { pipeline, outbound };
}

describe('product advice outbound', () => {
  it('sends active approved-ready FAQ + image + links when kill switch is on', async () => {
    const { pipeline, outbound } = await build({ autoSend: 'on' });

    const view = await pipeline.process(message());

    expect(view.status).toBe('sent');
    expect(outbound.sent).toHaveLength(1);
    expect(outbound.sent[0]?.text).toContain('Lau bằng khăn mềm');
    expect(outbound.sent[0]?.text).toContain('Ảnh: https://cdn.example.test/elni.webp');
    expect(outbound.sent[0]?.text).toContain('Catalog: https://catalog.example.test/elni');
  });

  it('sends active text advice when optional image and links are absent', async () => {
    const textOnlyContent = { ...activeContent(), assets: [], links: [] };
    const { pipeline, outbound } = await build({
      autoSend: 'on',
      content: new InMemoryContentRepository(textOnlyContent, ['ELNI']),
    });

    const view = await pipeline.process(message());

    expect(view.status).toBe('sent');
    expect(outbound.sent).toHaveLength(1);
    expect(outbound.sent[0]?.text).toContain('Lau bằng khăn mềm');
    expect(outbound.sent[0]?.text).not.toContain('Ảnh:');
    expect(outbound.sent[0]?.text).not.toContain('Catalog:');
  });

  it('does not send when AUTO_SEND kill switch is off', async () => {
    const { pipeline, outbound } = await build({ autoSend: 'off' });

    const view = await pipeline.process(message());

    expect(view.status).toBe('pending_review');
    expect(outbound.sent).toHaveLength(0);
  });

  it('hands off and does not send when approved content is missing', async () => {
    const { pipeline, outbound } = await build({
      autoSend: 'on',
      content: new InMemoryContentRepository({}, ['ELNI']),
    });

    const view = await pipeline.process(message());

    expect(view.status).toBe('needs_edit');
    expect(view.trace?.steps.find((step) => step.role === 'product_advisor')?.handoff).toBe(true);
    expect(outbound.sent).toHaveLength(0);
  });

  it('does not send a requested price when the exact current price period is absent', async () => {
    const parser: OrderParser = {
      name: 'forced-product-question',
      async parse(_input: ParserInput): Promise<ParseResult> {
        return { intent: 'hoi_san_pham', confidence: { intent: 0.99 } };
      },
    };
    const { pipeline, outbound } = await build({
      autoSend: 'on',
      parser,
      priceClock: new Date('2026-09-15'),
    });

    const view = await pipeline.process(message('ELNI co tot khong, gia bao nhieu?'));

    expect(view.status).toBe('needs_edit');
    expect(view.trace?.outbound?.text).not.toMatch(/\d{1,3}(?:[.,]\d{3})+đ/);
    expect(outbound.sent).toHaveLength(0);
  });
});

function activeContent() {
  return {
    provenance: [],
    assets: [
      {
        id: 'asset-1',
        externalId: 'elni-photo',
        kind: 'image' as const,
        title: 'ELNI',
        locator: 'https://cdn.example.test/elni.webp',
        source: 'object_storage' as const,
        status: 'active' as const,
        productSkus: ['ELNI'],
        operatorEdited: false,
      },
    ],
    faqs: [
      {
        id: 'faq-1',
        externalId: 'clean',
        productSku: 'ELNI',
        question: 'Có tốt không?',
        answer: 'Lau bằng khăn mềm.',
        status: 'active' as const,
        operatorEdited: false,
      },
    ],
    advice: [],
    links: [
      {
        id: 'link-1',
        externalId: 'catalog',
        productSku: 'ELNI',
        kind: 'catalog' as const,
        title: 'Catalog',
        url: 'https://catalog.example.test/elni',
        status: 'active' as const,
        operatorEdited: false,
      },
    ],
    readiness: [],
  };
}
