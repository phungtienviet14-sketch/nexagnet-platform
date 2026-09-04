import type { VehicleStatus } from '../transport.types.js';
import type {
  EffectiveVehicleState,
  EffectiveVehicleStateReason,
  MaintenanceWorkOrder,
  VehicleStateInconsistency,
} from './asset-compliance.types.js';

/**
 * PHEP HOP THANH TRANG THAI XE — T1 §7.2 va §18.2.
 *
 * §7.2 da noi ro `ON_TRIP` la DAN XUAT tu chuyen dang chay, khong phai mot co chinh tay. Cai con
 * thieu sau T2.1 hep hon nhieu: chua co PHEP HOP THANH nao, nen cot `TransportVehicle.status` van
 * sua duoc doc lap voi vong doi chuyen — ton tai duoc "xe IDLE trong khi chuyen da phan cong cho
 * no dang IN_TRANSIT". §18.2 ghi lai `DEMO_ASSUMPTION` cho lan hien thuc nay, va day la no:
 *
 *   bao duong dang mo                                    => UNDER_MAINTENANCE
 *   nguoc lai, co chuyen IN_TRANSIT dang duoc phan cong   => ON_TRIP
 *   nguoc lai                                             => IDLE
 *
 * BAO DUONG DUNG TRUOC CHUYEN, va §18.2 ghi ro ly do: mot xe dang sua ma bi chuyen keo ve
 * `ON_TRIP` sai NANG HON han cai troi dang co. Mot bang dieu khien noi "xe san sang" ve mot xe
 * dang nam trong xuong se dieu mot chuyen len no.
 *
 * NHUNG "bao duong thang" KHONG co nghia la mau thuan bi nuot. Khi ca hai cung dung, day la mot
 * TINH HUONG VAN HANH SAI can co nguoi xu ly, va no duoc phat ra thanh `MAINTENANCE_WHILE_IN_TRANSIT`
 * — acceptance 9 cua Issue #88 doi dung dieu do: "do not silently pretend both are fine".
 *
 * THUAN TUY: khong doc DB, khong doc dong ho, khong GPS (`GD-17`).
 */

export interface VehicleStateInput {
  readonly vehicleId: string;
  readonly registrationPlate: string;
  /** Cot dang luu tren `TransportVehicle`. Duoc doi chieu, KHONG duoc tin. */
  readonly recordedStatus: VehicleStatus;
  /** Lenh sua cua RIENG xe nay. Nguoi goi da loc; ham nay khong loc ho. */
  readonly workOrders: readonly MaintenanceWorkOrder[];
  /** Ma chuyen `IN_TRANSIT` ma xe nay DANG duoc phan cong (ban phan cong con hieu luc). */
  readonly inTransitTripIds: readonly string[];
}

export function resolveEffectiveVehicleState(input: VehicleStateInput): EffectiveVehicleState {
  const openWorkOrderIds = input.workOrders
    .filter((order) => order.status === 'OPEN')
    .map((order) => order.id);

  const underMaintenance = openWorkOrderIds.length > 0;
  const onTrip = input.inTransitTripIds.length > 0;

  const effectiveStatus: VehicleStatus = underMaintenance
    ? 'UNDER_MAINTENANCE'
    : onTrip
      ? 'ON_TRIP'
      : 'IDLE';

  const reason: EffectiveVehicleStateReason = underMaintenance
    ? 'MAINTENANCE_LOCK'
    : onTrip
      ? 'ACTIVE_IN_TRANSIT_TRIP'
      : 'NO_ACTIVE_WORK';

  const inconsistencies: VehicleStateInconsistency[] = [];
  if (underMaintenance && onTrip) inconsistencies.push('MAINTENANCE_WHILE_IN_TRANSIT');
  if (input.recordedStatus !== effectiveStatus) inconsistencies.push('RECORDED_STATUS_STALE');

  return {
    vehicleId: input.vehicleId,
    registrationPlate: input.registrationPlate,
    effectiveStatus,
    reason,
    recordedStatus: input.recordedStatus,
    openWorkOrderIds,
    inTransitTripIds: [...input.inTransitTripIds],
    inconsistencies,
  };
}

/**
 * Chi nhung xe co mau thuan VAN HANH.
 *
 * `RECORDED_STATUS_STALE` CO Y khong duoc coi la mau thuan van hanh: cot dang luu troi khoi trang
 * thai hieu luc la chuyen BINH THUONG trong ban demo nay — chinh vi the phep hop thanh moi ton
 * tai. Dua no vao bang canh bao cua Giam doc se lam bang do day nhung dong khong ai phai lam gi.
 * No van doc duoc tren tung xe, cho ai di dong bo du lieu.
 */
export const operationalConflictsOnly = (
  states: readonly EffectiveVehicleState[],
): readonly EffectiveVehicleState[] =>
  states.filter((state) => state.inconsistencies.includes('MAINTENANCE_WHILE_IN_TRANSIT'));
