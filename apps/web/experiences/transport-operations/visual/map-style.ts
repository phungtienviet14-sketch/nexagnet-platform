import type { StyleSpecification } from 'maplibre-gl';

/**
 * NEN BAN DO — mot quyet dinh co DO, khong phai mot mac dinh (#278 N1, #374).
 *
 * ===========================================================================
 * NEN CHI LA NEN. NGHIEP VU KHONG DOI THEO NHA CUNG CAP.
 *
 * `#374`: chu du an chon Google Maps lam nen de nguoi xem thay duong sa, dia danh, song ho. Nhung
 * Google CHI ve lop nen: tuyen, chang rong, moc va vet GPS van la cac lop deck.gl ve tu du lieu cua
 * may chu (`journey-layers.ts`), va `distanceKm` van la so cua nghiep vu. Tep nay khong biet gi ve
 * vong chay; no chi tra loi "nen nao, va vi sao".
 *
 * ===========================================================================
 * KHONG MOT NHA CUNG CAP TRA PHI NAO DUOC BAT NGAM.
 *
 * `#278` N1: *"do not introduce a paid map plan automatically"*. Nen:
 *   - khong khai `PROVIDER` thi KHONG goi Google, du khoa co nam san trong moi truong;
 *   - `google` ma thieu khoa thi ve nen CUC BO, khong nhay sang MapLibre (co the la mot nha tile
 *     tra phi khac);
 *   - ten nha cung cap la hay khong biet (vd `mapbox`) cung ve nen cuc bo.
 *
 * ===========================================================================
 * NEN CUC BO KHONG PHAI MOT BAN DO GIA.
 *
 * `LOCAL_FALLBACK` ve mot nen TRONG — khong duong bo, khong ten tinh. Cai do la co y: mot nen
 * trong noi that rang he thong khong biet hinh dang mat dat o day, con duong di va cac moc VAN ve
 * dung toa do. Nen `notice` KHONG duoc `null` o nhanh cuc bo — `TransportMap` in no ra.
 */

export const MAP_PROVIDERS = ['google', 'maplibre', 'local'] as const;
export type MapProvider = (typeof MAP_PROVIDERS)[number];

export const MAP_BASEMAP_SOURCES = [
  'GOOGLE_MAPS',
  'CONFIGURED_STYLE_URL',
  'LOCAL_FALLBACK',
] as const;
export type MapBasemapSource = (typeof MAP_BASEMAP_SOURCES)[number];

/**
 * VI SAO nen cuc bo — mot MA, khong phai mot cau van.
 *
 * Nguoi dung chi thay mot trong hai cau (`LOCAL_BASEMAP_NOTICE` hoac
 * `GOOGLE_BASEMAP_UNAVAILABLE_NOTICE`). Ma nay nam tren `data-basemap-fallback` cua khung ban do de
 * nguoi van hanh mo DevTools la biet thieu khoa, khoa bi Google tu choi, hay script khong tai duoc.
 */
export const BASEMAP_FALLBACK_REASONS = [
  'NOT_CONFIGURED',
  'LOCAL_SELECTED',
  'UNKNOWN_PROVIDER',
  'MAPLIBRE_STYLE_MISSING',
  'GOOGLE_KEY_MISSING',
  'GOOGLE_SCRIPT_FAILED',
  'GOOGLE_AUTH_FAILED',
  'GOOGLE_TIMEOUT',
] as const;
export type BasemapFallbackReason = (typeof BASEMAP_FALLBACK_REASONS)[number];

export type GoogleFailureReason = Extract<
  BasemapFallbackReason,
  'GOOGLE_SCRIPT_FAILED' | 'GOOGLE_AUTH_FAILED' | 'GOOGLE_TIMEOUT'
>;

export type TransportBasemap =
  | {
      readonly source: 'GOOGLE_MAPS';
      /** Khoa trinh duyet — cong khai theo ban chat, bao ve bang gioi han HTTP referrer. */
      readonly apiKey: string;
      /**
       * Map ID (tuy chon). Co thi nen VECTOR va deck.gl ve chung ngu canh WebGL voi Google; khong
       * co thi nen RASTER — Google tu choi `WebGLOverlayView` khi thieu Map ID (do 23/09/2026).
       */
      readonly mapId: string | null;
      readonly notice: null;
    }
  | { readonly source: 'CONFIGURED_STYLE_URL'; readonly style: string; readonly notice: null }
  | {
      readonly source: 'LOCAL_FALLBACK';
      readonly style: StyleSpecification;
      readonly notice: string;
      readonly reason: BasemapFallbackReason;
    };

/** Bien moi truong, doc nguyen — `resolveBasemap` moi la noi quyet dinh. */
export interface BasemapConfig {
  readonly provider?: string | null;
  readonly googleMapsApiKey?: string | null;
  readonly googleMapsMapId?: string | null;
  readonly styleUrl?: string | null;
}

/**
 * STYLE CUC BO — hop le voi MapLibre, va khong mot lan goi mang nao.
 *
 * `sources: {}` la diem chinh: khong tile, khong sprite, khong glyph. Nho vay ban do dung duoc
 * trong CI va tren mot may khong co duong ra Internet, va bai Playwright do duoc rang lop WebGL
 * that su khoi tao — chu khong do mot anh tile tai ve.
 */
export const LOCAL_BASEMAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    {
      id: 'tx-map-background',
      type: 'background',
      paint: { 'background-color': '#eef1f4' },
    },
  ],
};

export const LOCAL_BASEMAP_NOTICE =
  'Nền bản đồ ngoài chưa được cấu hình, nên bản đồ chỉ vẽ đường đi và các mốc trên nền trống. ' +
  'Toạ độ vẫn đúng; phần thiếu là hình dạng đường sá.';

/**
 * Cau cua `#374` §6 — noi NEN hong, KHONG noi toa do sai.
 *
 * Thieu khoa, khoa bi tu choi hay mang chan Google deu doc ra cung mot cau: voi nguoi dieu hanh,
 * dieu can biet la tuyen va moc tren man hinh van dung, chi phan nen la don gian.
 */
export const GOOGLE_BASEMAP_UNAVAILABLE_NOTICE =
  'Nền Google Maps chưa khả dụng; tuyến và mốc vẫn đang được hiển thị đúng trên nền đơn giản.';

const GOOGLE_REASONS: ReadonlySet<BasemapFallbackReason> = new Set([
  'GOOGLE_KEY_MISSING',
  'GOOGLE_SCRIPT_FAILED',
  'GOOGLE_AUTH_FAILED',
  'GOOGLE_TIMEOUT',
]);

export const localFallback = (reason: BasemapFallbackReason): TransportBasemap => ({
  source: 'LOCAL_FALLBACK',
  style: LOCAL_BASEMAP_STYLE,
  notice: GOOGLE_REASONS.has(reason) ? GOOGLE_BASEMAP_UNAVAILABLE_NOTICE : LOCAL_BASEMAP_NOTICE,
  reason,
});

/**
 * Rong hay chi co khoang trang deu la CHUA KHAI.
 *
 * Mot bien moi truong dat thanh chuoi rong la chuyen thuong gap trong `docker compose`, va no phai
 * doc ra giong het "khong dat" — chu khong lam MapLibre di tai mot URL rong, hay nap Google voi
 * mot khoa rong roi that bai voi mot loi khong ai hieu.
 */
const present = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() ?? '';
  return trimmed.length === 0 ? null : trimmed;
};

/**
 * Phan quyet TAT DINH: cung cau hinh thi cung nen, va khong nhanh nao goi mang.
 *
 * `PROVIDER` de trong giu dung hanh vi truoc #374 (co `STYLE_URL` thi MapLibre, khong thi cuc bo)
 * — mot moi truong dang chay khong doi nen chi vi ban nay duoc trien khai.
 */
export function resolveBasemap(config: BasemapConfig): TransportBasemap {
  const provider = present(config.provider)?.toLowerCase() ?? null;
  const apiKey = present(config.googleMapsApiKey);
  const styleUrl = present(config.styleUrl);

  if (provider === null) {
    return styleUrl === null
      ? localFallback('NOT_CONFIGURED')
      : { source: 'CONFIGURED_STYLE_URL', style: styleUrl, notice: null };
  }
  if (provider === 'google') {
    return apiKey === null
      ? localFallback('GOOGLE_KEY_MISSING')
      : { source: 'GOOGLE_MAPS', apiKey, mapId: present(config.googleMapsMapId), notice: null };
  }
  if (provider === 'maplibre') {
    return styleUrl === null
      ? localFallback('MAPLIBRE_STYLE_MISSING')
      : { source: 'CONFIGURED_STYLE_URL', style: styleUrl, notice: null };
  }
  return localFallback(provider === 'local' ? 'LOCAL_SELECTED' : 'UNKNOWN_PROVIDER');
}

/**
 * Nen THAT SU dang ve — sau khi Google da tra loi.
 *
 * `resolveBasemap` chi biet cau hinh. Khoa co the bi Google tu choi, script co the bi chan; khi do
 * ban do lui ve nen cuc bo va noi ro — chu khong de lai mot khung xam co hop thoai loi cua Google.
 */
export function effectiveBasemap(
  configured: TransportBasemap,
  googleFailure: GoogleFailureReason | null,
): TransportBasemap {
  if (configured.source !== 'GOOGLE_MAPS' || googleFailure === null) return configured;
  return localFallback(googleFailure);
}

/**
 * Doc bien moi truong — TUNG TEN VIET DU.
 *
 * Next.js thay `process.env.NEXT_PUBLIC_*` bang gia tri luc BUILD, va chi khi ten duoc viet nguyen
 * van; `process.env[ten]` se ra `undefined` trong trinh duyet. Doi bien = build lai, khong phai
 * chi khoi dong lai (xem `docs/phat-trien/van-hanh/ban-do-nen.md`).
 */
export const readBasemapEnv = (): BasemapConfig => ({
  provider: process.env.NEXT_PUBLIC_TRANSPORT_MAP_PROVIDER,
  googleMapsApiKey: process.env.NEXT_PUBLIC_TRANSPORT_GOOGLE_MAPS_API_KEY,
  googleMapsMapId: process.env.NEXT_PUBLIC_TRANSPORT_GOOGLE_MAPS_MAP_ID,
  styleUrl: process.env.NEXT_PUBLIC_TRANSPORT_MAP_STYLE_URL,
});
