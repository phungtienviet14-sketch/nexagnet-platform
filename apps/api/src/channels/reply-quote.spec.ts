import { describe, expect, it, vi } from 'vitest';
import { ThreadType, type Message } from 'zca-js';
import { InMemoryMessagesRepository } from '../messages/messages.repository.js';
import { ConversationContextBuilder } from '../messages/conversation-context.js';
import { zcaMessageToChannelMessage } from '../ingest/zca-message.js';
import { ZcaAdapter } from './zca.adapter.js';
import type { ZaloUserClient } from './zalo-user.client.js';

/** Mot tin zca-js that: `msgId` la CHUOI, con `quote.globalMsgId` la SO. */
function zcaMessage(over: Partial<Message['data']> = {}, threadId = 'group-1'): Message {
  return {
    type: ThreadType.Group,
    threadId,
    isSelf: false,
    data: {
      msgId: '99887766',
      cliMsgId: '1122334455',
      msgType: 'chat.text',
      uidFrom: 'dealer-1',
      dName: 'Meta HN',
      ts: '1786000000000',
      ttl: 0,
      content: '10 ghe felix',
      propertyExt: { color: 0, size: 0, type: 0, subType: 0, ext: '' },
      ...over,
    },
  } as unknown as Message;
}

describe('bat lay du kien de reply dung tin', () => {
  it('tin den mang theo du 8 truong zca-js can de quote lai', () => {
    const message = zcaMessageToChannelMessage(zcaMessage(), false);

    expect(message?.quoteTarget).toEqual({
      msgId: '99887766',
      cliMsgId: '1122334455',
      msgType: 'chat.text',
      uidFrom: 'dealer-1',
      ts: '1786000000000',
      ttl: 0,
      content: '10 ghe felix',
      propertyExt: { color: 0, size: 0, type: 0, subType: 0, ext: '' },
    });
  });

  it('thieu msgId -> khong co quoteTarget, khong bia du kien nua vao', () => {
    const message = zcaMessageToChannelMessage(zcaMessage({ msgId: '' }), false);

    expect(message?.quoteTarget).toBeUndefined();
  });
});

describe('gui tin co trich dan', () => {
  function adapterWithSpy() {
    const sendMessage = vi.fn(async () => ({ externalMessageId: '5' }));
    const client = { sendMessage } as unknown as ZaloUserClient;
    return { adapter: new ZcaAdapter(client), sendMessage };
  }

  it('co quote -> chuyen xuong client', async () => {
    const { adapter, sendMessage } = adapterWithSpy();
    const quote = zcaMessageToChannelMessage(zcaMessage(), false)?.quoteTarget;

    await adapter.sendMessage('group-1', 'Da xac nhan a nhe', { quote });

    expect(sendMessage).toHaveBeenCalledWith('group-1', 'Da xac nhan a nhe', { quote });
  });

  it('khong co quote -> gui nhu cu, khong doi hanh vi duong dang chay', async () => {
    const { adapter, sendMessage } = adapterWithSpy();

    await adapter.sendMessage('group-1', 'xin chao');

    expect(sendMessage).toHaveBeenCalledWith('group-1', 'xin chao', undefined);
  });
});

describe('khong gian ID cua zca-js khop giua tin den va quote', () => {
  it('tin luu theo msgId (chuoi) tra cuu duoc bang globalMsgId (so) cua tin reply', async () => {
    const repository = new InMemoryMessagesRepository();
    const original = zcaMessageToChannelMessage(zcaMessage(), false);
    await repository.save(original!);

    // Tin sau reply lai tin tren. zca-js dua `globalMsgId` dang SO — cung gia tri voi `msgId`.
    const reply = zcaMessageToChannelMessage(
      zcaMessage({
        msgId: '99887799',
        content: 'the lay 10c nhe',
        ts: '1786000060000',
        quote: {
          ownerId: 'dealer-1',
          cliMsgId: 1122334455,
          globalMsgId: 99887766,
          cliMsgType: 1,
          ts: 1786000000000,
          msg: '10 ghe felix',
          attach: '',
          fromD: 'Meta HN',
          ttl: 0,
        },
      } as Partial<Message['data']>),
      false,
    );

    const context = await new ConversationContextBuilder(repository).build(reply!);

    // Resolve duoc VE DONG TRONG DB (khong roi xuong nhanh inline chi con text tho).
    expect(context.quotedMessage).toMatchObject({
      externalMessageId: '99887766',
      text: '10 ghe felix',
      senderDisplayName: 'Meta HN',
    });
  });
});
