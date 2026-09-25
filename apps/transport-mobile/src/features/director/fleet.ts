import { formatBusinessDate, formatKm } from '../../format';
import { COLUMN_ORDER, columnLabel, phaseLabel } from '../office/control-tower';
import type {
  BoardCard,
  BoardCurrentLeg,
  ControlTowerView,
  Driver,
  Vehicle,
} from '../office/types';

/**
 * DOI XE, XE TRUOC — ghep the cua bang (control-tower) voi danh muc xe + lai xe. HAM THUAN.
 *
 *   · Bang KHONG co bien so hay ten lai xe; ghep o day, va thieu thi noi "chưa đọc được", khong bia.
 *   · KHONG dem "dang chay" o day. Con so do la `fleet.onTrip`/`runningRuns` cua may chu; man hinh
 *     chi sap xe theo cot cua the de xe dang lam viec len truoc.
 *   · Cot `DELIVERED` chua MOI vong chay da xong tu truoc toi nay. Chi giu the co
 *     `businessDate === generatedFor` (ca hai la so cua may chu) — "đã giao xong hôm nay".
 *   · km `null` -> "—", khong bao gio 0.
 */

export interface VehicleRunLine {
  readonly key: string;
  readonly runCode: string;
  readonly column: string;
  readonly columnLabel: string;
  /** "Chặng 2 · RỖNG · chạy không hàng" / "Chặng 1 · có hàng · DH-001"; `null` khi het chang mo. */
  readonly legLabel: string | null;
  readonly isEmptyLeg: boolean;
  readonly phaseLabel: string;
  readonly driverId: string | null;
  readonly driverName: string;
  readonly totalKm: string;
  readonly emptyKm: string;
  readonly businessDate: string;
}

export interface VehicleRow {
  readonly vehicleId: string;
  readonly plate: string;
  readonly vehicleClass: string | null;
  /** Cot LUU `UNDER_MAINTENANCE` — cung nguon may chu dung cho `underMaintenance`. */
  readonly isUnderMaintenance: boolean;
  readonly runs: readonly VehicleRunLine[];
}

const legLabelOf = (leg: BoardCurrentLeg): string => {
  const position = `Chặng ${leg.sequence}`;
  if (leg.kind === 'EMPTY') return `${position} · RỖNG · chạy không hàng`;
  return leg.orderCode === null
    ? `${position} · có hàng · chưa gắn đơn`
    : `${position} · có hàng · ${leg.orderCode}`;
};

const driverLabel = (drivers: ReadonlyMap<string, Driver>, driverId: string | null): string => {
  if (driverId === null) return 'Chưa phân công lái xe';
  return drivers.get(driverId)?.fullName ?? 'Lái xe chưa đọc được tên';
};

function toLine(
  card: BoardCard,
  column: string,
  drivers: ReadonlyMap<string, Driver>,
): VehicleRunLine {
  return {
    key: `${column}:${card.runId}`,
    runCode: card.runCode,
    column,
    columnLabel: columnLabel(column),
    legLabel: card.currentLeg === null ? null : legLabelOf(card.currentLeg),
    isEmptyLeg: card.currentLeg?.kind === 'EMPTY',
    phaseLabel: phaseLabel(card.currentLeg?.phase ?? null),
    driverId: card.driverId,
    driverName: driverLabel(drivers, card.driverId),
    totalKm: formatKm(card.totalKm),
    emptyKm: formatKm(card.emptyKm),
    businessDate: formatBusinessDate(card.businessDate),
  };
}

/** Thu hang sap xep: cot dang lam viec (theo quy trinh) truoc, ke hoach, da giao hom nay, roi xe trong. */
const columnRank = (column: string): number => {
  if (column === 'PLANNED') return 10;
  if (column === 'DELIVERED') return 11;
  const index = COLUMN_ORDER.indexOf(column);
  return index === -1 ? 9 : index;
};

const rowRank = (row: VehicleRow): number =>
  row.runs.length === 0 ? 20 : Math.min(...row.runs.map((run) => columnRank(run.column)));

/** Nhung the dang hien tren bang (bo `DELIVERED` cu). */
export function boardCardsInView(
  view: Pick<ControlTowerView, 'board' | 'generatedFor'>,
): ReadonlyArray<{ readonly card: BoardCard; readonly column: string }> {
  return view.board.flatMap((column) =>
    column.cards
      .filter((card) => column.column !== 'DELIVERED' || card.businessDate === view.generatedFor)
      .map((card) => ({ card, column: column.column })),
  );
}

export function buildVehicleRows(
  view: Pick<ControlTowerView, 'board' | 'generatedFor'>,
  vehicles: readonly Vehicle[],
  drivers: readonly Driver[],
): readonly VehicleRow[] {
  const driverById = new Map(drivers.map((driver) => [driver.id, driver]));
  const linesByVehicle = new Map<string, VehicleRunLine[]>();
  for (const { card, column } of boardCardsInView(view)) {
    const lines = linesByVehicle.get(card.vehicleId) ?? [];
    linesByVehicle.set(card.vehicleId, [...lines, toLine(card, column, driverById)]);
  }
  const known = vehicles.map((vehicle): VehicleRow => ({
    vehicleId: vehicle.id,
    plate: vehicle.registrationPlate,
    vehicleClass: vehicle.vehicleClass || null,
    isUnderMaintenance: vehicle.status === 'UNDER_MAINTENANCE',
    runs: sortLines(linesByVehicle.get(vehicle.id) ?? []),
  }));
  const knownIds = new Set(vehicles.map((vehicle) => vehicle.id));
  const orphans = [...linesByVehicle.entries()]
    .filter(([vehicleId]) => !knownIds.has(vehicleId))
    .map(([vehicleId, lines]): VehicleRow => ({
      vehicleId,
      plate: 'Xe chưa đọc được biển số',
      vehicleClass: null,
      isUnderMaintenance: false,
      runs: sortLines(lines),
    }));
  return [...known, ...orphans].sort(
    (a, b) => rowRank(a) - rowRank(b) || a.plate.localeCompare(b.plate, 'vi'),
  );
}

function sortLines(lines: readonly VehicleRunLine[]): readonly VehicleRunLine[] {
  return [...lines].sort((a, b) => columnRank(a.column) - columnRank(b.column));
}

/** Lai xe dang co mat tren bang (tru "đã giao") -> ma vong chay — de chon nguoi phan cong co thong tin. */
export function driverRunCodes(
  view: Pick<ControlTowerView, 'board' | 'generatedFor'>,
): ReadonlyMap<string, readonly string[]> {
  const map = new Map<string, readonly string[]>();
  for (const { card, column } of boardCardsInView(view)) {
    if (card.driverId === null || column === 'DELIVERED') continue;
    map.set(card.driverId, [...(map.get(card.driverId) ?? []), card.runCode]);
  }
  return map;
}
