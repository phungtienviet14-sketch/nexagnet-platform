import { StyleSheet, View } from 'react-native';
import { useTheme } from '../../../theme/ThemeProvider';
import { SPACE } from '../../../theme/tokens';
import { Button } from '../../../ui/Button';
import { Notice } from '../../../ui/Notice';
import { Card, Pill } from '../../../ui/Surface';
import { Text } from '../../../ui/Text';
import { waitingGate } from '../field-commands';
import { actionSlot, type FieldLegCard } from '../field-work';
import { FIELD_TRUTH_NOTE, PHASE_TONE, WAITING_BLOCKED_BY_ARRIVAL } from '../labels';
import {
  arrivalStillQueued,
  localStateFor,
  splitActions,
  type QueueEntry,
} from '../pending-actions';
import type { DriverFieldAction } from '../types';
import { ActionRow, iconFor } from './ActionRow';
import { WaitingTimer } from './WaitingTimer';

/**
 * THE VIEC KE TIEP — "dong ho tren cabin": mot tuyen doc duoc trong mot lan liec, MOT nut ho phach
 * cho viec ke tiep, cac viec khac nho hon ben duoi. Moi thu tren the la cua MAY CHU (giai doan, nut,
 * thoi gian cho); the chi them TRANG THAI TREN MAY cua tung nut.
 */
export function NextActionCard({
  card,
  entries,
  busy,
  receivedAtMs,
  timeZone,
  onAct,
  onActWithNote,
  onOpenRun,
}: {
  readonly card: FieldLegCard;
  readonly entries: readonly QueueEntry[];
  readonly busy: boolean;
  readonly receivedAtMs: number;
  readonly timeZone: string;
  readonly onAct: (action: DriverFieldAction) => void;
  readonly onActWithNote: (action: DriverFieldAction) => void;
  readonly onOpenRun: () => void;
}) {
  const { hero, rest } = splitActions(card.actions, entries, card.legId, card.orderId);
  const arrivalQueued = arrivalStillQueued(entries, card.legId);
  const heroGate =
    hero?.kind === 'WAITING_START' ? waitingGate(card, arrivalQueued).kind : ('READY' as const);

  return (
    <Card rail="signal" testID="driver-current-leg">
      <View style={styles.head}>
        <Text variant="overline" tone="muted" style={styles.flex}>
          {card.runCode} · {card.title}
        </Text>
        <Pill label={card.phaseLabel} tone={PHASE_TONE[card.phase] ?? 'neutral'} />
      </View>

      <RouteLine origin={card.originLabel} destination={card.destinationLabel} />
      {card.orderCode ? (
        <Text variant="caption" tone="muted">
          Đơn {card.orderCode}
        </Text>
      ) : null}

      <View style={styles.stack}>
        {card.waiting ? (
          <WaitingTimer waiting={card.waiting} receivedAtMs={receivedAtMs} timeZone={timeZone} />
        ) : null}
        <DocumentFacts card={card} />

        {hero && heroGate === 'READY' ? (
          <Button
            kind="signal"
            size="hero"
            label={hero.requiresLocation ? `${hero.label} (cần vị trí)` : hero.label}
            icon={iconFor(hero)}
            disabled={busy}
            hint={hero.requiresLocation ? 'Ứng dụng sẽ lấy vị trí làm bằng chứng' : undefined}
            onPress={() => onAct(hero)}
            testID="driver-next-action"
          />
        ) : null}
        {hero && heroGate !== 'READY' ? (
          <Notice
            tone="pending"
            icon="cloud-upload-outline"
            title="Bắt đầu chờ"
            detail={WAITING_BLOCKED_BY_ARRIVAL}
          />
        ) : null}
        {!hero && arrivalQueued && card.phase !== 'DELIVERED' ? (
          <Notice
            tone="pending"
            icon="cloud-upload-outline"
            title="Bắt đầu chờ — chưa bấm được"
            detail={WAITING_BLOCKED_BY_ARRIVAL}
            testID="driver-waiting-held"
          />
        ) : null}
        {!hero ? (
          <Notice
            tone="pending"
            icon="cloud-upload-outline"
            title="Việc đã bấm đang nằm trên máy"
            detail="Khi gửi xong, hệ thống sẽ cho biết việc kế tiếp. Không cần bấm lại."
          />
        ) : null}
        {hero?.kind === 'CHECKPOINT' ? (
          <Button
            kind="ghost"
            size="compact"
            label="Bấm kèm ghi chú"
            icon="note-edit-outline"
            disabled={busy}
            onPress={() => onActWithNote(hero)}
            testID="driver-next-action-note"
          />
        ) : null}

        {rest.map((action) => (
          <ActionRow
            key={actionSlot(card.legId, action)}
            action={action}
            local={localStateFor(entries, card.legId, card.orderId, action)}
            disabled={busy}
            onPress={() => onAct(action)}
            testID={actionTestId(action)}
          />
        ))}
      </View>

      <Text variant="caption" tone="faint" style={styles.truth}>
        {FIELD_TRUTH_NOTE}
      </Text>
      <Button
        kind="ghost"
        size="compact"
        label="Xem cả vòng chạy"
        icon="map-marker-path"
        onPress={onOpenRun}
        testID="driver-open-run"
      />
    </Card>
  );
}

export function actionTestId(action: DriverFieldAction): string {
  if (action.kind === 'CHECKPOINT') return `checkpoint-${action.checkpointType ?? 'x'}`;
  if (action.kind === 'DOCUMENT') return `document-${action.documentType ?? 'x'}`;
  return action.kind === 'WAITING_START' ? 'waiting-start' : 'receipt-handover';
}

/** Tuyen doc bang mat: diem di, vach noi, diem den — chu lon, khong viet tat. */
export function RouteLine({
  origin,
  destination,
}: {
  readonly origin: string;
  readonly destination: string;
}) {
  const { color } = useTheme();
  return (
    <View style={styles.route} accessibilityLabel={`Từ ${origin} đến ${destination}`} accessible>
      <View style={styles.rail}>
        <View style={[styles.node, { borderColor: color.ink }]} />
        <View style={[styles.stem, { backgroundColor: color.lineStrong }]} />
        <View
          style={[
            styles.node,
            styles.nodeEnd,
            { backgroundColor: color.ink, borderColor: color.ink },
          ]}
        />
      </View>
      <View style={styles.flex}>
        <Text variant="heading">{origin}</Text>
        <View style={styles.gap} />
        <Text variant="title">{destination}</Text>
      </View>
    </View>
  );
}

function DocumentFacts({ card }: { readonly card: FieldLegCard }) {
  if (
    card.capturedDocuments.length === 0 &&
    card.missingDocuments.length === 0 &&
    card.handoverLabel === null
  ) {
    return null;
  }
  return (
    <View style={styles.facts}>
      {card.capturedDocuments.length > 0 ? (
        <Text variant="caption" tone="live">
          Đã chụp: {card.capturedDocuments.join(', ')}
        </Text>
      ) : null}
      {card.missingDocuments.length > 0 ? (
        <Text variant="caption" tone="caution">
          Còn thiếu: {card.missingDocuments.join(', ')}
        </Text>
      ) : null}
      {card.handoverLabel ? (
        <Text variant="caption" tone="muted">
          {card.handoverLabel}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginBottom: SPACE.md },
  flex: { flex: 1 },
  stack: { gap: SPACE.md, marginTop: SPACE.lg },
  truth: { marginTop: SPACE.lg },
  route: { flexDirection: 'row', gap: SPACE.md },
  rail: { width: 14, alignItems: 'center', paddingTop: 6, paddingBottom: 10 },
  node: { width: 12, height: 12, borderRadius: 6, borderWidth: 2.5 },
  nodeEnd: { borderRadius: 3 },
  stem: { flex: 1, width: 2.5, marginVertical: 3 },
  gap: { height: SPACE.md },
  facts: { gap: SPACE.hair },
});
