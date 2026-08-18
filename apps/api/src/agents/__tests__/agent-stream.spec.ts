// Gian nhip = 0 trong test cho nhanh (chi construct orchestrator SAU dong nay).
process.env.STREAM_STEP_DELAY_MS = '0';

import { describe, expect, it } from 'vitest';
import type { AgentStreamEvent, ChannelMessage } from '@netviet/shared';
import { KnowledgeService } from '../../knowledge/knowledge.service.js';
import { SEED } from '../../knowledge/seed.js';
import { InMemoryOrdersRepository } from '../../orders/orders.repository.js';
import { FakeParser } from '../../pipeline/__tests__/fake-parser.js';
import { AgentEventsService } from '../agent-events.service.js';
import { AgentOrchestrator } from '../agent-orchestrator.service.js';

const META_HN = SEED.groups.find((group) => group.dealerId === 'meta-hn')!.chatId;

function msg(text: string, chatId: string = META_HN): ChannelMessage {
  return {
    externalMessageId: `m-${Math.random()}`,
    platform: 'zalo',
    source: 'bot_webhook',
    chatType: 'group',
    externalChatId: chatId,
    text,
    sentAt: new Date(),
  };
}

function capture(events: AgentEventsService) {
  const list: AgentStreamEvent[] = [];
  const sub = events.stream().subscribe((e) => list.push(e));
  return { list, stop: () => sub.unsubscribe() };
}

describe('AgentOrchestrator — streaming su kien', () => {
  it('phat order.created → router active/done → ... → order.finalized (dung thu tu, cung orderId)', async () => {
    const events = new AgentEventsService();
    const { list, stop } = capture(events);
    const orch = new AgentOrchestrator(
      new FakeParser(),
      new KnowledgeService(),
      new InMemoryOrdersRepository(),
      events,
    );

    const view = await orch.run(msg('@Bot ultty AI orders gui 10 ghe felix, ko lay VAT'));
    stop();

    expect(list[0]?.type).toBe('order.created');
    expect(list.at(-1)?.type).toBe('order.finalized');

    const routerActive = list.findIndex(
      (e) => e.type === 'agent.progress' && e.role === 'router' && e.phase === 'active',
    );
    const routerDone = list.findIndex(
      (e) => e.type === 'agent.progress' && e.role === 'router' && e.phase === 'done',
    );
    expect(routerActive).toBe(1); // ngay sau order.created
    expect(routerDone).toBeGreaterThan(routerActive);

    // Supervisor luon co buoc done
    expect(
      list.some((e) => e.type === 'agent.progress' && e.role === 'supervisor' && e.phase === 'done'),
    ).toBe(true);

    // Moi su kien deu thuoc cung 1 orderId = id don tra ve
    const finalEvent = list.at(-1);
    if (finalEvent?.type === 'order.finalized') {
      expect(finalEvent.order.id).toBe(view.id);
    }
    const orderIds = new Set(
      list.map((e) =>
        e.type === 'order.created'
          ? e.order.orderId
          : e.type === 'agent.progress'
            ? e.orderId
            : e.order.id,
      ),
    );
    expect(orderIds.size).toBe(1);
    expect(orderIds.has(view.id)).toBe(true);
  });

  it('khong co subscriber → van tra ve OrderView day du (backward-compatible)', async () => {
    const events = new AgentEventsService(); // khong subscribe
    const orch = new AgentOrchestrator(
      new FakeParser(),
      new KnowledgeService(),
      new InMemoryOrdersRepository(),
      events,
    );
    const view = await orch.run(msg('@Bot ultty AI orders 3 noi chien'));
    expect(view.trace?.steps).toHaveLength(6);
    expect(events.hasSubscribers()).toBe(false);
  });

  it('rerun voi orderId → GIU nguyen id, KHONG tao don moi', async () => {
    const events = new AgentEventsService();
    const repo = new InMemoryOrdersRepository();
    const orch = new AgentOrchestrator(new FakeParser(), new KnowledgeService(), repo, events);

    const first = await orch.run(msg('@Bot ultty AI orders 3 noi chien'));
    const rerun = await orch.run(msg('@Bot ultty AI orders 3 noi chien'), undefined, {
      orderId: first.id,
      rerun: true,
    });

    expect(rerun.id).toBe(first.id);
    expect(await repo.list()).toHaveLength(1); // cung id -> ghi de, khong nhan doi
  });
});
