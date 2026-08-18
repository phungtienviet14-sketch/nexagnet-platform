import { describe, expect, it, vi } from 'vitest';
import type { ChannelMessage } from '@netviet/shared';
import { AgentOrchestrator } from '../agents/agent-orchestrator.service.js';
import { InMemoryGroupParticipantsRepository } from '../groups/group-participants.repository.js';
import { KnowledgeService } from '../knowledge/knowledge.service.js';
import { InMemoryMessagesRepository } from '../messages/messages.repository.js';
import { InMemoryOrdersRepository } from '../orders/orders.repository.js';
import type { OrdersService } from '../orders/orders.service.js';
import type { RuntimeSettingsService } from '../runtime/runtime-settings.service.js';
import { FakeParser } from './__tests__/fake-parser.js';
import { PipelineService } from './pipeline.service.js';

const knowledge = new KnowledgeService(undefined, new Date('2026-08-15T00:00:00.000Z'));
const GROUP = knowledge.groups().find((group) => group.dealerId === 'meta-hn')!.chatId;

function message(id: string): ChannelMessage {
  return {
    externalMessageId: id,
    platform: 'zalo',
    source: 'zca_listener',
    chatType: 'group',
    externalChatId: GROUP,
    senderExternalId: 'customer-1',
    senderDisplayName: 'Khach A',
    text: 'gui 3 noi chien',
    sentAt: new Date(),
  };
}

async function participantRepo(changes: {
  customerRank?: 'dai_ly' | 'ctv' | 'khach_le' | 'unknown';
  handlingMode?: 'inherit_group' | 'process' | 'ignore' | 'manual_review';
}) {
  const repo = new InMemoryGroupParticipantsRepository();
  await repo.synchronize({
    groupId: GROUP,
    members: [{ externalUserId: 'customer-1', displayName: 'Khach A' }],
    complete: true,
    syncedAt: new Date().toISOString(),
  });
  const current = (await repo.list(GROUP, {})).participants[0]!;
  await repo.update(GROUP, current.id, changes, new Date().toISOString());
  return repo;
}

describe('Pipeline ap dung cau hinh thanh vien', () => {
  it('handlingMode=ignore bo truoc khi luu noi dung, LLM va tao order', async () => {
    const participants = await participantRepo({ handlingMode: 'ignore' });
    const orders = new InMemoryOrdersRepository();
    const messages = new InMemoryMessagesRepository();
    const parser = new FakeParser();
    const parseSpy = vi.spyOn(parser, 'parse');
    const pipeline = new PipelineService(
      new AgentOrchestrator(parser, knowledge, orders),
      undefined,
      messages,
      undefined,
      participants,
    );

    await expect(
      pipeline.process(message('ignored-1'), undefined, { allowDuplicateSkip: true }),
    ).resolves.toBeNull();
    expect(messages.list()).toHaveLength(0);
    expect(await orders.list()).toHaveLength(0);
    expect(parseSpy).not.toHaveBeenCalled();
  });

  it('handlingMode=manual_review tuyet doi khong AUTO_SEND', async () => {
    const participants = await participantRepo({ handlingMode: 'manual_review' });
    const orderRepo = new InMemoryOrdersRepository();
    const approve = vi.fn();
    const orders = { approve } as unknown as OrdersService;
    const runtime = { autoSend: () => 'on' } as unknown as RuntimeSettingsService;
    const pipeline = new PipelineService(
      new AgentOrchestrator(new FakeParser(), knowledge, orderRepo),
      orders,
      new InMemoryMessagesRepository(),
      runtime,
      participants,
    );

    const view = await pipeline.process(message('manual-1'));

    expect(view.status).toBe('pending_review');
    expect(approve).not.toHaveBeenCalled();
  });

  it('customerRank doi senderType nhung khong doi don gia cua dealer', async () => {
    const participants = await participantRepo({ customerRank: 'khach_le', handlingMode: 'process' });
    const orderRepo = new InMemoryOrdersRepository();
    const pipeline = new PipelineService(
      new AgentOrchestrator(new FakeParser(), knowledge, orderRepo),
      undefined,
      new InMemoryMessagesRepository(),
      undefined,
      participants,
    );

    const ranked = await pipeline.process(message('ranked-1'));
    const baseline = await new PipelineService(
      new AgentOrchestrator(new FakeParser(), knowledge, new InMemoryOrdersRepository()),
    ).process(message('baseline-1'));

    expect(ranked.senderType).toBe('khach_le');
    expect(ranked.priced?.lines[0]?.unitPrice).toBe(baseline.priced?.lines[0]?.unitPrice);
  });
});
