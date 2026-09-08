import {
  EMPTY_VALUE,
  formatBusinessDateRange,
  formatCount,
  formatDistance,
} from '../customer-view';
import type {
  CorridorInsightView,
  FleetInsightView,
  VehicleInsight,
  VehicleStatus,
} from '../transport-types';

/**
 * BANG DOI XE + BAO CAO TUYEN — tang doc cua man hinh, HAM THUAN (#278 N6/N7).
 *
 * ===========================================================================
 * BA CAU CONG BO PHAI LEN MAN HINH, KHONG DUOC NAM O CHU THICH.
 *
 * `utilisationFormula`, `grouping`, `emptyAttribution` deu do may chu tra ve, va ca ba deu noi mot
 * dieu: con so ben canh KHONG phai mot su that tuyet doi.
 *
 *   · ty le su dung dem NGAY co chang, khong dem gio chay;
 *   · tuyen gom theo NHAN TU DO, nen "Kho Hai Phong 2" la mot tuyen khac "Kho Hai Phong";
 *   · km rong quy cho chang co hang lien truoc, khong chia deu.
 *
 * Bo ba cau nay di thi bao cao van chay — va van sai theo mot cach khong ai phat hien duoc.
 */

const STATUS_LABEL: Readonly<Record<VehicleStatus, string>> = {
  IDLE: 'Đang rảnh',
  ON_TRIP: 'Đang chạy',
  UNDER_MAINTENANCE: 'Đang sửa chữa',
};

const UTILISATION_NOTE =
  'Tỷ lệ sử dụng = số NGÀY xe có chặng chưa huỷ ÷ số ngày trong khoảng. Đây là tỷ lệ theo ngày, ' +
  'không phải theo giờ chạy — hệ thống chưa ghi giờ chạy của từng chặng.';

const CORRIDOR_GROUPING_NOTE =
  'Tuyến được gom theo NHÃN địa điểm người dùng gõ, vì hệ thống chưa có mã địa điểm. ' +
  '“Kho Hải Phòng” và “kho  hải phòng” về cùng một tuyến; “Kho Hải Phòng 2” thì không.';

const CORRIDOR_EMPTY_NOTE =
  'Km rỗng của một tuyến là chặng rỗng chạy NGAY SAU chặng có hàng, trong cùng vòng chạy — ' +
  'đó là cái giá của chuyến hàng vừa rồi. Chặng rỗng đầu vòng chạy không thuộc tuyến nào.';

const percent = (ratio: number | null): string =>
  ratio === null
    ? EMPTY_VALUE
    : `${(ratio * 100).toLocaleString('vi-VN', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })}%`;

const km = (value: number | null): string => (value === null ? EMPTY_VALUE : formatDistance(value));

export interface FleetVehicleRow {
  readonly key: string;
  /** BIEN SO — dinh danh nghiep vu, thu duoc phep dat len dia chi. */
  readonly plate: string;
  readonly status: string;
  readonly runCount: string;
  readonly activeDays: string;
  readonly utilisation: string;
  readonly loadedKm: string;
  readonly emptyKm: string;
  readonly totalKm: string;
  readonly emptyRatio: string;
  /** `true` khi con chang thieu km — man hinh danh dau dong nay thay vi im lang. */
  readonly incomplete: boolean;
}

export interface FleetChartSeries {
  readonly plates: readonly string[];
  readonly loadedKm: readonly number[];
  readonly emptyKm: readonly number[];
  /** So xe bi BO khoi bieu do vi con chang thieu km. */
  readonly omittedVehicles: number;
}

export interface FleetInsightModel {
  readonly rangeLabel: string;
  readonly utilisationNote: string;
  readonly metrics: readonly {
    readonly key: string;
    readonly label: string;
    readonly value: string;
    readonly hint: string | null;
  }[];
  readonly vehicles: readonly FleetVehicleRow[];
  readonly chart: FleetChartSeries;
  /** Xe co ty le rong cao nhat — cai `#278` N8 goi la "top vehicles with excessive empty km". */
  readonly worstEmptyRatio: readonly FleetVehicleRow[];
}

const toRow = (vehicle: VehicleInsight): FleetVehicleRow => ({
  key: vehicle.vehicleId,
  plate: vehicle.registrationPlate,
  status: STATUS_LABEL[vehicle.status],
  runCount: formatCount(vehicle.runCount),
  activeDays: formatCount(vehicle.activeBusinessDays),
  utilisation: percent(vehicle.utilisation),
  loadedKm: km(vehicle.loadedKm),
  emptyKm: km(vehicle.emptyKm),
  totalKm: km(vehicle.totalKm),
  emptyRatio: percent(vehicle.emptyRatio),
  incomplete: vehicle.legsMissingDistance > 0,
});

export function toFleetInsight(view: FleetInsightView): FleetInsightModel {
  const vehicles = view.vehicles.map(toRow);

  /*
   * Chi ve xe CO DU km. Mot chiec xe con chang thieu km ma hien thanh cot cao 0 doc y het mot chiec
   * xe khong chay — va do dung la chiec xe nguoi ta se di hoi tai sao no ranh ca thang.
   */
  const drawable = view.vehicles.filter(
    (vehicle) => vehicle.loadedKm !== null && vehicle.emptyKm !== null,
  );

  return {
    rangeLabel: formatBusinessDateRange(view.range.from, view.range.to),
    utilisationNote: UTILISATION_NOTE,
    metrics: [
      { key: 'total', label: 'Xe trong đội', value: formatCount(view.presence.total), hint: null },
      { key: 'on-trip', label: 'Đang chạy', value: formatCount(view.presence.onTrip), hint: null },
      { key: 'idle', label: 'Đang rảnh', value: formatCount(view.presence.idle), hint: null },
      {
        key: 'maintenance',
        label: 'Đang sửa chữa',
        value: formatCount(view.presence.underMaintenance),
        hint: null,
      },
      {
        key: 'total-km',
        label: 'Tổng km toàn đội',
        value: km(view.totals.totalKm),
        hint:
          view.totals.legsMissingDistance > 0
            ? `${view.totals.legsMissingDistance} chặng chưa nhập km nên chưa cộng được tổng.`
            : null,
      },
      {
        key: 'empty-ratio',
        label: 'Tỷ lệ rỗng toàn đội',
        value: percent(view.totals.emptyRatio),
        hint: view.totals.emptyRatio === null ? 'Chưa đủ dữ liệu để tính tỷ lệ.' : null,
      },
    ],
    vehicles,
    chart: {
      plates: drawable.map((vehicle) => vehicle.registrationPlate),
      loadedKm: drawable.map((vehicle) => vehicle.loadedKm ?? 0),
      emptyKm: drawable.map((vehicle) => vehicle.emptyKm ?? 0),
      omittedVehicles: view.vehicles.length - drawable.length,
    },
    /*
     * Xep theo ty le rong GIAM DAN, va chi lay xe TINH DUOC ty le. Mot chiec xe chua du du lieu
     * khong duoc dung dau bang "chay rong nhieu nhat" — do la mot cao buoc dua tren cho trong.
     */
    worstEmptyRatio: [...view.vehicles]
      .filter((vehicle) => vehicle.emptyRatio !== null)
      .sort((left, right) => (right.emptyRatio ?? 0) - (left.emptyRatio ?? 0))
      .slice(0, 5)
      .map(toRow),
  };
}

/* ------------------------------------------------------------------ *
 * TUYEN
 * ------------------------------------------------------------------ */

export interface CorridorRow {
  readonly key: string;
  readonly route: string;
  readonly legCount: string;
  readonly orderCount: string;
  readonly loadedKm: string;
  readonly medianKm: string;
  readonly emptyKm: string;
  /** MA vong chay dau tien — duong mo thang sang ban do vong chay do. */
  readonly firstRunCode: string | null;
  readonly incomplete: boolean;
}

export interface CorridorInsightModel {
  readonly rangeLabel: string;
  readonly groupingNote: string;
  readonly emptyAttributionNote: string;
  readonly corridors: readonly CorridorRow[];
}

export function toCorridorInsight(view: CorridorInsightView): CorridorInsightModel {
  return {
    rangeLabel: formatBusinessDateRange(view.range.from, view.range.to),
    groupingNote: CORRIDOR_GROUPING_NOTE,
    emptyAttributionNote: CORRIDOR_EMPTY_NOTE,
    corridors: view.corridors.map((corridor) => ({
      key: corridor.corridorKey,
      route: `${corridor.originLabel} → ${corridor.destinationLabel}`,
      legCount: formatCount(corridor.legCount),
      orderCount: formatCount(corridor.orderCodes.length),
      loadedKm: km(corridor.loadedKm),
      medianKm: km(corridor.medianLoadedKm),
      emptyKm: km(corridor.attributedEmptyKm),
      firstRunCode: corridor.runCodes[0] ?? null,
      incomplete: corridor.legsMissingDistance > 0,
    })),
  };
}
