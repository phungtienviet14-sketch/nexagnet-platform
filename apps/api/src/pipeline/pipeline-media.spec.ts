import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChannelMessage } from '@netviet/shared';
import { AgentOrchestrator } from '../agents/agent-orchestrator.service.js';
import { KnowledgeService } from '../knowledge/knowledge.service.js';
import { MediaFetcherService } from '../media/media-fetcher.service.js';
import { MediaStore } from '../media/media-store.js';
import { InMemoryMessagesRepository } from '../messages/messages.repository.js';
import { InMemoryOrdersRepository } from '../orders/orders.repository.js';
import { FakeParser } from './__tests__/fake-parser.js';
import { PipelineService } from './pipeline.service.js';

const BOT_NAME = 'Bot ultty AI orders';
const MAPPED_GROUP = new KnowledgeService().groups().find((g) => g.dealerId === 'meta-hn')!.chatId;
const UNMAPPED_GROUP = 'nhom-chua-map-9999';
const IMAGE_URL = 'https://photo-stal-16.zdn.vn/gr/jpg/abc/def.jpg';

class FakeStore extends MediaStore {
  readonly name = 'fake';
  readonly enabled = true;
  readonly puts: Array<{ key: string; body: Buffer }> = [];
  async put(key: string, body: Buffer): Promise<void> {
    this.puts.push({ key, body });
  }
}

function build() {
  const knowledge = new KnowledgeService();
  const messages = new InMemoryMessagesRepository();
  const store = new FakeStore();
  const media = new MediaFetcherService(store, messages, {
    allowedHosts: ['zdn.vn'],
    maxBytes: 5_000_000,
    timeoutMs: 5_000,
    concurrency: 3,
  });
  const orchestrator = new AgentOrchestrator(
    new FakeParser(),
    knowledge,
    new InMemoryOrdersRepository(),
  );
  const pipeline = new PipelineService(
    orchestrator,
    undefined,
    messages,
    undefined,
    undefined,
    knowledge,
    undefined,
    media,
  );
  return { pipeline, messages, media, store };
}

/** Anh gui TRAN (khong chu thich) — dung ca Dot A' Task 1 lan Task 2. */
function anhTran(chatId: string, externalMessageId: string): ChannelMessage {
  return {
    externalMessageId,
    platform: 'zalo',
    source: 'zca_listener',
    chatType: 'group',
    externalChatId: chatId,
    senderExternalId: 'user-1',
    senderDisplayName: 'Chi Phuong',
    text: '',
    imageUrl: IMAGE_URL,
    sentAt: new Date('2026-08-11T03:00:00.000Z'),
  };
}

async function stubAnhThat(): Promise<void> {
  const jpeg = await sharp({
    create: { width: 1200, height: 800, channels: 3, background: { r: 10, g: 120, b: 60 } },
  })
    .jpeg()
    .toBuffer();
  vi.stubGlobal('fetch', vi.fn(async () => new Response(jpeg, { status: 200 })));
}

describe("Dot A' Task 2 — anh vao den KHO BEN VUNG, khong chi con cai link", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it('tin co anh -> tai ve, day len kho, ghi mediaKey/mediaBytes vao dong tin', async () => {
    await stubAnhThat();
    const { pipeline, messages, media, store } = build();

    const result = await pipeline.intake(anhTran(MAPPED_GROUP, 'm-anh-1'), BOT_NAME);
    await media.drain();

    expect(result.outcome).toBe('processed');
    const row = messages.list()[0]!;
    expect(row.mediaKey).toBe(`media/2026/08/${row.id}.webp`);
    expect(row.mediaBytes).toBeGreaterThan(0);
    expect(row.mediaFetchedAt).toBeInstanceOf(Date);
    expect(row.mediaError).toBeUndefined();
    expect(store.puts).toHaveLength(1);
  });

  it('nhom CHUA map cung duoc luu anh — chi NOI DUNG bi chan khoi LLM, anh la cua ta', async () => {
    await stubAnhThat();
    const { pipeline, messages, media } = build();

    const result = await pipeline.intake(anhTran(UNMAPPED_GROUP, 'm-anh-2'), BOT_NAME);
    await media.drain();

    expect(result.outcome).toBe('stored_only');
    expect(messages.list()[0]?.mediaKey).toBeTruthy();
  });

  // Bat bien lon nhat cua Task 2: tai anh that bai KHONG duoc lam rot tin.
  it('tai anh HONG -> tin VAN trong DB, chi ghi mediaError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
    const { pipeline, messages, media } = build();

    const result = await pipeline.intake(anhTran(MAPPED_GROUP, 'm-anh-hong'), BOT_NAME);
    await media.drain();

    expect(result.outcome).toBe('processed');
    expect(messages.list()).toHaveLength(1);
    expect(messages.list()[0]?.imageUrl).toBe(IMAGE_URL);
    expect(messages.list()[0]?.mediaKey).toBeUndefined();
    expect(messages.list()[0]?.mediaError).toContain('404');
  });

  it('tin TRUNG -> khong tai lai anh (khong ton bang thong, khong ghi de object)', async () => {
    await stubAnhThat();
    const { pipeline, media, store } = build();

    await pipeline.intake(anhTran(MAPPED_GROUP, 'm-anh-trung'), BOT_NAME);
    await pipeline.intake(anhTran(MAPPED_GROUP, 'm-anh-trung'), BOT_NAME);
    await media.drain();

    expect(store.puts).toHaveLength(1);
  });

  it('tin khong co anh -> khong goi ra mang lan nao', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { pipeline, media } = build();

    const chiChu = { ...anhTran(MAPPED_GROUP, 'm-chi-chu'), text: 'gui 10 ghe felix' };
    delete (chiChu as { imageUrl?: string }).imageUrl;
    await pipeline.intake(chiChu, BOT_NAME);
    await media.drain();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
