import type { RunLeg, VehicleRun } from '../movement/movement.types.js';
import { buildFleetInsight } from '../insight/insight-metrics.js';
import type { InsightRange } from '../insight/insight.types.js';
import type { Vehicle, VehicleStatus } from '../transport.types.js';

/**
 * HOAT DONG CUA XE MA TOI CO CO PHAN — ham THUAN (`#278` N9).
 *
 * ===========================================================================
 * VI SAO TEP NAY KHONG TRA VE `FleetInsightView`.
 *
 * Cac con so ben duoi CHINH LA nhung con so `buildFleetInsight()` da tinh, va tep nay goi lai dung
 * ham do — hai man hinh doc mot chiec xe phai ra cung mot ty le, neu khong thi mot trong hai sai.
 *
 * Nhung ket qua duoc CHEP TAY sang mot kieu rieng, tung truong mot. Do khong phai su rom ra:
 * `FleetInsightView` la be mat cua Bang doi xe, va no se con LON LEN — mot lan them truong doanh
 * thu hay gia thanh vao do la hop le voi bang do. Neu be mat ben huu quan tra thang kieu ay ra,
 * ngay do mot con so tien se tu roi vao man hinh cua co dong ma khong ai sua mot dong nao o day.
 *
 * `#278` N9 noi ro: *"economics only if current stakeholder authorization explicitly grants it"*, va
 * hom nay khong co mot loi cap quyen nao nhu the. Nen cong o day la mot phep CHEP CO DANH SACH, va
 * `stakeholder-activity.spec.ts` khoa chinh xac tap khoa duoc phep xuat hien.
 *
 * ===========================================================================
 * PHAM VI KHONG PHAI VIEC CUA TEP NAY.
 *
 * `vehicles` truyen vao PHAI da duoc loc theo pham vi cua nguoi dang xem. Tep nay khong biet ai
 * dang doc va khong tu loc duoc — `StakeholderActivityService` lam viec do, va no la duong vao duy
 * nhat. Doi lai, tep nay khong bao gio dem mot chiec xe khong co trong `vehicles`: moi con so tong
 * deu chay tren dung tap do.
 */

export const STAKEHOLDER_ACTIVITY_UNAVAILABLE_REASONS = ['MAINTENANCE_CAPABILITY_OFF'] as const;

export type StakeholderActivityUnavailableReason =
  (typeof STAKEHOLDER_ACTIVITY_UNAVAILABLE_REASONS)[number];

/**
 * SO NGAY NGHI — hinh dang RIENG cua be mat nay, khong phai kieu cua `asset-compliance`.
 *
 * Ly do la doc lap: neu `VehicleDowntime` ben kia them mot truong (chi phi sua chang han), no se
 * khong tu chay sang day. Bo chuyen doi nam trong adapter cua cong, va no cung la mot phep chep co
 * danh sach.
 */
export interface StakeholderDowntime {
  /**
   * TONG NGAY-LENH, khong phai "so ngay xe vang mat".
   *
   * Hai lenh sua cung mo tren mot xe duoc CONG THANG — xem `foldVehicleDowntime()`. Man hinh phai
   * goi dung ten con so nay; goi no la "so ngay xe nghi" se cho ra mot cau sai khi xe vao xuong hai
   * viec cung luc.
   */
  readonly workOrderDays: number;
  readonly openWorkOrderCount: number;
}

/** MOT chiec xe cua nguoi dang xem. KHONG mot truong tien nao — xem chu thich dau tep. */
export interface StakeholderVehicleActivity {
  readonly vehicleId: string;
  readonly registrationPlate: string;
  readonly status: VehicleStatus;
  readonly runCount: number;
  readonly activeBusinessDays: number;
  /** `null` khi khoang rong — khong bao gio `0` thay cho "khong tinh duoc". */
  readonly utilisation: number | null;
  /**
   * Bon o duoi `null` CUNG LUC khi con chang thieu km. Mot phan tram lam tron tu du lieu thieu la
   * mot con so bia.
   */
  readonly loadedKm: number | null;
  readonly emptyKm: number | null;
  readonly totalKm: number | null;
  readonly emptyRatio: number | null;
  readonly legsMissingDistance: number;
  /** `null` khi khach chua bat `transport-asset-compliance` — xem `unavailableSources`. */
  readonly downtime: StakeholderDowntime | null;
}

/**
 * KHONG CO DONG TONG, VA DO LA MOT LUA CHON.
 *
 * `buildFleetInsight()` co `totals` — hop ly voi Bang doi xe, vi ca doi xe thuoc cung mot chu. O
 * day thi khong: mot nguoi co the giu 30% chiec nay va 100% chiec kia, nen "tong km cua xe toi co
 * co phan" cong hai con so khong cung don vi so huu lai voi nhau. Con so ay tra loi mot cau hoi
 * chua ai dat, va no se bi doc nhu mot cai gi do thuoc ve nguoi xem.
 *
 * Khi B dinh nghia mot dai luong theo ty le so huu, do se la mot truong CO TEN RIENG voi mot cong
 * thuc viet ra — khong phai mot phep cong am tham o day.
 */
export interface StakeholderActivityView {
  readonly range: InsightRange;
  readonly utilisationFormula: string;
  readonly vehicles: readonly StakeholderVehicleActivity[];
  /**
   * Nguon VANG MAT, noi thanh loi.
   *
   * Mot o `—` khong tu giai thich duoc no la "chua co du lieu" hay "khach chua bat tinh nang".
   * Danh sach nay tra loi cau do mot lan cho ca bang.
   */
  readonly unavailableSources: readonly StakeholderActivityUnavailableReason[];
}

export interface StakeholderActivityInput {
  readonly range: InsightRange;
  /** DA LOC theo pham vi. Xem chu thich dau tep. */
  readonly vehicles: readonly Vehicle[];
  readonly runs: readonly VehicleRun[];
  readonly legsByRun: ReadonlyMap<string, readonly RunLeg[]>;
  /** `null` = khong co nang luc bao duong, KHAC voi mot `Map` rong (co nang luc, khong co lenh). */
  readonly downtimeByVehicle: ReadonlyMap<string, StakeholderDowntime> | null;
}

export function buildStakeholderActivity(input: StakeholderActivityInput): StakeholderActivityView {
  /*
   * Loc TRUOC khi vao `buildFleetInsight`: ham do tinh `totals` va `presence` tren dung tap
   * `vehicles` nhan duoc, nen mot tap da loc cho ra nhung con so tong CUA RIENG nguoi dang xem.
   * Truyen ca doi xe vao roi loc ket qua sau se lam `totals` mang so cua nguoi khac.
   */
  const scoped = new Set(input.vehicles.map((vehicle) => vehicle.id));
  const insight = buildFleetInsight({
    range: input.range,
    vehicles: input.vehicles,
    runs: input.runs.filter((run) => scoped.has(run.vehicleId)),
    legsByRun: input.legsByRun,
  });

  return {
    range: insight.range,
    utilisationFormula: insight.utilisationFormula,
    vehicles: insight.vehicles.map((vehicle): StakeholderVehicleActivity => ({
      vehicleId: vehicle.vehicleId,
      registrationPlate: vehicle.registrationPlate,
      status: vehicle.status,
      runCount: vehicle.runCount,
      activeBusinessDays: vehicle.activeBusinessDays,
      utilisation: vehicle.utilisation,
      loadedKm: vehicle.loadedKm,
      emptyKm: vehicle.emptyKm,
      totalKm: vehicle.totalKm,
      emptyRatio: vehicle.emptyRatio,
      legsMissingDistance: vehicle.legsMissingDistance,
      downtime: input.downtimeByVehicle?.get(vehicle.vehicleId) ?? null,
    })),
    unavailableSources: input.downtimeByVehicle === null ? ['MAINTENANCE_CAPABILITY_OFF'] : [],
  };
}
