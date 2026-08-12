import { describe, expect, it } from 'vitest';
import {
  BotPoller,
  isAllowedBotMessage,
  isBotChannelActive,
  shouldAcceptBotMessage,
  shouldAutoAck,
  updateToChannelMessage,
} from './bot-poller.js';

describe('BotPoller observability', () => {
  it('reports an explicit disabled long-poll transport before startup', () => {
    const poller = new BotPoller(
      {} as ConstructorParameters<typeof BotPoller>[0],
      {} as ConstructorParameters<typeof BotPoller>[1],
    );

    expect(poller.status()).toEqual({
      state: 'disabled',
      transport: 'long_poll',
      received: 0,
      processed: 0,
      failed: 0,
      lastSuccessfulPollAt: null,
      lastErrorAt: null,
      lastError: null,
    });
  });
});

describe('updateToChannelMessage — tin tra loi (reply/quote)', () => {
  it('map trich dan sang replyTo de parser co ngu canh, giong kenh zca', () => {
    const m = updateToChannelMessage({
      event_name: 'message.text.received',
      message: {
        message_id: 'm2',
        text: 'them 5 cai nua nhe',
        date: 1783404430000,
        from: { id: 'u1', display_name: 'Phùng Việt', is_bot: false },
        chat: { id: 'zgr-x', chat_type: 'GROUP' },
        reply_to_message: {
          message_id: 'm1',
          text: '10 ghe felix',
          date: 1783404428000,
          from: { id: 'u2', display_name: 'Meta HN', is_bot: false },
        },
      },
    });

    expect(m?.replyTo?.externalMessageId).toBe('m1');
    expect(m?.replyTo?.text).toBe('10 ghe felix');
    expect(m?.replyTo?.senderExternalId).toBe('u2');
    expect(m?.replyTo?.sentAt).toEqual(new Date(1783404428000));
  });

  it('khong co trich dan -> replyTo undefined, hanh vi y nhu truoc', () => {
    const m = updateToChannelMessage({
      message: {
        message_id: 'm3',
        text: 'chot don',
        from: { id: 'u1', is_bot: false },
        chat: { id: 'zgr-x', chat_type: 'GROUP' },
      },
    });

    expect(m?.replyTo).toBeUndefined();
  });

  it('trich dan rong (khong id, khong chu, khong anh) -> bo qua chu khong tao ngu canh rong', () => {
    const m = updateToChannelMessage({
      message: {
        message_id: 'm4',
        text: 'chot don',
        from: { id: 'u1', is_bot: false },
        chat: { id: 'zgr-x', chat_type: 'GROUP' },
        reply_to_message: { text: '   ' },
      },
    });

    expect(m?.replyTo).toBeUndefined();
  });
});

describe('updateToChannelMessage', () => {
  it('map tin text nhom', () => {
    const m = updateToChannelMessage({
      event_name: 'message.text.received',
      message: {
        message_id: 'abc',
        text: '@Bot ultty AI orders 10 ghe felix',
        date: 1783404428055,
        from: { id: 'u1', display_name: 'Phùng Việt', is_bot: false },
        chat: { id: 'zgr-x', chat_type: 'GROUP' },
      },
    });
    expect(m?.externalChatId).toBe('zgr-x');
    expect(m?.chatType).toBe('group');
    expect(m?.text).toContain('ghe felix');
    expect(m?.imageUrl).toBeUndefined();
  });

  it('map tin anh: caption -> text, photo_url -> imageUrl', () => {
    const m = updateToChannelMessage({
      event_name: 'message.image.received',
      message: {
        message_id: 'img1',
        caption: '@Bot ultty AI orders 5 noi chien',
        photo_url: 'https://photo-stal-16.zdn.vn/x.jpg',
        from: { id: 'u1', display_name: 'A', is_bot: false },
        chat: { id: 'zgr-x', chat_type: 'GROUP' },
      },
    });
    expect(m?.text).toContain('noi chien');
    expect(m?.imageUrl).toBe('https://photo-stal-16.zdn.vn/x.jpg');
  });

  it('bo qua tin cua chinh bot', () => {
    const m = updateToChannelMessage({
      message: { message_id: 'b1', text: 'xac nhan', from: { is_bot: true }, chat: { id: 'zgr-x' } },
    });
    expect(m).toBeNull();
  });

  // Dot A' Task 1: truoc day `if (!text) return null` vut thang anh gui TRAN (khong caption)
  // -> tin chua bao gio vao DB, ma link Zalo chet <=35 ngay => mat vinh vien.
  it('GIU tin anh khong caption: text rong, con nguyen photo_url', () => {
    const m = updateToChannelMessage({
      event_name: 'message.image.received',
      message: {
        message_id: 'img-tran',
        photo_url: 'https://photo-stal-16.zdn.vn/x.jpg',
        from: { id: 'u1', display_name: 'A', is_bot: false },
        chat: { id: 'zgr-x', chat_type: 'GROUP' },
      },
    });
    expect(m).not.toBeNull();
    expect(m?.text).toBe('');
    expect(m?.imageUrl).toBe('https://photo-stal-16.zdn.vn/x.jpg');
  });

  // photo_url nay la can cu DUY NHAT de giu tin khong caption, nen no phai duoc kiem truoc
  // (giong toHttpUrl cua zca-message): URL hong ma van cho qua thi safeParse rot ca tin.
  it('tin CO CHU nhung photo_url hong -> giu tin, bo imageUrl (khong lam rot ca tin)', () => {
    const m = updateToChannelMessage({
      message: {
        message_id: 'bad-photo',
        text: 'gui 3 robot',
        photo_url: 'not-a-url',
        from: { id: 'u1', is_bot: false },
        chat: { id: 'zgr-x', chat_type: 'GROUP' },
      },
    });
    expect(m?.text).toContain('robot');
    expect(m?.imageUrl).toBeUndefined();
  });

  it('bo qua tin khong caption khi photo_url hong — khong con gi de luu', () => {
    const m = updateToChannelMessage({
      message: {
        message_id: 'bad-photo-2',
        photo_url: 'not-a-url',
        from: { id: 'u1', is_bot: false },
        chat: { id: 'zgr-x', chat_type: 'GROUP' },
      },
    });
    expect(m).toBeNull();
  });

  it('bo qua update khong co noi dung', () => {
    expect(updateToChannelMessage({ message: { chat: { id: 'zgr-x' } } })).toBeNull();
  });
});

describe('shouldAutoAck', () => {
  it('bat cong tac + intent=khac (LLM khong hieu) -> co ack', () => {
    expect(shouldAutoAck('khac', 'on')).toBe(true);
  });

  it('tat cong tac -> khong ack du intent=khac', () => {
    expect(shouldAutoAck('khac', 'off')).toBe(false);
  });

  it('bat cong tac nhung intent da hieu (dat_don/hoi_gia) -> khong ack', () => {
    expect(shouldAutoAck('dat_don', 'on')).toBe(false);
    expect(shouldAutoAck('hoi_gia', 'on')).toBe(false);
  });
});

describe('hybrid ownership guard', () => {
  it('BotPoller hoat dong o ca bot va hybrid', () => {
    expect(isBotChannelActive('bot')).toBe(true);
    expect(isBotChannelActive('hybrid')).toBe(true);
    expect(isBotChannelActive('zca')).toBe(false);
    expect(isBotChannelActive('mock')).toBe(false);
  });

  it('chi nhan tin NHOM, chan tin ca nhan', () => {
    const base = {
      externalMessageId: 'm-1',
      platform: 'zalo' as const,
      source: 'bot_webhook' as const,
      chatType: 'group' as const,
      externalChatId: 'bot-chat-mapped',
      text: 'gui 10 ghe',
      sentAt: new Date(),
    };

    expect(isAllowedBotMessage(base)).toBe(true);
    expect(isAllowedBotMessage({ ...base, chatType: 'private' })).toBe(false);
  });

  it('hybrid: allowlist cua operator chi phoi CA kenh Bot, khong rieng zca', () => {
    const base = {
      externalMessageId: 'm-3',
      platform: 'zalo' as const,
      source: 'bot_webhook' as const,
      chatType: 'group' as const,
      externalChatId: 'nhom-duoc-chon',
      text: 'gui 10 ghe',
      sentAt: new Date(),
    };
    const ctx = {
      mode: 'hybrid' as const,
      allowlistActive: true,
      isAllowed: (chatId: string) => chatId === 'nhom-duoc-chon',
    };

    expect(shouldAcceptBotMessage(base, ctx)).toBe(true);
    expect(shouldAcceptBotMessage({ ...base, externalChatId: 'nhom-khong-chon' }, ctx)).toBe(false);
  });

  it('bot thuan (khong co phien zca -> allowlist rong) KHONG bi chan', () => {
    // Ap allowlist rong o che do bot thuan la chan sach ca kenh.
    const base = {
      externalMessageId: 'm-4',
      platform: 'zalo' as const,
      source: 'bot_webhook' as const,
      chatType: 'group' as const,
      externalChatId: 'nhom-bat-ky',
      text: 'gui 10 ghe',
      sentAt: new Date(),
    };

    expect(
      shouldAcceptBotMessage(base, {
        mode: 'bot',
        allowlistActive: false,
        isAllowed: () => false,
      }),
    ).toBe(true);
    // Hybrid nhung chua dang nhap zca -> allowlist chua co hieu luc, cung khong chan.
    expect(
      shouldAcceptBotMessage(base, {
        mode: 'hybrid',
        allowlistActive: false,
        isAllowed: () => false,
      }),
    ).toBe(true);
  });

  it('tin ca nhan bi chan o moi che do', () => {
    const priv = {
      externalMessageId: 'm-5',
      platform: 'zalo' as const,
      source: 'bot_webhook' as const,
      chatType: 'private' as const,
      externalChatId: 'nguoi-la',
      text: 'chao',
      sentAt: new Date(),
    };

    expect(
      shouldAcceptBotMessage(priv, { mode: 'bot', allowlistActive: false, isAllowed: () => true }),
    ).toBe(false);
  });

  it('nhom chua map KHONG con bi chan o day — tin phai vao duoc pipeline de duoc luu (I1)', () => {
    // Truoc 04/08/2026 ham nay doi chatId nam trong knowledge.groups(); tin @mention cua nhom
    // chua map bi vut ma Zalo khong phat lai. Cong "da map" gio nam trong PipelineService.intake.
    const unmapped = {
      externalMessageId: 'm-2',
      platform: 'zalo' as const,
      source: 'bot_webhook' as const,
      chatType: 'group' as const,
      externalChatId: 'nhom-hoan-toan-la',
      text: 'don hang co PII',
      sentAt: new Date(),
    };

    expect(isAllowedBotMessage(unmapped)).toBe(true);
  });
});
