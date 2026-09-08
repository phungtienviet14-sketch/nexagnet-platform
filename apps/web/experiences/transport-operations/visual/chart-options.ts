import type { JourneyDistanceChart } from '../workspace/journey';

/**
 * TUY CHON BIEU DO — HAM THUAN, khong `echarts`, khong DOM (#278 N1/N10).
 *
 * ECharts nhan mot doi tuong tuy chon. Neu doi tuong do duoc dung ben trong mot component React thi
 * khong bai `.ts` nao doc duoc no (`vitest.config.ts` cua `apps/web` chi nhan `.ts`, moi truong
 * `node`, khong DOM). Nen phep dung nam o day, va component chi con viec giao no cho ECharts.
 *
 * ===========================================================================
 * MAU DUOC TRUYEN VAO, KHONG DUOC VIET CUNG.
 *
 * Bang mau that nam o `transport-operations.css` duoi dang bien CSS tren `.tx-shell`. Viet lai ma
 * mau o day se de ra hai bang mau cho cung mot san pham, va chung se lech nhau o lan doi thuong
 * hieu dau tien. Component doc bien CSS luc chay roi truyen xuong.
 */

export interface ChartPalette {
  /** Mau cua chang CO HANG. */
  readonly loaded: string;
  /** Mau cua chang RONG — `#274` §4 doi mau DO. */
  readonly empty: string;
  readonly ink: string;
  readonly inkSoft: string;
  readonly line: string;
  readonly paper: string;
}

/** Kieu tra ve co y de long: `echarts.setOption` nhan mot doi tuong tuy chon rong. */
export type ChartOption = Readonly<Record<string, unknown>>;

/**
 * KM CO HANG vs KM RONG theo tung chang — cot chong.
 *
 * Hai chuoi chu khong mot: cau hoi ma bieu do nay tra loi la *"chang nao la chang rong, va no dai
 * bao nhieu"*, va mot chuoi duy nhat to hai mau se lam mot chang rong 100km doc giong mot chang co
 * hang 100km cho toi khi nguoi dung ro chuot vao.
 *
 * `omittedLegs` KHONG duoc ve. Mot chang chua nhap km ma hien thanh cot cao 0 doc y het mot chang
 * that su dai 0 km — man hinh in con so bi bo ra thanh chu, ben canh bieu do.
 */
export function loadedVsEmptyOption(
  chart: JourneyDistanceChart,
  palette: ChartPalette,
): ChartOption {
  return {
    animation: false,
    grid: { left: 48, right: 16, top: 28, bottom: 32, containLabel: true },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: {
      data: ['Km có hàng', 'Km rỗng'],
      textStyle: { color: palette.inkSoft },
      top: 0,
    },
    xAxis: {
      type: 'category',
      data: [...chart.sequences],
      axisLabel: { color: palette.inkSoft },
      axisLine: { lineStyle: { color: palette.line } },
    },
    yAxis: {
      type: 'value',
      name: 'km',
      nameTextStyle: { color: palette.inkSoft },
      axisLabel: { color: palette.inkSoft },
      splitLine: { lineStyle: { color: palette.line } },
    },
    series: [
      {
        name: 'Km có hàng',
        type: 'bar',
        stack: 'km',
        data: [...chart.loadedKm],
        itemStyle: { color: palette.loaded },
      },
      {
        name: 'Km rỗng',
        type: 'bar',
        stack: 'km',
        data: [...chart.emptyKm],
        itemStyle: { color: palette.empty },
      },
    ],
  };
}

/**
 * BANG MAU MAC DINH — chi dung khi khong doc duoc bien CSS (kiem thu, ket xuat may chu).
 *
 * Cac gia tri trung voi `--tx-go` / `--tx-stop` / ... trong `transport-operations.css`. Trung o day
 * la mot ban SAO co chu dich, va bai `chart-options.spec.ts` khong khoa chung: cai phai dung la
 * mau chang rong DOC RA duoc la mau do, chu khong phai mot ma hex cu the.
 */
export const FALLBACK_PALETTE: ChartPalette = {
  loaded: '#1c6b47',
  empty: '#94271e',
  ink: '#1b1a17',
  inkSoft: '#575249',
  line: '#e3ded4',
  paper: '#ffffff',
};

/**
 * Doc bang mau tu bien CSS cua `.tx-shell`.
 *
 * Nhan `CSSStyleDeclaration` chu khong tu goi `getComputedStyle`: nho vay ham van la ham thuan va
 * mot bai `.ts` truyen vao duoc mot doi tuong gia.
 */
export function paletteFrom(style: Pick<CSSStyleDeclaration, 'getPropertyValue'>): ChartPalette {
  const read = (name: string, fallback: string): string => {
    const value = style.getPropertyValue(name).trim();
    return value.length > 0 ? value : fallback;
  };

  return {
    loaded: read('--tx-go', FALLBACK_PALETTE.loaded),
    empty: read('--tx-stop', FALLBACK_PALETTE.empty),
    ink: read('--tx-ink', FALLBACK_PALETTE.ink),
    inkSoft: read('--tx-ink-soft', FALLBACK_PALETTE.inkSoft),
    line: read('--tx-line', FALLBACK_PALETTE.line),
    paper: read('--tx-paper', FALLBACK_PALETTE.paper),
  };
}
