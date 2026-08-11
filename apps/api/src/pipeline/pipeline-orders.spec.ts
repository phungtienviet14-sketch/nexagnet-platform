import { describe, expect, it } from 'vitest';
import type { ChannelMessage } from '@netviet/shared';
import { AgentOrchestrator } from '../agents/agent-orchestrator.service.js';
import { KnowledgeService } from '../knowledge/knowledge.service.js';
import { ChannelAdapter } from '../channels/channel-adapter.js';
import { MockAdapter } from '../channels/mock.adapter.js';
import { OutboundChannelRouter } from '../channels/outbound-channel.router.js';
import { KiotVietMockAdapter } from '../erp/kiotviet.mock.adapter.js';
import { InMemoryOrdersRepository } from '../orders/orders.repository.js';
import { OrdersService } from '../orders/orders.service.js';
import { MockParser } from './mock-parser.js';
import { PipelineService } from './pipeline.service.js';

const BOT_NAME = 'Bot ultty AI orders';
// Lay chatId nhom Meta HN DONG tu seed (khong hardcode ID) -> khong vo khi doi sang ID zca that.
const GROUP = new KnowledgeService().groups().find((g) => g.dealerId === 'meta-hn')!.chatId;

function build() {
  const knowledge = new KnowledgeService();
  const repo = new InMemoryOrdersRepository();
  const orchestrator = new AgentOrchestrator(new MockParser(), knowledge, repo);
  const pipeline = new PipelineService(orchestrator);
  const adapter = new MockAdapter();
  const zcaAdapter = new MockAdapter();
  const outbound = new OutboundChannelRouter(adapter, zcaAdapter, new MockAdapter());
  const orders = new OrdersService(repo, outbound, new KiotVietMockAdapter(knowledge));
  return { pipeline, orders, adapter, zcaAdapter };
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

describe('Pipeline + Orders (end-to-end backend)', () => {
  it('tin dat don co tag -> tao don da dinh gia theo cap dai ly, cho duyet', async () => {
    const { pipeline } = build();
    const view = await pipeline.process(
      msg('@Bot ultty AI orders gui 10 ghe felix, ko lay VAT'),
      BOT_NAME,
    );

    expect(view.intent).toBe('dat_don');
    expect(view.priced?.lines?.[0]?.sku).toBe('FELIX');
    expect(view.priced?.lines?.[0]?.unitPrice).toBe(1_250_000); // gia si (Don gia CTV) that
    expect(view.priced?.grandTotal).toBe(12_500_000);
    expect(view.status).toBe('pending_review');
  });

  it('duyet 1 cham -> gui format xac nhan kem nhan tu dong, trang thai sent', async () => {
    const { pipeline, orders, adapter } = build();
    const view = await pipeline.process(msg('@Bot ultty AI orders 3 noi chien'), BOT_NAME);

    const approved = await orders.approve(view.id);

    expect(approved.status).toBe('synced');
    expect(approved.kiotVietCode).toMatch(/^KV-/);
    expect(adapter.sent).toHaveLength(1);
    expect(adapter.sent[0]!.chatId).toBe(GROUP);
    expect(adapter.sent[0]!.text).toContain('Nồi chiên không dầu');
    expect(adapter.sent[0]!.text).toContain('Tin tự động');
  });

  it('don tu zca_listener -> duyet va chi gui bang tai khoan zca', async () => {
    const { pipeline, orders, adapter, zcaAdapter } = build();
    const view = await pipeline.process(
      { ...msg('3 noi chien'), source: 'zca_listener' },
      BOT_NAME,
    );

    await orders.approve(view.id);

    expect(view.replyChannel).toBe('zca');
    expect(zcaAdapter.sent).toHaveLength(1);
    expect(zcaAdapter.sent[0]?.chatId).toBe(GROUP);
    expect(adapter.sent).toHaveLength(0);
  });

  it('gui Zalo LOI -> don giu pending_review de duyet lai (khong ket, H1)', async () => {
    class FailingAdapter extends ChannelAdapter {
      readonly name = 'fail';
      async sendMessage(): Promise<void> {
        throw new Error('rate limit');
      }
    }
    const knowledge = new KnowledgeService();
    const repo = new InMemoryOrdersRepository();
    const pipeline = new PipelineService(new AgentOrchestrator(new MockParser(), knowledge, repo));
    const outbound = new OutboundChannelRouter(
      new FailingAdapter(),
      new MockAdapter(),
      new MockAdapter(),
    );
    const orders = new OrdersService(repo, outbound, new KiotVietMockAdapter(knowledge));

    const view = await pipeline.process(msg('@Bot ultty AI orders 3 noi chien'), BOT_NAME);
    await expect(orders.approve(view.id)).rejects.toThrow();

    const after = await orders.getOrThrow(view.id);
    expect(after.status).toBe('pending_review'); // van con nut Duyet -> retry duoc
    expect(after.kiotVietCode).toBeUndefined(); // chua len KiotViet
  });

  it('tin tu NHOM KHAC -> map dung dai ly/chinh sach/ten nhom cua nhom do (dinh tuyen da nhom)', async () => {
    const { pipeline, orders, adapter } = build();
    const knowledge = new KnowledgeService();
    const tn = knowledge.groups().find((g) => g.dealerId === 'dl-thai-nguyen');
    expect(tn, 'seed can co nhom map -> dl-thai-nguyen').toBeDefined();

    const view = await pipeline.process(
      {
        externalMessageId: `m-${Math.random()}`,
        platform: 'zalo',
        source: 'bot_webhook',
        chatType: 'group',
        externalChatId: tn!.chatId,
        text: '@Bot ultty AI orders gui 10 ghe felix',
        sentAt: new Date(),
      },
      BOT_NAME,
    );

    expect(view.intent).toBe('dat_don');
    expect(view.groupName).toBe(tn!.name);
    expect(view.dealerName).toBe('Đại lý Thái Nguyên');
    expect(view.priced?.policy).toBe('cong_no_45'); // khac Meta HN (cong_no_30) -> dinh tuyen theo nhom
    expect(view.status).toBe('pending_review'); // co dai ly -> khong canh bao "chua xac dinh"

    // Duyet -> xac nhan gui ve DUNG nhom nguon (khong phai Meta HN).
    await orders.approve(view.id);
    expect(adapter.sent.at(-1)?.chatId).toBe(tn!.chatId);
  });

  it('duyet 2 lan cung 1 don -> khong gui lai, khong tao ma KiotViet moi (idempotent, M4)', async () => {
    const { pipeline, orders, adapter } = build();
    const view = await pipeline.process(msg('@Bot ultty AI orders 3 noi chien'), BOT_NAME);

    const first = await orders.approve(view.id);
    const second = await orders.approve(view.id);

    expect(adapter.sent).toHaveLength(1); // chi gui Zalo 1 lan
    expect(second.status).toBe('synced');
    expect(second.kiotVietCode).toBe(first.kiotVietCode); // khong tao ma moi
  });

  it('tin hoi gia khong phai don -> khong nam trong danh sach don, khong duyet duoc', async () => {
    const { pipeline, orders } = build();
    const view = await pipeline.process(msg('ghe felix bao nhieu tien c oi'), BOT_NAME);

    expect(view.intent).toBe('hoi_gia');
    expect(await orders.listOrders()).toHaveLength(0);
    await expect(orders.approve(view.id)).rejects.toThrow();
  });
});
