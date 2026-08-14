import { describe, expect, it } from 'vitest';
import type { ChannelMessage } from '@netviet/shared';
import { InMemoryMessagesRepository } from './messages.repository.js';
import { ConversationContextBuilder } from './conversation-context.js';

function message(
  externalMessageId: string,
  text: string,
  sentAt: string,
  overrides: Partial<ChannelMessage> = {},
): ChannelMessage {
  return {
    externalMessageId,
    platform: 'zalo',
    source: 'zca_listener',
    chatType: 'group',
    externalChatId: 'group-1',
    senderExternalId: 'dealer-1',
    senderDisplayName: 'Meta HN',
    text,
    sentAt: new Date(sentAt),
    ...overrides,
  };
}

describe('ConversationContextBuilder', () => {
  it('resolve quote tu message persistence va gioi han context theo thu tu thoi gian', async () => {
    const repository = new InMemoryMessagesRepository();
    const original = message('m-1', '10 ELNI', '2026-08-12T02:00:00.000Z');
    await repository.save(original);
    await repository.save(message('m-2', 'gui nhe', '2026-08-12T02:01:00.000Z'));
    const current = message('m-3', 'c them 5c nhe', '2026-08-12T02:02:00.000Z', {
      replyTo: { externalMessageId: 'm-1', text: 'noi dung inline khong duoc uu tien' },
    });

    const context = await new ConversationContextBuilder(repository, {
      maxMessages: 1,
      maxCharacters: 1_000,
    }).build(current);

    expect(context.quotedMessage).toMatchObject({ externalMessageId: 'm-1', text: '10 ELNI' });
    expect(context.recentMessages).toHaveLength(1);
    expect(context.recentMessages[0]?.externalMessageId).toBe('m-2');
    expect(context.participants).toEqual([
      { externalId: 'dealer-1', displayName: 'Meta HN' },
    ]);
  });

  it('khong resolve reply sang tin cua nhom khac', async () => {
    const repository = new InMemoryMessagesRepository();
    await repository.save(
      message('m-other', '10 ELNI', '2026-08-12T02:00:00.000Z', {
        externalChatId: 'group-other',
      }),
    );
    const current = message('m-current', 'them 5', '2026-08-12T02:01:00.000Z', {
      replyTo: { externalMessageId: 'm-other' },
    });

    const context = await new ConversationContextBuilder(repository).build(current);

    expect(context.quotedMessage).toBeUndefined();
  });

  it('cat context theo character budget, khong gui lich su vo han', async () => {
    const repository = new InMemoryMessagesRepository();
    await repository.save(message('m-1', 'a'.repeat(80), '2026-08-12T02:00:00.000Z'));
    await repository.save(message('m-2', 'b'.repeat(80), '2026-08-12T02:01:00.000Z'));

    const context = await new ConversationContextBuilder(repository, {
      maxMessages: 10,
      maxCharacters: 100,
    }).build(message('m-3', 'them 5', '2026-08-12T02:02:00.000Z'));

    expect(context.recentMessages.reduce((sum, row) => sum + row.text.length, 0)).toBeLessThanOrEqual(100);
    expect(context.recentMessages).toHaveLength(1);
  });

  it('chi dua lich su cua dung thanh vien va loai cac tin dang nam trong burst', async () => {
    const repository = new InMemoryMessagesRepository();
    await repository.save(message('mine-before', '4 ELNI', '2026-08-12T02:00:00.000Z'));
    for (let index = 1; index <= 10; index += 1) {
      await repository.save(
        message(
          `other-member-${index}`,
          '20 FELIX',
          `2026-08-12T02:00:${String(index).padStart(2, '0')}.000Z`,
          { senderExternalId: 'dealer-2', senderDisplayName: 'Thanh vien khac' },
        ),
      );
    }
    await repository.save(message('burst-part', 'lay VAT', '2026-08-12T02:00:11.000Z'));

    const context = await new ConversationContextBuilder(repository).build(
      message('current', 'doi y', '2026-08-12T02:00:12.000Z'),
      ['burst-part'],
    );

    expect(context.recentMessages.map((row) => row.externalMessageId)).toEqual(['mine-before']);
    expect(context.participants).toEqual([
      { externalId: 'dealer-1', displayName: 'Meta HN' },
    ]);
  });

});
