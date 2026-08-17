import { describe, expect, it } from 'vitest';
import type { ChannelMessage } from '@netviet/shared';
import { AgentOrchestrator } from '../agents/agent-orchestrator.service.js';
import { KnowledgeService } from '../knowledge/knowledge.service.js';
import {
  InMemoryMessagesRepository,
  MessagesRepository,
  type SaveMessageResult,
} from '../messages/messages.repository.js';
import { ConversationContextBuilder } from '../messages/conversation-context.js';
import { InMemoryOrdersRepository } from '../orders/orders.repository.js';
import { MockParser } from './mock-parser.js';
import { PipelineService } from './pipeline.service.js';

const BOT_NAME = 'Bot ultty AI orders';
// Lay chatId nhom Meta HN DONG tu seed (khong hardcode ID) — giong pipeline-orders.spec.
const GROUP = new KnowledgeService().groups().find((g) => g.dealerId === 'meta-hn')!.chatId;

/** Stub ghi lai loi goi de assert luong save/attach (InMemory attachOrder la no-op nen khong assert duoc). */
class RecordingMessagesRepository extends MessagesRepository {
  readonly saved: ChannelMessage[] = [];
  readonly attached: Array<{ orderId: string; messageId: string }> = [];

  async save(message: ChannelMessage): Promise<SaveMessageResult> {
    this.saved.push(message);
    return { id: `rec-${this.saved.length}`, duplicate: false };
  }

  async attachOrder(orderId: string, messageId: string): Promise<void> {
    this.attached.push({ orderId, messageId });
  }

  async recordMedia(): Promise<void> {}
}

class DuplicateMessagesRepository extends MessagesRepository {
  async save(): Promise<SaveMessageResult> {
    return { id: 'existing-message', duplicate: true };
  }

  async attachOrder(): Promise<void> {}
  async recordMedia(): Promise<void> {}
}

class ThrowingMessagesRepository extends MessagesRepository {
  async save(): Promise<SaveMessageResult> {
    throw new Error('DB chet gia lap');
  }

  async attachOrder(): Promise<void> {}
  async recordMedia(): Promise<void> {}
}

function build(messages: MessagesRepository) {
  const knowledge = new KnowledgeService(undefined, new Date('2026-08-15T00:00:00.000Z'));
  const orchestrator = new AgentOrchestrator(new MockParser(), knowledge, new InMemoryOrdersRepository());
  return new PipelineService(
    orchestrator,
    undefined,
    messages,
    undefined,
    undefined,
    knowledge,
    undefined,
    undefined,
    new ConversationContextBuilder(messages),
  );
}

function msg(text: string, externalMessageId: string): ChannelMessage {
  return {
    externalMessageId,
    platform: 'zalo',
    source: 'bot_webhook',
    chatType: 'group',
    externalChatId: GROUP,
    text,
    sentAt: new Date(),
  };
}

describe('Pipeline luu MOI tin vao MessagesRepository (Phase 3)', () => {
  it('tin moi -> luu vao repo TRUOC khi xu ly, du field', async () => {
    const repo = new InMemoryMessagesRepository();
    const pipeline = build(repo);

    await pipeline.process(msg('@Bot ultty AI orders gui 10 ghe felix', 'm-luu-1'), BOT_NAME);

    const rows = repo.list();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.externalMessageId).toBe('m-luu-1');
    expect(rows[0]?.externalChatId).toBe(GROUP);
    expect(rows[0]?.text).toContain('ghe felix');
  });

  it('tin KHONG phai don (hoi gia) van duoc luu — luu MOI tin, khong chi don', async () => {
    const repo = new InMemoryMessagesRepository();
    const pipeline = build(repo);

    await pipeline.process(msg('ghe felix bao nhieu tien c oi', 'm-hoi-gia'), BOT_NAME);

    expect(repo.list()).toHaveLength(1);
  });

  it('tin trung externalMessageId -> khong tao dong thu 2', async () => {
    const repo = new InMemoryMessagesRepository();
    const pipeline = build(repo);

    await pipeline.process(msg('@Bot ultty AI orders 3 noi chien', 'm-trung'), BOT_NAME);
    await pipeline.process(msg('@Bot ultty AI orders 3 noi chien', 'm-trung'), BOT_NAME);

    expect(repo.list()).toHaveLength(1);
  });

  it('tin da ton tai trong kho ben vung -> KHONG chay orchestrator tao don lan nua', async () => {
    const knowledge = new KnowledgeService(undefined, new Date('2026-08-15T00:00:00.000Z'));
    const orders = new InMemoryOrdersRepository();
    const orchestrator = new AgentOrchestrator(new MockParser(), knowledge, orders);
    const pipeline = new PipelineService(orchestrator, undefined, new DuplicateMessagesRepository());

    const result = await pipeline.process(
      msg('@Bot ultty AI orders 3 noi chien', 'm-persisted-duplicate'),
      BOT_NAME,
    );

    expect(result).toBeNull();
    expect(await orders.list()).toHaveLength(0);
  });

  it('rerun (sua don) KHONG luu lai tin', async () => {
    const repo = new RecordingMessagesRepository();
    const pipeline = build(repo);

    // rerun voi orderId bat ky — chi quan tam viec KHONG goi save (loi orchestrator neu co thi nuot).
    await pipeline
      .process(msg('@Bot ultty AI orders 3 noi chien', 'm-rerun'), BOT_NAME, {
        orderId: 'khong-ton-tai',
        rerun: true,
      })
      .catch(() => undefined);

    expect(repo.saved).toHaveLength(0);
  });

  it('don duoc noi voi tin goc (attachOrder nhan dung orderId cua view)', async () => {
    const repo = new RecordingMessagesRepository();
    const pipeline = build(repo);

    const view = await pipeline.process(msg('@Bot ultty AI orders gui 10 ghe felix', 'm-noi'), BOT_NAME);

    expect(repo.attached).toHaveLength(1);
    expect(repo.attached[0]?.orderId).toBe(view.id);
    expect(repo.attached[0]?.messageId).toBe('rec-1');
  });

  it('repo loi -> pipeline VAN xu ly binh thuong (khong chan don)', async () => {
    const pipeline = build(new ThrowingMessagesRepository());

    const view = await pipeline.process(
      msg('@Bot ultty AI orders gui 10 ghe felix', 'm-loi-db'),
      BOT_NAME,
    );

    expect(view.intent).toBe('dat_don');
    expect(view.status).toBe('pending_review');
  });

  it('khong cau hinh MessagesRepository (backward compat) -> pipeline chay nhu cu', async () => {
    const knowledge = new KnowledgeService(undefined, new Date('2026-08-15T00:00:00.000Z'));
    const orchestrator = new AgentOrchestrator(new MockParser(), knowledge, new InMemoryOrdersRepository());
    const pipeline = new PipelineService(orchestrator);

    const view = await pipeline.process(msg('@Bot ultty AI orders 3 noi chien', 'm-compat'), BOT_NAME);

    expect(view.intent).toBe('dat_don');
  });

  it('reply bo sung so luong dung context da luu de ke thua mot SKU', async () => {
    const repo = new InMemoryMessagesRepository();
    const pipeline = build(repo);
    await pipeline.process(msg('10 ghe felix', 'm-original'), BOT_NAME);

    const view = await pipeline.process(
      {
        ...msg('c them 5c nhe', 'm-reply'),
        replyTo: { externalMessageId: 'm-original', text: '10 ghe felix' },
      },
      BOT_NAME,
    );

    expect(view.intent).toBe('dat_don');
    expect(view.parsed?.items).toHaveLength(1);
    expect(view.parsed?.items[0]?.quantity).toBe(5);
    expect(view.parsed?.items[0]?.skuRaw.toLowerCase()).toContain('felix');
  });

  it('reply co nhieu SKU -> handoff an toan, khong tao don doan', async () => {
    const repo = new InMemoryMessagesRepository();
    const pipeline = build(repo);
    await pipeline.process(msg('10 ghe felix va 2 noi chien', 'm-many'), BOT_NAME);

    const view = await pipeline.process(
      {
        ...msg('c them 5c nhe', 'm-ambiguous'),
        replyTo: { externalMessageId: 'm-many' },
      },
      BOT_NAME,
    );

    expect(view.intent).toBe('khac');
    expect(view.parsed).toBeNull();
    expect(view.priced).toBeNull();
  });
});
