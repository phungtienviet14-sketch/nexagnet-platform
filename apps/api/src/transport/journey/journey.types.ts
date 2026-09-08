import type { BusinessDate } from '../business-date.js';
import type { RunLegPhase } from '../checkpoint/run-timeline.js';
import type { RunCheckpointType } from '../checkpoint/checkpoint.types.js';
import type { RunDistanceSummary } from '../movement/run-distance.js';
import type { RunLegKind, RunLegStatus, VehicleRunStatus } from '../movement/movement.types.js';
import type { GeoPoint } from '../geo/geo-point.js';

/**
 * BAO CAO BAN DO CUA MOT VONG CHAY — mot READ MODEL (#278 N5).
 *
 * ===========================================================================
 * KHONG MOT TOA DO NAO O DAY DUOC SINH RA. TAT CA DEU CO CHU.
 *
 * Day la rang buoc thiet ke chinh cua ca tep. Nen tang nay khong co bang toa do dia diem: `RunLeg`
 * chi co `originLabel`/`destinationLabel` la CHUOI TU DO, va `TransportCounterpartySite` chi co
 * `name` + `address`. Cach de nhat de co mot ban do "dep" la geocode nhung chuoi do, hoac lay tam
 * mot hang rao co ten na na roi ve mot duong thang. Ca hai deu la BIA — va tren mot ban do thi mot
 * duong bia doc y het mot duong that.
 *
 * Nen o day chi co MOT nguon toa do, va no la mot khoa ngoai co that:
 * `TransportRunCheckpoint.observationId` tro thang vao mot ban dinh vi cua Lane B — tuc mot con
 * nguoi da dung o do va bam mot nut.
 *
 * Tam HANG RAO (`TransportGeofence`) co the la nguon thu hai, nhung chi qua mot chuoi khoa ngoai
 * that: `TransportRunSiteIntake.siteId` -> hang rao khai cho DUNG `subjectId` do. Chuoi do di qua
 * capability `transport-site-intake`, va no chua duoc noi o tranche nay — nen `JOURNEY_POINT_SOURCES`
 * KHONG khai truoc mot gia tri chua bao gio duoc phat. Mot enum co gia tri khong ai phat la mot
 * enum noi doi.
 *
 * Thieu thi truong toa do la `null` kem MOT MA LY DO. Ban do ve duoc bao nhieu thi ve, va noi ra
 * phan no khong ve duoc.
 *
 * ===========================================================================
 * TUYEN KE HOACH CHUA TON TAI, VA BAO CAO NOI RA DIEU DO.
 *
 * `#278` N5 doi *"planned route vs actual/matched route visually distinguishable"*. Tren `main` hom
 * nay khong co mot nha cung cap dan duong nao — Lane M (#277) so huu cong do. Nen `PLANNED` luon
 * tra ve `NO_ROUTE_PROVIDER`, chu KHONG tra ve duong noi hai diem dau cuoi. Mot doan thang giua hai
 * kho cach nhau 100km khong phai mot "tuyen ke hoach"; no la mot loi khang dinh sai ve duong di.
 *
 * ===========================================================================
 * `RAW` KHONG BAO GIO DUOC GOI LA `MATCHED`.
 *
 * `#278` N5: *"never claim matched line is raw GPS; preserve source labels: RAW / MATCHED /
 * PLANNED"*. Tang nay khong co khop ban do (map-matching), nen no khong phat ra `MATCHED` bao gio.
 * Hai duong no phat ra deu duoc goi dung ten: mot chuoi ban dinh vi tho, va mot duong noi cac moc.
 */

/* ------------------------------------------------------------------ *
 * TOA DO
 * ------------------------------------------------------------------ */

export const JOURNEY_POINT_SOURCES = [
  /** Ban dinh vi gan cung mot moc hien truong — con nguoi da o do. */
  'CHECKPOINT_OBSERVATION',
] as const;
export type JourneyPointSource = (typeof JOURNEY_POINT_SOURCES)[number];

export interface JourneyPoint {
  readonly point: GeoPoint;
  readonly source: JourneyPointSource;
  /** Gio MAY CHU cua moc sinh ra diem nay. `null` voi tam hang rao — no khong co thoi diem. */
  readonly at: string | null;
}

/**
 * VI SAO MOT CHO TREN BAN DO KHONG VE DUOC. Moi ma la mot viec KHAC NHAU cua con nguoi.
 *
 * Gop chung thanh mot `null` tran se lam nguoi van hanh khong biet phai lam gi: di bao lai xe bam
 * lai co vi tri, hay di khai mot hang rao cho cai kho do, hay cho Lane M.
 */
export const JOURNEY_GEOMETRY_GAPS = [
  /** Chang co moc, nhung khong moc nao kem ban dinh vi. Viec: nhac lai xe bat dinh vi. */
  'NO_CHECKPOINT_OBSERVATION',
  /** Chang chua co moc nao. Viec: khong co — chang chua chay den do. */
  'NO_CHECKPOINT_RECORDED',
  /** Tuyen ke hoach can mot nha cung cap dan duong. Viec: cho Lane M (#277). */
  'NO_ROUTE_PROVIDER',
  /** Chang khong noi voi mot chuyen nao, nen khong co phien bam vi tri nao de doc. */
  'NO_TRACKING_SESSION',
] as const;
export type JourneyGeometryGap = (typeof JOURNEY_GEOMETRY_GAPS)[number];

/* ------------------------------------------------------------------ *
 * DUONG DI
 * ------------------------------------------------------------------ */

/**
 * BA LOAI DUONG, va man hinh PHAI ve chung khac nhau.
 *
 * `MATCHED` co y KHONG co mat: tang nay khong khop ban do, nen mot gia tri khong bao gio duoc phat
 * la mot enum noi doi. No se duoc them vao khi co mot tang khop that.
 */
export const JOURNEY_PATH_KINDS = [
  /** Tuyen du kien truoc khi chay. Hom nay LUON `NO_ROUTE_PROVIDER`. */
  'PLANNED',
  /** Duong noi cac MOC co ban dinh vi, theo thu tu gio may chu. Thua, nhung 100% quy trach duoc. */
  'CHECKPOINT_ANCHORED',
  /** Chuoi ban dinh vi THO cua phien bam vi tri. Khong qua mot phep khop nao. */
  'RAW_OBSERVED',
] as const;
export type JourneyPathKind = (typeof JOURNEY_PATH_KINDS)[number];

export interface JourneyPath {
  readonly kind: JourneyPathKind;
  /** Rong khi `gap !== null`. KHONG BAO GIO mot doan thang noi hai dau de "co cai ma ve". */
  readonly points: readonly GeoPoint[];
  /** `null` khi duong ve duoc. Mot ma khi khong. */
  readonly gap: JourneyGeometryGap | null;
  /**
   * Con so THAT truoc khi thua bot. `points.length` co the nho hon.
   *
   * `#278` N11 cam ship hang thang ban dinh vi tho ve trinh duyet, nen duong `RAW_OBSERVED` bi thua
   * o may chu. Nhung thua ma khong noi ra se lam nguoi doc tuong da nhin thay het.
   */
  readonly sampledFrom: number;
}

/* ------------------------------------------------------------------ *
 * CHANG
 * ------------------------------------------------------------------ */

export interface JourneyLegView {
  readonly legId: string;
  readonly sequence: number;
  /**
   * `EMPTY` la truc ma `#274` §4 doi phai NOI BAT MAU DO tren ban do.
   *
   * Truong nay la SU THAT CUA MIEN (`TransportRunLeg.kind`), khong phai mot phep suy cua bao cao.
   * Mot chang rong o day la mot chang rong trong DB.
   */
  readonly kind: RunLegKind;
  readonly status: RunLegStatus;
  /** `null` khi chang RONG (bat bien cua mien) hoac chang co hang chua gan don. */
  readonly orderCode: string | null;
  readonly originLabel: string;
  readonly destinationLabel: string;
  readonly businessDate: BusinessDate;
  /** `GD-14` — km THUC TE, nhap tay. `null` = CHUA BIET, khong phai 0. */
  readonly distanceKm: number | null;
  /**
   * KM DU KIEN luc lap ke hoach — `RunLeg.plannedDistanceKm` cua Lane L (#276).
   *
   * `#278` N5 doi *"planned route vs actual/matched route visually distinguishable"*. Duong VE cua
   * tuyen du kien van chua co (`NO_ROUTE_PROVIDER`), nhung con SO du kien thi Lane L da dua vao —
   * nen bao cao dat hai con so canh nhau va de nguoi doc tu thay do lech.
   *
   * KHONG tinh san hieu so o day: mot chang co ke hoach 100km ma thuc te `null` thi hieu so la
   * KHONG BIET, khong phai `-100`. Tang doc cua man hinh xu ly cho do.
   */
  readonly plannedDistanceKm: number | null;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  /** `null` khi khong co nguon moc hoac chang chua co moc nao. */
  readonly phase: RunLegPhase | null;
}

/**
 * HINH HOC cua mot chang — TACH KHOI `JourneyLegView`, va do la mot ranh gioi QUYEN.
 *
 * ===========================================================================
 * VI SAO TOA DO KHONG DUOC NAM CUNG BAO CAO.
 *
 * Toa do o day den tu `TransportLocationObservation`. Tren `main` hom nay, DUY NHAT
 * `transport.location.history.read` mo duoc du lieu do ra ngoai (`GET /transport/tracking/
 * sessions/:id/track`), va ma do nam trong `ACCOUNTING_DENIED` — ke toan KHONG duoc xem lich su vi
 * tri. Moi be mat khac cua `transport-proof` deu co y cat toa do di: `OperationalProofView` chi tra
 * ve `geofenceVerdict` va khoang cach toi hang rao gan nhat, khong tra ve mot cap so nao.
 *
 * Nen neu bao cao vong chay mang theo toa do duoi ma `transport.run.read`, thi mot tranche ban do
 * vua am tham cap cho ke toan mot quyen ma ma tran vai da tu choi ho — va khong mot bai kiem nao
 * cua auth thay dieu do, vi khong dong nao trong `transport-actions.ts` bi sua.
 *
 * Cach chan la CAU TRUC: hai kieu, hai tuyen, hai ma quyen. Ai chi co `transport.run.read` van doc
 * duoc chang, km co hang/rong, ma don va dong thoi gian — mot bao cao that, chi khong co ban do.
 */
export interface JourneyLegGeometryView {
  readonly legId: string;
  readonly sequence: number;
  /** LAP LAI o day de ban do to duoc chang rong mau do ma khong phai ghep hai lan doc. */
  readonly kind: RunLegKind;
  readonly origin: JourneyPoint | null;
  readonly originGap: JourneyGeometryGap | null;
  readonly destination: JourneyPoint | null;
  readonly destinationGap: JourneyGeometryGap | null;
  readonly paths: readonly JourneyPath[];
}

/* ------------------------------------------------------------------ *
 * DONG THOI GIAN
 * ------------------------------------------------------------------ */

export const JOURNEY_EVENT_KINDS = ['CHECKPOINT', 'FUEL'] as const;
export type JourneyEventKind = (typeof JOURNEY_EVENT_KINDS)[number];

/**
 * MOT SU KIEN doc duoc tren dong thoi gian.
 *
 * KHONG mot cau tieng Viet nao — cung luat voi `control-tower.types.ts`. `code` la ma, va man hinh
 * dich no. Nhet cau chu vao day se lam mot nen tang da khach chi noi duoc mot thu tieng.
 */
export interface JourneyEvent {
  readonly kind: JourneyEventKind;
  /** `RunCheckpointType` voi moc; ma su kien nhien lieu voi dau. */
  readonly code: RunCheckpointType | 'FUEL_ENTRY';
  /** Gio MAY CHU. Dong thoi gian khong bao gio xep theo gio may khach (`#243` F7). */
  readonly at: string;
  readonly legId: string | null;
  readonly hasLocationProof: boolean;
  /** Ban ghi goc — de man hinh bam nguoc ve. */
  readonly subjectId: string;
}

/* ------------------------------------------------------------------ *
 * NGUON
 * ------------------------------------------------------------------ */

/**
 * NGUON NAM NGOAI `transport-core`. Cung luat cong bo voi `CONTROL_TOWER_SOURCES`.
 *
 * `transport-core` khong co mat: khong co vong chay thi khong co bao cao.
 */
export const JOURNEY_SOURCES = ['CHECKPOINT', 'LOCATION_PROOF', 'FUEL'] as const;
export type JourneySource = (typeof JOURNEY_SOURCES)[number];

/* ------------------------------------------------------------------ *
 * KHUNG NHIN
 * ------------------------------------------------------------------ */

export interface JourneyRunView {
  readonly runId: string;
  /** MA vong chay — dinh danh nghiep vu, thu duy nhat duoc phep dat len dia chi. */
  readonly runCode: string;
  readonly vehicleId: string;
  readonly vehiclePlate: string | null;
  readonly status: VehicleRunStatus;
  readonly businessDate: BusinessDate;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly driverId: string | null;
}

export interface RunJourneyView {
  readonly run: JourneyRunView;
  /**
   * KM CO HANG / RONG / TONG — doc NGUYEN VEN tu `summariseRunDistance()`.
   *
   * Tinh lai o day se cho ra mot con so thu hai cho cung cau hoi, va tang nay khong co quyen tra
   * loi cau do. `@turf` cua man hinh cang khong: no do do dai mot duong VE, khong do quang duong xe
   * da chay.
   */
  readonly distance: RunDistanceSummary;
  readonly orderCodes: readonly string[];
  readonly legs: readonly JourneyLegView[];
  readonly timeline: readonly JourneyEvent[];
  readonly unavailableSources: readonly JourneySource[];
}

/**
 * BAN DO cua mot vong chay — tuyen RIENG, ma quyen RIENG.
 *
 * Xem khoi chu thich cua `JourneyLegGeometryView`. Khung nhin nay CO TOA DO, nen no di sau
 * `transport.location.history.read` chu khong sau `transport.run.read`.
 */
export interface RunJourneyMapView {
  readonly runId: string;
  readonly runCode: string;
  readonly legs: readonly JourneyLegGeometryView[];
  readonly unavailableSources: readonly JourneySource[];
}
