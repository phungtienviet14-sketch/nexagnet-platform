import { reasonText } from '../../../i18n/reasons';
import { useOutbox } from '../../../outbox/OutboxProvider';
import { Notice } from '../../../ui/Notice';
import { NO_FIX_SUFFIX } from '../field-commands';
import { SEND_STAGE_TEXT, sendStage, type QueueEntry } from '../pending-actions';
import type { QueuedFlash as Flash } from '../use-field-actions';

/**
 * XAC NHAN NGAY DUOI NUT vua bam: "Đã lưu — sẽ gửi khi có sóng" / "Đang gửi…" / "Đã gửi" — doc tu
 * CHINH hang doi, khong doan. Moc khong kem vi tri noi them gio cua no la gio may chu nhan.
 */
export function QueuedFlash({
  flash,
  entries,
  sentIds,
}: {
  readonly flash: Flash;
  readonly entries: readonly QueueEntry[];
  readonly sentIds: ReadonlySet<string>;
}) {
  const { online } = useOutbox();
  const stage = sendStage({ clientEventId: flash.clientEventId, entries, sentIds, online });
  // Nhan cua moc khong kem vi tri DA mang cau "không kèm vị trí — ..." (dong bang luc bam); o day chi
  // them LY DO khong lay duoc vi tri, neu co.
  const extra =
    flash.withoutLocation && !flash.label.includes(NO_FIX_SUFFIX)
      ? `Mốc ${NO_FIX_SUFFIX}.`
      : flash.locationNote;
  if (stage.kind === 'BLOCKED') {
    return (
      <Notice
        tone="danger"
        icon="alert-octagon-outline"
        title={`${flash.label}: máy chủ không nhận`}
        detail={reasonText(stage.reason)}
        testID="driver-flash"
      />
    );
  }
  return (
    <Notice
      tone={stage.kind === 'SENT' ? 'live' : stage.kind === 'SENDING' ? 'pending' : 'neutral'}
      icon={
        stage.kind === 'SENT'
          ? 'cloud-check-outline'
          : stage.kind === 'SENDING'
            ? 'cloud-upload-outline'
            : 'content-save-outline'
      }
      title={SEND_STAGE_TEXT[stage.kind]}
      detail={extra ? `${flash.label}. ${extra}` : flash.label}
      testID="driver-flash"
    />
  );
}
