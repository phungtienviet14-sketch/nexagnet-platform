import { describe, expect, it } from 'vitest';
import { channelMessageSchema } from '../channel-message.js';

const validMessage = {
  externalMessageId: '1e43a3935908fe52a71d',
  platform: 'zalo',
  source: 'bot_webhook',
  chatType: 'group',
  externalChatId: 'f414c8f76fa586fbdfb4',
  senderExternalId: '607812198688816074',
  senderDisplayName: 'Meta HN',
  text: 'gui 10 ghe felix ve TN cho c',
  sentAt: 1695953568367,
};

describe('channelMessageSchema', () => {
  it('chap nhan tin nhan hop le va ep sentAt ve Date', () => {
    const parsed = channelMessageSchema.parse(validMessage);

    expect(parsed.sentAt).toBeInstanceOf(Date);
    expect(parsed.chatType).toBe('group');
    expect(parsed.text).toContain('ghe felix');
  });

  it('chap nhan tin dan tay tu che do co-pilot khong co sender', () => {
    const parsed = channelMessageSchema.parse({
      ...validMessage,
      source: 'copilot_paste',
      senderExternalId: undefined,
      senderDisplayName: undefined,
    });

    expect(parsed.source).toBe('copilot_paste');
  });

  it('tu choi platform ngoai danh sach ho tro', () => {
    const result = channelMessageSchema.safeParse({ ...validMessage, platform: 'telegram' });

    expect(result.success).toBe(false);
  });

  it('tu choi text rong', () => {
    const result = channelMessageSchema.safeParse({ ...validMessage, text: '' });

    expect(result.success).toBe(false);
  });
});
