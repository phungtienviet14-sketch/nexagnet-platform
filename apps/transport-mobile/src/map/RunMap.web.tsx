import { StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { RADIUS, SPACE } from '../theme/tokens';
import { Notice } from '../ui/Notice';
import { cameraFor, boundsOf, drawablePoints } from './camera';
import { MapLegend } from './MapLegend';
import type { RunMapProps } from './map-types';

/**
 * BAN DO tren TRINH DUYET — TAM THOI chi hien DANH SACH DIEM (cung props voi ban native).
 *
 * `maplibre-gl` 6 dung `import.meta` + tep worker rieng; Metro web chua phuc vu tep worker do, nen
 * chua ve nen ban do o day. Noi that dieu nay thay vi ve mot khung trong: toa do van dung, va nut
 * "Mở chỉ đường" van mo OpenStreetMap.
 */
export function RunMap({ points, height = 160, testID = 'map-view' }: RunMapProps) {
  const { color } = useTheme();
  const drawable = drawablePoints(points);
  if (cameraFor(boundsOf(drawable)) === null) return null;
  return (
    <View testID={testID}>
      <View
        style={[
          styles.frame,
          { minHeight: Math.min(height, 160), backgroundColor: color.surfaceSunken },
        ]}
      >
        <Notice
          tone="neutral"
          icon="map-outline"
          title="Bản đồ nền chưa có trên bản trình duyệt"
          detail="Các điểm vẫn đúng toạ độ — dùng “Mở chỉ đường” để xem trên OpenStreetMap."
        />
      </View>
      <MapLegend points={drawable} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: RADIUS.card, padding: SPACE.md, justifyContent: 'center' },
});
