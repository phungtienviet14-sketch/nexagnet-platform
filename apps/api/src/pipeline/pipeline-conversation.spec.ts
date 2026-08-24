// Bat AUTO_SEND + tat gian nhip TRUOC khi import (PipelineService doc env luc construct).
process.env.AUTO_SEND = 'on';
process.env.STREAM_STEP_DELAY_MS = '0';

import { describe, expect, it } from 'vitest';
import type { ChannelMessage } from '@netviet/shared';
import { AgentOrchestrator } from '../agents/agent-orchestrator.service.js';
import { MockAdapter } from '../channels/mock.adapter.js';
import { OutboundChannelRouter } from '../channels/outbound-channel.router.js';
import { InMemoryConversationThreadsRepository } from '../conversations/conversation-threads.repository.js';
import { ConversationsService } from '../conversations/conversations.service.js';
import { KnowledgeService } from '../knowledge/knowledge.service.js';
import { ConversationContextBuilder } from '../messages/conversation-context.js';
import { InMemoryMessagesRepository } from '../messages/messages.repository.js';
import { InMemoryOrdersRepository } from '../orders/orders.repository.js';
import { OrdersService } from '../orders/orders.service.js';
import { SalesOrderOutcomeService } from '../orders/sales-order-outcome.service.js';
import { FakeParser } from './__tests__/fake-parser.js';
import { PipelineService } from './pipeline.service.js';

/**
 * MACH HOI THOAI NHIEU LUOT (Pha 6) — chay het duong that: pipeline -> orchestrator -> rules ->
 * outbound. Parser la ban tat dinh (`FakeParser`), khong goi mang.
 *
 * Ba dieu duoc khoa o day, va ca ba deu la thu he thong KHONG lam duoc truoc 21/08/2026:
 *  1. Tin thieu so luong -> bot HOI LAI, khong am tham tao don 1 chiec roi gui cho khach.
 *  2. Khach dap "20" -> ghep vao don dang do va CHOT.
 *  3. Hai khach hoi cung luc trong CUNG mot nhom -> hai mach doc lap, khong tron so lieu.
 */

const GROUP = new KnowledgeService().groups().find((group) => group.dealerId === 'meta-hn')!.chatId;

function build() {
  const knowledge = new KnowledgeService(undefined, new Date('2026-08-15T00:00:00.000Z'));
  const repo = new InMemoryOrdersRepository();
  const orchestrator = new AgentOrchestrator(new FakeParser(), knowledge, repo);
  const adapter = new MockAdapter();
  const outbound = new OutboundChannelRouter(adapter, new MockAdapter(), new MockAdapter());
  const orders = new OrdersService(repo, outbound);
  const messages = new InMemoryMessagesRepository();
  const conversations = new ConversationsService(
    new InMemoryConversationThreadsRepository(),
    knowledge,
    outbound,
  );
  const pipeline = new PipelineService(
    orchestrator,
    new SalesOrderOutcomeService(orders),
    messages,
    undefined,
    undefined,
    knowledge,
    undefined,
    undefined,
    new ConversationContextBuilder(messages),
    conversations,
  );
  return { pipeline, adapter };
}

let counter = 0;

function msg(text: string, sender: string, name: string): ChannelMessage {
  counter += 1;
  return {
    externalMessageId: `m-${counter}`,
    platform: 'zalo',
    source: 'bot_webhook',
    chatType: 'group',
    externalChatId: GROUP,
    senderExternalId: sender,
    senderDisplayName: name,
    text,
    sentAt: new Date(Date.parse('2026-08-21T09:00:00.000Z') + counter * 1_000),
  };
}

describe('Mach hoi thoai nhieu luot — hoi lai khach roi chot don', () => {
  it('thieu so luong -> HOI LAI khach, khong tu tao don 1 chiec', async () => {
    const { pipeline, adapter } = build();

    const view = await pipeline.process(msg('gui ghe felix ve TN cho c', 'u1', 'Lan'), undefined);

    expect(view.intent).toBe('dat_don');
    // Khong duoc co don da tinh tien: chua ai noi so luong.
    expect(view.priced).toBeNull();
    expect(view.draftGaps?.askable).toEqual(['quantity']);
    expect(view.conversation).toMatchObject({ status: 'awaiting_answer', askCount: 1 });
    expect(adapter.sent).toHaveLength(1);
    expect(adapter.sent[0]!.text).toMatch(/bao nhiêu/i);
    // Cau hoi goi dung ten nguoi hoi va dung ten SP trong DANH MUC.
    expect(adapter.sent[0]!.text).toContain('Lan');
    expect(adapter.sent[0]!.text).toMatch(/felix/i);
  });

  it('khach dap "20" -> ghep vao don dang do va CHOT', async () => {
    const { pipeline, adapter } = build();

    await pipeline.process(msg('gui ghe felix ve TN cho c', 'u1', 'Lan'), undefined);
    const closed = await pipeline.process(msg('20', 'u1', 'Lan'), undefined);

    expect(closed.intent).toBe('dat_don');
    expect(closed.parsed?.items).toEqual([
      expect.objectContaining({ quantity: 20, skuRaw: expect.stringMatching(/felix/i) }),
    ]);
    expect(closed.status).toBe('sent');
    expect(closed.conversation?.status).toBe('closed');
    // Hai tin gui ra: cau hoi lai, roi ban xac nhan don.
    expect(adapter.sent).toHaveLength(2);
    expect(adapter.sent[1]!.text).toMatch(/TỔNG/);
  });

  it('HAI khach hoi cung luc trong cung nhom -> hai mach doc lap, khong tron so lieu', async () => {
    const { pipeline } = build();

    await pipeline.process(msg('gui ghe felix ve TN cho c', 'u1', 'Lan'), undefined);
    await pipeline.process(msg('cho a lay noi chien nhe', 'u2', 'Hung'), undefined);

    // Moi nguoi tra loi mot con so KHAC nhau, xen ke nhau.
    const lan = await pipeline.process(msg('20', 'u1', 'Lan'), undefined);
    const hung = await pipeline.process(msg('3', 'u2', 'Hung'), undefined);

    expect(lan.parsed?.items).toEqual([
      expect.objectContaining({ quantity: 20, skuRaw: expect.stringMatching(/felix/i) }),
    ]);
    expect(hung.parsed?.items).toEqual([
      expect.objectContaining({ quantity: 3, skuRaw: expect.stringMatching(/chien/i) }),
    ]);
  });

  it('het luot hoi -> chuyen Sale, khong hoi mai mot cau', async () => {
    const { pipeline, adapter } = build();

    // Ba tin lien tiep deu thieu so luong: hai cau hoi dau duoc gui, tin thu ba phai dung lai.
    await pipeline.process(msg('gui ghe felix cho c', 'u1', 'Lan'), undefined);
    await pipeline.process(msg('them noi chien nua', 'u1', 'Lan'), undefined);
    const third = await pipeline.process(msg('va them quat mini', 'u1', 'Lan'), undefined);

    expect(adapter.sent).toHaveLength(2);
    expect(third.conversation?.status).toBe('handed_off');
    expect(third.status).toBe('needs_edit');
  });

  it('mach cua nguoi khac KHONG bi cau tra loi cua nguoi nay dong lai', async () => {
    const { pipeline } = build();

    await pipeline.process(msg('gui ghe felix ve TN cho c', 'u1', 'Lan'), undefined);
    // Nguoi thu hai chi chao hoi — khong duoc dong mach cua ai, ke ca cua chinh minh.
    const greeting = await pipeline.process(msg('chao shop', 'u2', 'Hung'), undefined);
    expect(greeting.conversation).toBeUndefined();

    const closed = await pipeline.process(msg('20', 'u1', 'Lan'), undefined);
    expect(closed.status).toBe('sent');
  });
});
