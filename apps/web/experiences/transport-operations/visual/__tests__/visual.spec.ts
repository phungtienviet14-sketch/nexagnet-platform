import { describe, expect, it } from 'vitest';
import { LOCAL_BASEMAP_NOTICE, MAP_BASEMAP_SOURCES, resolveBasemap } from '../map-style';
import { FALLBACK_PALETTE, loadedVsEmptyOption, paletteFrom } from '../chart-options';
import type { JourneyDistanceChart } from '../../workspace/journey';

const chart = (over: Partial<JourneyDistanceChart> = {}): JourneyDistanceChart => ({
  sequences: ['Chặng 1', 'Chặng 2'],
  loadedKm: [105, 0],
  emptyKm: [0, 105],
  omittedLegs: 0,
  ...over,
});

describe('nen ban do — cau hinh duoc, va trung thuc khi khong co', () => {
  it('khong khai URL: dung style CUC BO va NOI RA rang nen ngoai chua co', () => {
    const basemap = resolveBasemap(undefined);

    expect(basemap.source).toBe('LOCAL_FALLBACK');
    expect(basemap.notice).toBe(LOCAL_BASEMAP_NOTICE);
    expect(typeof basemap.style).toBe('object');
  });

  /*
   * Mot bien moi truong dat thanh chuoi rong la chuyen thuong gap trong `docker compose`. No phai
   * doc ra giong het "khong dat", chu khong lam MapLibre di tai mot URL rong roi that bai voi mot
   * loi khong ai hieu.
   */
  it('URL rong hay chi co khoang trang deu duoc coi la CHUA KHAI', () => {
    expect(resolveBasemap('').source).toBe('LOCAL_FALLBACK');
    expect(resolveBasemap('   ').source).toBe('LOCAL_FALLBACK');
  });

  it('co khai URL: dung URL do, va khong con cau canh bao nao', () => {
    const basemap = resolveBasemap('  https://tiles.noi-bo.example/style.json  ');

    expect(basemap.source).toBe('CONFIGURED_STYLE_URL');
    expect(basemap.style).toBe('https://tiles.noi-bo.example/style.json');
    expect(basemap.notice).toBeNull();
  });

  /*
   * `#278` N1: *"map tiles/style/provider must be configurable; no UI lock-in to one vendor"* va
   * *"do not introduce a paid map plan automatically"*. Style cuc bo KHONG duoc goi mang: no phai
   * chay duoc trong CI va tren mot may khong co duong ra Internet.
   */
  it('style cuc bo khong tro toi mot nha cung cap tile nao', () => {
    const basemap = resolveBasemap(null);
    const serialised = JSON.stringify(basemap.style);

    expect(serialised).not.toContain('http');
    expect(serialised).not.toMatch(/mapbox|maptiler|google|openstreetmap/i);
  });

  it('hai nguon nen, va ca hai deu duoc dung', () => {
    expect([...MAP_BASEMAP_SOURCES]).toEqual(['CONFIGURED_STYLE_URL', 'LOCAL_FALLBACK']);
    expect(resolveBasemap(null).source).toBe('LOCAL_FALLBACK');
    expect(resolveBasemap('https://x/style.json').source).toBe('CONFIGURED_STYLE_URL');
  });
});

describe('bieu do km — hai chuoi, va mau chang rong den tu bang mau', () => {
  it('km co hang va km rong la HAI chuoi chong nhau, khong mot chuoi to hai mau', () => {
    const option = loadedVsEmptyOption(chart(), FALLBACK_PALETTE) as unknown as {
      series: readonly { name: string; stack: string; itemStyle: { color: string } }[];
    };

    expect(option.series).toHaveLength(2);
    expect(option.series.map((entry) => entry.name)).toEqual(['Km có hàng', 'Km rỗng']);
    expect(option.series.every((entry) => entry.stack === 'km')).toBe(true);
    expect(option.series[1]?.itemStyle.color).toBe(FALLBACK_PALETTE.empty);
  });

  it('chi ve dung so cot bang so nhan truc — khong bia them mot cot nao', () => {
    const option = loadedVsEmptyOption(chart(), FALLBACK_PALETTE) as unknown as {
      xAxis: { data: readonly string[] };
      series: readonly { data: readonly number[] }[];
    };

    expect(option.xAxis.data).toHaveLength(2);
    expect(option.series[0]?.data).toHaveLength(2);
    expect(option.series[1]?.data).toHaveLength(2);
  });

  it('khong chang nao ve duoc thi bieu do rong — khong mot cot mac dinh nao', () => {
    const option = loadedVsEmptyOption(
      chart({ sequences: [], loadedKm: [], emptyKm: [], omittedLegs: 3 }),
      FALLBACK_PALETTE,
    ) as unknown as {
      xAxis: { data: readonly string[] };
      series: readonly { data: readonly number[] }[];
    };

    expect(option.xAxis.data).toEqual([]);
    expect(option.series[0]?.data).toEqual([]);
  });

  it('bang mau doc tu bien CSS, va lui ve mac dinh khi bien rong', () => {
    const style = {
      getPropertyValue: (name: string) => (name === '--tx-stop' ? ' #ff0000 ' : ''),
    };

    const palette = paletteFrom(style);

    expect(palette.empty).toBe('#ff0000');
    expect(palette.loaded).toBe(FALLBACK_PALETTE.loaded);
  });

  it('tat dinh — hai lan dung cung dau vao cho cung tuy chon', () => {
    expect(loadedVsEmptyOption(chart(), FALLBACK_PALETTE)).toEqual(
      loadedVsEmptyOption(chart(), FALLBACK_PALETTE),
    );
  });
});
