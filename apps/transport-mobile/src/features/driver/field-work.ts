import { formatDuration } from '../../format';
import { DOCUMENT_LABEL, HANDOVER_LABEL, PHASE_LABEL } from './labels';
import type { DriverFieldAction, DriverFieldLeg, DriverFieldWork, RunLegPhase } from './types';

/**
 * MO HINH man "Việc" — port THUAN cua web `workspace/driver-field.ts` + `driver.ts` (`#279` O9,
 * `#340`).
 *
 * MAY CHU da tinh `nextActions`. Tep nay KHONG tinh lai luat moc: no chi chon CHANG nao hien truoc
 * va gap chuoi de doc. Tinh lai o day se cho ra hai ban luat, va ban tren dien thoai se cu di sau
 * moi lan luat doi — trieu chung la mot nut bam vao thi bao loi.
 */
export interface FieldLegCard {
  readonly legId: string;
  readonly runId: string;
  readonly runCode: string;
  readonly sequence: number;
  readonly title: string;
  readonly route: string;
  readonly originLabel: string;
  readonly destinationLabel: string;
  readonly phase: RunLegPhase;
  readonly phaseLabel: string;
  readonly orderCode: string | null;
  readonly orderId: string | null;
  readonly isEmptyLeg: boolean;
  readonly capturedDocuments: readonly string[];
  readonly missingDocuments: readonly string[];
  readonly handoverLabel: string | null;
  readonly arrivalCheckpointId: string | null;
  readonly waiting: DriverFieldLeg['waiting'];
  readonly actions: readonly DriverFieldAction[];
  readonly leg: DriverFieldLeg;
}

export type FieldHomeKind = 'NO_WORK' | 'RUN_IDLE' | 'RUN_CURRENT';

export interface FieldScreenModel {
  readonly kind: FieldHomeKind;
  readonly headline: string;
  /** Chang DANG LAM — chang DAU TIEN con viec de bam. `null` khi khong con viec gi. */
  readonly current: FieldLegCard | null;
  /** Cac chang con lai, dung thu tu may chu tra. */
  readonly others: readonly FieldLegCard[];
  /** So VONG CHAY dang mo (khong phai so chang) — mot vong hai chang van la mot viec. */
  readonly openRunCount: number;
  readonly serverNow: string;
}

export function toFieldCard(leg: DriverFieldLeg, runId: string, runCode: string): FieldLegCard {
  return {
    legId: leg.legId,
    runId,
    runCode,
    sequence: leg.sequence,
    title: leg.kind === 'EMPTY' ? `Chặng ${leg.sequence} — chạy rỗng` : `Chặng ${leg.sequence}`,
    route: `${leg.originLabel} → ${leg.destinationLabel}`,
    originLabel: leg.originLabel,
    destinationLabel: leg.destinationLabel,
    phase: leg.phase,
    phaseLabel: PHASE_LABEL[leg.phase] ?? leg.phase,
    orderCode: leg.orderCode,
    orderId: leg.orderId,
    isEmptyLeg: leg.kind === 'EMPTY',
    capturedDocuments: leg.documents
      .filter((document) => document.status === 'ACTIVE')
      .map((document) => DOCUMENT_LABEL[document.type] ?? document.type),
    missingDocuments: leg.missingDocumentTypes.map((type) => DOCUMENT_LABEL[type] ?? type),
    handoverLabel: leg.receiptHandover === null ? null : HANDOVER_LABEL[leg.receiptHandover],
    arrivalCheckpointId: leg.arrivalCheckpointId,
    waiting: leg.waiting,
    actions: leg.nextActions,
    leg,
  };
}

/**
 * "Dau tien con viec" chu khong "chang co so thu tu nho nhat chua giao": mot chang da giao nhung
 * chua chup bien nhan VAN con viec — va do dung la thu lai xe phai lam tiep (web, nguyen luat).
 */
export function toFieldScreen(work: DriverFieldWork): FieldScreenModel {
  const cards = work.runs.flatMap((run) =>
    run.legs.map((leg) => toFieldCard(leg, run.runId, run.runCode)),
  );
  const current = cards.find((card) => card.actions.length > 0) ?? null;
  const others = cards.filter((card) => card.legId !== current?.legId);
  const openRunCount = new Set(cards.map((card) => card.runId)).size;

  if (cards.length === 0) {
    return {
      kind: 'NO_WORK',
      headline: 'Hiện chưa có việc nào được điều cho bạn.',
      current: null,
      others: [],
      openRunCount: 0,
      serverNow: work.serverNow,
    };
  }
  return {
    kind: current === null ? 'RUN_IDLE' : 'RUN_CURRENT',
    headline:
      current === null
        ? 'Đã làm xong mọi việc hiện trường của các chuyến đang chạy.'
        : `${current.runCode} — ${current.phaseLabel}`,
    current,
    others,
    openRunCount,
    serverNow: work.serverNow,
  };
}

/** Moi chang cua MOT vong chay, dung thu tu — cho man chi tiet vong chay. */
export function legsOfRun(work: DriverFieldWork, runId: string): readonly FieldLegCard[] {
  const run = work.runs.find((candidate) => candidate.runId === runId);
  if (!run) return [];
  return run.legs.map((leg) => toFieldCard(leg, run.runId, run.runCode));
}

/**
 * KHOA CUA MOT LAN BAM — cung dang web (`legId:kind:type|label`): hai nut khac nhau tren cung chang
 * khong bao gio dung chung mot khoa chong lap.
 */
export function actionSlot(legId: string, action: DriverFieldAction): string {
  const detail = action.checkpointType ?? action.documentType ?? action.label;
  return `${legId}:${action.kind}:${detail}`;
}

/**
 * DONG HO CHO dem tiep GIUA hai lan doc — CHI de hien thi.
 *
 * Goc la `elapsedSeconds` MAY CHU tinh luc tra loi; phan cong them la thoi gian troi tu LUC NHAN
 * phan hoi do (dong ho may nay chi do mot khoang, khong do moc). Mot dien thoai lech gio van dem
 * dung, vi hieu hai lan doc cung mot dong ho khong mang do lech.
 */
export function tickingWaitSeconds(
  elapsedSeconds: number,
  receivedAtMs: number,
  nowMs: number,
): number {
  if (!Number.isFinite(elapsedSeconds)) return 0;
  const drift = Number.isFinite(receivedAtMs) && nowMs > receivedAtMs ? nowMs - receivedAtMs : 0;
  return Math.max(0, Math.floor(elapsedSeconds + drift / 1000));
}

export function formatWaiting(seconds: number): string {
  return formatDuration(seconds);
}
