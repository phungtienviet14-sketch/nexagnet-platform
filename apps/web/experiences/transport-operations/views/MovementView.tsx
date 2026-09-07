'use client';

import { useState } from 'react';
import { DataTable, MetricCard, PageHeader, StatusBadge } from '../components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../components/SectionState';
import type { StatusTone } from '../customer-view';
import {
  toSectionQuery,
  useNavigationInput,
  useRunDistance,
  useTransportOrders,
  useVehicleRunDetail,
  useVehicleRuns,
  useVehicles,
} from '../hooks/useTransportWorkspace';
import type {
  RunLeg,
  TransportOrder,
  TransportOrderStatus,
  VehicleRun,
  VehicleRunStatus,
} from '../transport-types';

/**
 * VONG CHAY & DON HANG — hai truc doc lap (#232 `D-01`).
 *
 * Man hinh nay ton tai de tra loi mot cau ma be mat chuyen v1 khong tra loi duoc: chieu ve xe chay
 * rong bao nhieu km. Nen thu duoc lam noi bat o day khong phai danh sach, ma la cot `Loai` cua tung
 * chang va o `Km rong` cua vong chay.
 *
 * MOT CAM tuyet doi: man hinh KHONG tu cong km. `loadedKm`/`emptyKm`/`emptyRatio` deu do may chu
 * tra (`GET /transport/runs/:id/distance`). Va khi con mot chang thieu km, may chu tra
 * `complete = false` + `emptyRatio = null` — man hinh phai NOI RA dieu do thay vi dien 0 vao cho
 * trong, vi mot ty le tinh tren du lieu khuyet trong y het mot ty le that.
 */

const LEG_KIND_LABEL: Readonly<Record<RunLeg['kind'], string>> = {
  LOADED: 'Có hàng',
  EMPTY: 'Chạy rỗng',
};

const legKindTone = (kind: RunLeg['kind']): StatusTone => (kind === 'LOADED' ? 'go' : 'wait');

const runStatusTone = (status: VehicleRunStatus): StatusTone => {
  switch (status) {
    case 'PLANNED':
      return 'wait';
    case 'ACTIVE':
      return 'go';
    case 'COMPLETED':
      return 'done';
    case 'CANCELLED':
      return 'stop';
  }
};

const orderStatusTone = (status: TransportOrderStatus): StatusTone => {
  switch (status) {
    case 'OPEN':
      return 'go';
    case 'FULFILLED':
      return 'done';
    case 'CANCELLED':
      return 'stop';
  }
};

/** `null` la CHUA BIET, khong phai 0 — va man hinh phai noi dung the. */
const km = (value: number | null): string =>
  value === null ? 'chưa nhập' : `${value.toLocaleString('vi-VN')} km`;

const money = (value: number | null): string =>
  value === null ? '—' : `${value.toLocaleString('vi-VN')} đ`;

export function MovementView() {
  const navigation = useNavigationInput();
  const orders = toSectionQuery(useTransportOrders(navigation));
  const runs = toSectionQuery(useVehicleRuns(navigation));
  const vehicles = toSectionQuery(useVehicles(navigation));

  const [openRunId, setOpenRunId] = useState<string | null>(null);
  const runDetail = toSectionQuery(useVehicleRunDetail(navigation, openRunId));
  const distance = toSectionQuery(useRunDistance(navigation, openRunId));

  if (runs.isBlocked) {
    return (
      <EmptyState title="Doanh nghiệp này chưa bật nghiệp vụ vòng chạy, hoặc vai của bạn không có quyền đọc." />
    );
  }
  if (runs.errorMessage !== null) {
    return <ErrorState message={runs.errorMessage} onRetry={runs.refetch} />;
  }
  if (runs.isLoading || runs.data === undefined) {
    return <LoadingState label="Đang tải vòng chạy…" />;
  }

  /** Bien so doc duoc thay cho `vehicleId` — man hinh khong bao gio hien mot `cuid` ra ngoai. */
  const plateOf = (vehicleId: string): string =>
    vehicles.data?.find((vehicle) => vehicle.id === vehicleId)?.registrationPlate ?? '—';

  /** Ma don doc duoc thay cho `orderId`. */
  const orderCodeOf = (orderId: string | null): string =>
    orderId === null
      ? '—'
      : (orders.data?.find((order) => order.id === orderId)?.code ?? 'đơn đã gỡ');

  const openRun = runDetail.data ?? null;
  const summary = distance.data;

  return (
    <>
      <PageHeader
        title="Vòng chạy & đơn hàng"
        summary="Nghĩa vụ thương mại và vòng chạy vật lý của xe là hai trục độc lập. Chặng chạy rỗng không mang đơn."
      />

      <DataTable<VehicleRun>
        caption="Vòng chạy của xe"
        rows={runs.data}
        rowKey={(run) => run.id}
        selectedKey={openRunId}
        onSelect={(run) => setOpenRunId(run.id === openRunId ? null : run.id)}
        onShowAll={() => setOpenRunId(null)}
        columns={[
          { key: 'code', header: 'Mã', render: (run) => run.code, isRowHeader: true },
          { key: 'vehicle', header: 'Xe', render: (run) => plateOf(run.vehicleId) },
          { key: 'businessDate', header: 'Ngày', render: (run) => run.businessDate },
          {
            key: 'status',
            header: 'Trạng thái',
            render: (run) => <StatusBadge label={run.status} tone={runStatusTone(run.status)} />,
          },
        ]}
      />

      {openRunId !== null && runDetail.errorMessage !== null && (
        <ErrorState message={runDetail.errorMessage} onRetry={runDetail.refetch} />
      )}
      {openRunId !== null && runDetail.isLoading && <LoadingState label="Đang tải chặng…" />}

      {openRun !== null && (
        <>
          <DataTable<RunLeg>
            caption={`Chặng của vòng chạy ${openRun.run.code}`}
            rows={openRun.legs}
            rowKey={(leg) => leg.id}
            columns={[
              {
                key: 'sequence',
                header: '#',
                render: (leg) => String(leg.sequence),
                isRowHeader: true,
                isNumeric: true,
              },
              {
                key: 'route',
                header: 'Chặng',
                render: (leg) => `${leg.originLabel} → ${leg.destinationLabel}`,
              },
              {
                key: 'kind',
                header: 'Loại',
                render: (leg) => (
                  <StatusBadge label={LEG_KIND_LABEL[leg.kind]} tone={legKindTone(leg.kind)} />
                ),
              },
              { key: 'order', header: 'Đơn', render: (leg) => orderCodeOf(leg.orderId) },
              {
                key: 'distance',
                header: 'Quãng đường',
                render: (leg) => km(leg.distanceKm),
                isNumeric: true,
              },
            ]}
          />

          {summary !== undefined && (
            <>
              <MetricCard label="Km có hàng" value={km(summary.loadedKm)} />
              <MetricCard label="Km rỗng" value={km(summary.emptyKm)} />
              <MetricCard
                label="Tỷ lệ rỗng"
                value={
                  summary.emptyRatio === null
                    ? 'chưa đủ dữ liệu'
                    : `${(summary.emptyRatio * 100).toFixed(1)}%`
                }
                hint={
                  summary.complete
                    ? null
                    : `Còn ${summary.legsMissingDistance.loaded + summary.legsMissingDistance.empty} chặng chưa nhập km — chưa tính được tỷ lệ.`
                }
              />
            </>
          )}
        </>
      )}

      {orders.errorMessage !== null ? (
        <ErrorState message={orders.errorMessage} onRetry={orders.refetch} />
      ) : (
        <DataTable<TransportOrder>
          caption="Nghĩa vụ thương mại"
          rows={orders.data ?? []}
          rowKey={(order) => order.id}
          columns={[
            { key: 'code', header: 'Mã đơn', render: (order) => order.code, isRowHeader: true },
            {
              key: 'route',
              header: 'Tuyến',
              render: (order) => `${order.originLabel} → ${order.destinationLabel}`,
            },
            { key: 'businessDate', header: 'Ngày', render: (order) => order.businessDate },
            {
              key: 'freight',
              header: 'Cước',
              render: (order) => money(order.freightAmount),
              isNumeric: true,
            },
            {
              key: 'status',
              header: 'Trạng thái',
              render: (order) => (
                <StatusBadge label={order.status} tone={orderStatusTone(order.status)} />
              ),
            },
          ]}
        />
      )}
    </>
  );
}
