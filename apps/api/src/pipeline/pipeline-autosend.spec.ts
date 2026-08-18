// Bat AUTO_SEND + tat gian nhip TRUOC khi import (PipelineService doc env luc construct).
process.env.AUTO_SEND = 'on';
process.env.STREAM_STEP_DELAY_MS = '0';

import { describe, expect, it } from 'vitest';
import type { ChannelMessage } from '@netviet/shared';
import { AgentOrchestrator } from '../agents/agent-orchestrator.service.js';
import { MockAdapter } from '../channels/mock.adapter.js';
import { OutboundChannelRouter } from '../channels/outbound-channel.router.js';
import { KnowledgeService } from '../knowledge/knowledge.service.js';
import { InMemoryOrdersRepository } from '../orders/orders.repository.js';
import { OrdersService } from '../orders/orders.service.js';
import { FakeParser } from './__tests__/fake-parser.js';
import { PipelineService } from './pipeline.service.js';
import { RuntimeSettingsService } from '../runtime/runtime-settings.service.js';

// Lay chatId nhom Meta HN DONG tu seed (khong hardcode ID).
const GROUP = new KnowledgeService().groups().find((g) => g.dealerId === 'meta-hn')!.chatId;

function build(settings?: RuntimeSettingsService) {
  const knowledge = new KnowledgeService(undefined, new Date('2026-08-15T00:00:00.000Z'));
  const repo = new InMemoryOrdersRepository();
  const orchestrator = new AgentOrchestrator(new FakeParser(), knowledge, repo);
  const adapter = new MockAdapter();
  const outbound = new OutboundChannelRouter(adapter, new MockAdapter(), new MockAdapter());
  const orders = new OrdersService(repo, outbound);
  const pipeline = new PipelineService(orchestrator, orders, undefined, settings);
  return { pipeline, adapter };
}

function msg(text: string): ChannelMessage {
  return {
    externalMessageId: `m-${Math.random()}`,
    platform: 'zalo',
    source: 'bot_webhook',
    chatType: 'group',
    externalChatId: GROUP,
    text,
    sentAt: new Date(),
  };
}

describe('PipelineService AUTO_SEND (policy tenant GĐ1)', () => {
  it('đúng 50 SP -> tự gửi dù risk cũ leo thang, dừng ở sent và giao việc Sale, không gọi ERP', async () => {
    const { pipeline, adapter } = build();
    const view = await pipeline.process(msg('@Bot ultty AI orders 50 quat mini'));

    expect(view.trace?.supervisor.escalate).toBe(true);
    expect(view.status).toBe('sent');
    expect(view.erpCode).toBeUndefined();
    expect(view.salesHandoff).toMatchObject({ action: 'manual_erp_entry', status: 'pending' });
    expect(adapter.sent).toHaveLength(1);
    expect(adapter.sent[0]!.text).toContain('Tin tự động');
  });

  it('51 SP -> KHÔNG tự gửi, giữ Sale can thiệp trước outbound', async () => {
    const { pipeline, adapter } = build();
    const view = await pipeline.process(msg('@Bot ultty AI orders 51 quat mini'));

    expect(view.status).toBe('needs_edit');
    expect(view.erpCode).toBeUndefined();
    expect(view.salesHandoff).toBeUndefined();
    expect(adapter.sent).toHaveLength(0);
  });

  it('cong tac runtime co hieu luc ngay ma khong can khoi dong lai API', async () => {
    process.env.AUTO_SEND = 'off';
    const settings = new RuntimeSettingsService();
    const { pipeline, adapter } = build(settings);

    const waiting = await pipeline.process(msg('@Bot ultty AI orders 3 noi chien'));
    expect(waiting.status).toBe('pending_review');
    expect(adapter.sent).toHaveLength(0);

    settings.setAutoSend(true);
    const sent = await pipeline.process(msg('@Bot ultty AI orders 3 noi chien'));
    expect(sent.status).toBe('sent');
    expect(sent.salesHandoff?.status).toBe('pending');
    expect(adapter.sent).toHaveLength(1);
  });
});
