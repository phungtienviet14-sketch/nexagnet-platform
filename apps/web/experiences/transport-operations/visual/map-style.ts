import type { StyleSpecification } from 'maplibre-gl';

/**
 * NEN BAN DO — mot quyet dinh co DO, khong phai mot mac dinh (#278 N1).
 *
 * ===========================================================================
 * KHONG MOT NHA CUNG CAP TILE NAO DUOC NUONG VAO MA.
 *
 * `#278` N1: *"map tiles/style/provider must be configurable; no UI lock-in to one vendor"* va
 * *"do not introduce a paid map plan automatically"*. Nen o day khong co mot URL nao cua Mapbox,
 * Google hay MapTiler. Khach nao co hop dong tile thi khai `NEXT_PUBLIC_TRANSPORT_MAP_STYLE_URL`;
 * khong khai thi ban do van chay.
 *
 * ===========================================================================
 * NEN CUC BO KHONG PHAI MOT BAN DO GIA.
 *
 * Khi khong co tile, `LOCAL_FALLBACK` ve mot nen TRONG — mot mau nen, khong duong bo, khong ten
 * tinh. Cai do la co y: mot nen trong noi that rang he thong khong biet hinh dang mat dat o day.
 * Duong di, cac diem moc va chang rong mau do VAN ve dung toa do va van doc duoc — do la thu bao
 * cao nay ton tai de cho xem.
 *
 * `#278` N1 goi dung ten dieu nay: *"support a deterministic/local/dev style path sufficient for CI
 * and honestly mark external basemap runtime not proven"*. Nen `notice` KHONG duoc `null` o nhanh
 * cuc bo — man hinh phai in no ra.
 */

export const MAP_BASEMAP_SOURCES = ['CONFIGURED_STYLE_URL', 'LOCAL_FALLBACK'] as const;
export type MapBasemapSource = (typeof MAP_BASEMAP_SOURCES)[number];

export interface TransportBasemap {
  readonly source: MapBasemapSource;
  /** Chuoi = URL style ngoai; doi tuong = style cuc bo khong goi mang. */
  readonly style: string | StyleSpecification;
  /** `null` CHI khi nen ngoai da duoc cau hinh. Nhanh cuc bo luon co mot cau chu. */
  readonly notice: string | null;
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
 * `styleUrl` rong hay chi co khoang trang deu duoc coi la CHUA KHAI.
 *
 * Mot bien moi truong dat thanh chuoi rong la chuyen thuong gap trong `docker compose`, va no phai
 * doc ra giong het "khong dat" — chu khong lam MapLibre di tai mot URL rong roi that bai voi mot
 * loi khong ai hieu.
 */
export function resolveBasemap(styleUrl: string | null | undefined): TransportBasemap {
  const trimmed = styleUrl?.trim() ?? '';
  if (trimmed.length === 0) {
    return { source: 'LOCAL_FALLBACK', style: LOCAL_BASEMAP_STYLE, notice: LOCAL_BASEMAP_NOTICE };
  }
  return { source: 'CONFIGURED_STYLE_URL', style: trimmed, notice: null };
}
