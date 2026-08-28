import { describe, expect, it } from 'vitest';
import type { AgentStep, ChannelMessage } from '@netviet/shared';
import { KnowledgeService } from '../../knowledge/knowledge.service.js';
import { SEED } from '../../knowledge/seed.js';
import { InMemoryOrdersRepository } from '../../orders/orders.repository.js';
import { FakeParser } from '../../pipeline/__tests__/fake-parser.js';
import { AgentOrchestrator } from '../agent-orchestrator.service.js';

const BOT = 'Bot ultty AI orders';
const META_HN = SEED.groups.find((group) => group.dealerId === 'meta-hn')!.chatId;

function build(): AgentOrchestrator {
  return new AgentOrchestrator(
    new FakeParser(),
    new KnowledgeService(undefined, new Date('2026-08-15T00:00:00.000Z')),
    new InMemoryOrdersRepository(),
  );
}

function msg(
  text: string,
  chatId: string = META_HN,
  source: ChannelMessage['source'] = 'bot_webhook',
): ChannelMessage {
  return {
    externalMessageId: `m-${Math.random()}`,
    platform: 'zalo',
    source,
    chatType: 'group',
    externalChatId: chatId,
    text,
    sentAt: new Date(),
  };
}

const activeRoles = (steps: AgentStep[]): string[] =>
  steps.filter((s) => s.status !== 'skipped').map((s) => s.role);

describe('AgentOrchestrator — multi-agent 6 con', () => {
  it.each([
    ['bot_webhook', 'bot'],
    ['zca_listener', 'zca'],
    ['copilot_paste', 'mock'],
  ] as const)('luu replyChannel theo nguon %s -> %s', async (source, replyChannel) => {
    const view = await build().run(msg('@Bot ultty AI orders 3 noi chien', META_HN, source), BOT);

    expect(view.replyChannel).toBe(replyChannel);
  });

  it('trace LUON du 6 vai dung thu tu; mock => 0 lan goi LLM', async () => {
    const view = await build().run(msg('@Bot ultty AI orders 3 noi chien'), BOT);
    expect(view.trace?.steps).toHaveLength(6);
    expect(view.trace?.steps.map((s) => s.role)).toEqual([
      'router',
      'product_advisor',
      'sales',
      'policy_finance',
      'after_sales',
      'supervisor',
    ]);
    expect(view.trace?.llmCalls).toBe(0);
    expect(view.trace?.brainMode).toBe('mock');
  });

  it('dat_don: >=4 vai tham gia (router, sales, policy_finance, supervisor); tien do RULES ENGINE', async () => {
    const view = await build().run(msg('@Bot ultty AI orders gui 10 ghe felix, ko lay VAT'), BOT);
    expect(view.intent).toBe('dat_don');
    const roles = activeRoles(view.trace!.steps);
    expect(roles).toEqual(expect.arrayContaining(['router', 'sales', 'policy_finance', 'supervisor']));
    // Nguyen tac bat bien: gia/tong tu rules engine (10 x 1.150.000 gia si that, khong VAT)
    expect(view.priced?.grandTotal).toBe(11_500_000); // = itemsSubtotal, tu rules engine
    expect(view.trace?.steps.find((s) => s.role === 'sales')?.source).toBe('rules');
  });

  it('hoi_gia -> KHONG tao don; Chính sách & tài chính báo giá', async () => {
    const view = await build().run(msg('ghe felix bao nhieu tien c oi'), BOT);
    expect(view.intent).toBe('hoi_gia');
    expect(view.priced).toBeNull();
    expect(view.trace?.steps.find((s) => s.role === 'policy_finance')?.status).toBe('active');
    expect(view.trace?.reply).toContain('Felix');
  });

  it('hoi_san_pham (câu hỏi, không số lượng) -> handoff an toàn khi chưa có content duyệt', async () => {
    const view = await build().run(msg('ghe felix co tot khong c oi'), BOT);
    expect(view.intent).toBe('hoi_san_pham');
    expect(view.priced).toBeNull();
    expect(view.trace?.steps.find((s) => s.role === 'product_advisor')?.status).toBe('handoff');
  });

  it('bảo hành -> Hậu mãi handoff kỹ thuật', async () => {
    const view = await build().run(msg('ghe felix bi loi 1 cai'), BOT);
    expect(view.intent).toBe('bao_hanh_khieu_nai');
    expect(view.trace?.steps.find((s) => s.role === 'after_sales')?.status).toBe('handoff');
  });

  it('đơn lớn bất thường -> Giám sát leo thang, status needs_edit', async () => {
    const view = await build().run(msg('@Bot ultty AI orders 50 ghe felix'), BOT);
    expect(view.priced?.grandTotal).toBeGreaterThanOrEqual(20_000_000);
    expect(view.trace?.supervisor.escalate).toBe(true);
    expect(view.status).toBe('needs_edit');
    expect(view.trace?.steps.find((s) => s.role === 'supervisor')?.status).toBe('handoff');
  });

  it('tin tu nhom LẠ (chưa map) -> senderType unknown + Giám sát leo thang', async () => {
    const view = await build().run(msg('xin bao gia si', 'zgr-unknown-demo-999'), BOT);
    expect(view.senderType).toBe('unknown');
    expect(view.trace?.supervisor.escalate).toBe(true);
  });
});
