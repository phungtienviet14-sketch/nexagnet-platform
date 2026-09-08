'use client';

import { useCallback } from 'react';
import { DataTable, MetricCard, PageHeader } from '../components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../components/SectionState';
import {
  toSectionQuery,
  useFleetInsight,
  useNavigationInput,
} from '../hooks/useTransportWorkspace';
import { loadedVsEmptyOption, type ChartPalette } from '../visual/chart-options';
import { TransportChart } from '../visual/TransportChart';
import { toFleetInsight, type FleetVehicleRow } from '../workspace/insight';

/**
 * BANG DOI XE — KPI, khac han man hinh HO SO xe (#278 N7).
 *
 * `#278` N7 doi *"Build the actual KPI dashboard distinct from the current Fleet master-data
 * screen"*. Man `fleet` tra loi "doi xe co nhung chiec nao"; man nay tra loi "chung chay the nao".
 *
 * MOI CON SO DEU CO THE LA DAU GACH. Do la tinh chat, khong phai thieu sot: mot chiec xe con chang
 * chua nhap km thi km cua no la KHONG BIET, va bang danh dau dong do thay vi dien 0 vao.
 */
const VEHICLE_COLUMNS = [
  {
    key: 'plate',
    header: 'Biển số',
    render: (row: FleetVehicleRow) => row.plate,
    isRowHeader: true,
  },
  { key: 'status', header: 'Trạng thái', render: (row: FleetVehicleRow) => row.status },
  {
    key: 'runs',
    header: 'Vòng chạy',
    render: (row: FleetVehicleRow) => row.runCount,
    isNumeric: true,
  },
  {
    key: 'days',
    header: 'Ngày có việc',
    render: (row: FleetVehicleRow) => row.activeDays,
    isNumeric: true,
  },
  {
    key: 'util',
    header: 'Tỷ lệ sử dụng',
    render: (row: FleetVehicleRow) => row.utilisation,
    isNumeric: true,
  },
  {
    key: 'loaded',
    header: 'Km có hàng',
    render: (row: FleetVehicleRow) => row.loadedKm,
    isNumeric: true,
  },
  {
    key: 'empty',
    header: 'Km rỗng',
    render: (row: FleetVehicleRow) => row.emptyKm,
    isNumeric: true,
  },
  {
    key: 'ratio',
    header: 'Tỷ lệ rỗng',
    render: (row: FleetVehicleRow) => row.emptyRatio,
    isNumeric: true,
  },
  {
    key: 'note',
    header: 'Ghi chú',
    render: (row: FleetVehicleRow) => (row.incomplete ? 'Còn chặng chưa nhập km' : ''),
  },
];

export function FleetInsightView(): React.ReactElement {
  const input = useNavigationInput();
  /*
   * KHOANG do MAY CHU chot (30 ngay gan nhat theo mui gio tenant). Man hinh KHONG tu tinh bang
   * `new Date()`: mot nguoi mo bao cao luc 00:30 gio Viet Nam se ra mot khoang lech mot ngay so voi
   * dong nghiep ngoi canh — `#278` N10.
   */
  const query = toSectionQuery(useFleetInsight(input, {}));
  const model = query.data === undefined ? null : toFleetInsight(query.data);

  const chart = model?.chart;
  const buildOption = useCallback(
    (palette: ChartPalette) =>
      loadedVsEmptyOption(
        {
          sequences: chart?.plates ?? [],
          loadedKm: chart?.loadedKm ?? [],
          emptyKm: chart?.emptyKm ?? [],
          omittedLegs: chart?.omittedVehicles ?? 0,
        },
        palette,
      ),
    [chart],
  );

  return (
    <>
      <PageHeader
        title="Bảng đội xe"
        summary="Xe chạy được bao nhiêu, rỗng bao nhiêu, và chiếc nào đang chạy rỗng nhiều nhất."
        context={model === null ? undefined : `Khoảng ${model.rangeLabel}`}
      />

      {query.errorMessage === null ? null : (
        <ErrorState message={query.errorMessage} onRetry={query.refetch} />
      )}
      {query.isLoading ? <LoadingState label="Đang đọc số liệu đội xe…" /> : null}

      {model === null ? null : (
        <>
          <section className="tx-cards" aria-label="Số liệu đội xe">
            {model.metrics.map((metric) => (
              <MetricCard
                key={metric.key}
                label={metric.label}
                value={metric.value}
                hint={metric.hint}
              />
            ))}
          </section>

          <section className="tx-panel" aria-label="Km có hàng và km rỗng theo xe">
            <h2>Km có hàng vs km rỗng, theo xe</h2>
            {model.chart.plates.length === 0 ? (
              <EmptyState title="Chưa xe nào đủ số km để vẽ biểu đồ." />
            ) : (
              <TransportChart
                ariaLabel="Biểu đồ km có hàng và km rỗng theo từng xe"
                buildOption={buildOption}
              />
            )}
            {model.chart.omittedVehicles > 0 ? (
              <p className="tx-note tx-note--warn">
                {model.chart.omittedVehicles} xe không có trên biểu đồ vì còn chặng chưa nhập km.
              </p>
            ) : null}
          </section>

          {model.worstEmptyRatio.length === 0 ? null : (
            <section className="tx-panel" aria-label="Xe chạy rỗng nhiều nhất">
              <h2>Chạy rỗng nhiều nhất</h2>
              <ol className="tx-worklist">
                {model.worstEmptyRatio.map((row) => (
                  <li key={row.key}>
                    <strong>{row.plate}</strong> — rỗng {row.emptyRatio} ({row.emptyKm} /{' '}
                    {row.totalKm})
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section className="tx-panel" aria-label="Từng xe">
            <h2>Từng xe</h2>
            <DataTable
              caption={`Số liệu từng xe trong khoảng ${model.rangeLabel}`}
              columns={VEHICLE_COLUMNS}
              rows={model.vehicles}
              rowKey={(row) => row.key}
            />
            {/*
             * CONG THUC di CUNG con so, khong nam o chu thich cuoi trang. `#278` N7 cam dat mot ty
             * le "su dung" ma khong noi tu so/mau so la gi.
             */}
            <p className="tx-note">{model.utilisationNote}</p>
          </section>
        </>
      )}
    </>
  );
}
