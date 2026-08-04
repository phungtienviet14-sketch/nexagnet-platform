import { describe, expect, it, vi } from 'vitest';
import type { ChannelMessage } from '@ultty/shared';
import { AgentOrchestrator } from '../agents/agent-orchestrator.service.js';
import type { GroupDiscoveryService } from '../groups/group-discovery.service.js';
import { InMemoryGroupParticipantsRepository } from '../groups/group-participants.repository.js';
import { KnowledgeService } from '../knowledge/knowledge.service.js';
import {
  InMemoryMessagesRepository,
  MessagesRepository,
  type SaveMessageResult,
} from '../messages/messages.repository.js';
import { InMemoryOrdersRepository } from '../orders/orders.repository.js';
import { MockParser } from './mock-parser.js';
import { PipelineService } from './pipeline.service.js';

const BOT_NAME = 'Bot ultty AI orders';
const MAPPED_GROUP = new KnowledgeService().groups().find((g) => g.dealerId === 'meta-hn')!.chatId;
const UNMAPPED_GROUP = 'nhom-chua-map-9999';

class DuplicateMessagesRepository extends MessagesRepository {
  async save(): Promise<SaveMessageResult> {
    return { id: 'existing-message', duplicate: true };
  }
  async attachOrder(): Promise<void> {}
}

function fakeDiscovery() {
  const observe = vi.fn(async (_chatId: string): Promise<void> => undefined);
  return { discovery: { observe } as unknown as GroupDiscoveryService, observe };
}

function build(options: {
  messages?: MessagesRepository;
  discovery?: GroupDiscoveryService;
  participants?: InMemoryGroupParticipantsRepository;
  withKnowledge?: boolean;
}) {
  const knowledge = new KnowledgeService();
  const orders = new InMemoryOrdersRepository();
  const orchestrator = new AgentOrchestrator(new MockParser(), knowledge, orders);
  const pipeline = new PipelineService(
    orchestrator,
    undefined,
    options.messages ?? new InMemoryMessagesRepository(),
    undefined,
    options.participants,
    options.withKnowledge === false ? undefined : knowledge,
    options.discovery,
  );
  return { pipeline, orchestrator, orders };
}

function msg(
  chatId: string,
  externalMessageId: string,
  text = '@Bot ultty AI orders gui 10 ghe felix',
): ChannelMessage {
  return {
    externalMessageId,
    platform: 'zalo',
    source: 'zca_listener',
    chatType: 'group',
    externalChatId: chatId,
    senderExternalId: 'user-1',
    senderDisplayName: 'Chi Phuong',
    text,
    sentAt: new Date(),
  };
}

describe('PipelineService.intake — luu truoc, loc parser sau', () => {
  it('nhom da map -> outcome processed kem view don', async () => {
    const { pipeline } = build({});

    const result = await pipeline.intake(msg(MAPPED_GROUP, 'm-mapped'), BOT_NAME);

    expect(result.outcome).toBe('processed');
    expect(result.view?.intent).toBe('dat_don');
  });

  it('nhom CHUA map -> tin VAN duoc luu vao DB (bat bien I1)', async () => {
    const repo = new InMemoryMessagesRepository();
    const { pipeline } = build({ messages: repo });

    const result = await pipeline.intake(msg(UNMAPPED_GROUP, 'm-unmapped'), BOT_NAME);

    expect(result.outcome).toBe('stored_only');
    expect(repo.list()).toHaveLength(1);
    expect(repo.list()[0]?.externalChatId).toBe(UNMAPPED_GROUP);
  });

  it('nhom CHUA map -> KHONG goi orchestrator (khong day PII sang LLM)', async () => {
    const { pipeline, orchestrator } = build({});
    const run = vi.spyOn(orchestrator, 'run');

    await pipeline.intake(msg(UNMAPPED_GROUP, 'm-unmapped-2'), BOT_NAME);

    expect(run).not.toHaveBeenCalled();
  });

  it('nhom CHUA map -> khong tao don', async () => {
    const { pipeline, orders } = build({});

    await pipeline.intake(msg(UNMAPPED_GROUP, 'm-unmapped-3'), BOT_NAME);

    expect(await orders.list()).toHaveLength(0);
  });

  it('tin trung trong kho ben vung -> outcome duplicate, khong chay lai orchestrator', async () => {
    const { pipeline, orchestrator } = build({ messages: new DuplicateMessagesRepository() });
    const run = vi.spyOn(orchestrator, 'run');

    const result = await pipeline.intake(msg(MAPPED_GROUP, 'm-trung'), BOT_NAME);

    expect(result.outcome).toBe('duplicate');
    expect(run).not.toHaveBeenCalled();
  });

  it('ghi nhan nhom cho ca nhom da map lan chua map', async () => {
    const { discovery, observe } = fakeDiscovery();
    const { pipeline } = build({ discovery });

    await pipeline.intake(msg(MAPPED_GROUP, 'm-obs-1'), BOT_NAME);
    await pipeline.intake(msg(UNMAPPED_GROUP, 'm-obs-2'), BOT_NAME);

    expect(observe.mock.calls.map((call) => call[0])).toEqual([MAPPED_GROUP, UNMAPPED_GROUP]);
  });

  it('GroupDiscoveryService loi -> tin van duoc xu ly (bat bien I6)', async () => {
    const observe = vi.fn(async (_chatId: string): Promise<void> => {
      throw new Error('DB sap');
    });
    const discovery = { observe } as unknown as GroupDiscoveryService;
    const { pipeline } = build({ discovery });

    const result = await pipeline.intake(msg(MAPPED_GROUP, 'm-obs-loi'), BOT_NAME);

    expect(result.outcome).toBe('processed');
  });

  it('ghi nhan nguoi gui vao danh sach thanh vien, ke ca khi nhom CHUA map', async () => {
    // Zalo tra danh sach thanh vien rong (04/08/2026) -> luong tin la nguon duy nhat con lai.
    const participants = new InMemoryGroupParticipantsRepository();
    const { pipeline } = build({ participants });

    await pipeline.intake(msg(UNMAPPED_GROUP, 'm-sender'), BOT_NAME);

    const { participants: rows } = await participants.list(UNMAPPED_GROUP, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      externalUserId: 'user-1',
      displayName: 'Chi Phuong',
      source: 'message_stream',
    });
  });

  it('tin khong co ten nguoi gui -> khong tao ho so rong', async () => {
    const participants = new InMemoryGroupParticipantsRepository();
    const { pipeline } = build({ participants });
    const anonymous = { ...msg(MAPPED_GROUP, 'm-an-danh') };
    delete (anonymous as { senderDisplayName?: string }).senderDisplayName;

    await pipeline.intake(anonymous, BOT_NAME);

    expect((await participants.list(MAPPED_GROUP, {})).participants).toHaveLength(0);
  });

  it('khong co KnowledgeService -> FAIL CLOSED: luu tin nhung khong dua sang parser', async () => {
    // Neu DI hong ma ta doan "da map" thi PII cua MOI nhom se chay thang sang LLM trong im lang.
    // Chua xac minh duoc thi coi nhu chua map — tin van duoc luu nguyen ven.
    const repo = new InMemoryMessagesRepository();
    const { pipeline } = build({ messages: repo, withKnowledge: false });

    const result = await pipeline.intake(msg(MAPPED_GROUP, 'm-khong-knowledge'), BOT_NAME);

    expect(result.outcome).toBe('stored_only');
    expect(repo.list()).toHaveLength(1);
  });
});
