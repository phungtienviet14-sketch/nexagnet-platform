import { useState, type ReactNode } from 'react';
import { useCapture, type CaptureChoice } from '../../capture/use-capture';
import { useOutbox } from '../../outbox/OutboxProvider';
import { HandoverSheet, NoteSheet, WaitingSheet } from './components/ActionSheets';
import { CaptureChoiceSheet } from './components/CaptureChoiceSheet';
import { LocatingOverlay } from './components/LocatingOverlay';
import { waitingGate } from './field-commands';
import type { FieldLegCard } from './field-work';
import { WAITING_BLOCKED_BY_ARRIVAL } from './labels';
import { arrivalStillQueued, type QueueEntry } from './pending-actions';
import type { DriverFieldAction, WaitingReason } from './types';
import { useFieldActions } from './use-field-actions';

type OpenSheet = {
  readonly kind: 'NOTE' | 'WAITING' | 'CAPTURE' | 'HANDOVER';
  readonly card: FieldLegCard;
  readonly action: DriverFieldAction;
} | null;

/**
 * LUONG BAM tren man "Việc" — noi MOT nut voi DUNG to truot cua no:
 *   moc         -> lay vi tri (toan man) -> xep hang
 *   bat dau cho -> chon ly do            -> xep hang (chi khi may chu DA co moc den noi)
 *   chung tu    -> ba lua chon that tha  -> chuan hoa + chep vao may -> xep hang kem tep
 *   bien nhan   -> xac nhan              -> xep hang
 * Moi hop chon cua he thong (may anh, thu vien, tep) chi mo SAU KHI to truot da dong: tren iOS mot
 * hop chon mo de len mot Modal dang hien co the khong bao gio hien ra.
 */
export function useFieldFlow(entries: readonly QueueEntry[]) {
  const actions = useFieldActions();
  const capture = useCapture();
  const { online } = useOutbox();
  const [sheet, setSheet] = useState<OpenSheet>(null);
  const [capturing, setCapturing] = useState(false);

  function act(card: FieldLegCard, action: DriverFieldAction) {
    actions.setFailure(null);
    switch (action.kind) {
      case 'CHECKPOINT':
        void actions.recordCheckpoint(card, action, null);
        return;
      case 'WAITING_START': {
        const gate = waitingGate(card, arrivalStillQueued(entries, card.legId));
        if (gate.kind === 'READY') setSheet({ kind: 'WAITING', card, action });
        else actions.setFailure(WAITING_BLOCKED_BY_ARRIVAL);
        return;
      }
      case 'DOCUMENT':
        setSheet({ kind: 'CAPTURE', card, action });
        return;
      case 'RECEIPT_HANDOVER':
        setSheet({ kind: 'HANDOVER', card, action });
        return;
    }
  }

  function actWithNote(card: FieldLegCard, action: DriverFieldAction) {
    if (action.kind === 'CHECKPOINT') setSheet({ kind: 'NOTE', card, action });
    else act(card, action);
  }

  async function choose(choice: CaptureChoice) {
    const current = sheet;
    if (current?.kind !== 'CAPTURE') return;
    setSheet(null);
    setCapturing(true);
    try {
      const outcome = await capture(choice);
      if (outcome.kind === 'OK')
        await actions.recordDocument(current.card, current.action, outcome.file);
      else if (outcome.kind !== 'CANCELLED') actions.setFailure(outcome.message);
    } finally {
      setCapturing(false);
    }
  }

  function startWaiting(reason: WaitingReason, note: string) {
    const current = sheet;
    if (current?.kind !== 'WAITING') return;
    const gate = waitingGate(current.card, arrivalStillQueued(entries, current.card.legId));
    setSheet(null);
    if (gate.kind !== 'READY') {
      actions.setFailure(WAITING_BLOCKED_BY_ARRIVAL);
      return;
    }
    void actions.startWaiting(current.card, gate.arrivalCheckpointId, reason, note);
  }

  const close = () => setSheet(null);
  const sheets: ReactNode = (
    <>
      <LocatingOverlay
        state={actions.locating}
        onCancel={actions.cancelLocating}
        onSkip={() => void actions.skipLocation()}
      />
      <NoteSheet
        visible={sheet?.kind === 'NOTE'}
        actionLabel={sheet?.action.label ?? ''}
        onClose={close}
        onSubmit={(note) => {
          const current = sheet;
          setSheet(null);
          if (current) void actions.recordCheckpoint(current.card, current.action, note);
        }}
      />
      <WaitingSheet
        visible={sheet?.kind === 'WAITING'}
        online={online}
        busy={actions.saving}
        onClose={close}
        onSubmit={startWaiting}
      />
      <CaptureChoiceSheet
        visible={sheet?.kind === 'CAPTURE'}
        title={sheet?.action.label ?? 'Chụp chứng từ'}
        busy={capturing}
        failure={null}
        onClose={close}
        onChoose={(choice) => void choose(choice)}
      />
      <HandoverSheet
        visible={sheet?.kind === 'HANDOVER'}
        busy={actions.saving}
        onClose={close}
        onConfirm={() => {
          const current = sheet;
          setSheet(null);
          if (current) void actions.recordHandover(current.card, current.action);
        }}
      />
    </>
  );

  return {
    ...actions,
    busy: actions.saving || capturing || actions.locating !== null,
    act,
    actWithNote,
    sheets,
  };
}
