'use client';

import { DataTable, PageHeader } from '../components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../components/SectionState';
import {
  toSectionQuery,
  useCorridorInsight,
  useNavigationInput,
} from '../hooks/useTransportWorkspace';
import { buildSectionUrl } from '../navigation';
import { toCorridorInsight, type CorridorRow } from '../workspace/insight';

/**
 * BAO CAO TUNG TUYEN — `#274` doi *"báo cáo chi tiết từng tuyến trên bản đồ"* (#278 N6).
 *
 * ===========================================================================
 * BAN DO CUA MOT TUYEN LA BAN DO CUA CAC VONG CHAY TREN TUYEN DO.
 *
 * Man hinh nay KHONG ve mot duong "dai dien" cho ca tuyen. Mot duong trung binh cua nam vong chay
 * la mot duong khong xe nao tung di, va tren ban do no doc y het mot duong that. Thay vao do moi
 * dong mang MA vong chay va mo thang sang ban do cua chinh vong chay do — noi toa do co chu, va noi
 * quyen xem toa do duoc kiem lai.
 *
 * ===========================================================================
 * HAI CAU CONG BO NAM TREN BANG, KHONG O CUOI TRANG.
 *
 * Tuyen dang gom theo NHAN TU DO, va km rong dang duoc quy theo mot quy tac cu the. Ai doc bang nay
 * ma khong doc hai cau do se tuong day la nhung con so tuyet doi.
 */
const CORRIDOR_COLUMNS = [
  { key: 'route', header: 'Tuyến', render: (row: CorridorRow) => row.route, isRowHeader: true },
  { key: 'legs', header: 'Số chặng', render: (row: CorridorRow) => row.legCount, isNumeric: true },
  {
    key: 'orders',
    header: 'Số đơn',
    render: (row: CorridorRow) => row.orderCount,
    isNumeric: true,
  },
  {
    key: 'loaded',
    header: 'Km có hàng',
    render: (row: CorridorRow) => row.loadedKm,
    isNumeric: true,
  },
  {
    key: 'median',
    header: 'Km trung vị',
    render: (row: CorridorRow) => row.medianKm,
    isNumeric: true,
  },
  {
    key: 'empty',
    header: 'Km rỗng quy về',
    render: (row: CorridorRow) => row.emptyKm,
    isNumeric: true,
  },
  {
    key: 'drill',
    header: 'Mở bản đồ',
    render: (row: CorridorRow) =>
      row.firstRunCode === null ? (
        ''
      ) : (
        <a href={buildSectionUrl('journey', row.firstRunCode)}>{row.firstRunCode}</a>
      ),
  },
  {
    key: 'note',
    header: 'Ghi chú',
    render: (row: CorridorRow) => (row.incomplete ? 'Còn chặng chưa nhập km' : ''),
  },
];

export function CorridorView(): React.ReactElement {
  const input = useNavigationInput();
  const query = toSectionQuery(useCorridorInsight(input, {}));
  const model = query.data === undefined ? null : toCorridorInsight(query.data);

  return (
    <>
      <PageHeader
        title="Báo cáo tuyến"
        summary="Mỗi tuyến chạy bao nhiêu chuyến, dài bao nhiêu, và kéo theo bao nhiêu km rỗng."
        context={model === null ? undefined : `Khoảng ${model.rangeLabel}`}
      />

      {query.errorMessage === null ? null : (
        <ErrorState message={query.errorMessage} onRetry={query.refetch} />
      )}
      {query.isLoading ? <LoadingState label="Đang gom số liệu theo tuyến…" /> : null}

      {model === null ? null : model.corridors.length === 0 ? (
        <EmptyState title="Chưa có chặng có hàng nào trong khoảng này." />
      ) : (
        <section className="tx-panel" aria-label="Các tuyến">
          <DataTable
            caption={`Các tuyến trong khoảng ${model.rangeLabel}`}
            columns={CORRIDOR_COLUMNS}
            rows={model.corridors}
            rowKey={(row) => row.key}
          />
          <ul className="tx-notes" aria-label="Cách đọc bảng này">
            <li>{model.groupingNote}</li>
            <li>{model.emptyAttributionNote}</li>
          </ul>
        </section>
      )}
    </>
  );
}
