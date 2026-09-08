import type { DispatchReadiness } from '../asset-compliance/vehicle-availability.js';
import type { Vehicle } from '../transport.types.js';
import type { DispatchCandidateFilterReason } from './dispatch-decisions.js';
import type {
  DispatchSuitabilityFlag,
  VehicleCurrentState,
  VehicleNextFree,
} from './dispatch.types.js';
import type { TruckProfile } from './routing/routing.types.js';

/**
 * BO LOC UNG VIEN — tat dinh, va co MOT ranh gioi phai giu bang moi gia (`#277 M2`).
 *
 * ===========================================================================
 * LOAI ⟂ GAN CO. HAI VIEC, HAI DAU RA.
 *
 * `exclusions` la nhung xe KHONG duoc de nghi. `flags` la nhung dieu nguoi dieu xe nen biet ve mot
 * xe VAN duoc de nghi. Gop chung se pha mot trong hai huong, va ca hai huong deu tung xay ra
 * trong cac he tuong tu:
 *
 *   · bien mot canh bao thanh mot cong chan -> doi xe teo lai, nguoi dung tim duong vong;
 *   · bien mot cong chan thanh mot canh bao -> mot chiec xe nha ngoai loi vao bang de nghi noi bo.
 *
 * ===========================================================================
 * VI SAO BAO DUONG KHONG PHAI MOT CONG CHAN O DAY.
 *
 * `#237` da tra loi cau nay va Lane M khong duoc tra loi lai: *"Until an authoritative B rule
 * exists for what strictly blocks dispatch, do not invent a hard block."*
 * `evaluateDispatchReadiness()` tra ve hai danh sach va danh sach `blocking` cua no LUON RONG.
 *
 * Nen tep nay doc `readiness.blocking` chu khong doc `readiness.warnings` de loai. `#277 M2` lap
 * lai dung nguyen tac do: *"no hard dispatch block invented from a mere maintenance warning."*
 * Ngay B tra loi `Q-05`, mot ma chuyen tu `warnings` sang `blocking` ben
 * `transport-asset-compliance` va tep nay TU DONG cham hon — khong mot dong nao o day phai doi.
 */

/** YEU CAU CUA DON — do NGUOI DIEU XE khai, khong phai mot cot tren `TransportOrder`. */
export interface DispatchRequirement {
  /**
   * Khoi luong hang, kg. `null` = khong khai.
   *
   * `TransportOrder` chi co `cargoDescription` (mot chuoi tu do). Doan khoi luong tu chuoi do la
   * dung cai `#277 M2` chan: *"vehicle type/payload suitability WHEN Order contains those facts"*.
   * Don khong mang su that do, nen no den tu nguoi bam nut — va khi khong ai khai thi phep loc
   * tai trong khong chay, chu khong chay voi mot con so doan.
   */
  readonly payloadKg: number | null;
  /** Hang xe yeu cau, doi chieu KHIT voi `Vehicle.vehicleClass`. `null` = khong yeu cau. */
  readonly vehicleClass: string | null;
}

export const NO_DISPATCH_REQUIREMENT: DispatchRequirement = {
  payloadKg: null,
  vehicleClass: null,
};

export interface SuitabilityInput {
  readonly vehicle: Vehicle;
  readonly requirement: DispatchRequirement;
  /** `null` khi khach khong bat `transport-asset-compliance` — khac "khong co canh bao nao". */
  readonly readiness: DispatchReadiness | null;
  readonly current: VehicleCurrentState;
  readonly nextFree: VehicleNextFree;
  readonly truckProfile: TruckProfile;
  /** Ban dinh vi hien tai co du moi de lam diem xuat phat khong — xem `gradeFreshness()`. */
  readonly currentUsableAsOrigin: boolean;
}

export interface SuitabilityVerdict {
  readonly exclusions: readonly DispatchCandidateFilterReason[];
  readonly flags: readonly DispatchSuitabilityFlag[];
}

export function assessSuitability(input: SuitabilityInput): SuitabilityVerdict {
  const exclusions: DispatchCandidateFilterReason[] = [];
  const flags: DispatchSuitabilityFlag[] = [];

  /*
   * XE NHA NGOAI KHONG VAO BANG NAY. `#277 M1`: *"external-carrier vehicles must not enter B
   * internal-fleet recommendation unless an accepted business workflow explicitly allows them."*
   * Khong co quy trinh nao nhu the duoc chap thuan, nen day la mot cong DONG.
   */
  if (input.vehicle.operationalControl !== 'INTERNAL_OPERATED') {
    exclusions.push('VEHICLE_NOT_INTERNALLY_OPERATED');
  }

  // Danh sach nay hom nay RONG theo dung #237. Doc no thay vi `warnings` la ca diem — xem dau tep.
  if (input.readiness !== null && input.readiness.blocking.length > 0) {
    exclusions.push('VEHICLE_DISPATCH_BLOCKED_BY_POLICY');
  }

  if (
    input.requirement.vehicleClass !== null &&
    input.vehicle.vehicleClass !== input.requirement.vehicleClass
  ) {
    exclusions.push('VEHICLE_CLASS_NOT_REQUESTED');
  }

  if (input.requirement.payloadKg !== null) {
    if (input.vehicle.allowedPayloadKg === null) {
      /*
       * KHONG BIET TAI TRONG XE thi KHONG LOAI, chi gan co.
       *
       * Loai mot chiec xe vi mot o trong trong so dang ky se lam doi xe teo lai theo do day cua
       * du lieu chu khong theo nang luc that — va no phat cho dung nhung doanh nghiep dang nhap
       * dan (#242 E2 da chon dung lap truong nay cho so huu). Nguoi dieu xe nhin thay co
       * `VEHICLE_PAYLOAD_UNKNOWN` va tu quyet.
       */
      flags.push('VEHICLE_PAYLOAD_UNKNOWN');
    } else if (input.vehicle.allowedPayloadKg < input.requirement.payloadKg) {
      exclusions.push('VEHICLE_PAYLOAD_BELOW_REQUIREMENT');
    }
  }

  /*
   * KHONG CO MOT DIEM XUAT PHAT NAO DUNG DUOC.
   *
   * Hai duong deu phai tat: ban dinh vi qua cu (hoac chua bao gio co), VA phep chieu "se ranh"
   * khong cho ra mot cho nao. Chi mot trong hai tat thi van con mot ung vien that.
   */
  if (!input.currentUsableAsOrigin && input.nextFree.place === null) {
    exclusions.push('VEHICLE_HAS_NO_USABLE_ORIGIN');
  }

  if (input.current.known) {
    if (input.current.location.freshness === 'AGEING') flags.push('CURRENT_LOCATION_AGEING');
    const grade = input.current.location.accuracyGrade;
    if (grade === 'POOR' || grade === 'UNKNOWN') flags.push('CURRENT_LOCATION_ACCURACY_LOW');
  }

  if (input.nextFree.completeness === 'PARTIAL') flags.push('NEXT_FREE_PROJECTION_PARTIAL');
  if (!input.truckProfile.complete) flags.push('TRUCK_PROFILE_INCOMPLETE');

  /*
   * CANH BAO VAN HANH duoc CHUYEN TIEP nguyen ven, khong duoc dich lai.
   *
   * `transport-asset-compliance` da tra loi cau "co gi dang bao ve chiec xe nay khong" va no so
   * huu cau tra loi do. Tinh lai o day se cho ra hai con so cho cung mot cau hoi — dung cai loi
   * ma `ControlTowerAlertFacts` da ghi lai de tranh.
   */
  for (const warning of input.readiness?.warnings ?? []) {
    if (warning === 'VEHICLE_HAS_OPEN_WORK_ORDER') flags.push('VEHICLE_HAS_OPEN_WORK_ORDER');
    if (warning === 'VEHICLE_RECORDED_STATUS_STALE') flags.push('VEHICLE_RECORDED_STATUS_STALE');
    if (warning === 'VEHICLE_MAINTENANCE_WHILE_IN_TRANSIT') {
      flags.push('VEHICLE_MAINTENANCE_WHILE_IN_TRANSIT');
    }
  }

  return { exclusions, flags };
}
