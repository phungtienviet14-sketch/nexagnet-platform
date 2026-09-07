import { businessDateDifferenceInDays, type BusinessDate } from '../business-date.js';
import type { EffectiveVehicleState, MaintenanceWorkOrder } from './asset-compliance.types.js';

/**
 * XE NGHI BAO LAU, VA CO GI DANG BAO VE VIEC DIEU NO — ham THUAN (`TX-06b`, Issue #237).
 *
 * ===========================================================================
 * TEP NAY KHONG CHAN GI, VA DO LA CA DIEM.
 *
 * `Q-05` — *"cai gi THAT SU cam dieu mot xe di, va cai gi chi canh bao"* — chua co cau tra loi tu
 * B. #237 noi thang: *"Until an authoritative B rule exists for what strictly blocks dispatch, do
 * not invent a hard block"*.
 *
 * Nen `evaluateDispatchReadiness()` tra ve HAI danh sach, va danh sach `blocking` LUON RONG hom
 * nay. Hinh dang do ton tai de khi B tra loi `Q-05` thi thay doi la mot phep chuyen mot ma tu
 * `warnings` sang `blocking` — chu khong phai mot lan dung them mot cong o giua duong dieu do.
 *
 * Va `vehicle-availability.spec.ts` KHOA dieu do lai: co mot bai khang dinh `blocking` rong voi mot
 * xe dang co ca lenh sua mo lan chuyen dang chay. Neu ai do them mot ma vao do ma khong co nguon,
 * bai test do se do — dung nhu no duoc viet ra de lam.
 */

/**
 * MOT KHOANG XE KHONG DUNG DUOC — suy tu lenh sua, khong tu mot bang lich su rieng.
 *
 * `TransportMaintenanceWorkOrder` DA la lich su do: mot lenh `OPEN` la xe dang nghi, mot lenh
 * `COMPLETED` la mot khoang da dong, va `CANCELLED` la mot lenh mo nham nen khong tinh. Dung mot
 * bang `VehicleAvailability` song song se tao mot su that THU HAI ve cung mot su kien — va ke tu
 * lan lech dau tien khong ai biet ben nao dung. Cung ly le voi `SettlementCredit` o `TX-07b`.
 */
export interface VehicleDowntimeSpan {
  readonly workOrderId: string;
  readonly kind: MaintenanceWorkOrder['kind'];
  readonly fromDate: BusinessDate;
  /** `null` = con dang mo, tuc khoang chua dong. */
  readonly toDate: BusinessDate | null;
  /** So ngay, hai dau DEU TINH. Voi khoang dang mo thi dem toi `today`. */
  readonly days: number;
  readonly isOpen: boolean;
}

export interface VehicleDowntime {
  readonly vehicleId: string;
  readonly spans: readonly VehicleDowntimeSpan[];
  /** Tong so ngay cua moi khoang. CO THE CHONG LAP neu hai lenh cung mo — xem chu thich. */
  readonly totalDays: number;
  readonly openSpanCount: number;
}

/**
 * GOP CAC KHOANG NGHI cua mot xe.
 *
 * ---------------------------------------------------------------------------
 * `totalDays` CONG THANG, KHONG hop nhat khoang chong lap. Do la mot lua chon, va no phai duoc noi
 * ra: hai lenh sua cung mo tren mot xe la mot tinh huong THAT (thay dau + sua dieu hoa cung luc),
 * va gop chung lai se giau mat viec xe da vao xuong hai viec. Con so nay tra loi *"tong so
 * ngay-lenh"*, khong phai *"so ngay xe vang mat"*.
 *
 * Khi mot bao cao can con so thu hai, no phai la mot ham RIENG co ten khac — khong phai mot co
 * `mergeOverlaps` tren ham nay, vi mot co nhu the se lam hai nguoi doc cung mot bang ra hai so.
 *
 * `today` do NGUOI GOI dua vao (`INV-25`): tep nay khong doc dong ho, nen hai mui gio khong cho ra
 * hai ket qua.
 */
export function foldVehicleDowntime(
  vehicleId: string,
  workOrders: readonly MaintenanceWorkOrder[],
  today: BusinessDate,
): VehicleDowntime {
  const spans: VehicleDowntimeSpan[] = [];

  for (const order of workOrders) {
    if (order.status === 'CANCELLED') continue;

    const toDate = order.status === 'COMPLETED' ? order.completedDate : null;
    const until = toDate ?? today;
    // Hai dau DEU TINH: mot lenh mo va dong trong cung mot ngay la MOT ngay xe nghi, khong phai 0.
    const days = businessDateDifferenceInDays(order.openedDate, until) + 1;

    spans.push({
      workOrderId: order.id,
      kind: order.kind,
      fromDate: order.openedDate,
      toDate,
      days: Math.max(days, 0),
      isOpen: order.status === 'OPEN',
    });
  }

  spans.sort((left, right) => left.fromDate.localeCompare(right.fromDate));

  return {
    vehicleId,
    spans,
    totalDays: spans.reduce((total, span) => total + span.days, 0),
    openSpanCount: spans.filter((span) => span.isOpen).length,
  };
}

/**
 * MA CANH BAO khi nhin mot xe truoc luc dieu chuyen.
 *
 * Moi ma la mot DANH TU chi trang thai, khong phai mot cau khuyen. Va khong ma nao trong so nay
 * chan gi — xem chu thich dau tep.
 */
export const DISPATCH_READINESS_WARNINGS = [
  /** Xe dang co it nhat mot lenh sua mo. CANH BAO, khong phai khoa. */
  'VEHICLE_HAS_OPEN_WORK_ORDER',
  /** Xe vua dang sua vua dang chay mot chuyen — mau thuan van hanh can nguoi xu ly. */
  'VEHICLE_MAINTENANCE_WHILE_IN_TRANSIT',
  /** Cot `TransportVehicle.status` da troi khoi trang thai hieu luc. Viec cua nguoi dong bo du lieu. */
  'VEHICLE_RECORDED_STATUS_STALE',
] as const;
export type DispatchReadinessWarning = (typeof DISPATCH_READINESS_WARNINGS)[number];

/**
 * KET QUA doc "co gi dang bao ve viec dieu xe nay khong".
 *
 * `blocking` la mot mang co kieu chu khong phai mot `boolean`, va do la co y: khi `Q-05` tra loi,
 * cai thay doi la NOI DUNG cua mang — moi cho goi doc no da viet dung roi.
 */
export interface DispatchReadiness {
  readonly vehicleId: string;
  readonly effectiveStatus: EffectiveVehicleState['effectiveStatus'];
  readonly warnings: readonly DispatchReadinessWarning[];
  /**
   * LUON RONG hom nay. `Q-05` chua tra loi, va #237 cam bia mot cong chan.
   *
   * Kieu la `readonly DispatchReadinessWarning[]` chu khong `never[]`: mot ma se chuyen sang day
   * khi co nguon, va luc do khong tep goi nao phai doi kieu.
   */
  readonly blocking: readonly DispatchReadinessWarning[];
}

export function evaluateDispatchReadiness(state: EffectiveVehicleState): DispatchReadiness {
  const warnings: DispatchReadinessWarning[] = [];

  if (state.openWorkOrderIds.length > 0) warnings.push('VEHICLE_HAS_OPEN_WORK_ORDER');
  if (state.inconsistencies.includes('MAINTENANCE_WHILE_IN_TRANSIT')) {
    warnings.push('VEHICLE_MAINTENANCE_WHILE_IN_TRANSIT');
  }
  if (state.inconsistencies.includes('RECORDED_STATUS_STALE')) {
    warnings.push('VEHICLE_RECORDED_STATUS_STALE');
  }

  return {
    vehicleId: state.vehicleId,
    effectiveStatus: state.effectiveStatus,
    warnings,
    // `Q-05` chua tra loi. Xem chu thich dau tep — day khong phai mot cho de quen dien.
    blocking: [],
  };
}
