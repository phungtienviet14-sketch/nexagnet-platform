import { describe, expect, it } from 'vitest';
import type { ChannelMessage } from '@ultty/shared';
import { KnowledgeService } from '../knowledge/knowledge.service.js';
import { ChannelAdapter } from '../channels/channel-adapter.js';
import { MockAdapter } from '../channels/mock.adapter.js';
import { KiotVietMockAdapter } from '../kiotviet/kiotviet.adapter.js';
import { InMemoryOrdersRepository } from '../orders/orders.repository.js';
import { OrdersService } from '../orders/orders.service.js';
import { MockParser } from './mock-parser.js';
import { PipelineService } from './pipeline.service.js';

const BOT_NAME = 'Bot ultty AI orders';
const GROUP = 'zgr-f8a7101d77709e2ec761'; // nhom test map -> Meta HN (dai_ly)

function build() {
  const knowledge = new KnowledgeService();
  const repo = new InMemoryOrdersRepository();
  const pipeline = new PipelineService(new MockParser(), knowledge, repo);
  const adapter = new MockAdapter();
  const orders = new OrdersService(repo, adapter, new KiotVietMockAdapter());
  return { pipeline, orders, adapter };
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
    expect(view.priced?.lines?.[0]?.sku).toBe('GHE-FELIX');
    expect(view.priced?.lines?.[0]?.unitPrice).toBe(1_150_000); // gia dai_ly
    expect(view.priced?.grandTotal).toBe(11_500_000);
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

  it('gui Zalo LOI -> don giu pending_review de duyet lai (khong ket, H1)', async () => {
    class FailingAdapter extends ChannelAdapter {
      readonly name = 'fail';
      async sendMessage(): Promise<void> {
        throw new Error('rate limit');
      }
    }
    const knowledge = new KnowledgeService();
    const repo = new InMemoryOrdersRepository();
    const pipeline = new PipelineService(new MockParser(), knowledge, repo);
    const orders = new OrdersService(repo, new FailingAdapter(), new KiotVietMockAdapter());

    const view = await pipeline.process(msg('@Bot ultty AI orders 3 noi chien'), BOT_NAME);
    await expect(orders.approve(view.id)).rejects.toThrow();

    const after = orders.getOrThrow(view.id);
    expect(after.status).toBe('pending_review'); // van con nut Duyet -> retry duoc
    expect(after.kiotVietCode).toBeUndefined(); // chua len KiotViet
  });

  it('tin hoi gia khong phai don -> khong nam trong danh sach don, khong duyet duoc', async () => {
    const { pipeline, orders } = build();
    const view = await pipeline.process(msg('ghe felix bao nhieu tien c oi'), BOT_NAME);

    expect(view.intent).toBe('hoi_gia');
    expect(orders.listOrders()).toHaveLength(0);
    await expect(orders.approve(view.id)).rejects.toThrow();
  });
});
