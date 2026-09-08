'use client';

import { useState } from 'react';
import { DataTable, MetricCard, PageHeader, StatusBadge } from '../components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../components/SectionState';
import type { StatusTone } from '../customer-view';
import {
  toSectionQuery,
  useNavigationInput,
  useOrderLegs,
  useOrderRunPlans,
  useRunMovement,
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
 * DON HANG & VONG CHAY — man hinh LAY DON LAM TRUNG TAM (#274 / #276 L8).
 *
 * ============================================================================================
 * VI SAO DON DUNG TRUOC
 * ============================================================================================
 *
 * `#274` chot lai hinh dang san pham: *"Boss/accounting operate Orders; normal flow does not
 * require manual Run close."* Ban dau man hinh nay bat dau bang bang VONG CHAY, va no bat nguoi
 * dung tra loi mot cau ho khong hoi: "chuyen nay la vong chay so may". Bay gio don dung truoc, va
 * chon mot don se mo ra dung cai ho can — no dang di den dau, tren vong chay nao.
 *
 * Bang vong chay o duoi VAN CON, va do la co y: `#276` L8 giu no lam *"advanced operational
 * drill-down and report source"*. Cai bi go la vi tri TRUNG TAM cua no, khong phai ban than no.
 *
 * ============================================================================================
 * MAN HINH NAY KHONG CO NUT NAO TAO HAY DONG MOT VONG CHAY
 * ============================================================================================
 *
 * Vong chay do he thong lap va he thong dong (`#276` L2/L4). Neu mot ngay co mot nut "Dong vong
 * chay" xuat hien o day thi hoac phan xu tu dong da hong, hoac ai do vua dua mot thao tac quan ly
 * vong chay tro lai quy trinh binh thuong — ca hai deu la hoi quy cua Lane L.
 *
 * ============================================================================================
 * MOT CAM TUYET DOI: MAN HINH KHONG TU CONG KM
 * ============================================================================================
 *
 * `loadedKm`/`emptyKm`/`emptyRatio` deu do may chu tra. Va tu `#276` L6 co HAI o — DA DI va DU
 * DINH — ma man hinh KHONG duoc gop lai: mot chang chua chay xong la mot ke hoach, khong phai mot
 * quang duong da di.
 */

const LEG_KIND_LABEL: Readonly<Record<RunLeg['kind'], string>> = {
  LOADED: 'Có hàng',
  EMPTY: 'Chạy rỗng',
};

const LEG_STATUS_LABEL: Readonly<Record<RunLeg['status'], string>> = {
  PLANNED: 'Dự kiến',
  IN_TRANSIT: 'Đang chạy',
  COMPLETED: 'Đã xong',
  CANCELLED: 'Đã huỷ',
};

const legKindTone = (kind: RunLeg['kind']): StatusTone => (kind === 'LOADED' ? 'go' : 'stop');

const legStatusTone = (status: RunLeg['status']): StatusTone => {
  switch (status) {
    case 'PLANNED':
      return 'wait';
    case 'IN_TRANSIT':
      return 'go';
    case 'COMPLETED':
      return 'done';
    case 'CANCELLED':
      return 'stop';
  }
};

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

const ratio = (value: number | null): string =>
  value === null ? 'chưa đủ dữ liệu' : `${(value * 100).toFixed(1)}%`;

export function MovementView() {
  const navigation = useNavigationInput();
  const orders = toSectionQuery(useTransportOrders(navigation));
  const runs = toSectionQuery(useVehicleRuns(navigation));
  const vehicles = toSectionQuery(useVehicles(navigation));

  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const orderLegs = toSectionQuery(useOrderLegs(navigation, openOrderId));
  const orderPlans = toSectionQuery(useOrderRunPlans(navigation, openOrderId));

  const [openRunId, setOpenRunId] = useState<string | null>(null);
  const runDetail = toSectionQuery(useVehicleRunDetail(navigation, openRunId));
  const movement = toSectionQuery(useRunMovement(navigation, openRunId));

  if (orders.isBlocked) {
    return (
      <EmptyState title="Doanh nghiệp này chưa bật nghiệp vụ đơn hàng, hoặc vai của bạn không có quyền đọc." />
    );
  }
  if (orders.errorMessage !== null) {
    return <ErrorState message={orders.errorMessage} onRetry={orders.refetch} />;
  }
  if (orders.isLoading || orders.data === undefined) {
    return <LoadingState label="Đang tải đơn hàng…" />;
  }

  /** Bien so doc duoc thay cho `vehicleId` — man hinh khong bao gio hien mot `cuid` ra ngoai. */
  const plateOf = (vehicleId: string): string =>
    vehicles.data?.find((vehicle) => vehicle.id === vehicleId)?.registrationPlate ?? '—';

  /** Ma vong chay doc duoc thay cho `runId`. */
  const runCodeOf = (runId: string): string =>
    runs.data?.find((run) => run.id === runId)?.code ?? runId;

  /** Ma don doc duoc thay cho `orderId`. */
  const orderCodeOf = (orderId: string | null): string =>
    orderId === null
      ? '—'
      : (orders.data?.find((order) => order.id === orderId)?.code ?? 'đơn đã gỡ');

  const activePlan = orderPlans.data?.find((plan) => plan.cancelledAt === null) ?? null;

  return (
    <>
      <PageHeader
        title="Đơn hàng & vòng chạy"
        summary="Nghiệp vụ đi từ ĐƠN. Vòng chạy và chặng do hệ thống lập và tự đóng — không ai phải bấm tạo hay đóng vòng chạy."
      />

      <DataTable<TransportOrder>
        caption="Nghĩa vụ thương mại"
        rows={orders.data}
        rowKey={(order) => order.id}
        selectedKey={openOrderId}
        onSelect={(order) => setOpenOrderId(order.id === openOrderId ? null : order.id)}
        onShowAll={() => setOpenOrderId(null)}
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

      {openOrderId !== null && orderLegs.errorMessage !== null && (
        <ErrorState message={orderLegs.errorMessage} onRetry={orderLegs.refetch} />
      )}
      {openOrderId !== null && orderLegs.isLoading && (
        <LoadingState label="Đang tải chặng của đơn…" />
      )}

      {openOrderId !== null && orderLegs.data !== undefined && (
        <>
          {activePlan !== null && (
            <MetricCard
              label="Vòng chạy đang phục vụ đơn"
              value={runCodeOf(activePlan.runId)}
              hint={`Xe ${plateOf(activePlan.vehicleId)} · ${
                activePlan.outcome === 'NEW_RUN'
                  ? 'mở vòng chạy mới'
                  : 'nối vào vòng chạy đang chạy'
              }`}
            />
          )}
          <DataTable<RunLeg>
            caption={`Chặng của đơn ${orderCodeOf(openOrderId)}`}
            rows={orderLegs.data}
            rowKey={(leg) => leg.id}
            columns={[
              {
                key: 'run',
                header: 'Vòng chạy',
                render: (leg) => runCodeOf(leg.runId),
                isRowHeader: true,
              },
              {
                key: 'route',
                header: 'Chặng',
                render: (leg) => `${leg.originLabel} → ${leg.destinationLabel}`,
              },
              {
                key: 'status',
                header: 'Tiến độ',
                render: (leg) => (
                  <StatusBadge
                    label={LEG_STATUS_LABEL[leg.status]}
                    tone={legStatusTone(leg.status)}
                  />
                ),
              },
              {
                key: 'distance',
                header: 'Đã đi',
                render: (leg) => km(leg.distanceKm),
                isNumeric: true,
              },
            ]}
          />
        </>
      )}

      <PageHeader
        title="Vòng chạy của xe"
        summary="Bề mặt vận hành nâng cao — nguồn của báo cáo km rỗng. Quy trình thường ngày không cần mở tới đây."
      />

      {runs.errorMessage !== null ? (
        <ErrorState message={runs.errorMessage} onRetry={runs.refetch} />
      ) : (
        <DataTable<VehicleRun>
          caption="Vòng chạy của xe"
          rows={runs.data ?? []}
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
      )}

      {openRunId !== null && runDetail.errorMessage !== null && (
        <ErrorState message={runDetail.errorMessage} onRetry={runDetail.refetch} />
      )}
      {openRunId !== null && runDetail.isLoading && <LoadingState label="Đang tải chặng…" />}

      {runDetail.data != null && (
        <>
          <DataTable<RunLeg>
            caption={`Chặng của vòng chạy ${runDetail.data.run.code}`}
            rows={runDetail.data.legs}
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
                key: 'status',
                header: 'Tiến độ',
                render: (leg) => (
                  <StatusBadge
                    label={LEG_STATUS_LABEL[leg.status]}
                    tone={legStatusTone(leg.status)}
                  />
                ),
              },
              {
                key: 'distance',
                header: 'Đã đi',
                render: (leg) => km(leg.distanceKm),
                isNumeric: true,
              },
              {
                key: 'plannedDistance',
                header: 'Dự kiến',
                render: (leg) => km(leg.plannedDistanceKm),
                isNumeric: true,
              },
            ]}
          />

          {movement.data !== undefined && (
            <>
              <MetricCard label="Km có hàng (đã đi)" value={km(movement.data.actual.loadedKm)} />
              <MetricCard label="Km rỗng (đã đi)" value={km(movement.data.actual.emptyKm)} />
              <MetricCard
                label="Tỷ lệ rỗng (đã đi)"
                value={ratio(movement.data.actual.emptyRatio)}
                hint={
                  movement.data.actual.complete
                    ? null
                    : `Còn ${
                        movement.data.actual.legsMissingDistance.loaded +
                        movement.data.actual.legsMissingDistance.empty
                      } chặng đã xong chưa nhập km — chưa tính được tỷ lệ.`
                }
              />
              <MetricCard
                label="Km rỗng (dự kiến)"
                value={km(movement.data.planned.emptyKm)}
                hint="Chặng chưa chạy xong. KHÔNG cộng vào km đã đi."
              />
              {movement.data.cancelledLegs > 0 && (
                <MetricCard
                  label="Chặng đã huỷ"
                  value={String(movement.data.cancelledLegs)}
                  hint="Kế hoạch bị bỏ — không tính vào km đã đi lẫn km dự kiến."
                />
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
