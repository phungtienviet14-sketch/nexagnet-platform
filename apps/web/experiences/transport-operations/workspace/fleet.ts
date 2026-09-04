import {
  DRIVER_STATUS_LABEL,
  VEHICLE_STATUS_LABEL,
  formatBusinessDate,
  formatInstant,
  formatOdometer,
  vehicleStatusTone,
  type StatusTone,
} from '../customer-view';
import type {
  BusinessDate,
  Driver,
  DriverStatus,
  Vehicle,
  VehicleDriverAssignment,
  VehicleStatus,
} from '../transport-types';

/**
 * MO HINH KHUNG NHIN cua man Doi xe & lai xe.
 *
 * RANH GIOI PHAI GIU: `TX-06` (bao duong, giay to, trang thai xe HIEU LUC) CHUA dong. Nen tep nay
 * KHONG duoc suy ra "xe nay khong chay duoc vi giay to het han" — do la ket luan cua T6, va #161
 * §4.D cam dung ra ket luan do truoc khi T6 vao `main`.
 *
 * Cai duoc phep: DOC lai chinh truong `licenceExpiry` da co san tu `TX-01` va so no voi hom nay.
 * Do la doc mot con so, khong phai dung mot may quyet dinh. Cau tren man hinh vi vay noi ve GIAY
 * PHEP het han, chu khong noi ve viec xe co duoc phep chay hay khong.
 */

/* ------------------------------------------------------------------ *
 * Xe
 * ------------------------------------------------------------------ */

export interface VehicleRow {
  readonly id: string;
  /** Bien so la dinh danh nghiep vu — nguoi doc nhan ra, va no khong sua duoc. */
  readonly registrationPlate: string;
  readonly vehicleClass: string;
  readonly status: VehicleStatus;
  readonly statusLabel: string;
  readonly tone: StatusTone;
  readonly odometerLabel: string;
  readonly payloadLabel: string;
}

export const toVehicleRows = (vehicles: readonly Vehicle[]): readonly VehicleRow[] =>
  vehicles.map((vehicle) => ({
    id: vehicle.id,
    registrationPlate: vehicle.registrationPlate,
    vehicleClass: vehicle.vehicleClass,
    status: vehicle.status,
    statusLabel: VEHICLE_STATUS_LABEL[vehicle.status],
    tone: vehicleStatusTone(vehicle.status),
    odometerLabel: formatOdometer(vehicle.currentOdoKm),
    payloadLabel:
      vehicle.allowedPayloadKg === null
        ? '—'
        : `${vehicle.allowedPayloadKg.toLocaleString('vi-VN')} kg`,
  }));

/**
 * `ON_TRIP` la trang thai DAN XUAT tu chuyen dang chay, khong phai co chinh tay duoc (VT-013).
 * Man hinh chi doc lai, va cau nay de nhac rang khong co nut nao dat truc tiep trang thai do.
 */
export const VEHICLE_STATUS_NOTE =
  'Trạng thái "Đang trên chuyến" do chuyến đang chạy quyết định, không đặt tay được.';

/* ------------------------------------------------------------------ *
 * Lai xe
 * ------------------------------------------------------------------ */

/**
 * `licenceExpiry` la `YYYY-MM-DD` theo lich tenant, nen so sanh CHUOI la dung va an toan — dung
 * `Date` o day se lai mo ra chinh cai loi lech mui gio ma cot ngay nghiep vu duoc tao ra de tranh.
 */
export type LicenceStanding = 'valid' | 'expiring' | 'expired';

const DAYS_CONSIDERED_SOON = 30;

/** Cong ngay tren chuoi `YYYY-MM-DD` — qua UTC de KHONG bi mui gio dia phuong keo lech mot ngay. */
const addDays = (today: BusinessDate, days: number): BusinessDate => {
  const value = new Date(`${today}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

export const licenceStanding = (
  licenceExpiry: BusinessDate,
  today: BusinessDate,
): LicenceStanding => {
  if (licenceExpiry < today) return 'expired';
  return licenceExpiry <= addDays(today, DAYS_CONSIDERED_SOON) ? 'expiring' : 'valid';
};

export interface DriverRow {
  readonly id: string;
  readonly fullName: string;
  readonly phone: string;
  readonly licenceClass: string;
  readonly licenceExpiryLabel: string;
  readonly licenceStanding: LicenceStanding;
  /** `null` khi giay phep con han — khong bay canh bao khong can thiet. */
  readonly licenceNote: string | null;
  readonly status: DriverStatus;
  readonly statusLabel: string;
  /**
   * Ho so lai xe co duoc noi voi mot tai khoan dang nhap hay chua. Khong noi thi be mat lai xe cua
   * nguoi do se bao "tai khoan chua duoc noi voi ho so lai xe nao" khi ho mo len.
   */
  readonly hasAuthUser: boolean;
}

export const toDriverRows = (
  drivers: readonly Driver[],
  today: BusinessDate,
): readonly DriverRow[] =>
  drivers.map((driver) => {
    const standing = licenceStanding(driver.licenceExpiry, today);
    return {
      id: driver.id,
      fullName: driver.fullName,
      phone: driver.phone,
      licenceClass: driver.licenceClass,
      licenceExpiryLabel: formatBusinessDate(driver.licenceExpiry),
      licenceStanding: standing,
      licenceNote:
        standing === 'expired'
          ? `Giấy phép đã hết hạn ngày ${formatBusinessDate(driver.licenceExpiry)}.`
          : standing === 'expiring'
            ? `Giấy phép hết hạn ngày ${formatBusinessDate(driver.licenceExpiry)}.`
            : null,
      status: driver.status,
      statusLabel: DRIVER_STATUS_LABEL[driver.status],
      hasAuthUser: driver.authUserId !== null,
    };
  });

/**
 * Cau noi ro pham vi cua canh bao giay phep o tren: no la mot phep so ngay, KHONG phai may danh gia
 * tuan thu cua `TX-06`. Giu cau nay tren man hinh de khong ai doc no thanh nhieu hon nghia that.
 */
export const LICENCE_NOTE_SCOPE =
  'Cảnh báo giấy phép ở đây chỉ so ngày hết hạn trên hồ sơ với hôm nay. Nghiệp vụ bảo dưỡng và ' +
  'giấy tờ đầy đủ thuộc phần chưa được bật.';

/* ------------------------------------------------------------------ *
 * Lich su lai xe phu trach xe
 * ------------------------------------------------------------------ */

export interface VehicleDriverHistoryRow {
  readonly id: string;
  readonly driverLabel: string;
  readonly fromLabel: string;
  readonly toLabel: string;
  readonly isActive: boolean;
}

/**
 * Doi nguoi phu trach DONG dong cu trong cung mot giao dich thay vi ghi de (`GD-06`), nen lich su
 * doc len la mot chuoi lien tuc — va dong `effectiveTo === null` la nguoi dang phu trach.
 */
export const toVehicleDriverHistoryRows = (
  assignments: readonly VehicleDriverAssignment[],
  drivers: readonly Driver[],
): readonly VehicleDriverHistoryRow[] => {
  const index = new Map(drivers.map((driver) => [driver.id, driver.fullName]));
  return assignments.map((row) => ({
    id: row.id,
    driverLabel: index.get(row.driverId) ?? 'Lái xe chưa đọc được tên',
    fromLabel: formatInstant(row.effectiveFrom),
    toLabel: row.effectiveTo === null ? 'đang phụ trách' : formatInstant(row.effectiveTo),
    isActive: row.effectiveTo === null,
  }));
};

/**
 * Khong co duong nao tra ve "lai xe dang phu trach cua MOI xe" — chi co duong theo tung xe.
 * Nen man hinh danh sach khong bay cot do, va cau nay giai thich vi sao thay vi de mot cot trong.
 */
export const NO_FLEET_WIDE_ASSIGNMENT_NOTE =
  'Người phụ trách hiện tại xem được khi mở từng xe: máy chủ chưa có đường đọc phân công của cả đội.';
