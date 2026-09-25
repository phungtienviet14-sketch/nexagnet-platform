import type { OutboxItem, SendOutcome } from '@netviet/driver-outbox';
import { isPauseReason, type FieldAction } from './field-actions';

/**
 * THU TU VIEC BAM — FIFO theo vong chay/chang, xuyen moi loai viec.
 *
 * May chu kiem thu tu (do tren ma, critic_gaps §3.3): `CHECKPOINT_PREDECESSOR_MISSING` neu moc
 * den sai thu tu; "Bắt đầu chờ" den SAU "Khách đã nhận" thi `WAITING_DELIVERY_ALREADY_ACCEPTED`.
 * Dong co cua goi xa theo `capturedAt` — nhung neu mot viec truoc dang LUI HEN (loi mang) thi no
 * khong nam trong lo nay, va viec sau cung vong chay se bi gui TRUOC no. Ham nay giu viec sau lai
 * cho toi khi moi viec truoc cung khoa da di.
 *
 * Khoa: `run:<runId>` va `leg:<legId>` cho moc/cho/chung tu; `leg:<legId>` + `order:<orderId>`
 * cho bien nhan (no chi co nghia sau "Khách đã nhận" cua chang do). Phieu dau doc lap — khong
 * khoa gi, khong bi giu vi viec cua vong chay.
 */
export const HELD_BEHIND_EARLIER = 'WAITING_FOR_EARLIER_ACTION';

export function orderingKeys(item: Pick<OutboxItem, 'payload'>): readonly string[] {
  const action = item.payload as unknown as Partial<FieldAction> & Record<string, unknown>;
  const keys: string[] = [];
  if (typeof action.runId === 'string') keys.push(`run:${action.runId}`);
  if (typeof action.legId === 'string') keys.push(`leg:${action.legId}`);
  if (action.type === 'RECEIPT_HANDOVER' && typeof action.orderId === 'string') {
    keys.push(`order:${action.orderId}`);
  }
  if (action.type === 'FUEL_SLIP') return [];
  return keys;
}

function isEarlier(
  a: Pick<OutboxItem, 'capturedAt' | 'id'>,
  b: Pick<OutboxItem, 'capturedAt' | 'id'>,
) {
  const at = Date.parse(a.capturedAt);
  const bt = Date.parse(b.capturedAt);
  return at < bt || (at === bt && a.id < b.id);
}

/**
 * Gui mot lo viec bam TUAN TU. `pendingOutsideBatch` = cac muc PENDING khong nam trong lo (dang
 * lui hen) — de giu viec sau cung khoa. Het phien (401) thi moi viec con lai deu cho.
 */
export async function sendProofBatch(
  items: readonly OutboxItem[],
  execute: (item: OutboxItem) => Promise<SendOutcome>,
  pendingOutsideBatch: readonly OutboxItem[] = [],
): Promise<SendOutcome[]> {
  const held = new Set<string>();
  const outcomes: SendOutcome[] = [];
  let paused: string | null = null;

  for (const item of items) {
    const keys = orderingKeys(item);
    if (paused) {
      outcomes.push({ kind: 'RETRY', reason: paused });
      continue;
    }
    const blockedByEarlier =
      keys.some((key) => held.has(key)) ||
      pendingOutsideBatch.some(
        (other) =>
          other.id !== item.id &&
          isEarlier(other, item) &&
          orderingKeys(other).some((key) => keys.includes(key)),
      );
    if (blockedByEarlier) {
      keys.forEach((key) => held.add(key));
      outcomes.push({ kind: 'RETRY', reason: HELD_BEHIND_EARLIER });
      continue;
    }
    const outcome = await execute(item);
    if (outcome.kind === 'RETRY') {
      if (isPauseReason(outcome.reason)) paused = outcome.reason;
      keys.forEach((key) => held.add(key));
    }
    outcomes.push(outcome);
  }
  return outcomes;
}
