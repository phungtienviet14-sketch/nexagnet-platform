import { describe, expect, it } from 'vitest';
import type { ConversationThread } from '@netviet/shared';
import {
  DEFAULT_THREAD_POLICY,
  canAskAgain,
  isAwaiting,
  isLive,
  reduceThread,
  type ThreadKey,
} from './conversation-thread.js';

const KEY: ThreadKey = { chatId: 'g1', senderExternalId: 'u1' };
const NOW = new Date('2026-08-21T09:00:00.000Z');

function ask(thread: ConversationThread | null, now = NOW): ConversationThread {
  return reduceThread(thread, { type: 'asked', slots: ['quantity'], question: 'may cai a?' }, KEY, now);
}

describe('reduceThread', () => {
  it('tin dau tien mo mach o trang thai collecting', () => {
    const thread = reduceThread(
      null,
      { type: 'customer_message', draft: { items: [{ skuRaw: 'ghe felix' }] }, displayName: 'Lan' },
      KEY,
      NOW,
    );

    expect(thread).toMatchObject({ status: 'collecting', askCount: 0, senderDisplayName: 'Lan' });
  });

  it('hoi lai -> awaiting_answer va tang askCount', () => {
    const asked = ask(null);

    expect(asked).toMatchObject({ status: 'awaiting_answer', askCount: 1, awaitingSlots: ['quantity'] });
    expect(isAwaiting(asked, NOW)).toBe(true);
  });

  it('don nhap luu vao mach la ban DA GOP do pipeline tinh, reducer khong gop lai', () => {
    const asked = reduceThread(
      reduceThread(
        null,
        { type: 'customer_message', draft: { items: [{ skuRaw: 'ghe felix' }] } },
        KEY,
        NOW,
      ),
      { type: 'asked', slots: ['quantity'], question: 'may cai a?' },
      KEY,
      NOW,
    );

    // `mergeConversationTurn` moi la cho gop; no da tra ve don DAY DU truoc khi den day.
    const answered = reduceThread(
      asked,
      { type: 'customer_message', draft: { items: [{ skuRaw: 'ghe felix', quantity: 20 }] } },
      KEY,
      NOW,
    );

    expect(answered.draft.items).toEqual([{ skuRaw: 'ghe felix', quantity: 20 }]);
    expect(answered.askCount).toBe(1);
  });

  it('mach da chot KHONG hoi sinh — tin sau la luot mua moi', () => {
    const closed = reduceThread(ask(null), { type: 'closed', orderId: 'o1' }, KEY, NOW);
    expect(isLive(closed, NOW)).toBe(false);

    const next = reduceThread(
      closed,
      { type: 'customer_message', draft: { items: [{ quantity: 5 }] } },
      KEY,
      NOW,
    );

    expect(next.askCount).toBe(0);
    expect(next.draft.items).toEqual([{ quantity: 5 }]);
  });

  it('mach het han KHONG ke thua don nhap cu', () => {
    const asked = reduceThread(
      reduceThread(
        null,
        { type: 'customer_message', draft: { items: [{ skuRaw: 'ghe felix' }] } },
        KEY,
        NOW,
      ),
      { type: 'asked', slots: ['quantity'], question: 'may cai a?' },
      KEY,
      NOW,
    );
    const later = new Date(NOW.getTime() + (DEFAULT_THREAD_POLICY.ttlMinutes + 1) * 60_000);

    expect(isLive(asked, later)).toBe(false);
    const next = reduceThread(
      asked,
      { type: 'customer_message', draft: { items: [{ quantity: 20 }] } },
      KEY,
      later,
    );
    expect(next.draft.items).toEqual([{ quantity: 20 }]);
  });

  it('het luot hoi thi khong hoi tiep', () => {
    const twice = ask(ask(null));

    expect(twice.askCount).toBe(DEFAULT_THREAD_POLICY.maxQuestions);
    expect(canAskAgain(twice)).toBe(false);
  });

  it('chuyen Sale dong mach va xoa slot dang cho', () => {
    const handed = reduceThread(ask(null), { type: 'handed_off', orderId: 'o9' }, KEY, NOW);

    expect(handed).toMatchObject({ status: 'handed_off', awaitingSlots: [], lastOrderId: 'o9' });
    expect(isAwaiting(handed, NOW)).toBe(false);
  });
});
