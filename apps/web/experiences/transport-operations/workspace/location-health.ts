export type LocationHealthTone = 'go' | 'wait' | 'stop' | 'flat';
export type LocationSourceFamily = 'PHONE' | 'TELEMATICS';
export type LocationSourceStatus = 'NOT_CONFIGURED' | 'LIVE' | 'DEGRADED' | 'LOST';

export interface SourceFamilyHealthView {
  readonly family: LocationSourceFamily;
  readonly status: LocationSourceStatus;
  readonly source: string | null;
  readonly lastReceivedAt: string | null;
  readonly ageSeconds: number | null;
}

export interface LocationHealthView {
  readonly vehicleId: string;
  readonly status:
    'NOT_TRACKED' | 'LIVE' | 'DEGRADED' | 'LOST' | 'SOURCE_FALLBACK' | 'ALL_SOURCES_LOST';
  readonly reason: string;
  readonly currentSource: LocationSourceFamily | null;
  readonly lastReceivedAt: string | null;
  readonly ageSeconds: number | null;
  readonly sources: readonly SourceFamilyHealthView[];
  readonly lastKnown: {
    readonly point: { readonly latitude: number; readonly longitude: number } | null;
    readonly source: string;
    readonly family: LocationSourceFamily;
    readonly accuracyMetres: number | null;
    readonly sessionId: string | null;
    readonly observedAt: string;
    readonly ageSeconds: number;
    readonly usableAsCurrent: boolean;
    readonly coordinatesRedacted: boolean;
  } | null;
}

const sourceLabels: Readonly<Record<LocationSourceFamily, string>> = {
  PHONE: 'Điện thoại',
  TELEMATICS: 'Thiết bị hành trình',
};

const sourceStatus: Readonly<
  Record<LocationSourceStatus, { readonly label: string; readonly tone: LocationHealthTone }>
> = {
  NOT_CONFIGURED: { label: 'Chưa cấu hình', tone: 'flat' },
  LIVE: { label: 'Đang nhận vị trí', tone: 'go' },
  DEGRADED: { label: 'Vị trí đã cũ', tone: 'wait' },
  LOST: { label: 'Mất GPS / Không nhận vị trí', tone: 'stop' },
};

const overallStatus: Readonly<
  Record<
    LocationHealthView['status'],
    { readonly label: string; readonly tone: LocationHealthTone }
  >
> = {
  NOT_TRACKED: { label: 'Không bật theo dõi', tone: 'flat' },
  LIVE: { label: 'Đang nhận vị trí', tone: 'go' },
  DEGRADED: { label: 'Vị trí đã cũ', tone: 'wait' },
  LOST: { label: 'Mất GPS / Không nhận vị trí', tone: 'stop' },
  SOURCE_FALLBACK: { label: 'Đang dùng nguồn dự phòng', tone: 'wait' },
  ALL_SOURCES_LOST: { label: 'Mất tất cả nguồn vị trí', tone: 'stop' },
};

export function toLocationHealthPresentation(health: LocationHealthView) {
  const status = overallStatus[health.status];
  const lastKnown = health.lastKnown;
  const canBeCurrent =
    lastKnown !== null &&
    lastKnown.usableAsCurrent &&
    health.currentSource !== null &&
    lastKnown.family === health.currentSource;

  const location =
    lastKnown === null
      ? null
      : {
          kind: canBeCurrent ? ('CURRENT' as const) : ('LAST_KNOWN' as const),
          label: canBeCurrent ? 'Vị trí hiện tại' : 'Vị trí cuối cùng',
          sourceFamily: lastKnown.family,
          sourceLabel: sourceLabels[lastKnown.family],
          point: lastKnown.point,
          coordinatesRedacted: lastKnown.coordinatesRedacted,
          observedAt: lastKnown.observedAt,
          ageSeconds: lastKnown.ageSeconds,
        };

  return {
    statusLabel: status.label,
    statusTone: status.tone,
    currentLocation: canBeCurrent ? location : null,
    lastKnownLocation: canBeCurrent ? null : location,
    realDeviceProof: 'NOT_PROVEN' as const,
    realDeviceProofLabel: 'Thiết bị thực tế chưa được chứng minh',
    sources: health.sources.map((entry) => ({
      ...entry,
      label: sourceLabels[entry.family],
      statusLabel: sourceStatus[entry.status].label,
      tone: sourceStatus[entry.status].tone,
    })),
  };
}
