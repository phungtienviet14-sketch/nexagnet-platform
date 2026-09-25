import { describe, expect, it } from 'vitest';
import type { FrozenFix } from '../../outbox/field-actions';
import {
  NO_FIX_SUFFIX,
  TapKeys,
  capturedAtFor,
  checkpointCommand,
  documentCommand,
  handoverCommand,
  locationPolicyFor,
  waitingCommand,
  waitingGate,
} from './field-commands';
import { toFieldCard } from './field-work';
import { ARRIVE_DELIVERY, ARRIVE_PICKUP, RECEIPT_PHOTO, leg } from './fixtures';

const FIX: FrozenFix = {
  latitude: 21.03,
  longitude: 105.85,
  accuracyMetres: 8,
  speedMetresPerSecond: null,
  bearingDegrees: null,
  source: 'DEVICE_FUSED',
  capturedAt: '2026-09-25T00:05:00.000Z',
  mockLocationReported: false,
};

const card = toFieldCard(leg(), 'run-1', 'VX-0001');

describe('locationPolicyFor', () => {
  it('moc may chu doi vi tri -> cong cung; con lai -> co thi tot', () => {
    expect(locationPolicyFor(ARRIVE_DELIVERY)).toBe('REQUIRED');
    expect(locationPolicyFor(ARRIVE_PICKUP)).toBe('BEST_EFFORT');
  });
});

describe('checkpointCommand', () => {
  it('co vi tri: dong bang ban dinh vi + ma quan sat rieng', () => {
    const command = checkpointCommand({
      card,
      action: ARRIVE_PICKUP,
      note: '  cong so 2  ',
      fix: FIX,
      observationClientEventId: 'obs-1',
    });
    expect(command).toEqual({
      type: 'CHECKPOINT',
      label: 'Đã tới điểm lấy hàng · VX-0001 · chặng 1',
      runId: 'run-1',
      legId: 'leg-1',
      checkpointType: 'PICKUP_ARRIVAL',
      note: 'cong so 2',
      location: { fix: FIX, observationClientEventId: 'obs-1' },
    });
  });

  it('khong vi tri o moc khong bat buoc: van xep hang, nhan NOI THAT gio la gio may chu', () => {
    const command = checkpointCommand({
      card,
      action: ARRIVE_PICKUP,
      note: '',
      fix: null,
      observationClientEventId: 'obs-1',
    });
    expect(command.location).toBeNull();
    expect(command.note).toBeNull();
    expect(command.label).toContain(NO_FIX_SUFFIX);
  });

  it('moc bat buoc vi tri ma khong co vi tri -> KHONG tao lenh', () => {
    expect(() =>
      checkpointCommand({
        card,
        action: ARRIVE_DELIVERY,
        note: null,
        fix: null,
        observationClientEventId: 'o',
      }),
    ).toThrow(/bắt buộc kèm vị trí/);
  });

  it('nut khong phai moc thi tu choi', () => {
    expect(() =>
      checkpointCommand({
        card,
        action: RECEIPT_PHOTO,
        note: null,
        fix: FIX,
        observationClientEventId: 'o',
      }),
    ).toThrow();
  });
});

describe('capturedAtFor', () => {
  it('uu tien gio LAY VI TRI, khong thi gio bam', () => {
    const now = new Date('2026-09-25T00:10:00.000Z');
    expect(capturedAtFor(FIX, now)).toBe(FIX.capturedAt);
    expect(capturedAtFor(null, now)).toBe(now.toISOString());
  });
});

describe('waitingGate + waitingCommand', () => {
  it('moc den noi con tren may -> chua bat dau cho duoc', () => {
    expect(waitingGate(card, true)).toEqual({ kind: 'ARRIVAL_QUEUED' });
  });
  it('may chu chua co moc den noi -> thieu neo', () => {
    expect(waitingGate(card, false)).toEqual({ kind: 'ARRIVAL_MISSING' });
  });
  it('co neo -> lenh cho mang dung ly do va ghi chu', () => {
    const arrived = toFieldCard(leg({ arrivalCheckpointId: 'cp-9' }), 'run-1', 'VX-0001');
    const gate = waitingGate(arrived, false);
    expect(gate).toEqual({ kind: 'READY', arrivalCheckpointId: 'cp-9' });
    expect(
      waitingCommand({
        card: arrived,
        arrivalCheckpointId: 'cp-9',
        reason: 'QUEUE_AHEAD',
        note: ' ',
      }),
    ).toEqual({
      type: 'WAITING_START',
      label: 'Bắt đầu chờ · VX-0001 · chặng 1',
      runId: 'run-1',
      legId: 'leg-1',
      arrivalCheckpointId: 'cp-9',
      reason: 'QUEUE_AHEAD',
      note: null,
    });
  });
});

describe('documentCommand / handoverCommand', () => {
  it('chung tu mang dung loai va nguon anh', () => {
    const command = documentCommand({ card, action: RECEIPT_PHOTO, captureMode: 'GALLERY' });
    expect(command.documentType).toBe('DELIVERY_RECEIPT');
    expect(command.captureMode).toBe('GALLERY');
    expect(command.checkpointId).toBeNull();
  });
  it('giu bien nhan mang ghi chu co dinh cua web', () => {
    expect(handoverCommand(card)).toMatchObject({
      type: 'RECEIPT_HANDOVER',
      orderId: 'order-1',
      externalNote: 'Biên nhận giấy có chữ ký người nhận',
    });
  });
  it('chang khong mang don thi khong co bien nhan de giu', () => {
    const empty = toFieldCard(leg({ orderId: null }), 'run-1', 'VX');
    expect(() => handoverCommand(empty)).toThrow();
  });
});

describe('TapKeys — mot khoa cho mot lan bam logic', () => {
  it('bam doi = cung khoa; da vao hang doi thi lan sau la khoa moi', () => {
    let counter = 0;
    const keys = new TapKeys(() => `id-${++counter}`);
    const first = keys.keyFor('leg-1:CHECKPOINT:LOADING');
    expect(keys.keyFor('leg-1:CHECKPOINT:LOADING')).toBe(first);
    expect(keys.keyFor('leg-2:CHECKPOINT:LOADING')).not.toBe(first);
    keys.release('leg-1:CHECKPOINT:LOADING');
    expect(keys.keyFor('leg-1:CHECKPOINT:LOADING')).not.toBe(first);
  });
});
