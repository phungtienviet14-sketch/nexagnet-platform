import { StyleSheet, View } from 'react-native';
import { useTheme } from '../../../theme/ThemeProvider';
import { RADIUS, SPACE } from '../../../theme/tokens';
import { Card, KeyValue } from '../../../ui/Surface';
import { Text } from '../../../ui/Text';
import { DIRECTION_LABEL, type MarginView, type MoneyRow } from '../finance';
import { Notice } from './Blocks';

/**
 * SAU O TIEN, TUNG O MOT — luoi hai cot, moi o mot nhan chieu "Phải thu"/"Phải trả". Khong co o
 * "Tổng", khong co thanh tong o day: cau cuoi noi ro vi sao.
 */
export function MoneyChips({
  rows,
  testID,
}: {
  readonly rows: readonly MoneyRow[];
  readonly testID?: string;
}) {
  const { color } = useTheme();
  return (
    <View testID={testID} style={styles.wrap}>
      <View style={styles.grid}>
        {rows.map((row) => (
          <View
            key={row.key}
            testID={`money-${row.key}`}
            accessibilityLabel={`${row.label}: ${row.value}`}
            style={[
              styles.chip,
              {
                backgroundColor: color.surface,
                borderColor: color.line,
                borderLeftColor: row.direction === 'RECEIVABLE' ? color.live : color.pending,
              },
            ]}
          >
            <Text variant="overline" tone={row.direction === 'RECEIVABLE' ? 'live' : 'pending'}>
              {DIRECTION_LABEL[row.direction]}
            </Text>
            <Text variant="figure" numberOfLines={1} adjustsFontSizeToFit>
              {row.value}
            </Text>
            <Text variant="caption" tone="muted">
              {row.label}
            </Text>
          </View>
        ))}
      </View>
      <Text variant="caption" tone="faint">
        Sáu khoản cho sáu đối tượng khác nhau — không cộng thành một tổng.
      </Text>
    </View>
  );
}

/** BIEN TRUC TIEP — con so va `disclosure` cua may chu di CUNG nhau, khong bao gio goi la lai rong. */
export function MarginCard({
  margin,
  testID,
}: {
  readonly margin: MarginView;
  readonly testID?: string;
}) {
  return (
    <View testID={testID}>
      <Card rail="brand">
        <Text variant="overline" tone="muted">
          {margin.title}
        </Text>
        <View style={styles.marginRow}>
          <Text variant="figureLarge" tone={margin.isNegative ? 'danger' : 'ink'}>
            {margin.margin}
          </Text>
          <Text variant="bodyStrong" tone="muted">
            {margin.ratio}
          </Text>
        </View>
        <Text variant="bodyStrong" tone="caution" testID="margin-disclosure">
          {margin.disclosure}
        </Text>
        <KeyValue label="Doanh thu" value={margin.revenue} />
        <KeyValue label="Chi phí trực tiếp trừ đi" value={margin.deduction} />
        <Text variant="caption" tone="faint">
          {margin.coverage}
        </Text>
      </Card>
    </View>
  );
}

export function CurrencyWarning({ text }: { readonly text: string | null }) {
  if (text === null) return null;
  return <Notice tone="caution" title="Nhiều mã tiền" detail={text} icon="currency-usd-off" />;
}

const styles = StyleSheet.create({
  wrap: { gap: SPACE.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  chip: {
    flexBasis: '47%',
    flexGrow: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 4,
    borderRadius: RADIUS.ticket,
    padding: SPACE.md,
    gap: 2,
  },
  marginRow: { flexDirection: 'row', alignItems: 'baseline', gap: SPACE.md, flexWrap: 'wrap' },
});
