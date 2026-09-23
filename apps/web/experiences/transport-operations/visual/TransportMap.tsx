'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { GoogleBasemap } from './GoogleBasemap';
import { MapLibreBasemap } from './MapLibreBasemap';
import { useGoogleMapsSession } from './google-maps-session';
import { boundsKey, cameraFor } from './map-camera';
import { effectiveBasemap, readBasemapEnv, resolveBasemap } from './map-style';
import { FALLBACK_PALETTE, paletteFrom, type ChartPalette } from './chart-options';
import type { JourneyMapModel } from '../workspace/journey';
import './transport-map.css';

/**
 * BAN DO VONG CHAY — mot nen, mot bo lop nghiep vu (#278 N1/N2/N5, #374).
 *
 * ```
 * JourneyMapModel ──buildJourneyLayers──▶ lop deck.gl ──▶ nen
 *                                                        ├─ GOOGLE_MAPS          (GoogleBasemap)
 *                                                        ├─ CONFIGURED_STYLE_URL (MapLibreBasemap)
 *                                                        └─ LOCAL_FALLBACK       (MapLibreBasemap)
 * ```
 *
 * Tep nay chi CHON nen va noi ra vi sao. Cai gi ve len ban do, ve the nao, la cua
 * `journey-layers.ts`; khung nhin la cua `map-camera.ts`; nen nao la cua `map-style.ts`.
 *
 * ===========================================================================
 * GOOGLE HONG THI LUI VE NEN CUC BO — KHONG BAO GIO LA MOT MAN HINH CHET.
 *
 * Thieu khoa, script bi chan, khoa bi tu choi (`gm_authFailure`) hay qua han: ban do ve lai CUNG
 * cac lop tren nen cuc bo, va cau thong bao noi dung dieu do — nen hong, toa do khong sai.
 */

export interface TransportMapProps {
  readonly model: JourneyMapModel;
  /** `[tay, nam, dong, bac]`, hoac `null` khi khong co gi de ve. */
  readonly bounds: readonly [number, number, number, number] | null;
  readonly ariaLabel: string;
  readonly heightPx?: number;
}

/**
 * Bang mau doc tu bien CSS SAU khi gan — luc ve lan dau `ref` con `null`, va doc `ref` trong luc
 * ve la sai quy tac cua React.
 */
function usePalette(host: React.RefObject<HTMLElement | null>): ChartPalette {
  const [palette, setPalette] = useState<ChartPalette>(FALLBACK_PALETTE);
  useEffect(() => {
    if (host.current !== null) setPalette(paletteFrom(window.getComputedStyle(host.current)));
  }, [host]);
  return palette;
}

export function TransportMap({
  model,
  bounds,
  ariaLabel,
  heightPx = 420,
}: TransportMapProps): React.ReactElement {
  const host = useRef<HTMLDivElement | null>(null);
  const configured = useMemo(() => resolveBasemap(readBasemapEnv()), []);
  const google = useGoogleMapsSession(
    configured.source === 'GOOGLE_MAPS' ? configured.apiKey : null,
  );
  const basemap = effectiveBasemap(configured, google?.status === 'FAILED' ? google.reason : null);

  /*
   * Bang mau va MO HINH di xuong, KHONG phai lop deck.gl da dung san: moi nen tu dung lop cua no
   * (xem `GoogleBasemap`), vi lop cua nen Google khong ve lai duoc tren nen cuc bo khi Google hong.
   */
  const palette = usePalette(host);

  /*
   * Camera theo GIA TRI cua khung, khong theo doi tuong: `key` la chinh `bounds` viet thanh chuoi,
   * nen lam tuoi du lieu khong keo ban do khoi cho nguoi dung vua keo/phong toi.
   */
  const key = boundsKey(bounds);
  const camera = useMemo(() => cameraFor(bounds), [key]);

  const isGoogleLoading = basemap.source === 'GOOGLE_MAPS' && google?.status === 'LOADING';
  const fallbackReason = basemap.source === 'LOCAL_FALLBACK' ? basemap.reason : undefined;

  const renderBasemap = (): React.ReactNode => {
    if (camera === null) return null;
    if (basemap.source === 'GOOGLE_MAPS') {
      return google?.status === 'READY' ? (
        <GoogleBasemap
          libraries={google.libraries}
          mapId={basemap.mapId}
          model={model}
          palette={palette}
          camera={camera}
        />
      ) : null;
    }
    return (
      <MapLibreBasemap
        style={basemap.style}
        showAttribution={basemap.source === 'CONFIGURED_STYLE_URL'}
        model={model}
        palette={palette}
        camera={camera}
      />
    );
  };

  return (
    <>
      <div className="tx-map-frame">
        <div
          ref={host}
          className="tx-map"
          style={{ height: `${heightPx}px` }}
          role="img"
          aria-label={ariaLabel}
          aria-busy={isGoogleLoading}
          data-testid="tx-map"
          data-basemap={basemap.source}
          data-basemap-fallback={fallbackReason}
          data-bounds={key}
        >
          {renderBasemap()}
        </div>
        {/* Mot dong trang thai mot luc: khong co toa do thi cung khong co gi de cho nen tai. */}
        {camera === null ? (
          <p className="tx-map__status" role="status">
            Chưa có toạ độ hợp lệ để vẽ bản đồ.
          </p>
        ) : isGoogleLoading ? (
          <p className="tx-map__status" role="status" aria-live="polite">
            Đang tải nền Google Maps…
          </p>
        ) : null}
      </div>
      {basemap.notice === null ? null : (
        <p className="tx-note" data-testid="tx-map-notice">
          {basemap.notice}
        </p>
      )}
    </>
  );
}

export default TransportMap;
