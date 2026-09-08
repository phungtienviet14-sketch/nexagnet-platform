'use client';

import { useEffect, useMemo, useRef } from 'react';
import Map, {
  NavigationControl,
  ScaleControl,
  useControl,
  type MapRef,
} from 'react-map-gl/maplibre';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { PathLayer, ScatterplotLayer } from '@deck.gl/layers';
import { resolveBasemap } from './map-style';
import { FALLBACK_PALETTE, paletteFrom, type ChartPalette } from './chart-options';
import type { JourneyMapModel, JourneyMarker, JourneySegment } from '../workspace/journey';
import 'maplibre-gl/dist/maplibre-gl.css';

/**
 * BAN DO VONG CHAY — MapLibre ve nen, deck.gl ve du lieu (#278 N1/N2/N5).
 *
 * ===========================================================================
 * DECK.GL DI VAO NHU MOT `control` CUA MAPLIBRE, KHONG PHAI MOT LOP CANVAS THU HAI.
 *
 * `MapboxOverlay` qua `useControl` la duong tich hop chinh thuc cua react-map-gl v8: deck.gl dung
 * CHUNG mot ngu canh WebGL va cung mot vong ve voi MapLibre. Chong hai canvas len nhau thi khi thu
 * phong hai lop se lech nhau vai khung hinh — tren mot ban do van tai, "lech vai khung hinh" nghia
 * la duong chay tach khoi cai moc ma no phai di qua.
 *
 * ===========================================================================
 * MAU DO CUA CHANG RONG DEN TU DU LIEU, KHONG TU MOT NHANH `if` CUA MAN HINH.
 *
 * `segment.role` do may chu dat, tu `TransportRunLeg.kind`. `#274` §4 doi chang rong mau DO, va
 * mau do o day di kem hai thu nua de mau khong phai tin hieu duy nhat (`#278` N2): duong rong duoc
 * ve DAY hon, va chu giai ben duoi ban do goi ten no.
 */

export interface TransportMapProps {
  readonly model: JourneyMapModel;
  /** `[tay, nam, dong, bac]`, hoac `null` khi khong co gi de ve. */
  readonly bounds: readonly [number, number, number, number] | null;
  readonly ariaLabel: string;
  readonly heightPx?: number;
}

const toRgb = (hex: string): [number, number, number] => {
  const value = hex.trim().replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((char) => `${char}${char}`)
          .join('')
      : value;
  const parsed = Number.parseInt(full.slice(0, 6), 16);
  if (!Number.isFinite(parsed)) return [0, 0, 0];
  return [(parsed >> 16) & 255, (parsed >> 8) & 255, parsed & 255];
};

/**
 * DO DAY theo LOAI DUONG — de nguoi doc phan biet duoc ba nguon.
 *
 * `#278` N5 doi *"planned route vs actual/matched route visually distinguishable"*. Tuyen ke hoach
 * hom nay khong bao gio co diem (`NO_ROUTE_PROVIDER`), nhung be rong cua no van duoc khai o day:
 * cho vao san se lam ngay Lane M co du lieu thi khong ai phai nghi lai xem ve no the nao.
 */
const WIDTH_BY_PATH: Readonly<Record<JourneySegment['pathKind'], number>> = {
  PLANNED: 2,
  CHECKPOINT_ANCHORED: 5,
  RAW_OBSERVED: 3,
};

function DeckLayers({
  model,
  palette,
}: {
  readonly model: JourneyMapModel;
  readonly palette: ChartPalette;
}): null {
  const overlay = useControl(() => new MapboxOverlay({ interleaved: false }));

  useEffect(() => {
    const loaded = toRgb(palette.loaded);
    const empty = toRgb(palette.empty);

    overlay.setProps({
      layers: [
        new PathLayer<JourneySegment>({
          id: 'tx-journey-paths',
          data: [...model.segments],
          widthUnits: 'pixels',
          widthMinPixels: 2,
          getPath: (segment) => segment.coordinates as unknown as [number, number][],
          /* Mau tu DU LIEU: `role` do may chu dat tu `TransportRunLeg.kind`. */
          getColor: (segment) => (segment.role === 'EMPTY' ? empty : loaded),
          /* Chang rong ve DAY hon — tin hieu thu hai ben canh mau. */
          getWidth: (segment) =>
            WIDTH_BY_PATH[segment.pathKind] + (segment.role === 'EMPTY' ? 2 : 0),
          pickable: true,
        }),
        new ScatterplotLayer<JourneyMarker>({
          id: 'tx-journey-markers',
          data: [...model.markers],
          radiusUnits: 'pixels',
          getRadius: 6,
          getPosition: (marker) => marker.coordinate as unknown as [number, number],
          getFillColor: toRgb(palette.ink),
          stroked: true,
          lineWidthMinPixels: 2,
          getLineColor: toRgb(palette.paper),
          pickable: true,
        }),
      ],
    });
  }, [model, overlay, palette]);

  return null;
}

export function TransportMap({
  model,
  bounds,
  ariaLabel,
  heightPx = 420,
}: TransportMapProps): React.ReactElement {
  const host = useRef<HTMLDivElement | null>(null);
  const map = useRef<MapRef | null>(null);

  const basemap = useMemo(
    () => resolveBasemap(process.env.NEXT_PUBLIC_TRANSPORT_MAP_STYLE_URL),
    [],
  );

  const palette = useMemo(
    () =>
      host.current === null || typeof window === 'undefined'
        ? FALLBACK_PALETTE
        : paletteFrom(window.getComputedStyle(host.current)),
    [],
  );

  /*
   * Khung nhin theo DU LIEU, khong theo mot toa do mac dinh nao.
   *
   * Khi `bounds` la `null` thi khong co gi de ve, va man hinh (`JourneyView`) khong dung component
   * nay. Nen o day khong co nhanh "bay ve giua Viet Nam" — mot ban do do doc y het mot ban do co
   * du lieu ma xe dang o cho khac.
   */
  useEffect(() => {
    const instance = map.current;
    if (instance === null || bounds === null) return;
    instance.fitBounds(
      [
        [bounds[0], bounds[1]],
        [bounds[2], bounds[3]],
      ],
      { padding: 48, duration: 0, maxZoom: 13 },
    );
  }, [bounds]);

  return (
    <div
      ref={host}
      className="tx-map"
      style={{ height: `${heightPx}px` }}
      role="img"
      aria-label={ariaLabel}
      data-testid="tx-map"
      data-basemap={basemap.source}
    >
      <Map
        ref={map}
        initialViewState={{ longitude: 105.85, latitude: 21.02, zoom: 5 }}
        mapStyle={basemap.style}
        attributionControl={false}
        style={{ width: '100%', height: '100%' }}
      >
        <NavigationControl position="top-right" showCompass={false} />
        <ScaleControl position="bottom-left" unit="metric" />
        <DeckLayers model={model} palette={palette} />
      </Map>
    </div>
  );
}

export default TransportMap;
