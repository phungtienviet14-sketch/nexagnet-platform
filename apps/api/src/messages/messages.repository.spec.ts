import { describe, expect, it } from 'vitest';
import type { ChannelMessage } from '@ultty/shared';
import { InMemoryMessagesRepository } from './messages.repository.js';

function msg(externalMessageId: string): ChannelMessage {
  return {
    externalMessageId,
    platform: 'zalo',
    source: 'bot_webhook',
    chatType: 'group',
    externalChatId: 'g-test',
    text: 'gui 10 ghe felix',
    sentAt: new Date('2026-07-11T00:00:00.000Z'),
  };
}

describe('InMemoryMessagesRepository', () => {
  it('save tin moi -> duplicate=false + luu du lieu', async () => {
    const repo = new InMemoryMessagesRepository();

    const result = await repo.save(msg('m-1'));

    expect(result.duplicate).toBe(false);
    expect(result.id).toBeTruthy();
    expect(repo.list()).toHaveLength(1);
    expect(repo.list()[0]?.text).toBe('gui 10 ghe felix');
  });

  it('tin trung (cung platform + externalMessageId) -> duplicate=true, KHONG tao dong 2, giu id cu', async () => {
    const repo = new InMemoryMessagesRepository();

    const first = await repo.save(msg('m-1'));
    const second = await repo.save(msg('m-1'));

    expect(second.duplicate).toBe(true);
    expect(second.id).toBe(first.id);
    expect(repo.list()).toHaveLength(1);
  });

  it('khac externalMessageId -> 2 dong rieng biet', async () => {
    const repo = new InMemoryMessagesRepository();

    await repo.save(msg('m-1'));
    const other = await repo.save(msg('m-2'));

    expect(other.duplicate).toBe(false);
    expect(repo.list()).toHaveLength(2);
  });

  it('attachOrder o memory la no-op, khong throw', async () => {
    const repo = new InMemoryMessagesRepository();
    await expect(repo.attachOrder()).resolves.toBeUndefined();
  });
});
