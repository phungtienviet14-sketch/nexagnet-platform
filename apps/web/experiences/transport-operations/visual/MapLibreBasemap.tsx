'use client';

import { useEffect, useRef } from 'react';
import Map, {
  NavigationControl,
  ScaleControl,
  useControl,
  type MapRef,
  type ViewState,
} from 'react-map-gl/maplibre';
import type { StyleSpecification } from 'maplibre-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { buildJourneyLayers } from './journey-layers';
import type { ChartPalette } from './chart-options';
import type { MapCamera } from './map-camera';
import type { JourneyMapModel } from '../workspace/journey';
import 'maplibre-gl/dist/maplibre-gl.css';

/**
 * NEN MAPLIBRE — style URL da khai, hoac nen CUC BO khong goi mang (#278 N1/N2/N5).
 *
 * ===========================================================================
 * DECK.GL DI VAO NHU MOT `control` CUA MAPLIBRE, KHONG PHAI MOT LOP CANVAS THU HAI.
 *
 * `MapboxOverlay` qua `useControl` la duong tich hop chinh thuc cua react-map-gl v8: deck.gl ve
 * trong CUNG vong ve cua MapLibre. Chong hai canvas len nhau thi khi thu phong hai lop se lech nhau
 * vai khung hinh — tren mot ban do van tai, "lech vai khung hinh" nghia la duong chay tach khoi cai
 * moc ma no phai di qua.
 *
 * ===========================================================================
 * KHUNG NHIN DAU TIEN CUNG LA KHUNG CUA DU LIEU.
 *
 * `initialViewState` lay tu `camera` — khong con mot toa do Ha Noi mac dinh nhay len truoc khi
 * `fitBounds` chay.
 *
 * Lop duoc dung MOI trong effect, khong nhan tu ngoai vao: xem `GoogleBasemap` — mot lop da thuoc
 * ngu canh WebGL cua nen Google khong ve duoc tren nen nay.
 */

function DeckOverlay({
  model,
  palette,
}: {
  readonly model: JourneyMapModel;
  readonly palette: ChartPalette;
}): null {
  const overlay = useControl(() => new MapboxOverlay({ interleaved: false }));

  useEffect(() => {
    overlay.setProps({ layers: buildJourneyLayers(model, palette) });
  }, [model, overlay, palette]);

  return null;
}

const initialViewStateFor = (
  camera: MapCamera,
): Partial<ViewState> & {
  bounds?: [[number, number], [number, number]];
  fitBoundsOptions?: { padding: number; maxZoom: number };
} =>
  camera.kind === 'CENTER'
    ? { longitude: camera.longitude, latitude: camera.latitude, zoom: camera.zoom }
    : {
        bounds: [
          [camera.bounds[0], camera.bounds[1]],
          [camera.bounds[2], camera.bounds[3]],
        ],
        fitBoundsOptions: { padding: camera.paddingPx, maxZoom: camera.maxZoom },
      };

export function MapLibreBasemap({
  style,
  showAttribution,
  model,
  palette,
  camera,
}: {
  /** Chuoi = URL style ngoai; doi tuong = style cuc bo khong goi mang. */
  readonly style: string | StyleSpecification;
  /** Tile ngoai (OSM, MapTiler, …) BAT BUOC ghi nguon; nen cuc bo khong co gi de ghi. */
  readonly showAttribution: boolean;
  readonly model: JourneyMapModel;
  readonly palette: ChartPalette;
  readonly camera: MapCamera;
}): React.ReactElement {
  const map = useRef<MapRef | null>(null);

  useEffect(() => {
    const instance = map.current;
    if (instance === null) return;
    if (camera.kind === 'CENTER') {
      instance.jumpTo({ center: [camera.longitude, camera.latitude], zoom: camera.zoom });
      return;
    }
    instance.fitBounds(
      [
        [camera.bounds[0], camera.bounds[1]],
        [camera.bounds[2], camera.bounds[3]],
      ],
      { padding: camera.paddingPx, duration: 0, maxZoom: camera.maxZoom },
    );
  }, [camera]);

  return (
    <Map
      ref={map}
      initialViewState={initialViewStateFor(camera)}
      mapStyle={style}
      attributionControl={showAttribution ? { compact: true } : false}
      style={{ width: '100%', height: '100%' }}
    >
      <NavigationControl position="top-right" showCompass={false} />
      <ScaleControl position="bottom-left" unit="metric" />
      <DeckOverlay model={model} palette={palette} />
    </Map>
  );
}

export default MapLibreBasemap;
