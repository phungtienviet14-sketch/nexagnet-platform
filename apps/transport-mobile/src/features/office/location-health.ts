import { formatAge, formatClock } from '../../format';
import type { SourceFamilyHealth, VehicleLocationHealth } from './types';

/**
 * SUC KHOE VI TRI cua mot xe — HAM THUAN, luat cua #297.
 *
 *   · `NOT_TRACKED` KHONG phai `LOST`: "khong ai yeu cau bam" la TRUNG TINH (xam), khong bao gio do.
 *   · Mat tin hieu KHONG phai loi cua lai xe: song yeu, pin, may khoa man hinh deu im lang y het. Nen
 *     ca `LOST` cung chi la mau CANH BAO, va cau chu noi su that ("không nhận được"), khong buoc toi.
 *   · "Vị trí hiện tại" CHI khi `usableAsCurrent` va ban ghi den tu CHINH nguon dang dung; con lai la
 *     "Vị trí cuối cùng · N phút trước".
 *   · Luon kem "Thiết bị thực tế chưa được chứng minh" — nguong im lang la de xuat, chua do tren may
 *     that (`tracking-policy.ts`).
 *   · Toa do: ke toan KHONG co `location.history.read` -> may chu tra `point: null` (che tron). Khi
 *     do man hinh khong co mot o toa do nao, ke ca o trong.
 */

export type HealthTone = 'live' | 'caution' | 'neutral';

export const DEVICE_PROOF_NOTE = 'Thiết bị thực tế chưa được chứng minh';

const STATUS: Readonly<Record<string, { readonly label: string; readonly tone: HealthTone }>> = {
  NOT_TRACKED: { label: 'Không bật theo dõi', tone: 'neutral' },
  LIVE: { label: 'Đang nhận vị trí', tone: 'live' },
  DEGRADED: { label: 'Vị trí đã cũ', tone: 'caution' },
  LOST: { label: 'Mất GPS / Không nhận vị trí', tone: 'caution' },
  SOURCE_FALLBACK: { label: 'Đang dùng nguồn dự phòng', tone: 'caution' },
  ALL_SOURCES_LOST: { label: 'Mất tất cả nguồn vị trí', tone: 'caution' },
};

const SOURCE_STATUS: Readonly<
  Record<string, { readonly label: string; readonly tone: HealthTone }>
> = {
  NOT_CONFIGURED: { label: 'Chưa cấu hình', tone: 'neutral' },
  AWAITING_FIRST: { label: 'Đang chờ vị trí đầu tiên', tone: 'neutral' },
  LIVE: { label: 'Đang nhận vị trí', tone: 'live' },
  DEGRADED: { label: 'Vị trí đã cũ', tone: 'caution' },
  LOST: { label: 'Mất GPS / Không nhận vị trí', tone: 'caution' },
};

const FAMILY_LABEL: Readonly<Record<string, string>> = {
  PHONE: 'Điện thoại',
  TELEMATICS: 'Thiết bị hành trình',
};

const REASON_LABEL: Readonly<Record<string, string>> = {
  TRACKING_NOT_EXPECTED: 'Không có vòng chạy nào đang yêu cầu bám vị trí xe này.',
  RECENT_OBSERVATION: 'Có vị trí mới trong khung thời gian cho phép.',
  AWAITING_FIRST_OBSERVATION: 'Vừa bắt đầu bám — đang chờ bản định vị đầu tiên.',
  OBSERVATION_AGEING: 'Bản vị trí gần nhất đã cũ hơn khung cho phép.',
  NO_RECENT_OBSERVATION:
    'Đã từng nhận vị trí rồi ngừng — có thể do sóng, pin hoặc máy khoá màn hình.',
  NO_OBSERVATION_RECEIVED: 'Đã chờ quá lâu mà chưa nhận được bản vị trí nào.',
  PHONE_SILENT_TELEMATICS_RECENT: 'Điện thoại im lặng; thiết bị hành trình trên xe vẫn báo.',
  NO_RECENT_OBSERVATION_ANY_SOURCE: 'Không nguồn nào báo vị trí trong khung cho phép.',
};

export const familyLabel = (family: string): string => FAMILY_LABEL[family] ?? family;

export interface SourceRow {
  readonly key: string;
  readonly label: string;
  readonly statusLabel: string;
  readonly tone: HealthTone;
  readonly age: string;
}

export interface LocationLine {
  readonly kind: 'CURRENT' | 'LAST_KNOWN';
  /** "Vị trí hiện tại · Điện thoại" / "Vị trí cuối cùng · 12 phút trước". */
  readonly label: string;
  readonly observedAt: string;
  /** Chi co khi may chu tra toa do (giam doc). Chuoi van ban, khong ve ban do o day. */
  readonly coordinates: string | null;
}

export interface LocationHealthModel {
  readonly statusLabel: string;
  readonly tone: HealthTone;
  readonly reason: string;
  readonly location: LocationLine | null;
  readonly sources: readonly SourceRow[];
  readonly deviceProofNote: string;
}

const sourceRow = (source: SourceFamilyHealth): SourceRow => {
  const known = SOURCE_STATUS[source.status];
  return {
    key: source.family,
    label: familyLabel(source.family),
    statusLabel: known?.label ?? `Trạng thái chưa có nhãn (${source.status})`,
    tone: known?.tone ?? 'neutral',
    age: source.ageSeconds === null ? 'chưa có bản nào' : formatAge(source.ageSeconds),
  };
};

const COORD = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 5,
  maximumFractionDigits: 5,
});

function coordinatesOf(lastKnown: NonNullable<VehicleLocationHealth['lastKnown']>): string | null {
  if (lastKnown.point === null || lastKnown.coordinatesRedacted) return null;
  const base = `${COORD.format(lastKnown.point.latitude)}, ${COORD.format(lastKnown.point.longitude)}`;
  return lastKnown.accuracyMetres === null
    ? base
    : `${base} (±${Math.round(lastKnown.accuracyMetres)} m)`;
}

export function locationLine(
  health: VehicleLocationHealth,
  timeZone?: string,
): LocationLine | null {
  const lastKnown = health.lastKnown;
  if (lastKnown === null) return null;
  const isCurrent =
    lastKnown.usableAsCurrent &&
    health.currentSource !== null &&
    lastKnown.family === health.currentSource;
  return {
    kind: isCurrent ? 'CURRENT' : 'LAST_KNOWN',
    label: isCurrent
      ? `Vị trí hiện tại · ${familyLabel(lastKnown.family)}`
      : `Vị trí cuối cùng · ${formatAge(lastKnown.ageSeconds)}`,
    observedAt: formatClock(lastKnown.observedAt, timeZone),
    coordinates: coordinatesOf(lastKnown),
  };
}

export function toLocationHealth(
  health: VehicleLocationHealth,
  timeZone?: string,
): LocationHealthModel {
  const known = STATUS[health.status];
  return {
    statusLabel: known?.label ?? `Trạng thái chưa có nhãn (${health.status})`,
    tone: known?.tone ?? 'neutral',
    reason: REASON_LABEL[health.reason] ?? health.reason,
    location: locationLine(health, timeZone),
    sources: health.sources.map(sourceRow),
    deviceProofNote: DEVICE_PROOF_NOTE,
  };
}
