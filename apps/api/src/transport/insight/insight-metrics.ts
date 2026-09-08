import type { Order, RunLeg, VehicleRun } from '../movement/movement.types.js';
import type { Vehicle } from '../transport.types.js';
import { addBusinessDays, assertBusinessDate, type BusinessDate } from '../business-date.js';
import {
  CORRIDOR_EMPTY_ATTRIBUTION,
  CORRIDOR_GROUPING,
  UTILISATION_FORMULA,
  type CorridorInsight,
  type CorridorInsightView,
  type FleetInsightView,
  type InsightRange,
  type VehicleInsight,
} from './insight.types.js';

/**
 * PHEP GOP cua bang doi xe va bao cao tuyen — HAM THUAN (#278 N6/N7/N10).
 *
 * `#278` N10: *"All derived metrics need named calculation functions and deterministic tests."*
 * Nen moi con so o day den tu mot ham co ten, va khong ham nao doc dong ho hay kho du lieu.
 *
 * ===========================================================================
 * MOT LUAT, LAP LAI O MOI CHO: THIEU MOT PHAN THI TONG LA `null`.
 *
 * `summariseRunDistance` da dat luat nay cho mot vong chay, va o day no duoc giu nguyen cho mot
 * chiec xe va cho mot tuyen. Mot tong tinh tren du lieu khuyet doc y het mot tong that, va no luon
 * sai theo huong LAM DEP — tuc kieu sai khong ai di kiem tra.
 */

/** Chang DA HUY khong duoc dem — cung quy uoc `summariseRunDistance`. */
const counts = (leg: RunLeg): boolean => leg.status !== 'CANCELLED';

/** So ngay LICH giua hai ngay nghiep vu, tinh ca hai dau. `0` khi khoang nguoc. */
export function businessDaysBetween(from: BusinessDate, to: BusinessDate): number {
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.round((end - start) / 86_400_000) + 1;
}

/** Khoang mac dinh khi nguoi goi khong dat: 30 ngay gan nhat, TINH CA hom nay. */
export const DEFAULT_RANGE_DAYS = 30;

/**
 * CHOT KHOANG NGAY — ham THUAN, va la NOI DUY NHAT quyet dinh viec do.
 *
 * `#278` N10: *"Time ranges must use tenant business-date/timezone semantics, not browser-local/UTC
 * accidents."* `today` do NGUOI GOI dua vao (da quy ve mui gio tenant), nen tep nay khong doc dong
 * ho — hai mui gio khong cho ra hai bao cao.
 *
 * Bang doi xe (`InsightReadService`) va be mat ben huu quan (`StakeholderActivityService`) deu goi
 * ham nay. Neu moi ben tu tinh lay 30 ngay, hai man hinh se lech nhau dung vao ngay dau thang — va
 * khong ai biet ben nao dung.
 *
 * `assertBusinessDate` NEM khi chuoi khong phai `YYYY-MM-DD`: mot khoang sai phai dung lai o bien,
 * khong duoc di tiep thanh mot bao cao rong ma nguoi doc tuong la "khong co chuyen nao".
 */
export function resolveInsightRange(
  from: string | undefined,
  to: string | undefined,
  today: BusinessDate,
): InsightRange {
  const end = to === undefined ? today : assertBusinessDate(to);
  const start =
    from === undefined ? addBusinessDays(end, -(DEFAULT_RANGE_DAYS - 1)) : assertBusinessDate(from);

  return { from: start, to: end, businessDays: businessDaysBetween(start, end) };
}

/** Ngay nghiep vu nam trong khoang. So sanh CHUOI — `YYYY-MM-DD` xep dung theo tu dien. */
export const withinRange = (
  date: BusinessDate,
  range: { readonly from: string; readonly to: string },
): boolean => date >= range.from && date <= range.to;

interface DistanceRollup {
  readonly loadedKm: number | null;
  readonly emptyKm: number | null;
  readonly totalKm: number | null;
  readonly emptyRatio: number | null;
  readonly legsMissingDistance: number;
}

/**
 * GOP km cua MOT TAP CHANG bat ky.
 *
 * Khong goi lai `summariseRunDistance`: ham do nhan tron chang cua MOT vong chay va tra them nhung
 * truong chi co nghia o grain do (`countedLegs`, `legsMissingDistance` tach theo loai). O day tap
 * dau vao la "moi chang cua mot chiec xe trong mot khoang" — mot grain khac. Nhung LUAT thi giong
 * het, va bai `insight-metrics.spec.ts` khang dinh hai ben cho cung ket qua tren cung tap chang.
 */
export function rollUpDistance(legs: readonly RunLeg[]): DistanceRollup {
  let loadedKm = 0;
  let emptyKm = 0;
  let missing = 0;

  for (const leg of legs) {
    if (!counts(leg)) continue;
    if (leg.distanceKm === null) {
      missing += 1;
      continue;
    }
    if (leg.kind === 'LOADED') loadedKm += leg.distanceKm;
    else emptyKm += leg.distanceKm;
  }

  if (missing > 0) {
    return {
      loadedKm: null,
      emptyKm: null,
      totalKm: null,
      emptyRatio: null,
      legsMissingDistance: missing,
    };
  }

  const totalKm = loadedKm + emptyKm;
  return {
    loadedKm,
    emptyKm,
    totalKm,
    emptyRatio: totalKm > 0 ? emptyKm / totalKm : null,
    legsMissingDistance: 0,
  };
}

export interface FleetInsightInput {
  readonly range: InsightRange;
  readonly vehicles: readonly Vehicle[];
  readonly runs: readonly VehicleRun[];
  readonly legsByRun: ReadonlyMap<string, readonly RunLeg[]>;
}

export function buildFleetInsight(input: FleetInsightInput): FleetInsightView {
  const runsByVehicle = new Map<string, VehicleRun[]>();
  for (const run of input.runs) {
    if (run.status === 'CANCELLED') continue;
    const bucket = runsByVehicle.get(run.vehicleId) ?? [];
    bucket.push(run);
    runsByVehicle.set(run.vehicleId, bucket);
  }

  const everyLeg: RunLeg[] = [];

  const vehicles = input.vehicles
    .map((vehicle): VehicleInsight => {
      const runs = runsByVehicle.get(vehicle.id) ?? [];
      const legs = runs
        .flatMap((run) => input.legsByRun.get(run.id) ?? [])
        .filter((leg) => counts(leg) && withinRange(leg.businessDate, input.range));
      everyLeg.push(...legs);

      /*
       * NGAY CO VIEC dem tren CHANG, khong tren vong chay: mot vong chay mo ngay 08 va chay sang
       * ngay 09 co hai ngay co viec, va `VehicleRun.businessDate` chi ghi duoc mot.
       */
      const activeDays = new Set(legs.map((leg) => leg.businessDate));
      const distance = rollUpDistance(legs);

      return {
        vehicleId: vehicle.id,
        registrationPlate: vehicle.registrationPlate,
        status: vehicle.status,
        runCount: runs.length,
        activeBusinessDays: activeDays.size,
        utilisation:
          input.range.businessDays > 0 ? activeDays.size / input.range.businessDays : null,
        ...distance,
      };
    })
    /* On dinh theo BIEN SO — cai nguoi doc nhin thay, khong phai `id` ky thuat. */
    .sort((left, right) => left.registrationPlate.localeCompare(right.registrationPlate));

  return {
    range: input.range,
    utilisationFormula: UTILISATION_FORMULA,
    vehicles,
    presence: {
      total: input.vehicles.length,
      idle: input.vehicles.filter((vehicle) => vehicle.status === 'IDLE').length,
      onTrip: input.vehicles.filter((vehicle) => vehicle.status === 'ON_TRIP').length,
      underMaintenance: input.vehicles.filter((vehicle) => vehicle.status === 'UNDER_MAINTENANCE')
        .length,
    },
    totals: rollUpDistance(everyLeg),
  };
}

/* ------------------------------------------------------------------ *
 * TUYEN
 * ------------------------------------------------------------------ */

/**
 * CHUAN HOA mot nhan dia diem.
 *
 * Ha chu thuong + gop khoang trang. KHONG bo dau tieng Viet: "Hà Nội" va "Ha Noi" la HAI chuoi ma
 * nguoi nhap co the co y phan biet, va gop chung lai la mot phep doan ma bao cao khong duoc phep.
 * Xem `CORRIDOR_GROUPING` — day la mot phep gom TAM, va no phai gom IT hon la nhieu hon.
 */
export const normaliseLabel = (label: string): string =>
  label.trim().toLowerCase().replace(/\s+/g, ' ');

export const corridorKeyOf = (origin: string, destination: string): string =>
  `${normaliseLabel(origin)} → ${normaliseLabel(destination)}`;

/** TRUNG VI. `null` tren tap rong — khong phai `0`. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? null;
  const lower = sorted[middle - 1];
  const upper = sorted[middle];
  return lower === undefined || upper === undefined ? null : (lower + upper) / 2;
}

export interface CorridorInsightInput {
  readonly range: InsightRange;
  readonly runs: readonly VehicleRun[];
  readonly legsByRun: ReadonlyMap<string, readonly RunLeg[]>;
  readonly orders: readonly Order[];
}

interface CorridorAccumulator {
  originLabel: string;
  destinationLabel: string;
  legCount: number;
  loadedKm: number;
  missing: number;
  readonly loadedSamples: number[];
  attributedEmptyKm: number;
  emptyMissing: number;
  readonly orderCodes: Set<string>;
  readonly runCodes: Set<string>;
}

export function buildCorridorInsight(input: CorridorInsightInput): CorridorInsightView {
  const orderCodeById = new Map(input.orders.map((order) => [order.id, order.code] as const));
  const buckets = new Map<string, CorridorAccumulator>();

  for (const run of input.runs) {
    if (run.status === 'CANCELLED') continue;
    const legs = [...(input.legsByRun.get(run.id) ?? [])]
      .filter(counts)
      .sort((left, right) => left.sequence - right.sequence);

    for (const [index, leg] of legs.entries()) {
      if (leg.kind !== 'LOADED') continue;
      if (!withinRange(leg.businessDate, input.range)) continue;

      const key = corridorKeyOf(leg.originLabel, leg.destinationLabel);
      const bucket = buckets.get(key) ?? {
        originLabel: leg.originLabel,
        destinationLabel: leg.destinationLabel,
        legCount: 0,
        loadedKm: 0,
        missing: 0,
        loadedSamples: [],
        attributedEmptyKm: 0,
        emptyMissing: 0,
        orderCodes: new Set<string>(),
        runCodes: new Set<string>(),
      };

      bucket.legCount += 1;
      bucket.runCodes.add(run.code);
      if (leg.orderId !== null) {
        const code = orderCodeById.get(leg.orderId);
        if (code !== undefined) bucket.orderCodes.add(code);
      }

      if (leg.distanceKm === null) bucket.missing += 1;
      else {
        bucket.loadedKm += leg.distanceKm;
        bucket.loadedSamples.push(leg.distanceKm);
      }

      /*
       * `CORRIDOR_EMPTY_ATTRIBUTION` — chang RONG ngay SAU chang co hang nay, trong cung vong chay.
       *
       * Chi chang lien ke: neu chang ke tiep lai co hang thi khong co km rong nao thuoc ve tuyen
       * nay, va cong them mot chang rong o xa hon se quy nham cai gia cua mot chuyen khac.
       */
      const next = legs[index + 1];
      if (next !== undefined && next.kind === 'EMPTY') {
        if (next.distanceKm === null) bucket.emptyMissing += 1;
        else bucket.attributedEmptyKm += next.distanceKm;
      }

      buckets.set(key, bucket);
    }
  }

  const corridors = [...buckets.entries()]
    .map(([corridorKey, bucket]): CorridorInsight => ({
      corridorKey,
      originLabel: bucket.originLabel,
      destinationLabel: bucket.destinationLabel,
      legCount: bucket.legCount,
      orderCodes: [...bucket.orderCodes].sort(),
      runCodes: [...bucket.runCodes].sort(),
      loadedKm: bucket.missing > 0 ? null : bucket.loadedKm,
      /* Trung vi tinh tren CAC CHANG CO SO — mot chang thieu km khong lam mat ca trung vi. */
      medianLoadedKm: median(bucket.loadedSamples),
      attributedEmptyKm: bucket.emptyMissing > 0 ? null : bucket.attributedEmptyKm,
      legsMissingDistance: bucket.missing + bucket.emptyMissing,
    }))
    /* Tuyen chay nhieu nhat len truoc; hoa thi on dinh theo khoa. */
    .sort(
      (left, right) =>
        right.legCount - left.legCount || left.corridorKey.localeCompare(right.corridorKey),
    );

  return {
    range: input.range,
    grouping: CORRIDOR_GROUPING,
    emptyAttribution: CORRIDOR_EMPTY_ATTRIBUTION,
    corridors,
  };
}
