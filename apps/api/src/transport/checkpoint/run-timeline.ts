import {
  DEFAULT_CHECKPOINT_POLICY,
  isRunScoped,
  type CheckpointPolicy,
} from './checkpoint-lifecycle.js';
import {
  RUN_CHECKPOINT_TYPES,
  type RunCheckpoint,
  type RunCheckpointType,
} from './checkpoint.types.js';

/**
 * DONG THOI GIAN CUA MOT CHUYEN — `#243` F6. Ham THUAN.
 *
 * ============================================================================================
 * MOT PHEP CHIEU, KHONG PHAI MOT BANG THU HAI
 * ============================================================================================
 *
 * `#241` doi dashboard duoc dung *"from source records, not a separate truth store"*. Nen o day
 * khong co cache, khong co bang read-model, khong co cot `phase` ghi san o dau ca: dua vao mot
 * chuoi moc da ghi, tra ra mot dong thoi gian. Chay hai lan tren cung dau vao cho cung ket qua.
 *
 * ============================================================================================
 * `IN_TRANSIT` VA `WAITING` XUAT HIEN O DAY, VA CHI O DAY
 * ============================================================================================
 *
 * Hai trang thai do khong phai moc (xem `checkpoint.types.ts`). Chung la KHOANG, va khoang thi
 * duoc SUY RA luc doc:
 *
 *   · dang `IN_TRANSIT`  = da `PICKUP_DEPARTURE`, chua `DELIVERY_ARRIVAL`;
 *   · dang `ARRIVED`     = da `DELIVERY_ARRIVAL`, chua `DELIVERY_ACCEPTED`.
 *
 * Nho vay khong the co chuyen "cot trang thai noi dang chay ma moc cuoi cung la da giao xong".
 *
 * `#241` ve bang Kanban co MOT cot nua giua `arrived` va `delivered`: `waiting`. Cot do KHONG suy
 * ra duoc tu rieng chuoi moc — hai chang cung dung o `DELIVERY_ARRIVAL` thi mot chang co the dang
 * cho nguoi nhan con chang kia thi khong. No can phien cho cua F3, va se duoc them vao day khi
 * phien cho ton tai. Tra ve `WAITING` bay gio la doan, va mot cot Kanban doan sai la mot cuoc dien
 * thoai goi nham cho lai xe.
 */

/**
 * GIAI DOAN suy ra cua mot chang — nguon cho bang Kanban cua `#241`
 * (*"driven by checkpoint/read-model semantics rather than inventing a second state machine"*).
 */
export const RUN_LEG_PHASES = [
  'PLANNED',
  'AT_PICKUP',
  'LOADING',
  'IN_TRANSIT',
  'ARRIVED',
  'DELIVERED',
] as const;

export type RunLegPhase = (typeof RUN_LEG_PHASES)[number];

/**
 * Giai doan cua mot chang, doc TU DUOI LEN.
 *
 * Thu tu kiem di nguoc quy trinh co chu y: moc muon nhat thang. Doc xuoi tu tren xuong se lam mot
 * chang da giao xong bi bao la `AT_PICKUP` chi vi moc do van con nam trong danh sach — moc la
 * GHI THEM, khong bao gio bi xoa di khi buoc sau xay ra.
 */
export function deriveLegPhase(types: readonly RunCheckpointType[]): RunLegPhase {
  if (types.includes('DELIVERY_ACCEPTED')) return 'DELIVERED';
  if (types.includes('DELIVERY_ARRIVAL')) return 'ARRIVED';
  if (types.includes('PICKUP_DEPARTURE')) return 'IN_TRANSIT';
  if (types.includes('LOADING')) return 'LOADING';
  if (types.includes('PICKUP_ARRIVAL') || types.includes('GATE_ENTRY')) return 'AT_PICKUP';
  return 'PLANNED';
}

/**
 * CANH BAO tren mot dong — `#243` F6 doi *"missing-document/proof warnings without silently
 * fabricating completion"*.
 *
 * Canh bao KHONG chan gi ca. Mot moc thieu chung cu van duoc ghi va van hien tren dong thoi gian;
 * cai khac la no hien kem mot ma doc duoc. Chan o day thay vi canh bao se lam lai xe mat luon
 * kha nang ghi moc that khi song yeu — va mot dong thoi gian trong con te hon mot dong co canh bao.
 */
export const TIMELINE_WARNINGS = [
  /** Loai moc nay le ra co vi tri theo chinh sach, nhung ban ghi khong tro toi ban dinh vi nao. */
  'LOCATION_PROOF_MISSING',
] as const;

export type TimelineWarning = (typeof TIMELINE_WARNINGS)[number];

/**
 * Vi tri cua mot loai moc trong quy trinh, dung DUNG thu tu khai bao o `RUN_CHECKPOINT_TYPES`.
 *
 * Chi dung de PHA HOA khi hai moc cung mot mili giay — khong phai de cuong che thu tu. Cuong che
 * thu tu la viec cua `checkpoint-lifecycle.ts`, va o do `GATE_ENTRY`/`LOADING` co y khong xep
 * truoc-sau nhau.
 */
const workflowRank = (type: RunCheckpointType): number => RUN_CHECKPOINT_TYPES.indexOf(type);

export interface RunTimelineEntry {
  readonly checkpointId: string;
  readonly at: Date;
  readonly type: RunCheckpointType;
  readonly legId: string | null;
  readonly recordedBy: string;
  readonly driverId: string | null;
  /** Co tro toi mot ban dinh vi cua Lane B khong. KHONG kem toa do — xem `transport-actions.ts`. */
  readonly hasLocationProof: boolean;
  readonly note: string | null;
  readonly warnings: readonly TimelineWarning[];
}

export interface RunTimeline {
  readonly runId: string;
  readonly entries: readonly RunTimelineEntry[];
  /** Giai doan hien tai cua tung chang, khoa la `legId`. */
  readonly legPhases: Readonly<Record<string, RunLegPhase>>;
  readonly warningCount: number;
}

/**
 * Dung dong thoi gian tu chuoi moc.
 *
 * `receivedAt` la truc sap xep, KHONG phai `capturedAt`. Gio may khach la mot con so do thiet bi
 * cua nguoi dung khai bao, va bai `F7` doi rang mot chiec dien thoai bi van nguoc dong ho khong
 * duoc xe dich lich su. Gio may chu thi mot lai xe khong cham vao duoc.
 */
export function buildRunTimeline(
  runId: string,
  checkpoints: readonly RunCheckpoint[],
  policy: CheckpointPolicy = DEFAULT_CHECKPOINT_POLICY,
): RunTimeline {
  const ordered = [...checkpoints].sort((left, right) => {
    const byTime = left.receivedAt.getTime() - right.receivedAt.getTime();
    if (byTime !== 0) return byTime;
    // HAI MOC CUNG MOT MILI GIAY. Xep theo VI TRI TRONG QUY TRINH, khong theo `id`.
    //
    // `id` la `cuid`/`uuid` — xep theo no thi hai moc cung luc ra thu tu tuy tien, va mot chuyen
    // hien "den noi giao" TREN "duoc giao viec" trong khi ca hai deu dung. Vi tri quy trinh thi
    // vua tat dinh vua doc duoc: cai le ra xay ra truoc thi hien truoc.
    const byWorkflow = workflowRank(left.type) - workflowRank(right.type);
    // Cung loai, cung mili giay (vd hai lan `LOADING`): luc nay `id` chi con la day cuoi de hai
    // lan doc khong doi cho nhau.
    return byWorkflow !== 0 ? byWorkflow : left.id.localeCompare(right.id);
  });

  const entries = ordered.map((checkpoint): RunTimelineEntry => {
    const warnings: TimelineWarning[] = [];
    if (
      policy.locationRequiredTypes.includes(checkpoint.type) &&
      checkpoint.observationId === null
    ) {
      warnings.push('LOCATION_PROOF_MISSING');
    }
    return {
      checkpointId: checkpoint.id,
      at: checkpoint.receivedAt,
      type: checkpoint.type,
      legId: checkpoint.legId,
      recordedBy: checkpoint.recordedBy,
      driverId: checkpoint.driverId,
      hasLocationProof: checkpoint.observationId !== null,
      note: checkpoint.note,
      warnings,
    };
  });

  const byLeg = new Map<string, RunCheckpointType[]>();
  for (const checkpoint of ordered) {
    if (isRunScoped(checkpoint.type) || checkpoint.legId === null) continue;
    const bucket = byLeg.get(checkpoint.legId) ?? [];
    bucket.push(checkpoint.type);
    byLeg.set(checkpoint.legId, bucket);
  }

  const legPhases: Record<string, RunLegPhase> = {};
  for (const [legId, types] of byLeg) legPhases[legId] = deriveLegPhase(types);

  return {
    runId,
    entries,
    legPhases,
    warningCount: entries.reduce((total, entry) => total + entry.warnings.length, 0),
  };
}
