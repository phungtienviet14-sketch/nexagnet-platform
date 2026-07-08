// Bat AUTO_SEND + tat gian nhip TRUOC khi import (PipelineService doc env luc construct).
process.env.AUTO_SEND = 'on';
process.env.STREAM_STEP_DELAY_MS = '0';

import { describe, expect, it } from 'vitest';
import type { ChannelMessage } from '@ultty/shared';
import { AgentOrchestrator } from '../agents/agent-orchestrator.service.js';
import { MockAdapter } from '../channels/mock.adapter.js';
import { KiotVietMockAdapter } from '../kiotviet/kiotviet.adapter.js';
import { KnowledgeService } from '../knowledge/knowledge.service.js';
import { InMemoryOrdersRepository } from '../orders/orders.repository.js';
import { OrdersService } from '../orders/orders.service.js';
import { MockParser } from './mock-parser.js';
import { PipelineService } from './pipeline.service.js';

const GROUP = 'zgr-f8a7101d77709e2ec761'; // Meta HN (dai_ly)

function build() {
  const knowledge = new KnowledgeService();
  const repo = new InMemoryOrdersRepository();
  const orchestrator = new AgentOrchestrator(new MockParser(), knowledge, repo);
  const adapter = new MockAdapter();
  const orders = new OrdersService(repo, adapter, new KiotVietMockAdapter(knowledge));
  const pipeline = new PipelineService(orchestrator, orders);
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

describe('PipelineService AUTO_SEND (AI tu chot khi khong rui ro)', () => {
  it('đơn KHÔNG rủi ro -> AI tự chốt: gửi nhóm + đồng bộ KiotViet, status synced', async () => {
    const { pipeline, adapter } = build();
    const view = await pipeline.process(msg('@Bot ultty AI orders 3 noi chien'));

    expect(view.trace?.supervisor.riskLevel).toBe('none');
    expect(view.status).toBe('synced'); // tu duyet, khong can Sale
    expect(view.kiotVietCode).toMatch(/^KV-/);
    expect(adapter.sent).toHaveLength(1); // da gui xac nhan vao nhom
    expect(adapter.sent[0]!.text).toContain('Tin tự động');
  });

  it('đơn LỚN (Giám sát leo thang) -> KHÔNG tự gửi, giữ Sale duyệt', async () => {
    const { pipeline, adapter } = build();
    const view = await pipeline.process(msg('@Bot ultty AI orders 50 ghe felix'));

    expect(view.trace?.supervisor.escalate).toBe(true);
    expect(view.status).toBe('needs_edit'); // khong synced
    expect(view.kiotVietCode).toBeUndefined();
    expect(adapter.sent).toHaveLength(0); // KHONG tu gui
  });

  it('đơn có cảnh báo/số lượng lớn (Giám sát theo dõi) -> KHÔNG tự gửi', async () => {
    const { pipeline, adapter } = build();
    const view = await pipeline.process(msg('@Bot ultty AI orders 30 am sieu toc'));

    // watch (SL >= 30) hoac bat ky rui ro nao -> khong auto-send.
    expect(view.trace?.supervisor.riskLevel).not.toBe('none');
    expect(view.status).not.toBe('synced');
    expect(adapter.sent).toHaveLength(0);
  });
});
