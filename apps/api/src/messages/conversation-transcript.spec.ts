import { describe, expect, it } from 'vitest';
import type { ConversationMessage } from '@netviet/shared';
import { formatRelativeTime, formatTranscript } from './conversation-transcript.js';

const NOW = new Date('2026-08-18T10:00:00.000Z');

function line(
  text: string,
  minutesAgo: number,
  overrides: Partial<ConversationMessage> = {},
): ConversationMessage {
  return {
    externalMessageId: `m-${minutesAgo}`,
    text,
    senderRole: 'customer',
    sentAt: new Date(NOW.getTime() - minutesAgo * 60_000),
    ...overrides,
  };
}

describe('formatRelativeTime', () => {
  it.each([
    [0, 'vua xong'],
    [0.5, 'vua xong'],
    [2, '2 phut truoc'],
    [59, '59 phut truoc'],
    [60, '1 gio truoc'],
    [200, '3 gio truoc'],
    [60 * 24, '1 ngay truoc'],
    [60 * 24 * 3, '3 ngay truoc'],
  ])('%s phut truoc -> %s', (minutesAgo, expected) => {
    expect(formatRelativeTime(new Date(NOW.getTime() - minutesAgo * 60_000), NOW)).toBe(expected);
  });

  it('moc thoi gian tuong lai (lech dong ho) khong tra ra so am', () => {
    expect(formatRelativeTime(new Date(NOW.getTime() + 60_000), NOW)).toBe('vua xong');
  });
});

describe('formatTranscript', () => {
  it('gan nhan vai de LLM biet ai noi cau nao', () => {
    const lines = formatTranscript(
      {
        recentMessages: [
          line('ghe felix con hang ko', 5, { senderDisplayName: 'Meta HN' }),
          line('Da con hang a nhe', 4, { senderRole: 'bot' }),
          line('the lay 10c', 1, { senderDisplayName: 'Meta HN' }),
        ],
        participants: [],
      },
      NOW,
    );

    expect(lines).toEqual([
      '[KHACH Meta HN] (5 phut truoc): ghe felix con hang ko',
      '[BOT] (4 phut truoc): Da con hang a nhe',
      '[KHACH Meta HN] (1 phut truoc): the lay 10c',
    ]);
  });

  it('vai sale duoc phan biet voi bot', () => {
    const lines = formatTranscript(
      {
        recentMessages: [line('Em kiem tra lai giup anh', 2, { senderRole: 'sale' })],
        participants: [],
      },
      NOW,
    );

    expect(lines).toEqual(['[SALE] (2 phut truoc): Em kiem tra lai giup anh']);
  });

  it('khong co ten hien thi thi dung id, khong bia thanh "Khach"', () => {
    const lines = formatTranscript(
      {
        recentMessages: [line('gui nhe', 1, { senderExternalId: 'uid-9' })],
        participants: [],
      },
      NOW,
    );

    expect(lines).toEqual(['[KHACH uid-9] (1 phut truoc): gui nhe']);
  });

  it('tin anh khong chu thich van hien dien, khong bien mat khoi mach', () => {
    const lines = formatTranscript(
      {
        recentMessages: [
          line('', 3, { imageUrl: 'https://example.com/a.jpg', senderDisplayName: 'Meta HN' }),
        ],
        participants: [],
      },
      NOW,
    );

    expect(lines).toEqual(['[KHACH Meta HN] (3 phut truoc): (gui mot anh)']);
  });

  it('context rong -> khong dong nao', () => {
    expect(formatTranscript({ recentMessages: [], participants: [] }, NOW)).toEqual([]);
  });
});
