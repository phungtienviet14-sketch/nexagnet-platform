import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  type InitialViewState,
  type StyleSpecification,
} from '@maplibre/maplibre-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { RADIUS, SPACE } from '../theme/tokens';
import { Notice } from '../ui/Notice';
import { BASEMAP_UNAVAILABLE_NOTICE, localStyle } from './basemap';
import {
  boundsKey,
  boundsOf,
  cameraFor,
  drawablePoints,
  pointsFeatureCollection,
  type MapCamera,
} from './camera';
import { MapAttribution } from './MapAttribution';
import { MapLegend, colorOf, usePointColors } from './MapLegend';
import { BASEMAP } from './map-config';
import type { RunMapProps } from './map-types';

/**
 * BAN DO DUNG CHUNG (Android/iOS) — MapLibre Native qua `@maplibre/maplibre-react-native` v11.
 *
 * Man lai xe dung hom nay; man giam doc dung lai CUNG props. Khong co diem hop le -> KHONG ve gi
 * (tra `null`), lop goi noi "chưa có toạ độ" — khong bao gio bia mot tam ban do.
 *
 * Diem ve bang LOP TRON (circle) tu GeoJSON, khong bang chu tren ban do: nen cuc bo (CI, may khong
 * ra mang) khong co glyph, nen nhan nam o CHU GIAI ben duoi. Nen ngoai khong tai duoc -> doi sang
 * nen trong va noi that; toa do van dung. `key` theo KHUNG: camera chi dat lai khi TOA DO doi, mot
 * lan lam moi du lieu khong keo ban do khoi cho nguoi dung vua keo toi.
 */
function initialView(camera: MapCamera): InitialViewState {
  if (camera.kind === 'CENTER') {
    return { center: [camera.longitude, camera.latitude], zoom: camera.zoom };
  }
  const pad = camera.paddingPx;
  const [west, south, east, north] = camera.bounds;
  return {
    bounds: [west, south, east, north],
    padding: { top: pad, right: pad, bottom: pad, left: pad },
  };
}

export function RunMap({ points, height = 260, testID = 'map-view' }: RunMapProps) {
  const { color } = useTheme();
  const colors = usePointColors();
  const [basemapFailed, setBasemapFailed] = useState(false);
  const drawable = drawablePoints(points);
  const bounds = boundsOf(drawable);
  const camera = cameraFor(bounds);
  if (camera === null) return null;

  const remote = BASEMAP.kind === 'REMOTE' && !basemapFailed ? BASEMAP : null;
  const mapStyle: string | StyleSpecification =
    remote !== null
      ? remote.styleUrl
      : { version: 8, sources: {}, layers: [...localStyle(color.surfaceSunken).layers] };
  const data = pointsFeatureCollection(drawable, (point) => colorOf(point, colors));

  return (
    <View testID={testID} accessibilityLabel={`Bản đồ ${drawable.length} điểm`}>
      <View style={[styles.frame, { height, borderColor: color.line }]}>
        <Map
          key={`${boundsKey(bounds)}|${remote ? 'remote' : 'local'}`}
          style={StyleSheet.absoluteFill}
          mapStyle={mapStyle}
          attribution={false}
          logo={false}
          compass={false}
          touchPitch={false}
          onDidFailLoadingMap={() => setBasemapFailed(true)}
        >
          <Camera initialViewState={initialView(camera)} />
          <GeoJSONSource id="nx-run-points" data={data}>
            <Layer
              type="circle"
              id="nx-run-points-halo"
              paint={{ 'circle-radius': 12, 'circle-color': colors.halo, 'circle-opacity': 0.95 }}
            />
            <Layer
              type="circle"
              id="nx-run-points-core"
              paint={{
                'circle-radius': 8,
                'circle-color': ['get', 'color'],
                'circle-opacity': ['case', ['get', 'stale'], 0.65, 1],
              }}
            />
          </GeoJSONSource>
        </Map>
        <MapAttribution basemap={remote} />
      </View>
      {BASEMAP.kind === 'LOCAL' ? (
        <Notice tone="neutral" icon="map-outline" title={BASEMAP.notice} />
      ) : basemapFailed ? (
        <Notice tone="neutral" icon="map-outline" title={BASEMAP_UNAVAILABLE_NOTICE} />
      ) : null}
      <MapLegend points={drawable} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: RADIUS.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    marginBottom: SPACE.sm,
  },
});
