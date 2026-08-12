import { describe, expect, it } from 'vitest';
import { ThreadType, type Message } from 'zca-js';
import { zcaMessageToChannelMessage } from './zca-message.js';

/** Dung 1 tin zca-js gia lap (chi cac field ma mapper doc). */
function makeMessage(opts: {
  type?: ThreadType;
  threadId?: string;
  isSelf?: boolean;
  content?: unknown;
  msgId?: string;
  uidFrom?: string;
  dName?: string;
  ts?: string;
  quote?: {
    ownerId?: string;
    globalMsgId?: number;
    msg?: string;
    fromD?: string;
    ts?: number;
  };
}): Message {
  return {
    type: opts.type ?? ThreadType.Group,
    threadId: opts.threadId ?? 'zgr-x',
    isSelf: opts.isSelf ?? false,
    data: {
      msgId: opts.msgId ?? 'm1',
      // `in` chu khong phai `??`: co test truyen content = null/'' co chu y, `??` se nuot mat.
      content: 'content' in opts ? opts.content : 'noi dung',
      uidFrom: opts.uidFrom ?? 'u1',
      dName: opts.dName ?? 'Phùng Việt',
      ts: opts.ts ?? '1783404428055',
      quote: opts.quote,
    },
  } as unknown as Message;
}

describe('zcaMessageToChannelMessage', () => {
  it('map tin text trong nhom', () => {
    const m = zcaMessageToChannelMessage(
      makeMessage({ content: 'gui 10 ghe felix ve TN', threadId: 'zgr-x' }),
      false,
    );
    expect(m?.externalChatId).toBe('zgr-x');
    expect(m?.chatType).toBe('group');
    expect(m?.source).toBe('zca_listener');
    expect(m?.text).toContain('ghe felix');
    expect(m?.imageUrl).toBeUndefined();
    expect(m?.senderDisplayName).toBe('Phùng Việt');
  });

  it('map tin anh: href -> imageUrl, title -> text (chu thich)', () => {
    const m = zcaMessageToChannelMessage(
      makeMessage({
        content: { href: 'https://photo-stal-16.zdn.vn/x.jpg', title: '5 noi chien', thumb: 't' },
      }),
      false,
    );
    expect(m?.text).toContain('noi chien');
    expect(m?.imageUrl).toBe('https://photo-stal-16.zdn.vn/x.jpg');
  });

  it('bo qua tin do CHINH tai khoan gui khi selfListen=off', () => {
    expect(zcaMessageToChannelMessage(makeMessage({ isSelf: true }), false)).toBeNull();
  });

  it('van xu ly tin cua chinh minh khi selfListen=on', () => {
    const m = zcaMessageToChannelMessage(makeMessage({ isSelf: true, content: 'test' }), true);
    expect(m?.text).toBe('test');
  });

  it('bo qua khi thieu threadId', () => {
    expect(zcaMessageToChannelMessage(makeMessage({ threadId: '' }), false)).toBeNull();
  });

  // Dot A' Task 1: truoc day `if (!trimmed) return null` vut thang anh gui TRAN -> tin chua bao
  // gio vao DB, ma link Zalo chet <=35 ngay. Nay giu tin voi text rong de con luu duoc anh.
  it('GIU tin anh khong chu thich: text rong, con nguyen imageUrl', () => {
    const m = zcaMessageToChannelMessage(makeMessage({ content: { href: 'https://x/y.jpg' } }), false);
    expect(m).not.toBeNull();
    expect(m?.text).toBe('');
    expect(m?.imageUrl).toBe('https://x/y.jpg');
  });

  it('bo qua tin khong co ca chu lan anh (tin he thong)', () => {
    expect(zcaMessageToChannelMessage(makeMessage({ content: '' }), false)).toBeNull();
    expect(zcaMessageToChannelMessage(makeMessage({ content: {} }), false)).toBeNull();
    expect(zcaMessageToChannelMessage(makeMessage({ content: '   ' }), false)).toBeNull();
  });

  it('bo qua tin khong chu thich khi href khong phai URL http(s) — khong con gi de luu', () => {
    expect(zcaMessageToChannelMessage(makeMessage({ content: { href: 'not-a-url' } }), false)).toBeNull();
  });

  it('bo qua khi content khong phai string lan object (tin he thong la)', () => {
    expect(zcaMessageToChannelMessage(makeMessage({ content: null }), false)).toBeNull();
    expect(zcaMessageToChannelMessage(makeMessage({ content: 42 }), false)).toBeNull();
  });

  it('ep ts (chuoi epoch-ms) sang Date hop le, khong phai Invalid Date', () => {
    const m = zcaMessageToChannelMessage(makeMessage({ ts: '1783404428055' }), false);
    expect(m?.sentAt).toBeInstanceOf(Date);
    expect(Number.isNaN(m?.sentAt.getTime())).toBe(false);
    expect(m?.sentAt.getTime()).toBe(1783404428055);
  });

  it('tin nhan 1-1 (User) -> chatType=private', () => {
    const m = zcaMessageToChannelMessage(makeMessage({ type: ThreadType.User, content: 'hi' }), false);
    expect(m?.chatType).toBe('private');
  });

  it('attachment co caption nhung href RONG -> GIU text, bo imageUrl (khong lam rot ca tin)', () => {
    const m = zcaMessageToChannelMessage(
      makeMessage({ content: { href: '', title: 'gui 3 robot' } }),
      false,
    );
    expect(m?.text).toContain('robot');
    expect(m?.imageUrl).toBeUndefined();
  });

  it('href khong phai URL http(s) -> bo imageUrl, giu caption', () => {
    const m = zcaMessageToChannelMessage(
      makeMessage({ content: { href: 'not-a-url', description: '2 may loc nuoc' } }),
      false,
    );
    expect(m?.text).toContain('may loc nuoc');
    expect(m?.imageUrl).toBeUndefined();
  });

  it('caption nam o description (khong co title) -> van lay lam text', () => {
    const m = zcaMessageToChannelMessage(
      makeMessage({ content: { href: 'https://x/y.jpg', description: '5 noi chien' } }),
      false,
    );
    expect(m?.text).toContain('noi chien');
    expect(m?.imageUrl).toBe('https://x/y.jpg');
  });

  it('thieu msgId -> externalMessageId fallback = `${threadId}-${ts}` (khoa dedup)', () => {
    const m = zcaMessageToChannelMessage(
      makeMessage({ msgId: '', threadId: 'zgr-x', ts: '1783404428055' }),
      false,
    );
    expect(m?.externalMessageId).toBe('zgr-x-1783404428055');
  });

  it('uidFrom/dName rong -> senderExternalId/senderDisplayName undefined (khong lam rot tin)', () => {
    const m = zcaMessageToChannelMessage(makeMessage({ uidFrom: '', dName: '', content: 'test' }), false);
    expect(m?.text).toBe('test');
    expect(m?.senderExternalId).toBeUndefined();
    expect(m?.senderDisplayName).toBeUndefined();
  });

  it('map quote zca-js thanh replyTo de resolve context ben vung', () => {
    const m = zcaMessageToChannelMessage(
      makeMessage({
        content: 'c them 5c nhe',
        quote: {
          ownerId: 'u-dealer',
          globalMsgId: 987654,
          msg: '10 ELNI',
          fromD: 'Meta HN',
          ts: 1783404400000,
        },
      }),
      false,
    );

    expect(m?.replyTo).toMatchObject({
      externalMessageId: '987654',
      senderExternalId: 'u-dealer',
      senderDisplayName: 'Meta HN',
      text: '10 ELNI',
    });
    expect(m?.replyTo?.sentAt).toEqual(new Date(1783404400000));
  });
});
