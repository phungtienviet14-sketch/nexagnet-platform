import type { DriverFieldAction, DriverFieldLeg, DriverFieldWork } from './types';

/** Du lieu mau cho test — hinh dang DUNG `GET /transport/me/field-work`, khong ten khach nao. */
export const ARRIVE_PICKUP: DriverFieldAction = {
  kind: 'CHECKPOINT',
  label: 'Đã tới điểm lấy hàng',
  checkpointType: 'PICKUP_ARRIVAL',
  requiresLocation: false,
  required: true,
};

export const ARRIVE_DELIVERY: DriverFieldAction = {
  kind: 'CHECKPOINT',
  label: 'Đã đến nơi',
  checkpointType: 'DELIVERY_ARRIVAL',
  requiresLocation: true,
  required: true,
};

export const START_WAITING: DriverFieldAction = {
  kind: 'WAITING_START',
  label: 'Bắt đầu chờ',
  requiresLocation: false,
  required: false,
};

export const RECEIPT_PHOTO: DriverFieldAction = {
  kind: 'DOCUMENT',
  label: 'Chụp biên nhận giao hàng',
  documentType: 'DELIVERY_RECEIPT',
  requiresLocation: false,
  required: true,
};

export const HOLD_RECEIPT: DriverFieldAction = {
  kind: 'RECEIPT_HANDOVER',
  label: 'Tôi đang giữ biên nhận',
  requiresLocation: false,
  required: false,
};

export function leg(overrides: Partial<DriverFieldLeg> = {}): DriverFieldLeg {
  return {
    legId: 'leg-1',
    sequence: 1,
    kind: 'LOADED',
    originLabel: 'Kho A',
    destinationLabel: 'Kho B',
    orderCode: 'DH-001',
    orderId: 'order-1',
    pickupPoint: { latitude: 21.0285, longitude: 105.8542 },
    deliveryPoint: { latitude: 20.8449, longitude: 106.6881 },
    phase: 'PLANNED',
    recordedTypes: [],
    arrivalCheckpointId: null,
    waiting: null,
    documents: [],
    missingDocumentTypes: [],
    receiptHandover: null,
    nextActions: [ARRIVE_PICKUP],
    ...overrides,
  };
}

export function work(legs: readonly DriverFieldLeg[], runCode = 'VX-0001'): DriverFieldWork {
  return {
    serverNow: '2026-09-25T01:00:00.000Z',
    runs: [{ runId: 'run-1', runCode, legs }],
  };
}
