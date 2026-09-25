import { randomUUID } from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { userMessage } from '../../api/errors';
import type { PickedFile } from '../../capture/pickers';
import { persistAttachment } from '../../outbox/attachments';
import type { FieldAction, FrozenFix } from '../../outbox/field-actions';
import { useOutbox, type EnqueueOptions } from '../../outbox/OutboxProvider';
import {
  BEST_EFFORT_FIX_TIMEOUT_MS,
  TapKeys,
  capturedAtFor,
  checkpointCommand,
  documentCommand,
  handoverCommand,
  waitingCommand,
} from './field-commands';
import { captureFixWithin } from './fix-capture';
import { actionSlot, type FieldLegCard } from './field-work';
import type { DriverFieldAction, WaitingReason } from './types';

/**
 * CAC LUONG BAM cua man "Việc" — mot noi giu khoa chong lap, trang thai lay vi tri, va xac nhan.
 *
 * Moi lan bam logic co MOT `clientEventId` (giu trong `TapKeys` toi khi viec nam trong hang doi):
 * bam doi, xoay man, bam lai sau loi — cung khoa, kho hang doi tra muc cu. Moi ban dinh vi co ma
 * quan sat RIENG: mot quan sat chi lam chung cho mot moc (`CHECKPOINT_OBSERVATION_ALREADY_USED`).
 */
export interface LocatingState {
  readonly label: string;
  readonly required: boolean;
}

export interface QueuedFlash {
  readonly clientEventId: string;
  readonly label: string;
  /** Moc xep hang KHONG kem vi tri — gio cua no la gio may chu nhan. */
  readonly withoutLocation: boolean;
  readonly locationNote: string | null;
}

interface PendingTap {
  readonly card: FieldLegCard;
  readonly action: DriverFieldAction;
  readonly note: string | null;
  readonly slot: string;
  readonly key: string;
}

export function useFieldActions() {
  const { enqueue } = useOutbox();
  const keysRef = useRef<TapKeys | null>(null);
  const keys = useCallback((): TapKeys => (keysRef.current ??= new TapKeys(randomUUID)), []);
  const generation = useRef(0);
  const pendingTap = useRef<PendingTap | null>(null);
  const [locating, setLocating] = useState<LocatingState | null>(null);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [flash, setFlash] = useState<QueuedFlash | null>(null);

  const queue = useCallback(
    async (
      slot: string,
      command: FieldAction,
      options: EnqueueOptions,
      extra: Pick<QueuedFlash, 'withoutLocation' | 'locationNote'>,
    ): Promise<boolean> => {
      setSaving(true);
      try {
        const item = await enqueue(command, options);
        keys().release(slot);
        if (Platform.OS !== 'web') {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        setFlash({ clientEventId: item.clientEventId, label: command.label, ...extra });
        return true;
      } catch (error) {
        setFailure(userMessage(error));
        return false;
      } finally {
        setSaving(false);
      }
    },
    [enqueue, keys],
  );

  const finishCheckpoint = useCallback(
    (tap: PendingTap, fix: FrozenFix | null, locationNote: string | null) =>
      queue(
        tap.slot,
        checkpointCommand({
          card: tap.card,
          action: tap.action,
          note: tap.note,
          fix,
          observationClientEventId: randomUUID(),
        }),
        { clientEventId: tap.key, capturedAt: capturedAtFor(fix, new Date()) },
        { withoutLocation: fix === null, locationNote },
      ),
    [queue],
  );

  /** Bam mot MOC: luon thu lay vi tri; moc bat buoc thi khong co vi tri = khong ghi. */
  const recordCheckpoint = useCallback(
    async (card: FieldLegCard, action: DriverFieldAction, note: string | null) => {
      const slot = actionSlot(card.legId, action);
      const tap: PendingTap = { card, action, note, slot, key: keys().keyFor(slot) };
      pendingTap.current = tap;
      const token = ++generation.current;
      setFailure(null);
      setFlash(null);
      setLocating({ label: action.label, required: action.requiresLocation });
      const outcome = await captureFixWithin(
        action.requiresLocation ? null : BEST_EFFORT_FIX_TIMEOUT_MS,
      );
      if (token !== generation.current) return; // da huy hoac da chon "ghi khong kem vi tri"
      pendingTap.current = null;
      setLocating(null);
      if (outcome.kind === 'OK') {
        await finishCheckpoint(tap, outcome.fix, null);
        return;
      }
      if (action.requiresLocation) {
        setFailure(outcome.message);
        return;
      }
      await finishCheckpoint(tap, null, outcome.message);
    },
    [finishCheckpoint, keys],
  );

  const cancelLocating = useCallback(() => {
    generation.current += 1;
    pendingTap.current = null;
    setLocating(null);
  }, []);

  /** Chi cho moc KHONG bat buoc vi tri: ghi ngay, noi that gio la gio may chu nhan. */
  const skipLocation = useCallback(async () => {
    const tap = pendingTap.current;
    if (!tap || tap.action.requiresLocation) return;
    generation.current += 1;
    pendingTap.current = null;
    setLocating(null);
    await finishCheckpoint(tap, null, null);
  }, [finishCheckpoint]);

  const startWaiting = useCallback(
    (
      card: FieldLegCard,
      arrivalCheckpointId: string,
      reason: WaitingReason,
      note: string | null,
    ) => {
      const slot = `${card.legId}:WAITING_START`;
      setFailure(null);
      return queue(
        slot,
        waitingCommand({ card, arrivalCheckpointId, reason, note }),
        { clientEventId: keys().keyFor(slot) },
        { withoutLocation: false, locationNote: null },
      );
    },
    [queue, keys],
  );

  const recordDocument = useCallback(
    async (card: FieldLegCard, action: DriverFieldAction, file: PickedFile) => {
      const slot = actionSlot(card.legId, action);
      setFailure(null);
      try {
        const attachment = await persistAttachment(file.uri, file.contentType, file.captureMode);
        return await queue(
          slot,
          documentCommand({ card, action, captureMode: file.captureMode }),
          { clientEventId: keys().keyFor(slot), attachments: [attachment] },
          { withoutLocation: false, locationNote: null },
        );
      } catch (error) {
        setFailure(`Chưa lưu được tệp trên máy: ${userMessage(error)}`);
        return false;
      }
    },
    [queue, keys],
  );

  const recordHandover = useCallback(
    (card: FieldLegCard, action: DriverFieldAction) => {
      const slot = actionSlot(card.legId, action);
      setFailure(null);
      try {
        return queue(
          slot,
          handoverCommand(card),
          { clientEventId: keys().keyFor(slot) },
          { withoutLocation: false, locationNote: null },
        );
      } catch (error) {
        setFailure(userMessage(error));
        return Promise.resolve(false);
      }
    },
    [queue, keys],
  );

  return {
    locating,
    saving,
    failure,
    flash,
    setFailure,
    dismissFlash: () => setFlash(null),
    recordCheckpoint,
    cancelLocating,
    skipLocation,
    startWaiting,
    recordDocument,
    recordHandover,
  };
}

export type FieldActions = ReturnType<typeof useFieldActions>;
