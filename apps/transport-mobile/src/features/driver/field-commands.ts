import type {
  CheckpointAction,
  DocumentAction,
  FrozenFix,
  ReceiptHandoverAction,
  WaitingStartAction,
} from '../../outbox/field-actions';
import { RECEIPT_HANDOVER_NOTE } from './labels';
import type { FieldLegCard } from './field-work';
import type { DriverFieldAction, WaitingReason } from './types';

/**
 * LENH XEP HANG cho tung loai nut — ham THUAN: cung dau vao, cung than lenh.
 *
 * Than lenh la thu duoc DONG BANG vao hang doi va gui lai y het sau 4 tieng mat song; nen no phai
 * dung duoc o day, co test, thay vi rai trong mot `onPress`.
 */

/**
 * CHINH SACH VI TRI cua mot moc.
 *
 *   REQUIRED    — may chu doi ban dinh vi (`requiresLocation`). Khong co vi tri -> KHONG xep hang,
 *                 va noi "moc chua duoc ghi".
 *   BEST_EFFORT — khong bat buoc, nhung ban dinh vi la DAU THOI GIAN DUY NHAT cua thiet bi ma moc
 *                 nhan duoc (`checkpoint.service.ts:279` chep `capturedAt` tu quan sat). Khong co no
 *                 thi may chu dong dau `receivedAt` LUC GUI — mot moc "Đã tới điểm lấy hàng" xep
 *                 hang luc 5 gio sang co the mang gio 9 gio. Nen van thu lay, trong thoi han ngan,
 *                 va noi that khi khong co.
 */
export type LocationPolicy = 'REQUIRED' | 'BEST_EFFORT';

export function locationPolicyFor(action: DriverFieldAction): LocationPolicy {
  return action.requiresLocation ? 'REQUIRED' : 'BEST_EFFORT';
}

/** Thoi han lay vi tri "co thi tot" — qua han thi xep hang khong kem vi tri, khong chan lai xe. */
export const BEST_EFFORT_FIX_TIMEOUT_MS = 8_000;

export const NO_FIX_SUFFIX = 'không kèm vị trí — giờ tính theo lúc máy chủ nhận';

function where(card: FieldLegCard): string {
  return `${card.runCode} · chặng ${card.sequence}`;
}

export function checkpointCommand(input: {
  readonly card: FieldLegCard;
  readonly action: DriverFieldAction;
  readonly note: string | null;
  readonly fix: FrozenFix | null;
  /** Sinh MOT lan cho MOT ban dinh vi — mot quan sat chi lam chung cho mot moc. */
  readonly observationClientEventId: string;
}): CheckpointAction {
  const { card, action, fix } = input;
  if (!action.checkpointType) throw new Error('Nút này không phải một mốc.');
  if (action.requiresLocation && fix === null) {
    throw new Error('Mốc này bắt buộc kèm vị trí — mốc chưa được ghi.');
  }
  const note = input.note?.trim() ?? '';
  const base = `${action.label} · ${where(card)}`;
  return {
    type: 'CHECKPOINT',
    label: fix === null ? `${base} (${NO_FIX_SUFFIX})` : base,
    runId: card.runId,
    legId: card.legId,
    checkpointType: action.checkpointType,
    note: note === '' ? null : note.slice(0, 2000),
    location:
      fix === null ? null : { fix, observationClientEventId: input.observationClientEventId },
  };
}

/** Dau thoi gian cua muc hang doi: gio LAY VI TRI neu co, khong thi gio bam. */
export function capturedAtFor(fix: FrozenFix | null, now: Date): string {
  return fix?.capturedAt ?? now.toISOString();
}

export type WaitingGate =
  | { readonly kind: 'READY'; readonly arrivalCheckpointId: string }
  | { readonly kind: 'ARRIVAL_QUEUED' }
  | { readonly kind: 'ARRIVAL_MISSING' };

/** `Bắt đầu chờ` chi bam duoc khi may chu DA co moc den noi (co `arrivalCheckpointId`). */
export function waitingGate(card: FieldLegCard, arrivalQueued: boolean): WaitingGate {
  if (arrivalQueued) return { kind: 'ARRIVAL_QUEUED' };
  if (card.arrivalCheckpointId === null) return { kind: 'ARRIVAL_MISSING' };
  return { kind: 'READY', arrivalCheckpointId: card.arrivalCheckpointId };
}

export function waitingCommand(input: {
  readonly card: FieldLegCard;
  readonly arrivalCheckpointId: string;
  readonly reason: WaitingReason;
  readonly note: string | null;
}): WaitingStartAction {
  const note = input.note?.trim() ?? '';
  return {
    type: 'WAITING_START',
    label: `Bắt đầu chờ · ${where(input.card)}`,
    runId: input.card.runId,
    legId: input.card.legId,
    arrivalCheckpointId: input.arrivalCheckpointId,
    reason: input.reason,
    note: note === '' ? null : note.slice(0, 2000),
  };
}

export function documentCommand(input: {
  readonly card: FieldLegCard;
  readonly action: DriverFieldAction;
  readonly captureMode: DocumentAction['captureMode'];
}): DocumentAction {
  const { card, action } = input;
  if (!action.documentType) throw new Error('Nút này không phải một chứng từ.');
  return {
    type: 'DOCUMENT',
    label: `${action.label} · ${where(card)}`,
    runId: card.runId,
    legId: card.legId,
    checkpointId: null,
    documentType: action.documentType,
    documentLabel: null,
    captureMode: input.captureMode,
  };
}

export function handoverCommand(card: FieldLegCard): ReceiptHandoverAction {
  if (card.orderId === null) throw new Error('Chặng này không mang đơn nào để giữ biên nhận.');
  return {
    type: 'RECEIPT_HANDOVER',
    label: `Đang giữ biên nhận · ${where(card)}`,
    orderId: card.orderId,
    legId: card.legId,
    externalNote: RECEIPT_HANDOVER_NOTE,
  };
}

/**
 * KHOA CHONG LAP cua MOT lan bam logic — sinh mot lan, giu qua moi lan bam lai cho toi khi viec da
 * nam trong hang doi. Bam doi -> cung khoa -> kho hang doi tra lai muc cu, khong them hang.
 */
export class TapKeys {
  private readonly keys = new Map<string, string>();

  constructor(private readonly newId: () => string) {}

  keyFor(slot: string): string {
    const existing = this.keys.get(slot);
    if (existing) return existing;
    const created = this.newId();
    this.keys.set(slot, created);
    return created;
  }

  /** Viec DA vao hang doi: lan bam sau (vd `Đang xếp hàng` lap lai) la mot su kien moi. */
  release(slot: string): void {
    this.keys.delete(slot);
  }
}
