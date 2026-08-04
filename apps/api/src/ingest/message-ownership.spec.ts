import { describe, expect, it } from 'vitest';
import { ThreadType, type Message } from 'zca-js';
import { decideZcaMessageOwnership } from './message-ownership.js';

const OFFICIAL_BOT_ID = '4055584533866160964';

function groupMessage(options: {
  senderId?: string;
  text?: string;
  mentions?: Array<{ uid: string; pos: number; len: number }>;
} = {}): Message {
  return {
    type: ThreadType.Group,
    threadId: 'zca-group-1',
    isSelf: false,
    data: {
      msgId: 'm-1',
      content: options.text ?? 'gui 10 ghe felix',
      uidFrom: options.senderId ?? 'customer-1',
      dName: 'Khach',
      ts: '1783404428055',
      mentions: options.mentions,
    },
  } as unknown as Message;
}

describe('decideZcaMessageOwnership', () => {
  it('native mention dung Bot chinh thuc -> nhuong cho Bot Platform', () => {
    const message = groupMessage({
      text: '@Bot ultty AI orders gui 10 ghe felix',
      mentions: [{ uid: OFFICIAL_BOT_ID, pos: 0, len: 20 }],
    });

    expect(decideZcaMessageOwnership(message, OFFICIAL_BOT_ID)).toBe('yield_to_bot');
  });

  it('khong mention -> zca xu ly', () => {
    expect(decideZcaMessageOwnership(groupMessage(), OFFICIAL_BOT_ID)).toBe('process_with_zca');
  });

  it('mention nguoi khac -> zca van xu ly', () => {
    const message = groupMessage({ mentions: [{ uid: 'sale-1', pos: 0, len: 5 }] });

    expect(decideZcaMessageOwnership(message, OFFICIAL_BOT_ID)).toBe('process_with_zca');
  });

  it('chi go ten Bot bang chu, khong co native mention metadata -> zca xu ly', () => {
    const message = groupMessage({ text: '@Bot ultty AI orders gui 10 ghe felix' });

    expect(decideZcaMessageOwnership(message, OFFICIAL_BOT_ID)).toBe('process_with_zca');
  });

  it('tin do Bot chinh thuc gui -> zca bo qua de chong vong lap', () => {
    const message = groupMessage({ senderId: OFFICIAL_BOT_ID, text: 'Da ghi nhan don hang' });

    expect(decideZcaMessageOwnership(message, OFFICIAL_BOT_ID)).toBe('ignore_official_bot');
  });

  it('khong lay duoc ID Bot -> fail closed ke ca khi zca khong tra mention metadata', () => {
    expect(decideZcaMessageOwnership(groupMessage(), null)).toBe('identity_unavailable');
  });

  it('khong lay duoc ID Bot + co native mention -> fail closed vi khong biet mention ai', () => {
    const message = groupMessage({ mentions: [{ uid: 'unknown-target', pos: 0, len: 5 }] });

    expect(decideZcaMessageOwnership(message, null)).toBe('identity_unavailable');
  });
});
