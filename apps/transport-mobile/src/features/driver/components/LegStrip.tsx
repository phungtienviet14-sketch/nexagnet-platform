import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '../../../theme/ThemeProvider';
import { RADIUS, SPACE } from '../../../theme/tokens';
import { Icon } from '../../../ui/Icon';
import { Text } from '../../../ui/Text';
import type { FieldLegCard } from '../field-work';
import { entriesForLeg, type QueueEntry } from '../pending-actions';

/**
 * DAI TUYEN doc — cac chang CON LAI, chi de doc. Nut bam chi o chang dang lam (luat web): hai noi
 * bam cho cung mot viec la hai cau tra loi cho "bay gio toi lam gi".
 */
export function LegStrip({
  cards,
  entries,
  onOpen,
}: {
  readonly cards: readonly FieldLegCard[];
  readonly entries: readonly QueueEntry[];
  readonly onOpen: (card: FieldLegCard) => void;
}) {
  const { color } = useTheme();
  return (
    <View style={styles.strip}>
      {cards.map((card, index) => {
        const queued = entriesForLeg(entries, card.legId).length;
        const last = index === cards.length - 1;
        return (
          <Pressable
            key={card.legId}
            accessibilityRole="button"
            accessibilityLabel={`${card.runCode}, ${card.title}: ${card.route}. ${card.phaseLabel}.`}
            onPress={() => onOpen(card)}
            testID={`driver-leg-${card.legId}`}
            style={({ pressed }) => [styles.row, { opacity: pressed ? 0.8 : 1 }]}
          >
            <View style={styles.rail}>
              <View style={[styles.badge, { backgroundColor: color.surfaceSunken }]}>
                <Text variant="label" tone="muted">
                  {card.sequence}
                </Text>
              </View>
              {last ? null : <View style={[styles.stem, { backgroundColor: color.line }]} />}
            </View>
            <View style={[styles.body, { borderColor: color.line }]}>
              <Text variant="overline" tone="faint">
                {card.runCode}
              </Text>
              <Text variant="bodyStrong">{card.route}</Text>
              <Text variant="caption" tone="muted">
                {card.phaseLabel}
                {card.isEmptyLeg ? ' · chạy rỗng' : ''}
                {queued > 0 ? ` · ${queued} việc chờ gửi` : ''}
              </Text>
            </View>
            <Icon name="chevron-right" tone="faint" />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { gap: 0 },
  row: { flexDirection: 'row', alignItems: 'stretch', gap: SPACE.md, minHeight: 64 },
  rail: { width: 32, alignItems: 'center' },
  badge: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stem: { flex: 1, width: 2, marginVertical: SPACE.xs },
  body: {
    flex: 1,
    gap: 2,
    paddingBottom: SPACE.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: SPACE.md,
  },
});
