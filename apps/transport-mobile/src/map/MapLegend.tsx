import { StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { SPACE } from '../theme/tokens';
import { Text } from '../ui/Text';
import { drawablePoints } from './camera';
import type { PointColors } from './map-config';
import type { MapPoint } from './map-types';

/** Mau cham theo loai diem, lay tu bang mau cua chu de (sang/toi). */
export function usePointColors(): PointColors {
  const { color } = useTheme();
  return {
    pickup: color.brand,
    delivery: color.ink,
    me: color.live,
    vehicle: color.pending,
    stale: color.neutral,
    halo: color.surfaceRaised,
  };
}

export function colorOf(point: MapPoint, colors: PointColors): string {
  return point.stale ? colors.stale : colors[point.kind];
}

/**
 * CHU GIAI duoi ban do — nhan cua TUNG diem bang chu (ban do khong can glyph/phong chu nao), va noi
 * ro diem nao la vi tri CU (#297: cu != hien tai).
 */
export function MapLegend({ points }: { readonly points: readonly MapPoint[] }) {
  const colors = usePointColors();
  return (
    <View style={styles.legend}>
      {drawablePoints(points).map((point) => (
        <View key={point.id} style={styles.row} accessible accessibilityLabel={point.label}>
          <View
            style={[
              styles.dot,
              { backgroundColor: colorOf(point, colors), opacity: point.stale ? 0.7 : 1 },
            ]}
          />
          <Text variant="caption" tone={point.stale ? 'muted' : 'ink'} style={styles.flex}>
            {point.label}
            {point.stale ? ' (vị trí cũ)' : ''}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { gap: SPACE.xs, paddingTop: SPACE.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  dot: { width: 12, height: 12, borderRadius: 6 },
  flex: { flex: 1 },
});
