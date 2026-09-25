import { DASH, formatBusinessDate, formatClock, formatVnd } from '../../format';
import type { Tone } from '../../ui/Surface';
import {
  FUEL_PAYMENT_METHOD_LABEL,
  FUEL_RECONCILIATION_LABEL,
  FUEL_RECONCILIATION_TONE,
  FUEL_VERIFICATION_LABEL,
  FUEL_VERIFICATION_TONE,
  fuelReviewReasonLabel,
} from './labels';
import type { DriverFuelSlipView, FuelReconciliationStatus } from './types';

/**
 * DONG PHIEU DO DAU cua chinh lai xe — port `toDriverFuelSlipRows` cua web (`workspace/driver.ts`).
 *
 * `litersUnits` la MILILIT: chia 1000 truoc khi hien — hien thang la sai gap nghin lan. Hai cong
 * chung tu (go ra / dinh them) giu DUNG hinh dang luat may chu, chi de NOI vi sao; may chu van la
 * noi quyet.
 */
const scaled = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 });
const plain = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });

export function formatLitersUnits(units: number | null | undefined): string {
  if (typeof units !== 'number' || !Number.isFinite(units)) return DASH;
  return `${scaled.format(units / 1000)} lít`;
}

export function formatConsumptionUnits(units: number | null | undefined): string {
  if (typeof units !== 'number' || !Number.isFinite(units)) return DASH;
  return `${scaled.format(units / 1000)} L/100km`;
}

export function formatOdometer(km: number | null | undefined): string {
  if (typeof km !== 'number' || !Number.isFinite(km)) return DASH;
  return `${plain.format(km)} km`;
}

export interface FuelSlipRow {
  readonly id: string;
  readonly headline: string;
  readonly businessDateLabel: string;
  readonly occurredAtLabel: string;
  readonly odometerLabel: string;
  readonly consumptionLabel: string;
  readonly contextLabel: string;
  readonly stationLabel: string | null;
  readonly paymentLabel: string;
  readonly invoiceNo: string | null;
  readonly verificationLabel: string;
  readonly verificationTone: Tone;
  readonly reconciliationLabel: string;
  readonly reconciliationTone: Tone;
  readonly reviewReasonLabels: readonly string[];
  readonly evidenceCountLabel: string;
  readonly canResubmit: boolean;
  readonly rejectedNote: string | null;
  readonly evidenceLockedReason: string | null;
  readonly evidenceAttachLockedReason: string | null;
}

const REMOVE_LOCKED: readonly FuelReconciliationStatus[] = ['MATCHED', 'SETTLED'];

export function evidenceLockedReason(slip: DriverFuelSlipView): string | null {
  if (slip.verificationStatus === 'VERIFIED') {
    return 'Phiếu đã được kế toán xác thực: chứng từ không gỡ được nữa, nhưng vẫn đính thêm được.';
  }
  if (REMOVE_LOCKED.includes(slip.reconciliationStatus)) {
    return 'Phiếu đã vào kỳ đối soát bảng kê nên chứng từ không gỡ được nữa.';
  }
  return null;
}

export function evidenceAttachLockedReason(slip: DriverFuelSlipView): string | null {
  return slip.reconciliationStatus === 'SETTLED'
    ? 'Kỳ đối soát của phiếu đã chốt nên không đính thêm chứng từ được nữa.'
    : null;
}

function contextLabel(slip: DriverFuelSlipView): string {
  const vehicle = `Xe ${slip.vehiclePlate ?? DASH}`;
  if (slip.runCode !== null) {
    const leg = slip.legSequence === null ? '' : ` · chặng ${slip.legSequence}`;
    return `${vehicle} · Vòng xe ${slip.runCode}${leg}`;
  }
  if (slip.tripCode !== null) return `${vehicle} · Chuyến cũ ${slip.tripCode}`;
  return vehicle;
}

export function toFuelSlipRow(slip: DriverFuelSlipView, timeZone: string): FuelSlipRow {
  return {
    id: slip.id,
    headline: `${formatLitersUnits(slip.litersUnits)} · ${formatVnd(slip.amount)}`,
    businessDateLabel: formatBusinessDate(slip.businessDate),
    occurredAtLabel: formatClock(slip.occurredAt, timeZone),
    odometerLabel: formatOdometer(slip.odometerKm),
    consumptionLabel: formatConsumptionUnits(slip.consumptionUnits),
    contextLabel: contextLabel(slip),
    stationLabel: slip.stationId === null ? null : (slip.stationName ?? 'Trạm đã khai'),
    paymentLabel: FUEL_PAYMENT_METHOD_LABEL[slip.paymentMethod] ?? slip.paymentMethod,
    invoiceNo: slip.invoiceNo,
    verificationLabel: FUEL_VERIFICATION_LABEL[slip.verificationStatus] ?? slip.verificationStatus,
    verificationTone: FUEL_VERIFICATION_TONE[slip.verificationStatus] ?? 'neutral',
    reconciliationLabel:
      FUEL_RECONCILIATION_LABEL[slip.reconciliationStatus] ?? slip.reconciliationStatus,
    reconciliationTone: FUEL_RECONCILIATION_TONE[slip.reconciliationStatus] ?? 'neutral',
    reviewReasonLabels: slip.reviewReasons.map(fuelReviewReasonLabel),
    evidenceCountLabel:
      slip.evidenceCount === 0 ? 'Chưa có ảnh chứng từ' : `${plain.format(slip.evidenceCount)} ảnh`,
    canResubmit: slip.verificationStatus === 'REJECTED',
    rejectedNote:
      slip.verificationStatus === 'REJECTED'
        ? (slip.reviewNote ?? 'Phiếu bị từ chối. Sửa lại theo ghi chú rồi nộp lại.')
        : null,
    evidenceLockedReason: evidenceLockedReason(slip),
    evidenceAttachLockedReason: evidenceAttachLockedReason(slip),
  };
}

export function toFuelSlipRows(
  slips: readonly DriverFuelSlipView[],
  timeZone: string,
): readonly FuelSlipRow[] {
  return slips.map((slip) => toFuelSlipRow(slip, timeZone));
}
