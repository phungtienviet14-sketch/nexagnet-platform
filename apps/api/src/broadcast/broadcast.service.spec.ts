import { describe, expect, it } from 'vitest';
import { AUTO_LABEL } from '../channels/auto-label.js';
import { ChannelAdapter } from '../channels/channel-adapter.js';
import { MockAdapter } from '../channels/mock.adapter.js';
import { KnowledgeService } from '../knowledge/knowledge.service.js';
import { BroadcastService } from './broadcast.service.js';

/** Adapter loi co chon loc: nem loi voi 1 chatId cu the, cac nhom khac van gui duoc. */
class FlakyAdapter extends ChannelAdapter {
  readonly name = 'flaky';
  readonly sent: string[] = [];
  constructor(private readonly failChatId: string) {
    super();
  }
  async sendMessage(chatId: string): Promise<void> {
    if (chatId === this.failChatId) throw new Error('Zalo sendMessage that bai: 429');
    this.sent.push(chatId);
  }
}

const knowledge = new KnowledgeService();
const allChatIds = knowledge.groups().map((g) => g.chatId);
const [firstChatId] = allChatIds;
if (!firstChatId) throw new Error('Seed phải có ít nhất 1 nhóm cho test broadcast');
const NO_THROTTLE = { throttleMs: 0 };

describe('BroadcastService', () => {
  it('hybrid: cho dry-run nhung khoa gui that de khong doan sai kenh', async () => {
    const savedMode = process.env.CHANNEL_MODE;
    const savedToken = process.env.ZALO_BOT_TOKEN;
    process.env.CHANNEL_MODE = 'hybrid';
    process.env.ZALO_BOT_TOKEN = 'test-token';
    try {
      const mock = new MockAdapter();
      const svc = new BroadcastService(mock, knowledge);

      await expect(
        svc.broadcast({ text: 'Sale 10%', dryRun: false }, NO_THROTTLE),
      ).rejects.toThrow(/hybrid/i);
      await expect(
        svc.broadcast({ text: 'Sale 10%', dryRun: true }, NO_THROTTLE),
      ).resolves.toMatchObject({ dryRun: true, sent: 0 });
      expect(mock.sent).toHaveLength(0);
    } finally {
      if (savedMode === undefined) delete process.env.CHANNEL_MODE;
      else process.env.CHANNEL_MODE = savedMode;
      if (savedToken === undefined) delete process.env.ZALO_BOT_TOKEN;
      else process.env.ZALO_BOT_TOKEN = savedToken;
    }
  });

  it('dryRun: gan AUTO_LABEL, liet ke tat ca nhom, KHONG goi adapter', async () => {
    const mock = new MockAdapter();
    const svc = new BroadcastService(mock, knowledge);

    const res = await svc.broadcast({ text: 'Sale 10%', dryRun: true }, NO_THROTTLE);

    expect(res.dryRun).toBe(true);
    expect(res.labeledText).toBe('Sale 10%' + AUTO_LABEL);
    expect(res.total).toBe(allChatIds.length);
    expect(res.sent).toBe(0);
    expect(mock.sent).toHaveLength(0);
  });

  it('gui that: moi nhom nhan tin da gan nhan, sent = tong so nhom', async () => {
    const mock = new MockAdapter();
    const svc = new BroadcastService(mock, knowledge);

    const res = await svc.broadcast({ text: 'Sale 10%', dryRun: false }, NO_THROTTLE);

    expect(res.sent).toBe(allChatIds.length);
    expect(res.failed).toBe(0);
    expect(res.results.every((r) => r.ok)).toBe(true);
    expect(mock.sent).toHaveLength(allChatIds.length);
    expect(mock.sent[0]?.text).toBe('Sale 10%' + AUTO_LABEL);
  });

  it('chi gui vao tap nhom da chon (groupChatIds)', async () => {
    const mock = new MockAdapter();
    const svc = new BroadcastService(mock, knowledge);

    const res = await svc.broadcast(
      { text: 'Chỉ nhóm 1', groupChatIds: [firstChatId], dryRun: false },
      NO_THROTTLE,
    );

    expect(res.total).toBe(1);
    expect(mock.sent).toHaveLength(1);
    expect(mock.sent[0]?.chatId).toBe(firstChatId);
  });

  it('loi cuc bo 1 nhom khong lam dung ca loat (partial failure)', async () => {
    const flaky = new FlakyAdapter(firstChatId);
    const svc = new BroadcastService(flaky, knowledge);

    const res = await svc.broadcast({ text: 'Sale', dryRun: false }, NO_THROTTLE);

    expect(res.failed).toBe(1);
    expect(res.sent).toBe(allChatIds.length - 1);
    const failed = res.results.find((r) => r.chatId === firstChatId);
    expect(failed?.ok).toBe(false);
    expect(failed?.error).toContain('429');
    expect(flaky.sent).toHaveLength(allChatIds.length - 1);
  });

  it('vuot tran so nhom -> tu choi (guard chong blast nham)', async () => {
    const mock = new MockAdapter();
    const svc = new BroadcastService(mock, knowledge);

    await expect(
      svc.broadcast({ text: 'Sale', dryRun: false }, { throttleMs: 0, maxTargets: 1 }),
    ).rejects.toThrow(/nhóm/i);
    expect(mock.sent).toHaveLength(0);
  });
});
