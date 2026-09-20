import { describe, expect, it } from 'vitest';
import {
  toLocationHealthPresentation,
  type LocationHealthView,
  type SourceFamilyHealthView,
} from '../location-health';

const OBSERVED_AT = '2026-09-18T14:00:00.000Z';

const source = (overrides: Partial<SourceFamilyHealthView> = {}): SourceFamilyHealthView => ({
  family: 'PHONE',
  status: 'LIVE',
  source: 'DEVICE_GNSS',
  lastReceivedAt: OBSERVED_AT,
  ageSeconds: 18,
  ...overrides,
});

const health = (overrides: Partial<LocationHealthView> = {}): LocationHealthView => ({
  vehicleId: 'vehicle-w-location-01',
  status: 'LIVE',
  reason: 'RECENT_OBSERVATION',
  currentSource: 'PHONE',
  lastReceivedAt: OBSERVED_AT,
  ageSeconds: 18,
  sources: [
    source(),
    source({
      family: 'TELEMATICS',
      status: 'NOT_CONFIGURED',
      source: null,
      lastReceivedAt: null,
      ageSeconds: null,
    }),
  ],
  lastKnown: {
    point: { latitude: 21.0278, longitude: 105.8342 },
    source: 'DEVICE_GNSS',
    family: 'PHONE',
    accuracyMetres: 8,
    sessionId: 'tracking-session-w-01',
    observedAt: OBSERVED_AT,
    ageSeconds: 18,
    usableAsCurrent: true,
    coordinatesRedacted: false,
  },
  ...overrides,
});

describe('location health — su that hien tai va dau vet cu khong bi tron', () => {
  it('LIVE noi ro nguon hien tai va chi cho phep ban LIVE lam vi tri hien tai', () => {
    const model = toLocationHealthPresentation(health());

    expect(model.statusLabel).toBe('Đang nhận vị trí');
    expect(model.statusTone).toBe('go');
    expect(model.currentLocation).toMatchObject({
      kind: 'CURRENT',
      sourceFamily: 'PHONE',
      sourceLabel: 'Điện thoại',
      observedAt: OBSERVED_AT,
      ageSeconds: 18,
    });
    expect(model.lastKnownLocation).toBeNull();
  });

  it('ban stale chi la VI TRI CUOI CUNG, khong bao gio la current marker', () => {
    const model = toLocationHealthPresentation(
      health({
        status: 'DEGRADED',
        reason: 'OBSERVATION_AGEING',
        currentSource: null,
        ageSeconds: 900,
        sources: [source({ status: 'DEGRADED', ageSeconds: 900 })],
        lastKnown: {
          ...health().lastKnown!,
          ageSeconds: 900,
          usableAsCurrent: false,
        },
      }),
    );

    expect(model.statusLabel).toBe('Vị trí đã cũ');
    expect(model.currentLocation).toBeNull();
    expect(model.lastKnownLocation).toMatchObject({
      kind: 'LAST_KNOWN',
      label: 'Vị trí cuối cùng',
      observedAt: OBSERVED_AT,
      ageSeconds: 900,
    });
  });
});

describe('location health — tung nguon van doc duoc khi co fallback', () => {
  it('PHONE mat van hien canh bao trong khi TELEMATICS dang cap vi tri du phong', () => {
    const model = toLocationHealthPresentation(
      health({
        status: 'SOURCE_FALLBACK',
        reason: 'PHONE_SILENT_TELEMATICS_RECENT',
        currentSource: 'TELEMATICS',
        sources: [
          source({ status: 'LOST', ageSeconds: 1_200 }),
          source({
            family: 'TELEMATICS',
            status: 'LIVE',
            source: 'TELEMATICS',
            ageSeconds: 12,
          }),
        ],
        ageSeconds: 12,
        lastKnown: {
          ...health().lastKnown!,
          source: 'TELEMATICS',
          family: 'TELEMATICS',
          ageSeconds: 12,
          usableAsCurrent: true,
        },
      }),
    );

    expect(model.statusLabel).toBe('Đang dùng nguồn dự phòng');
    expect(model.currentLocation).toMatchObject({
      kind: 'CURRENT',
      sourceFamily: 'TELEMATICS',
    });
    expect(model.sources.find((entry) => entry.family === 'PHONE')).toMatchObject({
      status: 'LOST',
      statusLabel: 'Mất GPS / Không nhận vị trí',
      tone: 'stop',
    });
  });

  it('khong bien software seam TELEMATICS thanh loi khang dinh co thiet bi that', () => {
    const model = toLocationHealthPresentation(
      health({
        status: 'SOURCE_FALLBACK',
        reason: 'PHONE_SILENT_TELEMATICS_RECENT',
        currentSource: 'TELEMATICS',
        sources: [
          source({ status: 'LOST', ageSeconds: 1_200 }),
          source({
            family: 'TELEMATICS',
            status: 'LIVE',
            source: 'TELEMATICS',
            ageSeconds: 12,
          }),
        ],
        lastKnown: {
          ...health().lastKnown!,
          source: 'TELEMATICS',
          family: 'TELEMATICS',
          ageSeconds: 12,
          usableAsCurrent: true,
        },
      }),
    );

    expect(model.realDeviceProof).toBe('NOT_PROVEN');
    expect(model.realDeviceProofLabel).toBe('Thiết bị thực tế chưa được chứng minh');

    const ownerVisibleCopy = [
      model.statusLabel,
      model.realDeviceProofLabel,
      ...model.sources.flatMap((entry) => [entry.label, entry.statusLabel]),
    ].join(' ');
    expect(ownerVisibleCopy).not.toMatch(/thiết bị thật đang hoạt động|đã xác minh thiết bị thật/i);
  });
});

describe('location health — mat het va khong theo doi la hai trang thai khac nhau', () => {
  it('ALL_SOURCES_LOST co nhan canh bao va van noi moc last seen nhu bang chung cuoi', () => {
    const model = toLocationHealthPresentation(
      health({
        status: 'ALL_SOURCES_LOST',
        reason: 'NO_RECENT_OBSERVATION_ANY_SOURCE',
        currentSource: null,
        ageSeconds: 3_600,
        sources: [
          source({ status: 'LOST', ageSeconds: 3_600 }),
          source({
            family: 'TELEMATICS',
            status: 'LOST',
            source: 'TELEMATICS',
            ageSeconds: 4_200,
          }),
        ],
        lastKnown: {
          ...health().lastKnown!,
          ageSeconds: 3_600,
          usableAsCurrent: false,
        },
      }),
    );

    expect(model.statusLabel).toBe('Mất tất cả nguồn vị trí');
    expect(model.statusTone).toBe('stop');
    expect(model.currentLocation).toBeNull();
    expect(model.lastKnownLocation).toMatchObject({
      kind: 'LAST_KNOWN',
      label: 'Vị trí cuối cùng',
      observedAt: OBSERVED_AT,
      ageSeconds: 3_600,
    });
  });

  it("NOT_TRACKED noi 'Khong bat theo doi' voi sac thai trung tinh, khong gia lam mat GPS", () => {
    const model = toLocationHealthPresentation(
      health({
        status: 'NOT_TRACKED',
        reason: 'TRACKING_NOT_EXPECTED',
        currentSource: null,
        lastReceivedAt: null,
        ageSeconds: null,
        sources: [],
        lastKnown: null,
      }),
    );

    expect(model.statusLabel).toBe('Không bật theo dõi');
    expect(model.statusTone).toBe('flat');
    expect(model.currentLocation).toBeNull();
    expect(model.lastKnownLocation).toBeNull();
    expect(model.statusLabel).not.toMatch(/mất|lỗi/i);
  });
});
