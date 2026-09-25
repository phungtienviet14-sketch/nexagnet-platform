import type { OutboxItem, SendOutcome } from '@netviet/driver-outbox';
import { describe, expect, it } from 'vitest';
import { PAUSE_UNAUTHENTICATED } from './field-actions';
import { HELD_BEHIND_EARLIER, orderingKeys, sendProofBatch } from './proof-sender';

function item(id: string, payload: Record<string, unknown>, minute = 0): OutboxItem {
  return {
    id,
    clientEventId: `evt-${id}`,
    kind: 'PROOF',
    capturedAt: `2026-09-25T07:${String(minute).padStart(2, '0')}:00.000Z`,
    payload,
    attachments: [],
    attempts: 0,
    nextAttemptAt: '2026-09-25T07:00:00.000Z',
    state: 'PENDING',
    lastError: null,
  };
}

const arrival = (id: string, runId = 'r1', legId = 'l1', minute = 0) =>
  item(id, { type: 'CHECKPOINT', runId, legId, checkpointType: 'DELIVERY_ARRIVAL' }, minute);

function executor(script: Record<string, SendOutcome>) {
  const calls: string[] = [];
  return {
    calls,
    execute: async (row: OutboxItem): Promise<SendOutcome> => {
      calls.push(row.id);
      return script[row.id] ?? { kind: 'ACCEPTED' };
    },
  };
}

describe('sendProofBatch — FIFO theo vong chay/chang', () => {
  it('viec truoc loi mang -> viec sau CUNG vong chay bi giu, khong gui vuot', async () => {
    const { calls, execute } = executor({ a: { kind: 'RETRY', reason: 'Network request failed' } });

    const outcomes = await sendProofBatch(
      [arrival('a', 'r1', 'l1', 0), arrival('b', 'r1', 'l1', 1), arrival('c', 'r2', 'l9', 2)],
      execute,
    );

    expect(calls).toEqual(['a', 'c']);
    expect(outcomes).toEqual([
      { kind: 'RETRY', reason: 'Network request failed' },
      { kind: 'RETRY', reason: HELD_BEHIND_EARLIER },
      { kind: 'ACCEPTED' },
    ]);
  });

  it('viec truoc DANG LUI HEN (ngoai lo) cung giu viec sau cung khoa', async () => {
    const { calls, execute } = executor({});
    const backingOff = arrival('old', 'r1', 'l1', 0);

    const outcomes = await sendProofBatch([arrival('new', 'r1', 'l1', 5)], execute, [backingOff]);

    expect(calls).toEqual([]);
    expect(outcomes).toEqual([{ kind: 'RETRY', reason: HELD_BEHIND_EARLIER }]);
  });

  it('muc ngoai lo MOI HON khong giu muc cu', async () => {
    const { calls, execute } = executor({});
    await sendProofBatch([arrival('old', 'r1', 'l1', 0)], execute, [
      arrival('newer', 'r1', 'l1', 9),
    ]);
    expect(calls).toEqual(['old']);
  });

  it('bien nhan dung sau "Khách đã nhận" cua chang do', async () => {
    const accepted = item(
      'acc',
      { type: 'CHECKPOINT', runId: 'r1', legId: 'l1', checkpointType: 'DELIVERY_ACCEPTED' },
      0,
    );
    const handover = item('ho', { type: 'RECEIPT_HANDOVER', orderId: 'o1', legId: 'l1' }, 1);
    const { calls, execute } = executor({ acc: { kind: 'RETRY', reason: 'timeout' } });

    await sendProofBatch([accepted, handover], execute);

    expect(calls).toEqual(['acc']);
  });

  it('phieu dau doc lap — khong bi giu boi viec cua vong chay', async () => {
    const fuel = item('fuel', { type: 'FUEL_SLIP', body: { runId: 'r1' } }, 1);
    const { calls, execute } = executor({ a: { kind: 'RETRY', reason: 'timeout' } });

    await sendProofBatch([arrival('a', 'r1', 'l1', 0), fuel], execute);

    expect(calls).toEqual(['a', 'fuel']);
    expect(orderingKeys(fuel)).toEqual([]);
  });

  it('401 -> moi viec con lai cho, khong goi may chu them', async () => {
    const { calls, execute } = executor({ a: { kind: 'RETRY', reason: PAUSE_UNAUTHENTICATED } });

    const outcomes = await sendProofBatch([arrival('a'), arrival('b', 'r2', 'l2', 1)], execute);

    expect(calls).toEqual(['a']);
    expect(outcomes[1]).toEqual({ kind: 'RETRY', reason: PAUSE_UNAUTHENTICATED });
  });

  it('bi tu choi (REJECTED) khong giu viec sau — viec sau tu nhan phan quyet cua no', async () => {
    const { calls, execute } = executor({ a: { kind: 'REJECTED', reason: 'X' } });
    await sendProofBatch([arrival('a'), arrival('b', 'r1', 'l1', 1)], execute);
    expect(calls).toEqual(['a', 'b']);
  });
});
