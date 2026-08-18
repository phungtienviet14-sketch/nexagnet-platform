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

/** Tin he thong da gui ra nhom — cai ma truoc Pha 1 khong bao gio ton tai trong DB. */
function outbound(externalMessageId: string, text: string, sentAt: string): ChannelMessage {
  return {
    externalMessageId,
    platform: 'zalo',
    source: 'system_outbound',
    chatType: 'group',
    externalChatId: 'group-1',
    senderDisplayName: 'Bot',
    text,
    sentAt: new Date(sentAt),
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

  it('loai cac tin dang nam trong burst nhung GIU tin cua thanh vien khac trong nhom', async () => {
    const repository = new InMemoryMessagesRepository();
    await repository.save(message('mine-before', '4 ELNI', '2026-08-12T02:00:00.000Z'));
    await repository.save(
      message('other-member', '20 FELIX', '2026-08-12T02:00:05.000Z', {
        senderExternalId: 'dealer-2',
        senderDisplayName: 'Thanh vien khac',
      }),
    );
    await repository.save(message('burst-part', 'lay VAT', '2026-08-12T02:00:11.000Z'));

    const context = await new ConversationContextBuilder(repository).build(
      message('current', 'doi y', '2026-08-12T02:00:12.000Z'),
      ['burst-part'],
    );

    // Hoi thoai nhom la CUA CA NHOM: cat theo nguoi gui lam mat ve truoc cua mach hoi thoai.
    expect(context.recentMessages.map((row) => row.externalMessageId)).toEqual([
      'mine-before',
      'other-member',
    ]);
    expect(context.participants).toEqual([
      { externalId: 'dealer-1', displayName: 'Meta HN' },
      { externalId: 'dealer-2', displayName: 'Thanh vien khac' },
    ]);
  });

  it('dua CA cau tra loi cua chinh bot vao context, co nhan vai', async () => {
    const repository = new InMemoryMessagesRepository();
    await repository.save(message('m-1', 'ghe felix con hang ko c', '2026-08-12T02:00:00.000Z'));
    await repository.save(
      outbound('out-1', 'Da con hang a nhe, em bao gia ngay ben duoi', '2026-08-12T02:00:30.000Z'),
      { direction: 'outbound', senderRole: 'bot' },
    );

    const context = await new ConversationContextBuilder(repository).build(
      message('m-2', 'the lay 10c', '2026-08-12T02:01:00.000Z'),
    );

    expect(context.recentMessages.map((row) => row.externalMessageId)).toEqual(['m-1', 'out-1']);
    expect(context.recentMessages.map((row) => row.senderRole)).toEqual(['customer', 'bot']);
  });

  it('tin qua dai thi DUNG lai, khong nhay qua de lay tin cu hon (lich su khong duoc thung lo)', async () => {
    const repository = new InMemoryMessagesRepository();
    await repository.save(message('cu-nhat', 'tin cu nhat', '2026-08-12T02:00:00.000Z'));
    await repository.save(message('dai', 'x'.repeat(200), '2026-08-12T02:00:30.000Z'));

    const context = await new ConversationContextBuilder(repository, {
      maxMessages: 10,
      maxCharacters: 100,
    }).build(message('current', 'the sao a', '2026-08-12T02:01:00.000Z'));

    // Tin 'dai' vuot ngan sach -> cat TU DO TRO VE TRUOC. Neu con 'cu-nhat' nghia la LLM duoc
    // dua hai tin khong lien tuc ma khong biet, tuong chung ke nhau.
    expect(context.recentMessages).toEqual([]);
  });

  it('cua so mac dinh giu duoc mach hoi thoai dai (16 tin)', async () => {
    const repository = new InMemoryMessagesRepository();
    for (let index = 1; index <= 20; index += 1) {
      await repository.save(
        message(`m-${index}`, `tin ${index}`, `2026-08-12T02:00:${String(index).padStart(2, '0')}.000Z`),
      );
    }

    const context = await new ConversationContextBuilder(repository).build(
      message('current', 'chot nhe', '2026-08-12T02:01:00.000Z'),
    );

    expect(context.recentMessages).toHaveLength(16);
    expect(context.recentMessages[0]?.externalMessageId).toBe('m-5');
    expect(context.recentMessages.at(-1)?.externalMessageId).toBe('m-20');
  });
});
