import {
  EMPTY_VALUE,
  formatBusinessDateRange,
  formatCount,
  formatDistance,
} from '../customer-view';
import type { StakeholderActivityView, StakeholderVehicleActivity } from '../transport-types';

/**
 * HOAT DONG CUA XE MINH CO CO PHAN — tang doc, HAM THUAN (`#278` N9).
 *
 * ===========================================================================
 * HAI DAU GACH KHONG GIONG NHAU, VA MAN HINH PHAI NOI RA DIEU DO.
 *
 * O `—` cua cot "Ngay nghi" co the la mot trong hai chuyen hoan toan khac nhau:
 *
 *   · khach CHUA BAT phan bao duong — khong he co du lieu de doc; hoac
 *   · khach DA BAT, nhung chiec xe nay khong doc duoc ban ghi nao.
 *
 * Gop hai cai lam mot se day mot nguoi di bat mot tinh nang dang chay. Nen `maintenanceNote` tra
 * loi cau do MOT LAN cho ca bang, va no chi khac `null` khi may chu cong bo nguon vang mat.
 *
 * ===========================================================================
 * VA KHONG CO DONG TONG.
 *
 * Mot nguoi co the giu 30% chiec nay va 100% chiec kia. Cong km hai chiec lai se ra mot con so
 * khong thuoc ve ai — xem chu thich `StakeholderActivityView` ben may chu.
 */

const MAINTENANCE_OFF_NOTE =
  'Số ngày nghỉ chưa hiện được vì phần Bảo dưỡng chưa được bật cho công ty. Đây KHÔNG phải là ' +
  '“xe chạy đủ tháng” — hệ thống chưa có nguồn để đọc.';

const percent = (ratio: number | null): string =>
  ratio === null
    ? EMPTY_VALUE
    : `${(ratio * 100).toLocaleString('vi-VN', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })}%`;

export interface StakeholderActivityRow {
  readonly key: string;
  readonly plate: string;
  readonly runCount: string;
  readonly activeDays: string;
  readonly utilisation: string;
  readonly loadedKm: string;
  readonly emptyKm: string;
  readonly totalKm: string;
  readonly emptyRatio: string;
  /** Cau giai thich vi sao cac o km la dau gach, hoac `null` khi du lieu day du. */
  readonly missingNote: string | null;
  readonly downtimeDays: string;
  readonly openWorkOrders: string;
}

/**
 * SO LIEU THO cho bieu do — KHONG phai chuoi da dinh dang.
 *
 * `omittedVehicles` la so xe BI BO RA vi con chang chua nhap km. Ve chung thanh cot cao `0` se lam
 * mot chiec xe thieu so lieu doc y het mot chiec xe nam bai ca thang — nen chung bi bo khoi bieu
 * do, va con so bi bo duoc in thanh chu ben canh.
 */
export interface StakeholderActivityChart {
  readonly plates: readonly string[];
  readonly loadedKm: readonly number[];
  readonly emptyKm: readonly number[];
  readonly omittedVehicles: number;
}

export interface StakeholderActivityModel {
  readonly rangeLabel: string;
  readonly utilisationNote: string;
  /** `null` khi khach DA bat bao duong — xem chu thich dau tep. */
  readonly maintenanceNote: string | null;
  readonly rows: readonly StakeholderActivityRow[];
  readonly chart: StakeholderActivityChart;
}

const rowOf = (vehicle: StakeholderVehicleActivity): StakeholderActivityRow => ({
  key: vehicle.vehicleId,
  plate: vehicle.registrationPlate,
  runCount: formatCount(vehicle.runCount),
  activeDays: formatCount(vehicle.activeBusinessDays),
  utilisation: percent(vehicle.utilisation),
  loadedKm: vehicle.loadedKm === null ? EMPTY_VALUE : formatDistance(vehicle.loadedKm),
  emptyKm: vehicle.emptyKm === null ? EMPTY_VALUE : formatDistance(vehicle.emptyKm),
  totalKm: vehicle.totalKm === null ? EMPTY_VALUE : formatDistance(vehicle.totalKm),
  emptyRatio: percent(vehicle.emptyRatio),
  /*
   * Cau nay chi xuat hien khi THAT SU con chang thieu km. Mot dau gach khong tu giai thich duoc, va
   * nguoi doc se tuong xe khong chay — thay vi hieu rang so lieu chua ghi xong.
   */
  missingNote:
    vehicle.legsMissingDistance === 0
      ? null
      : `${formatCount(vehicle.legsMissingDistance)} chặng chưa ghi số km, nên các ô km để trống.`,
  downtimeDays:
    vehicle.downtime === null ? EMPTY_VALUE : formatCount(vehicle.downtime.workOrderDays),
  openWorkOrders:
    vehicle.downtime === null ? EMPTY_VALUE : formatCount(vehicle.downtime.openWorkOrderCount),
});

export function toStakeholderActivity(view: StakeholderActivityView): StakeholderActivityModel {
  return {
    rangeLabel: formatBusinessDateRange(view.range.from, view.range.to),
    /*
     * Cong thuc do MAY CHU tra ve, khong phai mot cau viet cung o day. Neu mot ngay tu so hay mau
     * so doi, cau tren man hinh doi theo — khong ai phai nho di sua hai cho.
     */
    utilisationNote: `Tỷ lệ sử dụng = ${view.utilisationFormula} (đếm theo NGÀY có chặng, không theo giờ chạy).`,
    maintenanceNote: view.unavailableSources.includes('MAINTENANCE_CAPABILITY_OFF')
      ? MAINTENANCE_OFF_NOTE
      : null,
    rows: view.vehicles.map(rowOf),
    chart: chartOf(view.vehicles),
  };
}

const chartOf = (vehicles: readonly StakeholderVehicleActivity[]): StakeholderActivityChart => {
  const drawable = vehicles.filter(
    (vehicle) => vehicle.loadedKm !== null && vehicle.emptyKm !== null,
  );

  return {
    plates: drawable.map((vehicle) => vehicle.registrationPlate),
    loadedKm: drawable.map((vehicle) => vehicle.loadedKm ?? 0),
    emptyKm: drawable.map((vehicle) => vehicle.emptyKm ?? 0),
    omittedVehicles: vehicles.length - drawable.length,
  };
};
