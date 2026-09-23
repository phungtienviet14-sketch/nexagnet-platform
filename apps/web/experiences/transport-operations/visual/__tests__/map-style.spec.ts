import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BASEMAP_FALLBACK_REASONS,
  GOOGLE_BASEMAP_UNAVAILABLE_NOTICE,
  LOCAL_BASEMAP_NOTICE,
  MAP_BASEMAP_SOURCES,
  effectiveBasemap,
  readBasemapEnv,
  resolveBasemap,
  type TransportBasemap,
} from '../map-style';

/*
 * `#374` §2 + §8 (unit/provider) — nen nao, va vi sao, TAT DINH theo cau hinh.
 *
 * Khong bai nao o day goi mang: `resolveBasemap` va `effectiveBasemap` la ham thuan. Nap Google
 * that (va hong that) do o `google-maps-loader.spec.ts`, `google-maps-session.spec.ts` va tren
 * trinh duyet.
 */

/* Khong mang dang `AIza…`: day khong phai khoa, va bo quet bi mat khong nen phai doan dieu do. */
const KEY = 'khoa-thu-khong-phai-khoa-that';
const STYLE = 'https://tiles.noi-bo.example/style.json';

const reasonOf = (basemap: TransportBasemap): string | null =>
  basemap.source === 'LOCAL_FALLBACK' ? basemap.reason : null;

describe('nha cung cap nen — sau truong hop cua #374 §8', () => {
  it('1. google + khoa → GOOGLE_MAPS, va khong con cau canh bao nao', () => {
    const basemap = resolveBasemap({ provider: 'google', googleMapsApiKey: `  ${KEY}  ` });

    expect(basemap).toEqual({ source: 'GOOGLE_MAPS', apiKey: KEY, mapId: null, notice: null });
  });

  /* Map ID la TUY CHON: co thi nen vector (deck.gl interleaved), khong co van la Google. */
  it('1b. google + khoa + Map ID → mang Map ID; Map ID rong coi nhu khong co', () => {
    const withMapId = resolveBasemap({
      provider: 'google',
      googleMapsApiKey: KEY,
      googleMapsMapId: '  map-id-thu  ',
    });
    const blankMapId = resolveBasemap({
      provider: 'google',
      googleMapsApiKey: KEY,
      googleMapsMapId: '   ',
    });

    expect(withMapId).toEqual({
      source: 'GOOGLE_MAPS',
      apiKey: KEY,
      mapId: 'map-id-thu',
      notice: null,
    });
    expect(blankMapId).toEqual({ source: 'GOOGLE_MAPS', apiKey: KEY, mapId: null, notice: null });
  });

  it('2. google + THIEU khoa → nen cuc bo, va noi ro nen Google chua kha dung', () => {
    const basemap = resolveBasemap({ provider: 'google' });

    expect(basemap.source).toBe('LOCAL_FALLBACK');
    expect(reasonOf(basemap)).toBe('GOOGLE_KEY_MISSING');
    expect(basemap.notice).toBe(GOOGLE_BASEMAP_UNAVAILABLE_NOTICE);
  });

  it('3. maplibre + style URL → CONFIGURED_STYLE_URL', () => {
    const basemap = resolveBasemap({ provider: 'maplibre', styleUrl: `  ${STYLE}  ` });

    expect(basemap).toEqual({ source: 'CONFIGURED_STYLE_URL', style: STYLE, notice: null });
  });

  it('4. local → nen cuc bo, KE CA khi khoa Google va style URL deu co san', () => {
    const basemap = resolveBasemap({ provider: 'local', googleMapsApiKey: KEY, styleUrl: STYLE });

    expect(basemap.source).toBe('LOCAL_FALLBACK');
    expect(reasonOf(basemap)).toBe('LOCAL_SELECTED');
    expect(basemap.notice).toBe(LOCAL_BASEMAP_NOTICE);
  });

  /*
   * Mot bien moi truong dat thanh chuoi rong la chuyen thuong gap trong `docker compose`. No phai
   * doc ra giong het "khong dat" — chu khong nap Google voi mot khoa rong.
   */
  it('5. chuoi rong hay chi co khoang trang deu la CHUA KHAI', () => {
    expect(reasonOf(resolveBasemap({ provider: 'google', googleMapsApiKey: '  \t ' }))).toBe(
      'GOOGLE_KEY_MISSING',
    );
    expect(reasonOf(resolveBasemap({ provider: 'maplibre', styleUrl: '   ' }))).toBe(
      'MAPLIBRE_STYLE_MISSING',
    );
    expect(reasonOf(resolveBasemap({ provider: '   ', googleMapsApiKey: KEY }))).toBe(
      'NOT_CONFIGURED',
    );
    expect(reasonOf(resolveBasemap({ provider: '', styleUrl: '' }))).toBe('NOT_CONFIGURED');
  });

  it('6. khong cau hinh gi → nen cuc bo, va hai lan goi cho cung mot ket qua', () => {
    const first = resolveBasemap({});
    const second = resolveBasemap({ provider: undefined, googleMapsApiKey: null, styleUrl: null });

    expect(first.source).toBe('LOCAL_FALLBACK');
    expect(reasonOf(first)).toBe('NOT_CONFIGURED');
    expect(first.notice).toBe(LOCAL_BASEMAP_NOTICE);
    expect(second).toEqual(first);
  });
});

describe('khong mot nha cung cap tra phi nao duoc bat ngam (#278 N1, #374 §2)', () => {
  it('co khoa Google nhung KHONG khai provider → khong goi Google', () => {
    const basemap = resolveBasemap({ googleMapsApiKey: KEY });

    expect(basemap.source).toBe('LOCAL_FALLBACK');
    expect(reasonOf(basemap)).toBe('NOT_CONFIGURED');
  });

  it('google thieu khoa ma co style URL → nen CUC BO, khong nhay sang MapLibre', () => {
    const basemap = resolveBasemap({ provider: 'google', styleUrl: STYLE });

    expect(basemap.source).toBe('LOCAL_FALLBACK');
    expect(reasonOf(basemap)).toBe('GOOGLE_KEY_MISSING');
  });

  it('ten nha cung cap la (vd `mapbox`) → nen cuc bo, khong doan', () => {
    const basemap = resolveBasemap({ provider: 'mapbox', googleMapsApiKey: KEY, styleUrl: STYLE });

    expect(basemap.source).toBe('LOCAL_FALLBACK');
    expect(reasonOf(basemap)).toBe('UNKNOWN_PROVIDER');
  });

  it('ten provider khong phan biet hoa thuong', () => {
    expect(resolveBasemap({ provider: ' Google ', googleMapsApiKey: KEY }).source).toBe(
      'GOOGLE_MAPS',
    );
    expect(resolveBasemap({ provider: 'MAPLIBRE', styleUrl: STYLE }).source).toBe(
      'CONFIGURED_STYLE_URL',
    );
  });

  /* Moi truong dang chay truoc #374 chi co `STYLE_URL`: no KHONG duoc doi nen sau khi nang cap. */
  it('tuong thich nguoc: khong khai provider ma co style URL → MapLibre nhu truoc', () => {
    expect(resolveBasemap({ styleUrl: STYLE })).toEqual({
      source: 'CONFIGURED_STYLE_URL',
      style: STYLE,
      notice: null,
    });
  });
});

describe('Google hong → nen cuc bo, noi NEN hong, khong noi toa do sai (#374 §6)', () => {
  const google = resolveBasemap({ provider: 'google', googleMapsApiKey: KEY });

  it.each(['GOOGLE_SCRIPT_FAILED', 'GOOGLE_AUTH_FAILED', 'GOOGLE_TIMEOUT'] as const)(
    '%s → LOCAL_FALLBACK kem cau cua #374',
    (reason) => {
      const basemap = effectiveBasemap(google, reason);

      expect(basemap.source).toBe('LOCAL_FALLBACK');
      expect(reasonOf(basemap)).toBe(reason);
      expect(basemap.notice).toBe(GOOGLE_BASEMAP_UNAVAILABLE_NOTICE);
    },
  );

  it('Google chua hong thi giu nguyen nen Google', () => {
    expect(effectiveBasemap(google, null)).toBe(google);
  });

  it('nen khong phai Google thi loi Google khong lien quan', () => {
    const maplibre = resolveBasemap({ provider: 'maplibre', styleUrl: STYLE });

    expect(effectiveBasemap(maplibre, 'GOOGLE_AUTH_FAILED')).toBe(maplibre);
  });

  it('cau thong bao noi tuyen va moc VAN dung, va khong lo khoa', () => {
    const basemap = effectiveBasemap(google, 'GOOGLE_AUTH_FAILED');

    expect(basemap.notice).toContain('tuyến và mốc vẫn đang được hiển thị đúng');
    expect(JSON.stringify(basemap)).not.toContain(KEY);
  });
});

describe('nen cuc bo — trung thuc va khong goi mang', () => {
  /*
   * `#278` N1: *"support a deterministic/local/dev style path sufficient for CI"*. Style cuc bo
   * KHONG duoc goi mang: no phai chay duoc trong CI va tren mot may khong co duong ra Internet.
   */
  it('style cuc bo khong tro toi mot nha cung cap tile nao', () => {
    const basemap = resolveBasemap({});
    const serialised = JSON.stringify(basemap.source === 'LOCAL_FALLBACK' ? basemap.style : null);

    expect(serialised).not.toContain('http');
    expect(serialised).not.toMatch(/mapbox|maptiler|google|openstreetmap/i);
  });

  it('moi nhanh cuc bo deu co cau thong bao, khong nhanh nao im lang', () => {
    const configs = [
      {},
      { provider: 'local' },
      { provider: 'mapbox' },
      { provider: 'maplibre' },
      { provider: 'google' },
    ];

    for (const config of configs) {
      const basemap = resolveBasemap(config);
      expect(basemap.source).toBe('LOCAL_FALLBACK');
      expect(basemap.notice?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('ba nguon nen va tam ly do lui ve — khong them bot lang le', () => {
    expect([...MAP_BASEMAP_SOURCES]).toEqual([
      'GOOGLE_MAPS',
      'CONFIGURED_STYLE_URL',
      'LOCAL_FALLBACK',
    ]);
    expect(BASEMAP_FALLBACK_REASONS).toHaveLength(8);
  });
});

describe('doc cau hinh tu moi truong', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('doc dung bon bien NEXT_PUBLIC_TRANSPORT_*', () => {
    vi.stubEnv('NEXT_PUBLIC_TRANSPORT_MAP_PROVIDER', 'google');
    vi.stubEnv('NEXT_PUBLIC_TRANSPORT_GOOGLE_MAPS_API_KEY', KEY);
    vi.stubEnv('NEXT_PUBLIC_TRANSPORT_GOOGLE_MAPS_MAP_ID', 'map-id-thu');
    vi.stubEnv('NEXT_PUBLIC_TRANSPORT_MAP_STYLE_URL', STYLE);

    expect(readBasemapEnv()).toEqual({
      provider: 'google',
      googleMapsApiKey: KEY,
      googleMapsMapId: 'map-id-thu',
      styleUrl: STYLE,
    });
    expect(resolveBasemap(readBasemapEnv())).toEqual({
      source: 'GOOGLE_MAPS',
      apiKey: KEY,
      mapId: 'map-id-thu',
      notice: null,
    });
  });
});
