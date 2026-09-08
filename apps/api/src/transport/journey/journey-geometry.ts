import type { RunCheckpoint, RunCheckpointType } from '../checkpoint/checkpoint.types.js';
import type { LocationObservation } from '../proof/tracking.types.js';
import type { GeoPoint } from '../geo/geo-point.js';
import type { JourneyGeometryGap, JourneyPath, JourneyPoint } from './journey.types.js';

/**
 * HINH HOC CUA MOT CHANG — HAM THUAN. Khong Nest, khong Prisma, khong dong ho, khong mang.
 *
 * Ca tep nay ton tai de mot cau duy nhat kiem duoc bang mot bai `.ts`: *khong toa do nao duoc sinh
 * ra*. Neu phep quyet dinh nay nam trong service thi no se chi con la mot loi khuyen trong tai
 * lieu, va mot lan "tam ve doan thang cho de nhin" se lot qua ma khong ai thay.
 */

/**
 * MOC XAY RA O DAU LAY HANG. Bon loai, va ca bon deu o CUNG mot cho.
 *
 * `GATE_ENTRY` va `LOADING` co y khong xep truoc-sau nhau (`checkpoint-lifecycle.ts`), nen o day
 * khong doc thu tu — chi doc "moc nao trong nhom nay co ban dinh vi SOM NHAT".
 */
const ORIGIN_TYPES: readonly RunCheckpointType[] = [
  'PICKUP_ARRIVAL',
  'GATE_ENTRY',
  'LOADING',
  'PICKUP_DEPARTURE',
];

/** MOC XAY RA O NOI GIAO. */
const DESTINATION_TYPES: readonly RunCheckpointType[] = ['DELIVERY_ARRIVAL', 'DELIVERY_ACCEPTED'];

/**
 * TRAN SO DIEM cua mot duong ban dinh vi tho, TREN MOI CHANG.
 *
 * `#278` N11: *"do not ship months of raw GPS by default"*. Mot chuyen Ha Noi - Hai Phong bam moi
 * 10 giay la ~1.100 diem; ca vong chay bon chang la ~4.500. Ve het thi trinh duyet van chiu duoc,
 * nhung duong day cua khach thi khong, va khong ai doc duoc them gi tu diem thu 400.
 *
 * 400 la con so de mot chang van giu duoc hinh dang cua duong di o muc thu phong toan tuyen. Khi
 * nguoi dung phong to that su thi do la mot lan doc KHAC, co bien, va no thuoc tranche sau.
 */
export const RAW_PATH_MAX_POINTS = 400;

/** Gio MAY CHU la truc duy nhat — cung luat voi `buildRunTimeline` (`#243` F7). */
const byReceivedAt = (left: RunCheckpoint, right: RunCheckpoint): number =>
  left.receivedAt.getTime() - right.receivedAt.getTime() || left.id.localeCompare(right.id);

const byCapturedAt = (left: LocationObservation, right: LocationObservation): number =>
  left.capturedAt.getTime() - right.capturedAt.getTime() || left.id.localeCompare(right.id);

export interface LegGeometrySource {
  /** Moc CUA RIENG chang nay. Moc muc vong chay (`ASSIGNED`/`DEPARTED`/`COMPLETED`) khong vao day. */
  readonly checkpoints: readonly RunCheckpoint[];
  /** Ban dinh vi tra cuu duoc theo `observationId` cua moc. Vang mat = khong doc duoc. */
  readonly observationsById: ReadonlyMap<string, LocationObservation>;
  /**
   * Ban dinh vi THO cua phien bam vi tri thuoc chang nay.
   *
   * `null` — chu KHONG mang rong — khi chang khong noi voi mot chuyen nao, nen khong co phien nao
   * de doc. Mang rong nghia la CO phien nhung chua ban dinh vi nao roi vao khoang cua chang; hai
   * dieu do dan toi hai ma ly do khac nhau.
   */
  readonly rawObservations: readonly LocationObservation[] | null;
}

export interface LegGeometry {
  readonly origin: JourneyPoint | null;
  readonly originGap: JourneyGeometryGap | null;
  readonly destination: JourneyPoint | null;
  readonly destinationGap: JourneyGeometryGap | null;
  readonly paths: readonly JourneyPath[];
}

const pointOf = (observation: LocationObservation): JourneyPoint => ({
  point: observation.point,
  source: 'CHECKPOINT_OBSERVATION',
  at: observation.receivedAt.toISOString(),
});

/**
 * MOT DAU CUA CHANG.
 *
 * Ba ket qua, va chung KHONG duoc gop:
 *
 *   · co diem;
 *   · `NO_CHECKPOINT_RECORDED`    — chua ai bam moc nao o dau nay. Chua co viec gi phai lam.
 *   · `NO_CHECKPOINT_OBSERVATION` — DA bam, nhung khong lan nao kem ban dinh vi. Co viec: nhac lai
 *     xe bat dinh vi, hoac xem lai vi sao dien thoai khong lay duoc vi tri o cho do.
 *
 * Gop hai ma cuoi lam mot se lam mot chang chua chay den doc y het mot chang chay xong ma mat bang
 * chung.
 */
const endpointOf = (
  source: LegGeometrySource,
  types: readonly RunCheckpointType[],
): { readonly point: JourneyPoint | null; readonly gap: JourneyGeometryGap | null } => {
  const atEnd = source.checkpoints.filter((entry) => types.includes(entry.type));
  if (atEnd.length === 0) return { point: null, gap: 'NO_CHECKPOINT_RECORDED' };

  for (const checkpoint of [...atEnd].sort(byReceivedAt)) {
    if (checkpoint.observationId === null) continue;
    const observation = source.observationsById.get(checkpoint.observationId);
    if (observation === undefined) continue;
    return { point: pointOf(observation), gap: null };
  }

  return { point: null, gap: 'NO_CHECKPOINT_OBSERVATION' };
};

/**
 * DUONG NOI CAC MOC — thua, nhung khong mot doan nao la suy dien.
 *
 * Can it nhat HAI diem: mot diem le khong phai mot duong, va tra ve mot mang mot phan tu se lam
 * tang ve phia tren phai tu hoi "duong nay di dau". Mot diem thi da nam san o `origin`/`destination`.
 */
const checkpointAnchoredPath = (source: LegGeometrySource): JourneyPath => {
  const points: GeoPoint[] = [];
  for (const checkpoint of [...source.checkpoints].sort(byReceivedAt)) {
    if (checkpoint.observationId === null) continue;
    const observation = source.observationsById.get(checkpoint.observationId);
    if (observation === undefined) continue;
    points.push(observation.point);
  }

  if (points.length < 2) {
    return {
      kind: 'CHECKPOINT_ANCHORED',
      points: [],
      gap: source.checkpoints.length === 0 ? 'NO_CHECKPOINT_RECORDED' : 'NO_CHECKPOINT_OBSERVATION',
      sampledFrom: points.length,
    };
  }

  return { kind: 'CHECKPOINT_ANCHORED', points, gap: null, sampledFrom: points.length };
};

/**
 * THUA DEU theo chi so, va LUON giu diem dau va diem cuoi.
 *
 * Khong thua theo khoang cach hay theo goc (Douglas-Peucker): mot phep don gian hoa hinh hoc lam
 * duong DEP hon nhung no DOI hinh dang, va mot duong da bi lam muot thi khong con doc duoc cho lai
 * xe dung lai. Thua deu thi moi diem con lai la mot ban dinh vi CO THAT, chua ai dong vao.
 */
export const decimate = <T>(items: readonly T[], max: number): readonly T[] => {
  if (max < 2) throw new RangeError('Tran so diem phai it nhat la 2');
  if (items.length <= max) return items;

  const step = (items.length - 1) / (max - 1);
  const kept: T[] = [];
  for (let index = 0; index < max; index += 1) {
    const item = items[Math.round(index * step)];
    if (item !== undefined) kept.push(item);
  }
  return kept;
};

const rawObservedPath = (source: LegGeometrySource): JourneyPath => {
  if (source.rawObservations === null) {
    return { kind: 'RAW_OBSERVED', points: [], gap: 'NO_TRACKING_SESSION', sampledFrom: 0 };
  }

  const ordered = [...source.rawObservations].sort(byCapturedAt);
  if (ordered.length < 2) {
    return {
      kind: 'RAW_OBSERVED',
      points: [],
      gap: 'NO_CHECKPOINT_OBSERVATION',
      sampledFrom: ordered.length,
    };
  }

  return {
    kind: 'RAW_OBSERVED',
    points: decimate(ordered, RAW_PATH_MAX_POINTS).map((entry) => entry.point),
    gap: null,
    sampledFrom: ordered.length,
  };
};

/**
 * TUYEN KE HOACH — LUON `NO_ROUTE_PROVIDER` tren `main` hom nay.
 *
 * Ham nay ton tai thay vi mot hang so, va do la co y: khi Lane M (#277) dua mot cong dan duong vao,
 * cho phai sua la DUNG mot ham, va `journey-geometry.spec.ts` co mot bai doi chinh cau nay. Bo han
 * duong `PLANNED` khoi bao cao se lam man hinh khong con cho de ve no, va luc do viec noi Lane M
 * vao se la mot lan sua giao dien chu khong phai mot lan dien vao mot cho da chua san.
 */
const plannedPath = (): JourneyPath => ({
  kind: 'PLANNED',
  points: [],
  gap: 'NO_ROUTE_PROVIDER',
  sampledFrom: 0,
});

export function buildLegGeometry(source: LegGeometrySource): LegGeometry {
  const origin = endpointOf(source, ORIGIN_TYPES);
  const destination = endpointOf(source, DESTINATION_TYPES);

  return {
    origin: origin.point,
    originGap: origin.gap,
    destination: destination.point,
    destinationGap: destination.gap,
    paths: [plannedPath(), checkpointAnchoredPath(source), rawObservedPath(source)],
  };
}
