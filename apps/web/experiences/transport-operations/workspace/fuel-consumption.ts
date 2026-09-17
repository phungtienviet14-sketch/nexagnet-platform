import {
  FUEL_CONSUMPTION_INSIGHT_LABEL,
  FUEL_CONSUMPTION_LINK_STATE_LABEL,
  FUEL_VERIFICATION_LABEL,
  formatBusinessDate,
  formatBusinessDateRange,
  formatConsumption,
  formatCount,
  formatDistance,
  formatLiters,
  formatOdometer,
  fuelConsumptionLinkTone,
  fuelVerificationTone,
  type StatusTone,
} from '../customer-view';
import type { FuelConsumptionLink, FuelVehicleConsumption } from '../fuel-review-types';
import type { BusinessDate } from '../transport-types';

/**
 * MO HINH DRILL-DOWN TIEU HAO theo xe/ky — `#313`.
 *
 * TRINH BAY chuoi ma may chu da tinh (`fuel-consumption-drilldown.ts`), khong tinh lai mot con so
 * nao: mot phep chia thu hai o trinh duyet la mot su that thu hai, va no se lech voi bao cao dung
 * vao ngay ai do sua quy tac moc km.
 */

export const CONSUMPTION_INSIGHT_NOTICE =
  'Cảnh báo tiêu hao chỉ để soát xét: hệ thống không tạo khoản nợ, không trừ quỹ và không khấu trừ lương của lái xe từ những con số này.';

/** Cung tran voi may chu (`FUEL_CONSUMPTION_MAX_SPAN_DAYS`). Chan truoc de khong ban mot 400. */
export const MAX_CONSUMPTION_SPAN_DAYS = 92;

export interface ConsumptionRow {
  readonly id: string;
  readonly dateLabel: string;
  readonly verificationLabel: string;
  readonly verificationTone: StatusTone;
  readonly previousOdometerLabel: string;
  readonly odometerLabel: string;
  readonly distanceLabel: string;
  readonly litersLabel: string;
  readonly consumptionLabel: string;
  readonly stateLabel: string;
  readonly stateTone: StatusTone;
  readonly insightLabels: readonly string[];
  /** Con so may chu CHUP luc khai, khi no khac chuoi hien tai. */
  readonly recordedNote: string | null;
  readonly isComputed: boolean;
  readonly isFocused: boolean;
}

export interface ConsumptionCard {
  readonly label: string;
  readonly value: string;
  readonly hint: string | null;
}

export interface ConsumptionDrilldownModel {
  readonly title: string;
  readonly periodLabel: string;
  readonly normLabel: string;
  readonly leadInLabel: string;
  readonly notice: string;
  readonly cards: readonly ConsumptionCard[];
  readonly rows: readonly ConsumptionRow[];
  readonly unverifiedNote: string | null;
  readonly truncatedNote: string | null;
  readonly emptyNote: string | null;
}

const toRow = (link: FuelConsumptionLink, focusedEntryId: string | null): ConsumptionRow => ({
  id: link.entryId,
  dateLabel: formatBusinessDate(link.businessDate),
  verificationLabel: FUEL_VERIFICATION_LABEL[link.verificationStatus],
  verificationTone: fuelVerificationTone(link.verificationStatus),
  previousOdometerLabel: formatOdometer(link.previousOdometerKm),
  odometerLabel: formatOdometer(link.odometerKm),
  distanceLabel: formatDistance(link.distanceKm),
  litersLabel: formatLiters(link.litersUnits),
  consumptionLabel: formatConsumption(link.consumptionUnits),
  stateLabel: FUEL_CONSUMPTION_LINK_STATE_LABEL[link.state],
  stateTone: fuelConsumptionLinkTone(link.state),
  insightLabels: link.insights.map((insight) => FUEL_CONSUMPTION_INSIGHT_LABEL[insight]),
  recordedNote: link.insights.includes('RECORDED_SNAPSHOT_DIFFERS')
    ? `Lúc khai ghi: mốc ${formatOdometer(link.recorded.previousOdometerKm)}, tiêu hao ${formatConsumption(link.recorded.consumptionUnits)}.`
    : null,
  isComputed: link.state === 'COMPUTED',
  isFocused: focusedEntryId !== null && focusedEntryId === link.entryId,
});

const cardsOf = (view: FuelVehicleConsumption): ConsumptionCard[] => {
  const { summary } = view;
  const inChain = summary.entryCount - summary.excludedCount;
  return [
    {
      label: 'Tiêu hao bình quân kỳ',
      value: formatConsumption(summary.consumptionUnits),
      hint: `Tính trên ${formatCount(summary.computedCount)}/${formatCount(inChain)} lần đổ có mốc km hợp lệ`,
    },
    { label: 'Quãng đường đã tính', value: formatDistance(summary.totalDistanceKm), hint: null },
    { label: 'Số lít đã tính', value: formatLiters(summary.totalLitersUnits), hint: null },
    {
      label: 'Cần soát (không tính)',
      value: formatCount(summary.reviewCount),
      hint:
        summary.excludedCount > 0
          ? `${formatCount(summary.excludedCount)} phiếu bị từ chối nằm ngoài chuỗi`
          : null,
    },
    { label: 'Vượt định mức', value: formatCount(summary.aboveNormCount), hint: 'Chỉ để soát xét' },
  ];
};

export const toConsumptionDrilldownModel = (
  view: FuelVehicleConsumption,
  focusedEntryId: string | null,
): ConsumptionDrilldownModel => ({
  title: `Xe ${view.vehicle.registrationPlate}`,
  periodLabel: formatBusinessDateRange(view.period.from, view.period.to),
  normLabel:
    view.norm.normL100km === null
      ? 'Hạng xe này chưa khai định mức — không có cảnh báo vượt định mức.'
      : `Định mức ${formatCount(view.norm.normL100km)} L/100km, dung sai ${formatCount(view.norm.tolerancePercent)}%.`,
  leadInLabel:
    view.leadIn === null
      ? 'Không có phiếu nào trước kỳ — phiếu đầu kỳ chưa có mốc km.'
      : `Mốc km trước kỳ: ${formatOdometer(view.leadIn.odometerKm)} (${formatBusinessDate(view.leadIn.businessDate)}).`,
  notice: CONSUMPTION_INSIGHT_NOTICE,
  cards: cardsOf(view),
  rows: view.links.map((link) => toRow(link, focusedEntryId)),
  unverifiedNote:
    view.summary.unverifiedCount > 0
      ? `${formatCount(view.summary.unverifiedCount)} phiếu trong chuỗi chưa được xác thực.`
      : null,
  truncatedNote: view.isTruncated
    ? 'Kỳ này có quá nhiều phiếu nên chỉ hiện một phần. Hãy chọn khoảng ngày ngắn hơn.'
    : null,
  emptyNote: view.links.length === 0 ? 'Xe này không có phiếu đổ nào trong kỳ.' : null,
});

const BUSINESS_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Thang chua mot ngay nghiep vu — ky mac dinh cua drill-down. */
export const monthRangeOf = (date: BusinessDate): { from: BusinessDate; to: BusinessDate } => {
  const parts = BUSINESS_DATE.exec(date);
  if (parts === null) return { from: date, to: date };
  const [, year, month] = parts;
  const lastDay = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  return {
    from: `${year}-${month}-01`,
    to: `${year}-${month}-${String(lastDay).padStart(2, '0')}`,
  };
};

/** Cau loi cho mot khoang ngay, hoac `null` khi hop le. Cung luat voi may chu. */
export const consumptionPeriodProblem = (range: {
  readonly from: string;
  readonly to: string;
}): string | null => {
  if (!BUSINESS_DATE.test(range.from) || !BUSINESS_DATE.test(range.to)) {
    return 'Chọn đủ ngày bắt đầu và ngày kết thúc.';
  }
  if (range.from > range.to) return 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.';
  const days =
    Math.round(
      (Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) / 86_400_000,
    ) + 1;
  return days > MAX_CONSUMPTION_SPAN_DAYS
    ? `Chọn tối đa ${MAX_CONSUMPTION_SPAN_DAYS} ngày một lần.`
    : null;
};
