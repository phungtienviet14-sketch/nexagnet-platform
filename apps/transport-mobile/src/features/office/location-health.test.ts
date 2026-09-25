import { describe, expect, it } from 'vitest';
import { DEVICE_PROOF_NOTE, toLocationHealth } from './location-health';
import type { VehicleLocationHealth } from './types';

const base: VehicleLocationHealth = {
  vehicleId: 'v1',
  status: 'LIVE',
  reason: 'RECENT_OBSERVATION',
  currentSource: 'PHONE',
  lastReceivedAt: '2026-09-25T02:00:00.000Z',
  ageSeconds: 120,
  sources: [
    {
      family: 'PHONE',
      status: 'LIVE',
      source: 'PHONE_GPS',
      lastReceivedAt: '2026-09-25T02:00:00.000Z',
      ageSeconds: 120,
    },
    {
      family: 'TELEMATICS',
      status: 'NOT_CONFIGURED',
      source: null,
      lastReceivedAt: null,
      ageSeconds: null,
    },
  ],
  lastKnown: {
    point: { latitude: 21.0285, longitude: 105.8542 },
    coordinatesRedacted: false,
    source: 'PHONE_GPS',
    family: 'PHONE',
    accuracyMetres: 12.4,
    observedAt: '2026-09-25T02:00:00.000Z',
    ageSeconds: 120,
    usableAsCurrent: true,
  },
};

describe('toLocationHealth', () => {
  it('NOT_TRACKED la trung tinh, khong phai mat GPS', () => {
    const model = toLocationHealth({
      ...base,
      status: 'NOT_TRACKED',
      reason: 'TRACKING_NOT_EXPECTED',
      currentSource: null,
      sources: [],
      lastKnown: null,
    });
    expect(model.tone).toBe('neutral');
    expect(model.statusLabel).toBe('Không bật theo dõi');
    expect(model.location).toBeNull();
    expect(model.deviceProofNote).toBe(DEVICE_PROOF_NOTE);
  });

  it('LOST khong to do (khong buoc toi lai xe)', () => {
    const model = toLocationHealth({ ...base, status: 'LOST', reason: 'NO_RECENT_OBSERVATION' });
    expect(model.tone).not.toBe('danger');
    // Ly do noi nguyen nhan co the (song, pin, khoa man hinh) — khong noi "lai xe tat".
    expect(model.reason).toContain('sóng');
    expect(model.reason).not.toMatch(/lái xe tắt|lỗi của lái xe/);
  });

  it('vi tri hien tai chi khi usableAsCurrent va dung nguon dang dung', () => {
    expect(toLocationHealth(base).location?.label).toBe('Vị trí hiện tại · Điện thoại');
    const stale = toLocationHealth({
      ...base,
      status: 'DEGRADED',
      lastKnown: { ...base.lastKnown!, usableAsCurrent: false, ageSeconds: 1500 },
    });
    expect(stale.location?.kind).toBe('LAST_KNOWN');
    expect(stale.location?.label).toBe('Vị trí cuối cùng · 25 phút trước');
    const otherSource = toLocationHealth({ ...base, currentSource: 'TELEMATICS' });
    expect(otherSource.location?.kind).toBe('LAST_KNOWN');
  });

  it('toa do chi khi may chu tra; che thi khong co o toa do', () => {
    expect(toLocationHealth(base).location?.coordinates).toBe('21.02850, 105.85420 (±12 m)');
    const redacted = toLocationHealth({
      ...base,
      lastKnown: { ...base.lastKnown!, point: null, coordinatesRedacted: true },
    });
    expect(redacted.location?.coordinates).toBeNull();
  });

  it('AWAITING_FIRST va trang thai la duoc xu ly phong thu', () => {
    const model = toLocationHealth({
      ...base,
      status: 'SOMETHING_NEW',
      sources: [
        {
          family: 'PHONE',
          status: 'AWAITING_FIRST',
          source: null,
          lastReceivedAt: null,
          ageSeconds: null,
        },
        { family: 'PHONE', status: 'WEIRD', source: null, lastReceivedAt: null, ageSeconds: null },
      ],
    });
    expect(model.statusLabel).toContain('SOMETHING_NEW');
    expect(model.sources[0]?.statusLabel).toBe('Đang chờ vị trí đầu tiên');
    expect(model.sources[0]?.age).toBe('chưa có bản nào');
    expect(model.sources[1]?.statusLabel).toContain('WEIRD');
  });
});
