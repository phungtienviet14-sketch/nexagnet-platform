import { summariseRunDistance } from '../movement/run-distance.js';
import type { RunAssignment, RunLeg, VehicleRun } from '../movement/movement.types.js';
import type { Driver, Vehicle } from '../transport.types.js';
import {
  CHECKPOINT_DERIVED_COLUMNS,
  OPERATIONS_BOARD_COLUMNS,
  type ActionQueueItem,
  type ActionQueueSeverity,
  type FleetPresenceView,
  type OperationsBoardCard,
  type OperationsBoardColumn,
  type OperationsBoardColumnView,
} from './control-tower.types.js';

/**
 * PHEP CHIEU cua thap dieu hanh — HAM THUAN, khong Nest, khong Prisma, khong dong ho.
 *
 * Cung ly le voi `run-distance.ts` va `trip-lifecycle.ts`: neu service tu gop so thi phep dem chi
 * con la mot loi khuyen trong tai lieu, va mot cot dem sai se chi lo ra khi co nguoi ngoi cong tay
 * lai. O day moi phep dem doc duoc ma khong can biet du lieu tu dau ve.
 *
 * BA RANG BUOC ma tep nay giu:
 *
 *   1. KHONG BIA. Thieu km o mot chang thi `totalKm` la `null`, khong phai 0 — day dung la luat ma
 *      `summariseRunDistance` da dat, va o day chi doc lai ket luan cua no thay vi cong lai.
 *   2. KHONG DOI TRANG THAI. Bang la mot phep chieu cua `VehicleRunStatus`; khong mot ham nao o day
 *      nhan mot lenh chuyen trang thai (#244 G3).
 *   3. TAT DINH. Cung dau vao cho ra cung thu tu, khong phu thuoc thu tu tra ve cua kho.
 */

export interface ControlTowerCoreInput {
  readonly runs: readonly VehicleRun[];
  /** Chang theo `runId`. Vang mat = chua co chang nao, khong phai loi. */
  readonly legsByRun: ReadonlyMap<string, readonly RunLeg[]>;
  /** LICH SU phan cong theo `runId` — ban dang hieu luc la ban co `effectiveTo === null`. */
  readonly assignmentsByRun: ReadonlyMap<string, readonly RunAssignment[]>;
  readonly vehicles: readonly Vehicle[];
  readonly drivers: readonly Driver[];
}

/**
 * BA COT CO NGUON hom nay, anh xa tu `VehicleRunStatus`.
 *
 * `CANCELLED` KHONG co mat, va do la cung mot quyet dinh ma `run-distance.ts` da lay cho chang huy:
 * mot ke hoach bi bo khong phai mot buoc trong quy trinh. No bien mat khoi bang thay vi tao mot cot
 * thu tam ma khong ai lam gi voi no.
 */
const COLUMN_BY_RUN_STATUS: Readonly<Partial<Record<VehicleRun['status'], OperationsBoardColumn>>> =
  {
    PLANNED: 'PLANNED',
    ACTIVE: 'IN_TRANSIT',
    COMPLETED: 'DELIVERED',
  };

const activeDriverOf = (assignments: readonly RunAssignment[] | undefined): string | null =>
  assignments?.find((assignment) => assignment.effectiveTo === null)?.driverId ?? null;

const toCard = (run: VehicleRun, input: ControlTowerCoreInput): OperationsBoardCard => {
  const legs = input.legsByRun.get(run.id) ?? [];
  const distance = summariseRunDistance(legs);
  const counted = legs.filter((leg) => leg.status !== 'CANCELLED');

  return {
    runId: run.id,
    runCode: run.code,
    vehicleId: run.vehicleId,
    businessDate: run.businessDate,
    driverId: activeDriverOf(input.assignmentsByRun.get(run.id)),
    loadedLegs: counted.filter((leg) => leg.kind === 'LOADED').length,
    emptyLegs: counted.filter((leg) => leg.kind === 'EMPTY').length,
    /*
     * `complete === false` nghia la con mot chang thieu km. Tra `null` chu khong tra tong mot phan:
     * mot tong tinh tren du lieu khuyet doc giong het mot tong that, va no sai theo huong LAM DEP
     * (nho hon su that) — tuc kieu sai khong ai di kiem tra.
     */
    totalKm: distance.complete ? distance.totalKm : null,
  };
};

/** On dinh theo MA vong chay — cai ma nguoi doc nhin thay, khong phai `id` ky thuat. */
const byRunCode = (left: OperationsBoardCard, right: OperationsBoardCard): number =>
  left.runCode.localeCompare(right.runCode) || left.runId.localeCompare(right.runId);

export function buildOperationsBoard(
  input: ControlTowerCoreInput,
): readonly OperationsBoardColumnView[] {
  const cardsByColumn = new Map<OperationsBoardColumn, OperationsBoardCard[]>();

  for (const run of input.runs) {
    const column = COLUMN_BY_RUN_STATUS[run.status];
    if (column === undefined) continue;
    const bucket = cardsByColumn.get(column) ?? [];
    bucket.push(toCard(run, input));
    cardsByColumn.set(column, bucket);
  }

  return OPERATIONS_BOARD_COLUMNS.map((column) => {
    /*
     * Bon cot cua Lane F giu NGUYEN cho tren bang va noi ra ly do. Xem khoi chu thich cua
     * `CHECKPOINT_DERIVED_COLUMNS`: bo cot di se lam nguoi doc tuong quy trinh that chi co ba buoc,
     * con suy chung tu `RunLegStatus` se cho ra mot con so bia.
     */
    if (CHECKPOINT_DERIVED_COLUMNS.includes(column)) {
      return {
        column,
        cards: [],
        total: 0,
        unavailableReason: 'AWAITING_CHECKPOINT_SOURCE' as const,
      };
    }
    const cards = [...(cardsByColumn.get(column) ?? [])].sort(byRunCode);
    return { column, cards, total: cards.length, unavailableReason: null };
  });
}

export function countFleetPresence(input: ControlTowerCoreInput): FleetPresenceView {
  return {
    total: input.vehicles.length,
    idle: input.vehicles.filter((vehicle) => vehicle.status === 'IDLE').length,
    onTrip: input.vehicles.filter((vehicle) => vehicle.status === 'ON_TRIP').length,
    underMaintenance: input.vehicles.filter((vehicle) => vehicle.status === 'UNDER_MAINTENANCE')
      .length,
    activeDrivers: input.drivers.filter((driver) => driver.status === 'ACTIVE').length,
  };
}

const SEVERITY_ORDER: Readonly<Record<ActionQueueSeverity, number>> = {
  CRITICAL: 0,
  WARNING: 1,
  INFO: 2,
};

/**
 * Nang truoc, roi on dinh theo `kind` va `id` — cung khuon `sortAlerts`.
 *
 * `[...items]` chu khong `items.sort()`: mang dau vao thuoc ve nguoi goi, va mot ham doc lai di sua
 * du lieu cua nguoi khac la kieu loi chi lo ra o lan doc thu hai.
 */
export const sortActionQueue = (items: readonly ActionQueueItem[]): readonly ActionQueueItem[] =>
  [...items].sort(
    (left, right) =>
      SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity] ||
      left.kind.localeCompare(right.kind) ||
      left.subject.id.localeCompare(right.subject.id),
  );
