import { describe, expect, it, vi } from 'vitest';
import type { ChannelMessage } from '@netviet/shared';
import { AgentOrchestrator } from '../agents/agent-orchestrator.service.js';
import type { GroupDiscoveryService } from '../groups/group-discovery.service.js';
import { InMemoryGroupParticipantsRepository } from '../groups/group-participants.repository.js';
import type { GroupParticipantsRepository } from '../groups/group-participants.repository.js';
import { KnowledgeService } from '../knowledge/knowledge.service.js';
import {
  InMemoryMessagesRepository,
  MessagesRepository,
  type SaveMessageResult,
} from '../messages/messages.repository.js';
import { ConversationContextBuilder } from '../messages/conversation-context.js';
import { InMemoryOrdersRepository } from '../orders/orders.repository.js';
import type { OrdersService } from '../orders/orders.service.js';
import type { RuntimeSettingsService } from '../runtime/runtime-settings.service.js';
import { MockParser } from './mock-parser.js';
import { PipelineService } from './pipeline.service.js';

const BOT_NAME = 'Bot ultty AI orders';
const MAPPED_GROUP = new KnowledgeService().groups().find((g) => g.dealerId === 'meta-hn')!.chatId;
const UNMAPPED_GROUP = 'nhom-chua-map-9999';
const IMAGE_URL = 'https://photo-stal-16.zdn.vn/gr/jpg/abc/def.jpg';

class DuplicateMessagesRepository extends MessagesRepository {
  async save(): Promise<SaveMessageResult> {
    return { id: 'existing-message', duplicate: true };
  }
  async attachOrder(): Promise<void> {}
  async recordMedia(): Promise<void> {}
}

function fakeDiscovery() {
  const observe = vi.fn(async (_chatId: string): Promise<void> => undefined);
  return { discovery: { observe } as unknown as GroupDiscoveryService, observe };
}

function build(options: {
  messages?: MessagesRepository;
  discovery?: GroupDiscoveryService;
  participants?: GroupParticipantsRepository;
  withKnowledge?: boolean;
  burstWindowMs?: number;
  ordersService?: OrdersService;
  settings?: RuntimeSettingsService;
}) {
  const knowledge = new KnowledgeService();
  const orders = new InMemoryOrdersRepository();
  const messages = options.messages ?? new InMemoryMessagesRepository();
  const orchestrator = new AgentOrchestrator(new MockParser(), knowledge, orders);
  const pipeline = new PipelineService(
    orchestrator,
    options.ordersService,
    messages,
    options.settings,
    options.participants,
    options.withKnowledge === false ? undefined : knowledge,
    options.discovery,
    undefined,
    new ConversationContextBuilder(messages),
    options.burstWindowMs,
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

/** Anh gui TRAN: khong chu thich, chi co link anh. */
function imageOnlyMsg(chatId: string, externalMessageId: string): ChannelMessage {
  return { ...msg(chatId, externalMessageId, ''), imageUrl: IMAGE_URL };
}

describe('PipelineService.intake — luu truoc, loc parser sau', () => {
  it('gom burst dat don + VAT cung nhom, cung nguoi gui thanh mot don', async () => {
    const messages = new InMemoryMessagesRepository();
    const { pipeline, orders } = build({ messages, burstWindowMs: 20 });
    const sentAt = new Date('2026-08-14T02:00:00.000Z');

    const first = pipeline.intake(
      { ...msg(MAPPED_GROUP, 'm-burst-order', 'gửi tn cho chị 4 con quạt tích đinẹ nhé'), sentAt },
      BOT_NAME,
    );
    const second = pipeline.intake(
      {
        ...msg(MAPPED_GROUP, 'm-burst-vat', 'lấy vat'),
        sentAt: new Date(sentAt.getTime() + 50),
      },
      BOT_NAME,
    );

    const [firstResult, secondResult] = await Promise.all([first, second]);
    const created = await orders.list();

    expect(firstResult.outcome).toBe('processed');
    expect(secondResult.outcome).toBe('processed');
    expect(firstResult.view?.id).toBe(secondResult.view?.id);
    expect(created).toHaveLength(1);
    expect(created[0]?.rawText).toContain('lấy vat');
    expect(created[0]?.parsed?.items).toEqual([{ skuRaw: 'quat tich dine', quantity: 4 }]);
    expect(created[0]?.parsed?.wantVat).toBe(true);
    expect(created[0]?.priced?.lines[0]?.sku).toBe('ELNI');
  });

  it('noi provenance theo sentAt de messageId legacy luon la tin som nhat', async () => {
    class TrackingMessages extends InMemoryMessagesRepository {
      readonly attached: string[] = [];
      override async attachOrder(_orderId?: string, messageId?: string): Promise<void> {
        if (messageId) this.attached.push(messageId);
      }
    }
    const messages = new TrackingMessages();
    const { pipeline } = build({ messages, burstWindowMs: 20 });
    const base = new Date('2026-08-14T02:00:00.000Z');

    await Promise.all([
      pipeline.intake(
        { ...msg(MAPPED_GROUP, 'm-arrived-first', 'lấy vat'), sentAt: new Date(base.getTime() + 50) },
        BOT_NAME,
      ),
      pipeline.intake(
        { ...msg(MAPPED_GROUP, 'm-chronological-first', '4 quat elni'), sentAt: base },
        BOT_NAME,
      ),
    ]);

    const chronologicalFirstId = messages
      .list()
      .find((row) => row.externalMessageId === 'm-chronological-first')?.id;
    expect(messages.attached[0]).toBe(chronologicalFirstId);
  });

  it('anh den khi text dang cho burst -> gom vao cung mot pipeline, khong tao hai don', async () => {
    const messages = new InMemoryMessagesRepository();
    const { pipeline, orchestrator, orders } = build({ messages, burstWindowMs: 40 });
    const run = vi.spyOn(orchestrator, 'run');
    const sentAt = new Date('2026-08-14T02:00:00.000Z');

    const text = pipeline.intake(
      { ...msg(MAPPED_GROUP, 'm-text-before-image', '4 quat elni'), sentAt },
      BOT_NAME,
    );
    const image = pipeline.intake(
      {
        ...imageOnlyMsg(MAPPED_GROUP, 'm-image-after-text'),
        sentAt: new Date(sentAt.getTime() + 25),
      },
      BOT_NAME,
    );

    const [textResult, imageResult] = await Promise.all([text, image]);

    expect(run).toHaveBeenCalledTimes(1);
    expect(textResult.view?.id).toBe(imageResult.view?.id);
    expect(await orders.list()).toHaveLength(1);
    expect(run.mock.calls[0]?.[0]).toMatchObject({ imageUrl: IMAGE_URL });
  });

  it('gom theo thanh vien va nhom, khong tach y dinh chi vi hai tin di qua hai adapter hybrid', async () => {
    const messages = new InMemoryMessagesRepository();
    const { pipeline, orders } = build({ messages, burstWindowMs: 20 });
    const sentAt = new Date('2026-08-14T02:00:00.000Z');

    await Promise.all([
      pipeline.intake(
        {
          ...msg(MAPPED_GROUP, 'm-hybrid-order', 'gửi tn cho chị 4 con quạt tích đinẹ nhé'),
          source: 'bot_webhook',
          sentAt,
        },
        BOT_NAME,
      ),
      pipeline.intake(
        {
          ...msg(MAPPED_GROUP, 'm-hybrid-vat', 'lấy vat'),
          source: 'zca_listener',
          sentAt: new Date(sentAt.getTime() + 50),
        },
        BOT_NAME,
      ),
    ]);

    expect(await orders.list()).toHaveLength(1);
  });

  it('khong gom hai thanh vien khac nhau du nhan cung luc trong mot nhom', async () => {
    const messages = new InMemoryMessagesRepository();
    const { pipeline, orders } = build({ messages, burstWindowMs: 20 });
    const sentAt = new Date('2026-08-14T02:00:00.000Z');

    const [first, second] = await Promise.all([
      pipeline.intake({ ...msg(MAPPED_GROUP, 'm-user-1', '4 quat elni'), sentAt }, BOT_NAME),
      pipeline.intake(
        {
          ...msg(MAPPED_GROUP, 'm-user-2', '2 ghe felix'),
          senderExternalId: 'user-2',
          senderDisplayName: 'Thanh vien khac',
          sentAt,
        },
        BOT_NAME,
      ),
    ]);

    expect(first.view?.id).not.toBe(second.view?.id);
    expect(await orders.list()).toHaveLength(2);
  });

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

  // Dot A' Task 1 — mat xich cuoi: schema + 2 mapper da cho anh tran di qua, nhung dieu thuc su
  // quan trong la no VAO DEN DB. Text rong khong duoc lam vo bat ky chang nao phia sau.
  it('tin CHI CO ANH (text rong) van vao DB va chay het pipeline', async () => {
    const repo = new InMemoryMessagesRepository();
    const { pipeline } = build({ messages: repo });

    const result = await pipeline.intake(imageOnlyMsg(MAPPED_GROUP, 'm-anh-tran'), BOT_NAME);

    expect(result.outcome).toBe('processed');
    expect(repo.list()).toHaveLength(1);
    expect(repo.list()[0]?.text).toBe('');
    expect(repo.list()[0]?.imageUrl).toBe(IMAGE_URL);
  });

  it('tin CHI CO ANH o nhom CHUA map -> van luu DB kem link anh (bat bien I1)', async () => {
    const repo = new InMemoryMessagesRepository();
    const { pipeline } = build({ messages: repo });

    const result = await pipeline.intake(imageOnlyMsg(UNMAPPED_GROUP, 'm-anh-chua-map'), BOT_NAME);

    expect(result.outcome).toBe('stored_only');
    expect(repo.list()[0]?.imageUrl).toBe(IMAGE_URL);
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

  it('retry cung worker sau khi da save nhung orchestrator loi -> chay lai thay vi duplicate complete', async () => {
    const messages = new InMemoryMessagesRepository();
    const { pipeline, orchestrator, orders } = build({ messages });
    const run = vi.spyOn(orchestrator, 'run').mockRejectedValueOnce(new Error('LLM timeout'));
    const message = msg(MAPPED_GROUP, 'm-retry-after-save');

    await expect(pipeline.intake(message, BOT_NAME)).rejects.toThrow('LLM timeout');
    const retried = await pipeline.intake(message, BOT_NAME, { retryPersisted: true });

    expect(retried.outcome).toBe('processed');
    expect(run).toHaveBeenCalledTimes(2);
    expect(messages.list()).toHaveLength(1);
    expect(await orders.list()).toHaveLength(1);
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

  it('UID routing moi chua reconcile voi stable participant restrictive -> chan auto-send fail closed', async () => {
    const participants = new InMemoryGroupParticipantsRepository();
    const syncedAt = '2026-08-14T02:00:00.000Z';
    await participants.synchronize({
      groupId: MAPPED_GROUP,
      complete: true,
      syncedAt,
      members: [{ externalUserId: 'old-routing-uid', globalId: 'stable-user', displayName: 'A' }],
    });
    const stable = (await participants.list(MAPPED_GROUP, {})).participants[0]!;
    await participants.update(MAPPED_GROUP, stable.id, { handlingMode: 'manual_review' }, syncedAt);
    const sendConfirmation = vi.fn();
    const ordersService = { sendConfirmation } as unknown as OrdersService;
    const settings = { autoSend: () => 'on' } as unknown as RuntimeSettingsService;
    const { pipeline } = build({
      participants,
      ordersService,
      settings,
    });

    const firstMessage = {
      ...msg(MAPPED_GROUP, 'm-new-routing-uid-1'),
      senderExternalId: 'new-routing-uid',
    };
    const result = await pipeline.intake(firstMessage, BOT_NAME);
    await pipeline.intake(
      { ...firstMessage, externalMessageId: 'm-new-routing-uid-2' },
      BOT_NAME,
    );

    expect(result.outcome).toBe('processed');
    expect(sendConfirmation).not.toHaveBeenCalled();
  });
});
