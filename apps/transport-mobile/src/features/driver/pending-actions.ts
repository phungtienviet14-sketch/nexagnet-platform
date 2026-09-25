import type { DriverFieldAction } from './types';

/**
 * VIEC DA LUU TREN MAY nhung may chu chua thay — noi voi tung nut de lai xe khong bam lan hai.
 *
 * `nextActions` la cau tra loi CUA MAY CHU tai lan doc cuoi. Mot moc vua xep hang luc mat song thi
 * may chu chua biet, nen nut do VAN nam trong danh sach — va mot lai xe khong thay gi thay doi se
 * bam lai. Tep nay doi chieu hang doi voi tung nut: cung chang + cung loai moc/chung tu.
 *
 * Doc payload DA DONG BANG cua hang doi (`FieldAction` cua `outbox/field-actions.ts`), khong suy gi
 * them: mot muc hong dang thi bo qua, khong doan.
 */
export interface QueueEntry {
  readonly clientEventId: string;
  readonly state: 'PENDING' | 'BLOCKED';
  readonly lastError: string | null;
  readonly capturedAt: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export type LocalActionState =
  | { readonly kind: 'QUEUED'; readonly entry: QueueEntry }
  | { readonly kind: 'BLOCKED'; readonly entry: QueueEntry };

function text(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

/** Muc hang doi nay co PHAI la lan bam cua nut `action` tren chang `legId` khong. */
export function matchesAction(
  entry: QueueEntry,
  legId: string,
  orderId: string | null,
  action: DriverFieldAction,
): boolean {
  const payload = entry.payload;
  if (text(payload.type) !== action.kind) return false;
  const entryLeg = text(payload.legId);
  switch (action.kind) {
    case 'CHECKPOINT':
      return entryLeg === legId && text(payload.checkpointType) === action.checkpointType;
    case 'DOCUMENT':
      return entryLeg === legId && text(payload.documentType) === action.documentType;
    case 'WAITING_START':
      return entryLeg === legId;
    case 'RECEIPT_HANDOVER':
      return entryLeg === legId || (orderId !== null && text(payload.orderId) === orderId);
  }
}

/**
 * Trang thai cuc bo cua MOT nut. `BLOCKED` thang `QUEUED`: mot muc bi may chu tu choi can nguoi
 * xem, con muc dang cho se tu gui.
 */
export function localStateFor(
  entries: readonly QueueEntry[],
  legId: string,
  orderId: string | null,
  action: DriverFieldAction,
): LocalActionState | null {
  const matching = entries.filter((entry) => matchesAction(entry, legId, orderId, action));
  const blocked = matching.find((entry) => entry.state === 'BLOCKED');
  if (blocked) return { kind: 'BLOCKED', entry: blocked };
  const queued = matching.find((entry) => entry.state === 'PENDING');
  return queued ? { kind: 'QUEUED', entry: queued } : null;
}

/**
 * Moc `Đã đến nơi` cua chang nay con NAM TREN MAY (chua len may chu).
 *
 * `Bắt đầu chờ` can `arrivalCheckpointId` — ma chi CO sau khi may chu nhan moc den noi. Nen khi moc
 * do con trong hang doi, man hinh noi thang "gui xong moi bat dau cho duoc" thay vi bay mot nut se
 * bi tu choi (`WAITING_ARRIVAL_NOT_FOUND`).
 */
export function arrivalStillQueued(entries: readonly QueueEntry[], legId: string): boolean {
  return entries.some(
    (entry) =>
      text(entry.payload.type) === 'CHECKPOINT' &&
      text(entry.payload.legId) === legId &&
      text(entry.payload.checkpointType) === 'DELIVERY_ARRIVAL',
  );
}

/** Moi muc PROOF cua mot chang (de hien "Đã lưu trên máy — chờ gửi" ca voi nut da bien mat). */
export function entriesForLeg(
  entries: readonly QueueEntry[],
  legId: string,
): readonly QueueEntry[] {
  return entries.filter((entry) => text(entry.payload.legId) === legId);
}

/** Nhan cua mot muc hang doi — dung chuoi da dong bang luc bam. */
export function entryLabel(entry: QueueEntry): string {
  return text(entry.payload.label) ?? 'Việc hiện trường';
}

/**
 * CHIA nut cua chang dang lam thanh: nut chinh (viec ke tiep CHUA xep hang), va cac nut con lai.
 *
 * Viec ke tiep la nut DAU TIEN may chu tra ma chua nam trong hang doi. Mot nut da xep hang thi
 * khong con la "viec ke tiep" — no la mot viec dang cho song.
 */
export function splitActions(
  actions: readonly DriverFieldAction[],
  entries: readonly QueueEntry[],
  legId: string,
  orderId: string | null,
): { readonly hero: DriverFieldAction | null; readonly rest: readonly DriverFieldAction[] } {
  const hero =
    actions.find((action) => localStateFor(entries, legId, orderId, action) === null) ?? null;
  return { hero, rest: actions.filter((action) => action !== hero) };
}

/**
 * XAC NHAN NGAY SAU KHI BAM — noi that viec vua bam dang o dau.
 *
 * Thu tu tra loi: bi tu choi -> con tren may -> DA LEN (co trong so da gui) -> chua thay o dau ca
 * (vua xep hang, danh sach chua kip doc lai) thi noi nhu con tren may, KHONG noi "da gui".
 */
export type SendStage =
  | { readonly kind: 'BLOCKED'; readonly reason: string | null }
  | { readonly kind: 'SAVED_OFFLINE' }
  | { readonly kind: 'SENDING' }
  | { readonly kind: 'SENT' };

export function sendStage(input: {
  readonly clientEventId: string;
  readonly entries: readonly QueueEntry[];
  readonly sentIds: ReadonlySet<string>;
  readonly online: boolean;
}): SendStage {
  const entry = input.entries.find((candidate) => candidate.clientEventId === input.clientEventId);
  if (entry?.state === 'BLOCKED') return { kind: 'BLOCKED', reason: entry.lastError };
  if (!entry && input.sentIds.has(input.clientEventId)) return { kind: 'SENT' };
  return input.online ? { kind: 'SENDING' } : { kind: 'SAVED_OFFLINE' };
}

export const SEND_STAGE_TEXT: Readonly<Record<Exclude<SendStage['kind'], 'BLOCKED'>, string>> = {
  SAVED_OFFLINE: 'Đã lưu — sẽ gửi khi có sóng',
  SENDING: 'Đang gửi…',
  SENT: 'Đã gửi',
};
