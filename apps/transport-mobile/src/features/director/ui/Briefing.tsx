import { StyleSheet, View } from 'react-native';
import { useTheme } from '../../../theme/ThemeProvider';
import { RADIUS, SPACE } from '../../../theme/tokens';
import { Icon } from '../../../ui/Icon';
import { Card } from '../../../ui/Surface';
import { Text } from '../../../ui/Text';
import { queueKindLabel, severityTone, type FleetStat } from '../../office/control-tower';
import { siteIntakeQueueNote } from '../../office/site-intake-review';
import type { QueueItem } from '../../office/types';
import { actionLabelFor, queueItemSubline } from '../inbox';

/**
 * MAU BAN TIN BUOI SANG cua giam doc: mot cau mo dau lon (so cua may chu), roi the viec va dai so.
 * Khong phai "dashboard" luoi the deu nhau: cau mo dau to gap doi moi thu con lai, vi giam doc doc
 * no truoc tien va nhieu khi chi doc no.
 */
export function Headline({
  text,
  runningLine,
}: {
  readonly text: string;
  readonly runningLine: string;
}) {
  const { color } = useTheme();
  return (
    <View style={[styles.hero, { borderColor: color.ink }]}>
      <Text variant="display" testID="director-headline" accessibilityRole="header">
        {text}
      </Text>
      <Text variant="body" tone="muted" testID="director-running-summary">
        {runningLine}
      </Text>
    </View>
  );
}

const SEVERITY_SHORT: Readonly<Record<string, string>> = {
  CRITICAL: 'Khẩn',
  WARNING: 'Cần xem',
  INFO: 'Để biết',
};

/** The mot viec — vach mau theo MUC, dong tu theo viec, ma nghiep vu (khong id). */
export function DecisionCard({
  item,
  onPress,
}: {
  readonly item: QueueItem;
  readonly onPress: (item: QueueItem) => void;
}) {
  const tone = severityTone(item.severity);
  const subline = queueItemSubline(item);
  const note = siteIntakeQueueNote(item);
  return (
    <Card
      rail={tone}
      onPress={() => onPress(item)}
      testID={`director-queue-item-${item.kind}`}
      accessibilityLabel={`${queueKindLabel(item.kind)}. ${actionLabelFor(item.kind)}`}
    >
      <View style={styles.cardRow}>
        <View style={styles.flex}>
          <Text
            variant="overline"
            tone={tone === 'danger' ? 'danger' : tone === 'caution' ? 'caution' : 'muted'}
          >
            {SEVERITY_SHORT[item.severity] ?? item.severity}
          </Text>
          <Text variant="bodyStrong">{queueKindLabel(item.kind)}</Text>
          {subline ? (
            <Text variant="caption" tone="muted">
              {subline}
            </Text>
          ) : null}
          {note ? (
            <Text variant="caption" tone="caution" testID={`director-queue-note-${item.kind}`}>
              {note}
            </Text>
          ) : null}
          <Text variant="label" tone="brand">
            {actionLabelFor(item.kind)}
          </Text>
        </View>
        <Icon name="chevron-right" tone="muted" />
      </View>
    </Card>
  );
}

/** Dai so doi xe — NHAN co don vi cua web; "Xe đang chạy" (dem XE) duoc nhan manh. */
export function FleetStrip({ stats }: { readonly stats: readonly FleetStat[] }) {
  const { color } = useTheme();
  return (
    <View style={styles.strip} testID="director-fleet-strip">
      {stats.map((stat) => {
        const emphasis = stat.key === 'on-trip';
        return (
          <View
            key={stat.key}
            testID={`director-fleet-${stat.key}`}
            accessibilityLabel={`${stat.label}: ${stat.value}`}
            style={[
              styles.tile,
              {
                backgroundColor: emphasis ? color.brandSoft : color.surface,
                borderColor: emphasis ? color.brand : color.line,
              },
            ]}
          >
            <Text variant={emphasis ? 'figureLarge' : 'figure'} tone={emphasis ? 'brand' : 'ink'}>
              {stat.value}
            </Text>
            <Text variant="caption" tone="muted">
              {stat.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { gap: SPACE.sm, borderLeftWidth: 4, paddingLeft: SPACE.lg, paddingVertical: SPACE.xs },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  flex: { flex: 1, gap: 2 },
  strip: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  tile: {
    flexGrow: 1,
    flexBasis: '30%',
    minHeight: 76,
    borderRadius: RADIUS.ticket,
    borderWidth: StyleSheet.hairlineWidth,
    padding: SPACE.md,
    justifyContent: 'flex-end',
    gap: 2,
  },
});
