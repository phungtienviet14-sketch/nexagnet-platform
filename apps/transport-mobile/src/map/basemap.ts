/**
 * NEN BAN DO — chon THUAN tu cau hinh luc dung (port y nghia cua web `visual/map-style.ts`).
 *
 *   mac dinh                         -> OpenFreeMap "liberty" (khong khoa, khong dinh danh trong URL)
 *   EXPO_PUBLIC_MAP_STYLE_URL        -> kieu ban do do doanh nghiep tu khai
 *   EXPO_PUBLIC_MAP_PROVIDER=local   -> nen TRONG noi bo (khong tile, khong glyph): CI, anh chup, may
 *                                       khong ra duoc Internet. Toa do van dung; thieu la duong sa.
 *
 * GHI NGUON la BAT BUOC voi nen ngoai (ODbL) va phai NHIN THAY duoc, khong giau sau mot nut.
 */
export const OPENFREEMAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
export const OPENFREEMAP_ATTRIBUTION = 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap';
export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';

export const LOCAL_BASEMAP_NOTICE =
  'Nền bản đồ ngoài chưa được cấu hình, nên bản đồ chỉ vẽ các điểm trên nền trống. Toạ độ vẫn ' +
  'đúng; phần thiếu là hình dạng đường sá.';

export const BASEMAP_UNAVAILABLE_NOTICE =
  'Không tải được nền bản đồ; các điểm vẫn đang được hiển thị đúng trên nền đơn giản.';

export interface LocalStyle {
  readonly version: 8;
  readonly sources: Record<string, never>;
  readonly layers: ReadonlyArray<{
    readonly id: string;
    readonly type: 'background';
    readonly paint: { readonly 'background-color': string };
  }>;
}

export function localStyle(background = '#EAE5DA'): LocalStyle {
  return {
    version: 8,
    sources: {},
    layers: [
      { id: 'nx-background', type: 'background', paint: { 'background-color': background } },
    ],
  };
}

export type Basemap =
  | { readonly kind: 'REMOTE'; readonly styleUrl: string; readonly attribution: string }
  | { readonly kind: 'LOCAL'; readonly notice: string };

export interface BasemapConfig {
  readonly provider?: string | null;
  readonly styleUrl?: string | null;
}

function isHttpsUrl(value: string): boolean {
  return /^https:\/\/[^\s/]+\/\S*$/i.test(value);
}

export function resolveBasemap(config: BasemapConfig): Basemap {
  const provider = (config.provider ?? '').trim().toLowerCase();
  if (provider === 'local') return { kind: 'LOCAL', notice: LOCAL_BASEMAP_NOTICE };
  const styleUrl = (config.styleUrl ?? '').trim();
  if (styleUrl !== '') {
    if (!isHttpsUrl(styleUrl)) return { kind: 'LOCAL', notice: LOCAL_BASEMAP_NOTICE };
    const attribution = styleUrl.startsWith('https://tiles.openfreemap.org/')
      ? OPENFREEMAP_ATTRIBUTION
      : OSM_ATTRIBUTION;
    return { kind: 'REMOTE', styleUrl, attribution };
  }
  if (provider === '' || provider === 'openfreemap') {
    return {
      kind: 'REMOTE',
      styleUrl: OPENFREEMAP_STYLE_URL,
      attribution: OPENFREEMAP_ATTRIBUTION,
    };
  }
  // Ten nha cung cap la (hoac can khoa ma ban dung nay khong co): nen trong, noi that — khong nhay
  // am tham sang nha cung cap khac.
  return { kind: 'LOCAL', notice: LOCAL_BASEMAP_NOTICE };
}
