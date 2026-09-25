import { StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { SPACE } from '../theme/tokens';
import { Text } from '../ui/Text';
import type { Basemap } from './basemap';

/**
 * GHI NGUON NEN BAN DO — luon NHIN THAY (ODbL), khong giau sau mot nut "i". Nen cuc bo khong co du
 * lieu ben ngoai nao nen khong can ghi.
 */
export function MapAttribution({ basemap }: { readonly basemap: Basemap | null }) {
  const { color } = useTheme();
  if (basemap === null || basemap.kind !== 'REMOTE') return null;
  return (
    <View
      pointerEvents="none"
      style={[styles.badge, { backgroundColor: color.surface }]}
      testID="map-attribution"
    >
      <Text variant="caption" tone="muted" style={styles.text} numberOfLines={2}>
        {basemap.attribution}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    right: SPACE.xs,
    bottom: SPACE.xs,
    left: SPACE.xs,
    alignSelf: 'flex-end',
    paddingHorizontal: SPACE.sm,
    paddingVertical: 2,
    borderRadius: 6,
    opacity: 0.9,
  },
  text: { fontSize: 10, lineHeight: 13, textAlign: 'right' },
});
