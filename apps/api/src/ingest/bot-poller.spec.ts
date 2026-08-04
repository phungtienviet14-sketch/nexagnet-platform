import { describe, expect, it } from 'vitest';
import {
  isAllowedBotMessage,
  isBotChannelActive,
  shouldAutoAck,
  updateToChannelMessage,
} from './bot-poller.js';

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
