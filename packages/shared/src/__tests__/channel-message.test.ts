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

  it('tu choi text rong khi KHONG co anh', () => {
    const result = channelMessageSchema.safeParse({ ...validMessage, text: '' });

    expect(result.success).toBe(false);
  });

  it('tu choi tin chi co khoang trang va khong co anh', () => {
    const result = channelMessageSchema.safeParse({ ...validMessage, text: '   \n  ' });

    expect(result.success).toBe(false);
  });

  // Dot A' Task 1: anh gui TRAN (khong chu thich) truoc day bi schema tu choi -> chua bao gio
  // vao DB, ma link Zalo chet <=35 ngay => mat vinh vien. Nay text rong + co anh la HOP LE.
  it('chap nhan tin CHI CO ANH: text rong nhung co imageUrl', () => {
    const parsed = channelMessageSchema.parse({
      ...validMessage,
      text: '',
      imageUrl: 'https://photo-stal-16.zdn.vn/gr/jpg/abc/def.jpg',
    });

    expect(parsed.text).toBe('');
    expect(parsed.imageUrl).toBe('https://photo-stal-16.zdn.vn/gr/jpg/abc/def.jpg');
  });

  it('chap nhan caption toan khoang trang khi co anh', () => {
    const result = channelMessageSchema.safeParse({
      ...validMessage,
      text: '   ',
      imageUrl: 'https://photo-stal-16.zdn.vn/gr/jpg/abc/def.jpg',
    });

    expect(result.success).toBe(true);
  });

  // Bat bien co chu y: `text` van la `string` (KHONG optional) de moi call-site phia sau
  // (parser, repository, OrderView.rawText) khong phai xu ly undefined.
  it('text van la string khi tin chi co anh', () => {
    const parsed = channelMessageSchema.parse({
      ...validMessage,
      text: '',
      imageUrl: 'https://photo-stal-16.zdn.vn/gr/jpg/abc/def.jpg',
    });

    expect(typeof parsed.text).toBe('string');
  });

  it('van chan text vuot 10.000 ky tu du co anh', () => {
    const result = channelMessageSchema.safeParse({
      ...validMessage,
      text: 'a'.repeat(10_001),
      imageUrl: 'https://photo-stal-16.zdn.vn/gr/jpg/abc/def.jpg',
    });

    expect(result.success).toBe(false);
  });
});
