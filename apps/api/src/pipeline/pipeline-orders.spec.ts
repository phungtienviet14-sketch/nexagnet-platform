import { describe, expect, it, vi } from 'vitest';
import type { ChannelMessage } from '@netviet/shared';
import { AgentOrchestrator } from '../agents/agent-orchestrator.service.js';
import { KnowledgeService } from '../knowledge/knowledge.service.js';
import { ChannelAdapter } from '../channels/channel-adapter.js';
import { MockAdapter } from '../channels/mock.adapter.js';
import { OutboundChannelRouter } from '../channels/outbound-channel.router.js';
import { InMemoryOrdersRepository } from '../orders/orders.repository.js';
import { OrdersService } from '../orders/orders.service.js';
import { MockParser } from './mock-parser.js';
import { PipelineService } from './pipeline.service.js';

const BOT_NAME = 'Bot ultty AI orders';
// Lay chatId nhom Meta HN DONG tu seed (khong hardcode ID) -> khong vo khi doi sang ID zca that.
const GROUP = new KnowledgeService().groups().find((g) => g.dealerId === 'meta-hn')!.chatId;

function build() {
  const knowledge = new KnowledgeService(undefined, new Date('2026-08-15T00:00:00.000Z'));
  const repo = new InMemoryOrdersRepository();
  const orchestrator = new AgentOrchestrator(new MockParser(), knowledge, repo);
  const pipeline = new PipelineService(orchestrator);
  const adapter = new MockAdapter();
  const zcaAdapter = new MockAdapter();
  const outbound = new OutboundChannelRouter(adapter, zcaAdapter, new MockAdapter());
  const orders = new OrdersService(repo, outbound);
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

    expect(approved.status).toBe('sent');
    expect(approved.erpCode).toBeUndefined();
    expect(approved.salesHandoff).toMatchObject({
      action: 'manual_erp_entry',
      status: 'pending',
    });
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
      async sendMessage(): Promise<never> {
        throw new Error('rate limit');
      }
    }
    const knowledge = new KnowledgeService(undefined, new Date('2026-08-15T00:00:00.000Z'));
    const repo = new InMemoryOrdersRepository();
    const pipeline = new PipelineService(new AgentOrchestrator(new MockParser(), knowledge, repo));
    const outbound = new OutboundChannelRouter(
      new FailingAdapter(),
      new MockAdapter(),
      new MockAdapter(),
    );
    const orders = new OrdersService(repo, outbound);

    const view = await pipeline.process(msg('@Bot ultty AI orders 3 noi chien'), BOT_NAME);
    await expect(orders.approve(view.id)).rejects.toThrow();

    const after = await orders.getOrThrow(view.id);
    expect(after.status).toBe('pending_review'); // van con nut Duyet -> retry duoc
    expect(after.erpCode).toBeUndefined(); // chua len ERP
  });

  it('tin tu NHOM KHAC -> map dung dai ly/chinh sach/ten nhom cua nhom do (dinh tuyen da nhom)', async () => {
    const { pipeline, orders, adapter } = build();
    const knowledge = new KnowledgeService(undefined, new Date('2026-08-15T00:00:00.000Z'));
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

  it('duyet 2 lan cung 1 don -> khong gui/tạo handoff lai (idempotent, M4)', async () => {
    const { pipeline, orders, adapter } = build();
    const view = await pipeline.process(msg('@Bot ultty AI orders 3 noi chien'), BOT_NAME);

    const first = await orders.approve(view.id);
    const second = await orders.approve(view.id);

    expect(adapter.sent).toHaveLength(1); // chi gui Zalo 1 lan
    expect(second.status).toBe('sent');
    expect(second.salesHandoff).toEqual(first.salesHandoff);
  });

  it('hai thao tac gui dong thoi cung chia se mot outbound dang chay', async () => {
    class DelayedAdapter extends ChannelAdapter {
      readonly name = 'delayed';
      sent = 0;
      private releaseGate!: () => void;
      private readonly gate = new Promise<void>((resolve) => {
        this.releaseGate = resolve;
      });

      async sendMessage(): Promise<Record<string, never>> {
        this.sent += 1;
        await this.gate;
        return {};
      }

      release(): void {
        this.releaseGate();
      }
    }

    const knowledge = new KnowledgeService(undefined, new Date('2026-08-15T00:00:00.000Z'));
    const repo = new InMemoryOrdersRepository();
    const pipeline = new PipelineService(new AgentOrchestrator(new MockParser(), knowledge, repo));
    const delayed = new DelayedAdapter();
    const orders = new OrdersService(
      repo,
      new OutboundChannelRouter(delayed, new MockAdapter(), new MockAdapter()),
    );
    const view = await pipeline.process(msg('@Bot ultty AI orders 3 noi chien'), BOT_NAME);

    const first = orders.approve(view.id);
    const second = orders.approve(view.id);
    await vi.waitFor(() => expect(delayed.sent).toBe(1));
    delayed.release();

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(delayed.sent).toBe(1);
    expect(secondResult.salesHandoff).toEqual(firstResult.salesHandoff);
  });

  it('Sale danh dau handoff nhap ERP hoan tat va thao tac lap la idempotent', async () => {
    const { pipeline, orders, adapter } = build();
    const view = await pipeline.process(msg('@Bot ultty AI orders 3 noi chien'), BOT_NAME);
    const sent = await orders.approve(view.id);

    const completed = await orders.completeSalesHandoff(sent.id);
    const repeated = await orders.completeSalesHandoff(sent.id);

    expect(completed.status).toBe('sent');
    expect(completed.salesHandoff?.status).toBe('completed');
    expect(repeated.salesHandoff).toEqual(completed.salesHandoff);
    expect(adapter.sent).toHaveLength(1);
  });

  it('khong cho reject don da gui roi approve lai gay gui trung', async () => {
    const { pipeline, orders, adapter } = build();
    const view = await pipeline.process(msg('@Bot ultty AI orders 3 noi chien'), BOT_NAME);
    await orders.approve(view.id);

    await expect(orders.reject(view.id)).rejects.toThrow();
    await expect(orders.getOrThrow(view.id)).resolves.toMatchObject({ status: 'sent' });
    await orders.approve(view.id);
    expect(adapter.sent).toHaveLength(1);
  });

  it('don da tu choi la trang thai cuoi, khong the approve va gui ra nhom', async () => {
    const { pipeline, orders, adapter } = build();
    const view = await pipeline.process(msg('@Bot ultty AI orders 3 noi chien'), BOT_NAME);
    await orders.reject(view.id);

    await expect(orders.approve(view.id)).rejects.toThrow();
    await expect(orders.getOrThrow(view.id)).resolves.toMatchObject({ status: 'rejected' });
    expect(adapter.sent).toHaveLength(0);
  });

  it('tin hoi gia khong phai don -> khong nam trong danh sach don, khong duyet duoc', async () => {
    const { pipeline, orders } = build();
    const view = await pipeline.process(msg('ghe felix bao nhieu tien c oi'), BOT_NAME);

    expect(view.intent).toBe('hoi_gia');
    expect(await orders.listOrders()).toHaveLength(0);
    await expect(orders.approve(view.id)).rejects.toThrow();
  });
});
