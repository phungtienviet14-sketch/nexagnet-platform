import { summariseRunDistance } from '../movement/run-distance.js';
import type { Order, RunAssignment, RunLeg, VehicleRun } from '../movement/movement.types.js';
import type { RunLegPhase } from '../checkpoint/run-timeline.js';
import type { Driver, Vehicle } from '../transport.types.js';
import {
  OPERATIONS_BOARD_COLUMNS,
  PHASE_DERIVED_COLUMNS,
  WAITING_COLUMN,
  type ActionQueueItem,
  type ActionQueueSeverity,
  type BoardCurrentLeg,
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
 *   2. KHONG DOI TRANG THAI. Bang la mot phep chieu cua `VehicleRunStatus` + giai doan chang doc
 *      tu MOC; khong mot ham nao o day nhan mot lenh chuyen trang thai (#244 G3).
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
  /**
   * MA DON theo `orderId` — chi de dat len the. `Order.code` la dinh danh nghiep vu; `orderId`
   * khong duoc di len dia chi (quy uoc `SELECTION_QUERY_PARAM` cua `navigation.ts`).
   */
  readonly orderCodesById: ReadonlyMap<string, Order['code']>;
  /**
   * GIAI DOAN CHANG doc tu moc hien truong, khoa ngoai la `runId`, khoa trong la `legId`.
   *
   * `null` — chu KHONG mot `Map` rong — khi capability `transport-checkpoint` dang tat. Hai thu do
   * khac han nhau: mot `Map` rong nghia la CO nguon nhung chua ai bam moc nao (bang van hien ba cot
   * that, rong); `null` nghia la khong co nguon, va bang phai cong bo `AWAITING_CHECKPOINT_SOURCE`.
   */
  readonly legPhasesByRun: ReadonlyMap<string, Readonly<Record<string, RunLegPhase>>> | null;
  /**
   * CHANG DANG CO MOT PHIEN CHO MO — `#279` O5.
   *
   * `null` — chu KHONG mot `Set` rong — khi capability `transport-checkpoint` dang tat. Hai thu do
   * khac han nhau, cung khuon `legPhasesByRun`: mot `Set` rong nghia la CO nguon va hom nay khong
   * xe nao dang cho (cot `WAITING` la mot cot that, rong); `null` nghia la khong co nguon, va bang
   * phai cong bo `AWAITING_WAITING_SESSION_SOURCE`.
   */
  readonly waitingLegIds: ReadonlySet<string> | null;
}

/**
 * CHANG DANG LAM = chang co so thu tu NHO NHAT ma chua xong.
 *
 * "Chua xong" doc tu HAI truc va can ca hai: `RunLegStatus` la su that cua `transport-core` (chang
 * huy, chang da dong), con `RunLegPhase` la su that cua hien truong (lai xe da bam
 * `DELIVERY_ACCEPTED` chua). Bo truc nao cung sai: chi doc trang thai thi mot chang lai xe da giao
 * xong ma dieu hanh chua dong van bi coi la dang lam; chi doc giai doan thi mot chang HUY van len
 * bang, vi khong ai bam moc cho mot chang bi huy.
 */
const pickCurrentLeg = (
  legs: readonly RunLeg[],
  phases: Readonly<Record<string, RunLegPhase>> | undefined,
  orderCodesById: ReadonlyMap<string, string>,
): BoardCurrentLeg | null => {
  const open = [...legs]
    .sort((left, right) => left.sequence - right.sequence)
    .find((leg) => {
      if (leg.status === 'CANCELLED' || leg.status === 'COMPLETED') return false;
      return phases?.[leg.id] !== 'DELIVERED';
    });

  if (open === undefined) return null;

  return {
    legId: open.id,
    sequence: open.sequence,
    kind: open.kind,
    orderCode: open.orderId === null ? null : (orderCodesById.get(open.orderId) ?? null),
    phase: phases?.[open.id] ?? null,
  };
};

/**
 * COT cua mot vong chay.
 *
 * `PLANNED`/`DELIVERED`/loai bo `CANCELLED` van do `VehicleRunStatus` quyet — do la vong doi cua
 * chinh vong chay va no khong doi. Cai `#243` F1 them vao la BEN TRONG `ACTIVE`: mot vong chay dang
 * chay bay gio phan biet duoc "dang o bai lay hang", "dang xuong hang", "dang chay", "da den noi
 * giao" — bon tinh huong ma truoc day deu do chung mot o `IN_TRANSIT`.
 *
 * `IN_TRANSIT` la CHO VE MAC DINH cua mot vong chay dang chay, va do khong phai mot phong doan: khi
 * chua co moc nao thi dieu duy nhat he thong biet chac la vong chay dang mo — dung cai ma cot
 * `IN_TRANSIT` noi. Mot vong chay dang chay bien mat khoi bang chi vi lai xe chua bam nut thi te
 * hon han.
 */
const columnForRun = (
  run: VehicleRun,
  currentLeg: BoardCurrentLeg | null,
  waitingLegIds: ReadonlySet<string> | null,
): OperationsBoardColumn | null => {
  if (run.status === 'PLANNED') return 'PLANNED';
  if (run.status === 'COMPLETED') return 'DELIVERED';
  if (run.status !== 'ACTIVE') return null;

  /*
   * `WAITING` DUNG TRUOC `ARRIVED`, va do la ca ly do cot nay ton tai.
   *
   * Hai chang cung dung o `DELIVERY_ARRIVAL` thi mot chang co the dang cho nguoi nhan con chang kia
   * thi khong. Chi mot PHIEN CHO co gio mo phan biet duoc hai truong hop do — xem khoi chu thich
   * cua `WAITING_COLUMN`. Doc no truoc `phase` nghia la mot xe dang cho khong con lan trong cot
   * `ARRIVED` cung nhung xe vua den va dang do hang.
   */
  if (currentLeg !== null && waitingLegIds?.has(currentLeg.legId) === true) return WAITING_COLUMN;

  switch (currentLeg?.phase) {
    case 'AT_PICKUP':
      return 'PICKUP';
    case 'LOADING':
      return 'LOADING';
    case 'ARRIVED':
      return 'ARRIVED';
    default:
      return 'IN_TRANSIT';
  }
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
     * (nho hon su that) — tuc kieu sai khong ai di kiem tra. Cung luat cho `emptyKm`.
     */
    totalKm: distance.complete ? distance.totalKm : null,
    emptyKm: distance.complete ? distance.emptyKm : null,
    currentLeg: pickCurrentLeg(legs, input.legPhasesByRun?.get(run.id), input.orderCodesById),
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
    const card = toCard(run, input);
    const column = columnForRun(run, card.currentLeg, input.waitingLegIds);
    if (column === null) continue;
    const bucket = cardsByColumn.get(column) ?? [];
    bucket.push(card);
    cardsByColumn.set(column, bucket);
  }

  const phasesAvailable = input.legPhasesByRun !== null;

  return OPERATIONS_BOARD_COLUMNS.map((column) => {
    /*
     * `WAITING` chi RONG kem ma ly do khi KHONG CO nguon phien cho — tuc khach dang tat
     * `transport-checkpoint`. Khi co nguon, no la mot cot that: rong o day nghia la hom nay khong
     * xe nao dang cho nguoi nhan, mot su that chu khong mot cho trong.
     *
     * `#279` O5 da lam ra nguon do. Truoc no, suy cot nay tu `DELIVERY_ARRIVAL` se bien hai chang
     * khac han nhau thanh mot con so — xem khoi chu thich cua `WAITING_COLUMN`.
     */
    if (column === WAITING_COLUMN && input.waitingLegIds === null) {
      return {
        column,
        cards: [],
        total: 0,
        unavailableReason: 'AWAITING_WAITING_SESSION_SOURCE' as const,
      };
    }

    /*
     * Ba cot giai doan chi rong khi KHONG CO nguon moc. Khi co nguon, chung la cot that: rong o day
     * nghia la hom nay khong xe nao dang o buoc do — mot su that, khong phai mot cho trong.
     */
    if (!phasesAvailable && PHASE_DERIVED_COLUMNS.includes(column)) {
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
