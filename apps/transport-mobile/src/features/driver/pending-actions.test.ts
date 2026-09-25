import { describe, expect, it } from 'vitest';
import {
  ARRIVE_DELIVERY,
  ARRIVE_PICKUP,
  HOLD_RECEIPT,
  RECEIPT_PHOTO,
  START_WAITING,
} from './fixtures';
import {
  arrivalStillQueued,
  entriesForLeg,
  entryLabel,
  localStateFor,
  matchesAction,
  sendStage,
  splitActions,
  type QueueEntry,
} from './pending-actions';

function entry(
  payload: Record<string, unknown>,
  state: QueueEntry['state'] = 'PENDING',
): QueueEntry {
  return { clientEventId: `e-${Math.random()}`, state, lastError: null, capturedAt: 'x', payload };
}

describe('matchesAction — doi chieu hang doi voi tung nut', () => {
  it('moc: cung chang + cung loai moc', () => {
    const queued = entry({ type: 'CHECKPOINT', legId: 'leg-1', checkpointType: 'PICKUP_ARRIVAL' });
    expect(matchesAction(queued, 'leg-1', null, ARRIVE_PICKUP)).toBe(true);
    expect(matchesAction(queued, 'leg-2', null, ARRIVE_PICKUP)).toBe(false);
    expect(matchesAction(queued, 'leg-1', null, ARRIVE_DELIVERY)).toBe(false);
  });

  it('chung tu: cung chang + cung loai chung tu', () => {
    const queued = entry({ type: 'DOCUMENT', legId: 'leg-1', documentType: 'DELIVERY_RECEIPT' });
    expect(matchesAction(queued, 'leg-1', null, RECEIPT_PHOTO)).toBe(true);
    expect(matchesAction(queued, 'leg-1', null, ARRIVE_PICKUP)).toBe(false);
  });

  it('bat dau cho: theo chang', () => {
    expect(
      matchesAction(entry({ type: 'WAITING_START', legId: 'leg-1' }), 'leg-1', null, START_WAITING),
    ).toBe(true);
  });

  it('giu bien nhan: theo chang HOAC theo don', () => {
    const byOrder = entry({ type: 'RECEIPT_HANDOVER', legId: null, orderId: 'order-9' });
    expect(matchesAction(byOrder, 'leg-1', 'order-9', HOLD_RECEIPT)).toBe(true);
    expect(matchesAction(byOrder, 'leg-1', 'order-1', HOLD_RECEIPT)).toBe(false);
  });

  it('payload hong dang thi khong khop gi', () => {
    expect(matchesAction(entry({}), 'leg-1', null, ARRIVE_PICKUP)).toBe(false);
  });
});

describe('localStateFor', () => {
  it('BLOCKED thang QUEUED — muc bi tu choi can nguoi xem', () => {
    const payload = { type: 'CHECKPOINT', legId: 'leg-1', checkpointType: 'PICKUP_ARRIVAL' };
    const state = localStateFor(
      [entry(payload), { ...entry(payload, 'BLOCKED'), lastError: 'CHECKPOINT_RUN_TERMINAL' }],
      'leg-1',
      null,
      ARRIVE_PICKUP,
    );
    expect(state?.kind).toBe('BLOCKED');
    expect(state?.entry.lastError).toBe('CHECKPOINT_RUN_TERMINAL');
  });

  it('khong co gi tren may -> null', () => {
    expect(localStateFor([], 'leg-1', null, ARRIVE_PICKUP)).toBeNull();
  });
});

describe('arrivalStillQueued — cong cua "Bắt đầu chờ"', () => {
  it('moc Đã đến nơi con tren may thi chua cho bat dau cho', () => {
    const queued = [
      entry({ type: 'CHECKPOINT', legId: 'leg-1', checkpointType: 'DELIVERY_ARRIVAL' }),
    ];
    expect(arrivalStillQueued(queued, 'leg-1')).toBe(true);
    expect(arrivalStillQueued(queued, 'leg-2')).toBe(false);
    expect(arrivalStillQueued([], 'leg-1')).toBe(false);
  });
});

describe('splitActions — viec ke tiep la nut dau tien CHUA xep hang', () => {
  it('nut dau da xep hang -> nut ke tiep len lam nut chinh', () => {
    const queued = [
      entry({ type: 'CHECKPOINT', legId: 'leg-1', checkpointType: 'DELIVERY_ARRIVAL' }),
    ];
    const { hero, rest } = splitActions([ARRIVE_DELIVERY, RECEIPT_PHOTO], queued, 'leg-1', null);
    expect(hero).toBe(RECEIPT_PHOTO);
    expect(rest).toEqual([ARRIVE_DELIVERY]);
  });

  it('moi nut deu da xep hang -> khong co nut chinh (khong moi bam lan hai)', () => {
    const queued = [
      entry({ type: 'CHECKPOINT', legId: 'leg-1', checkpointType: 'PICKUP_ARRIVAL' }),
    ];
    expect(splitActions([ARRIVE_PICKUP], queued, 'leg-1', null).hero).toBeNull();
  });
});

describe('entriesForLeg / entryLabel', () => {
  it('loc theo chang va dung nhan da dong bang', () => {
    const list = [
      entry({ legId: 'leg-1', label: 'Đã tới điểm lấy hàng · VX · chặng 1' }),
      entry({ legId: 'x' }),
    ];
    expect(entriesForLeg(list, 'leg-1')).toHaveLength(1);
    expect(entryLabel(list[0] as QueueEntry)).toBe('Đã tới điểm lấy hàng · VX · chặng 1');
    expect(entryLabel(entry({}))).toBe('Việc hiện trường');
  });
});

describe('sendStage — xac nhan that sau khi bam', () => {
  const pending = { ...entry({}), clientEventId: 'k1' };
  const stage = (entries: readonly QueueEntry[], sent: readonly string[], online: boolean) =>
    sendStage({ clientEventId: 'k1', entries, sentIds: new Set(sent), online });

  it('con tren may: ngoai tuyen -> da luu; co mang -> dang gui', () => {
    expect(stage([pending], [], false).kind).toBe('SAVED_OFFLINE');
    expect(stage([pending], [], true).kind).toBe('SENDING');
  });
  it('co trong so da gui va khong con tren may -> da gui', () => {
    expect(stage([], ['k1'], true).kind).toBe('SENT');
  });
  it('chua thay o dau ca thi KHONG noi da gui', () => {
    expect(stage([], [], true).kind).toBe('SENDING');
  });
  it('bi tu choi -> mang ly do', () => {
    const blocked = { ...pending, state: 'BLOCKED' as const, lastError: 'CHECKPOINT_RUN_TERMINAL' };
    expect(stage([blocked], ['k1'], true)).toEqual({
      kind: 'BLOCKED',
      reason: 'CHECKPOINT_RUN_TERMINAL',
    });
  });
});
