import {
  FUEL_RECONCILIATION_STATUS_LABEL,
  FUEL_VERIFICATION_LABEL,
  TRIP_KIND_LABEL,
  TRIP_STATUS_LABEL,
  formatBusinessDate,
  formatConsumption,
  formatCount,
  formatInstant,
  formatLiters,
  formatMoney,
  formatOdometer,
  fuelVerificationTone,
  tripStatusTone,
  type StatusTone,
} from '../customer-view';
import type { DriverFuelSlipView, DriverFundStatement, DriverTripView } from '../transport-types';
import { toFundBalance, type FundBalanceModel } from './driver-fund';

/**
 * MO HINH KHUNG NHIN cua BE MAT LAI XE — `GD-23`, `INV-09`.
 *
 * BAT BIEN CUA CA TEP: khong mot ham nao o day duoc nhan, tinh, hay bay ra mot con so DOANH THU.
 * Dieu do khong duoc giu bang y chi tot: no duoc giu bang KIEU. `DriverTripView` va
 * `DriverFuelSlipView` la hai kieu RIENG o may chu, khong co truong `freightAmount`, nen mot lan
 * them truong doanh thu vao `Trip` sau nay KHONG the ro sang day.
 *
 * `REVENUE_FIELD_NAMES` + `revenueFieldsIn` la luoi thu hai: mot phep thu chay duoc tren chinh
 * payload that, de spec chung minh dieu tren thay vi chi tin vao kieu. #161 §8 doi dung bang chung
 * do — "payload cua lai xe khong chua doanh thu, chu khong phai chi bi CSS che di".
 */
/**
 * `INV-09` cam DOANH THU / GIA CUOC, khong cam moi con so tien.
 *
 * Lai xe VAN phai thay so tien tren phieu dau cua chinh minh — ho tra tien mat va can doi soat lai
 * — nen `amount` va `currencyCode` la truong HOP LE tren `DriverFuelSlipView`. Dua chung vao danh
 * sach nay se lam luoi bao dong keu sai cho, va mot luoi keu sai la mot luoi bi tat.
 */
export const REVENUE_FIELD_NAMES = [
  'freightAmount',
  'revenueAmount',
  'marginAmount',
  'marginBasisPoints',
  'commissionAmount',
  'carrierPayableAmount',
  'directCostAmount',
  'deductionAmount',
] as const;

/**
 * Tra ve nhung khoa "mui tien" tim thay trong mot payload cua be mat lai xe.
 * Rong la dat. Dung trong spec, va dung duoc ca voi du lieu that khi can dieu tra.
 */
export const revenueFieldsIn = (payload: unknown): readonly string[] => {
  if (payload === null || typeof payload !== 'object') return [];
  const rows = Array.isArray(payload) ? payload : [payload];
  const found = new Set<string>();
  for (const row of rows) {
    if (row === null || typeof row !== 'object') continue;
    for (const key of Object.keys(row as Record<string, unknown>)) {
      if ((REVENUE_FIELD_NAMES as readonly string[]).includes(key)) found.add(key);
    }
  }
  return [...found].sort();
};

/* ------------------------------------------------------------------ *
 * Chuyen cua chinh minh
 * ------------------------------------------------------------------ */

export interface DriverTripCard {
  readonly id: string;
  readonly code: string;
  readonly statusLabel: string;
  readonly tone: StatusTone;
  readonly kindLabel: string;
  readonly businessDateLabel: string;
  readonly route: string;
  /** Ten khach hang la thong tin AN TOAN cho lai xe; gia cuoc thi khong. */
  readonly customerLabel: string;
  readonly vehicleLabel: string;
  readonly cargoDescription: string | null;
  readonly distanceLabel: string;
  readonly isCurrentAssignee: boolean;
}

export const toDriverTripCard = (trip: DriverTripView): DriverTripCard => ({
  id: trip.id,
  code: trip.code,
  statusLabel: TRIP_STATUS_LABEL[trip.status],
  tone: tripStatusTone(trip.status),
  kindLabel: TRIP_KIND_LABEL[trip.kind],
  businessDateLabel: formatBusinessDate(trip.businessDate),
  route: `${trip.originLabel} → ${trip.destinationLabel}`,
  customerLabel: trip.customerName ?? 'Không có khách chỉ định',
  vehicleLabel: trip.vehicleRegistrationPlate ?? 'Chưa gán xe',
  cargoDescription: trip.cargoDescription,
  distanceLabel: formatOdometer(trip.distanceKm),
  isCurrentAssignee: trip.isCurrentAssignee,
});

/**
 * Chuyen DANG LAM: chuyen dang chay ma minh la nguoi phu trach hien tai. Neu khong co thi lay
 * chuyen ke tiep da len ke hoach — do la cau tra loi dung cho cau hoi "gio toi lam gi".
 */
export const currentDriverTrip = (trips: readonly DriverTripView[]): DriverTripView | null => {
  const mine = trips.filter((trip) => trip.isCurrentAssignee);
  return (
    mine.find((trip) => trip.status === 'IN_TRANSIT') ??
    mine.find((trip) => trip.status === 'PLANNED') ??
    null
  );
};

/**
 * Lai xe chi dat duoc HAI trang thai (`DRIVER_SETTABLE_STATUSES`), va `RECONCILED` co y nam ngoai
 * tam voi: `GD-01` doi mot lan chuyen tay co quyen. Nen o day khong bao gio co nut "chot doi soat".
 */
export interface DriverTripAction {
  readonly to: 'IN_TRANSIT' | 'DELIVERED';
  readonly label: string;
}

export const driverTripActions = (trip: DriverTripView | null): readonly DriverTripAction[] => {
  if (trip === null || !trip.isCurrentAssignee) return [];
  if (trip.status === 'PLANNED') return [{ to: 'IN_TRANSIT', label: 'Bắt đầu chuyến' }];
  if (trip.status === 'IN_TRANSIT') return [{ to: 'DELIVERED', label: 'Đã giao' }];
  return [];
};

/* ------------------------------------------------------------------ *
 * Phieu dau cua chinh minh
 * ------------------------------------------------------------------ */

export interface DriverFuelSlipRow {
  readonly id: string;
  readonly businessDateLabel: string;
  readonly occurredAtLabel: string;
  readonly litersLabel: string;
  readonly amountLabel: string;
  readonly odometerLabel: string;
  readonly consumptionLabel: string;
  readonly verificationLabel: string;
  readonly tone: StatusTone;
  readonly reconciliationLabel: string;
  readonly reviewNote: string | null;
  readonly evidenceCountLabel: string;
  readonly hasEvidence: boolean;
  /**
   * ANH cua chinh phieu — `id` de dung dia chi doc byte, `contentType` de chon giua the anh va mot
   * lien ket tai ve cho PDF.
   */
  readonly evidence: readonly { readonly id: string; readonly contentType: string | null }[];
  /** Bi tu choi thi NOP LAI duoc qua dung vong doi cu (`#168 B5`). */
  readonly canResubmit: boolean;
  readonly rejectedNote: string | null;
}

export const toDriverFuelSlipRows = (
  slips: readonly DriverFuelSlipView[],
): readonly DriverFuelSlipRow[] =>
  slips.map((slip) => ({
    id: slip.id,
    businessDateLabel: formatBusinessDate(slip.businessDate),
    occurredAtLabel: formatInstant(slip.occurredAt),
    litersLabel: formatLiters(slip.litersUnits),
    amountLabel: formatMoney(slip.amount),
    odometerLabel: formatOdometer(slip.odometerKm),
    consumptionLabel: formatConsumption(slip.consumptionUnits),
    verificationLabel: FUEL_VERIFICATION_LABEL[slip.verificationStatus],
    tone: fuelVerificationTone(slip.verificationStatus),
    reconciliationLabel: FUEL_RECONCILIATION_STATUS_LABEL[slip.reconciliationStatus],
    reviewNote: slip.reviewNote,
    evidenceCountLabel: formatCount(slip.evidenceCount),
    hasEvidence: slip.evidenceCount > 0,
    evidence: slip.evidence,
    canResubmit: slip.verificationStatus === 'REJECTED',
    rejectedNote:
      slip.verificationStatus === 'REJECTED'
        ? (slip.reviewNote ?? 'Phiếu bị từ chối. Sửa lại theo ghi chú rồi nộp lại.')
        : null,
  }));

/** Cau canh o tai anh — noi ro anh di dau, vi day la anh chung tu tien. */
export const EVIDENCE_UPLOAD_HINT =
  'Chụp rõ phiếu, đủ số lít và số tiền. Ảnh gắn vào đúng phiếu này và kế toán xem được khi đối soát.';

/* ------------------------------------------------------------------ *
 * Trang chu
 * ------------------------------------------------------------------ */

export interface DriverHomeModel {
  readonly currentTrip: DriverTripCard | null;
  readonly actions: readonly DriverTripAction[];
  /** `null` khi khach chua bat `transport-costing` — khong bia so 0. */
  readonly fund: FundBalanceModel | null;
  readonly openTripCount: number;
  readonly headline: string;
}

const OPEN_STATUSES = new Set(['PLANNED', 'IN_TRANSIT']);

/**
 * MOT viec troi nhat, MOT den hai lan bam — #161 §3. Nen trang chu tra ve dung mot chuyen dang lam
 * kem thao tac cua chinh no, chu khong tra ve mot danh sach de nguoi ta tu tim.
 */
export const toDriverHome = (input: {
  readonly trips: readonly DriverTripView[];
  readonly fund: DriverFundStatement | null;
}): DriverHomeModel => {
  const current = currentDriverTrip(input.trips);
  const openTripCount = input.trips.filter(
    (trip) => trip.isCurrentAssignee && OPEN_STATUSES.has(trip.status),
  ).length;
  return {
    currentTrip: current === null ? null : toDriverTripCard(current),
    actions: driverTripActions(current),
    fund: input.fund === null ? null : toFundBalance(input.fund),
    openTripCount,
    headline:
      current === null
        ? 'Hiện chưa có chuyến nào được phân công cho bạn.'
        : `${TRIP_STATUS_LABEL[current.status]} · ${current.originLabel} → ${current.destinationLabel}`,
  };
};
