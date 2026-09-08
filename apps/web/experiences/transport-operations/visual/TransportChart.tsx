'use client';

import { useEffect, useRef } from 'react';
import {
  FALLBACK_PALETTE,
  paletteFrom,
  type ChartOption,
  type ChartPalette,
} from './chart-options';

/**
 * BO NOI MONG SANG ECharts — do repo tu giu, khong qua mot boc ngoai (#278 N1).
 *
 * `#278` N1: *"prefer a thin repo-owned ECharts adapter over an unnecessary stale wrapper"*. Cac
 * boc React cho ECharts deu them mot vong doi component nua giua React va `echarts.init`, va chung
 * tut hau moi lan ECharts len ban chinh. Cai o day chi lam ba viec: `init`, `setOption`, `dispose`.
 *
 * ===========================================================================
 * NAP DONG, VA DO LA DIEU KIEN DE PHAN CON LAI CUA SAN PHAM KHONG NANG LEN.
 *
 * `echarts` la ~1MB truoc khi nen. Nap tinh se dua no vao goi dung chung cua MOI man hinh van tai,
 * ke ca man hinh danh sach chuyen khong co bieu do nao. Nen o day dung `await import()` BEN TRONG
 * `useEffect`, va chi nap dung nhung module can dung (`BarChart` + luoi + chu giai + goi y + trinh
 * ve canvas) thay vi goi `echarts` day du.
 *
 * Do la lan do that: ban production Next 15.5 giu `First Load JS` dung chung o 104 kB sau khi ca
 * ECharts, MapLibre va deck.gl vao repo.
 */

export interface TransportChartProps {
  /** Nhan mo ta cho nguoi doc man hinh — bieu do la `img` doi voi cong nghe ho tro. */
  readonly ariaLabel: string;
  /** Ham dung tuy chon, nhan bang mau doc tu bien CSS luc chay. */
  readonly buildOption: (palette: ChartPalette) => ChartOption;
  readonly heightPx?: number;
}

interface ChartHandle {
  setOption: (option: ChartOption) => void;
  resize: () => void;
  dispose: () => void;
}

export function TransportChart({
  ariaLabel,
  buildOption,
  heightPx = 260,
}: TransportChartProps): React.ReactElement {
  const host = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = host.current;
    if (element === null) return;

    let disposed = false;
    let chart: ChartHandle | null = null;

    void (async () => {
      const [core, charts, components, renderers] = await Promise.all([
        import('echarts/core'),
        import('echarts/charts'),
        import('echarts/components'),
        import('echarts/renderers'),
      ]);

      core.use([
        charts.BarChart,
        components.GridComponent,
        components.TooltipComponent,
        components.LegendComponent,
        renderers.CanvasRenderer,
      ]);

      if (disposed) return;

      /*
       * Doc bang mau TU CHINH the dang gan. `.tx-shell` khai bien CSS o do, nen mot lan doi thuong
       * hieu di thang vao bieu do ma khong ai phai nho sua mot bang mau thu hai.
       */
      const palette =
        typeof window === 'undefined'
          ? FALLBACK_PALETTE
          : paletteFrom(window.getComputedStyle(element));

      const instance = core.init(element);
      instance.setOption(buildOption(palette));
      chart = instance as unknown as ChartHandle;
    })();

    const onResize = (): void => chart?.resize();
    window.addEventListener('resize', onResize);

    return () => {
      disposed = true;
      window.removeEventListener('resize', onResize);
      chart?.dispose();
    };
  }, [buildOption]);

  return (
    <div
      ref={host}
      className="tx-chart"
      style={{ height: `${heightPx}px` }}
      role="img"
      aria-label={ariaLabel}
      data-testid="tx-chart"
    />
  );
}
