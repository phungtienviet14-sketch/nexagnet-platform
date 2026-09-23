'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { DataTable, MetricCard, PageHeader, StatusBadge } from '../components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../components/SectionState';
import {
  toSectionQuery,
  useCustomers,
  useNavigationInput,
  useOrderLegs,
  useOrderRunPlans,
  useRunMovement,
  useTransportOrders,
  useVehicleRunDetail,
  useVehicleRuns,
  useVehicles,
} from '../hooks/useTransportWorkspace';
import type { RunPlanProposal, RunLeg, TransportOrder, VehicleRun } from '../transport-types';
import { newCorrelationKey, transportApi } from '../transport-api';
import {
  LEG_STATUS_LABEL,
  legStatusTone,
  ORDER_STATUS_LABEL,
  orderStatusTone,
  RUN_STATUS_LABEL,
  runStatusTone,
} from '../workspace/office-lifecycle';
import { OrderFulfilmentPanel } from './OrderFulfilmentPanel';
import { RunLegWorkflow } from './RunLegWorkflow';

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
 * Nut CO o day tu `#376` la nut cua CHANG va cua DON — xem `RunLegWorkflow` va
 * `OrderFulfilmentPanel`: van phong tien chang `PLANNED -> IN_TRANSIT -> COMPLETED` va xac nhan don
 * `OPEN -> FULFILLED`. Moc lai xe la bang chung, khong tu doi mot trang thai nao trong hai truc do.
 *
 * ============================================================================================
 * MOT CAM TUYET DOI: MAN HINH KHONG TU CONG KM
 * ============================================================================================
 *
 * `loadedKm`/`emptyKm`/`emptyRatio` deu do may chu tra. Va tu `#276` L6 co HAI o — DA DI va DU
 * DINH — ma man hinh KHONG duoc gop lai: mot chang chua chay xong la mot ke hoach, khong phai mot
 * quang duong da di.
 */

/** `null` la CHUA BIET, khong phai 0 — va man hinh phai noi dung the. */
const km = (value: number | null): string =>
  value === null ? 'chưa nhập' : `${value.toLocaleString('vi-VN')} km`;

const money = (value: number | null): string =>
  value === null ? '—' : `${value.toLocaleString('vi-VN')} đ`;

/** O tuy chon: chuoi rong la CHUA NHAP, khong phai mot mo ta rong. */
const cargoOf = (data: FormData): string | null => {
  const value = String(data.get('cargoDescription') ?? '').trim();
  return value === '' ? null : value;
};

const ratio = (value: number | null): string =>
  value === null ? 'chưa đủ dữ liệu' : `${(value * 100).toFixed(1)}%`;

export function MovementView() {
  const queryClient = useQueryClient();
  const navigation = useNavigationInput();
  const orders = toSectionQuery(useTransportOrders(navigation));
  const runs = toSectionQuery(useVehicleRuns(navigation));
  const vehicles = toSectionQuery(useVehicles(navigation));
  const customers = toSectionQuery(useCustomers(navigation));

  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const orderLegs = toSectionQuery(useOrderLegs(navigation, openOrderId));
  const orderPlans = toSectionQuery(useOrderRunPlans(navigation, openOrderId));

  const [openRunId, setOpenRunId] = useState<string | null>(null);
  const runDetail = toSectionQuery(useVehicleRunDetail(navigation, openRunId));
  const movement = toSectionQuery(useRunMovement(navigation, openRunId));
  const [preview, setPreview] = useState<RunPlanProposal | null>(null);
  const [planKey, setPlanKey] = useState<string | null>(null);
  const [planSuccess, setPlanSuccess] = useState<string | null>(null);

  const createOrder = useMutation({
    mutationFn: (input: Parameters<typeof transportApi.movement.createOrder>[0]) =>
      transportApi.movement.createOrder(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['transport', 'orders'] });
    },
  });
  const previewPlan = useMutation({
    mutationFn: (input: { orderId: string; vehicleId: string }) =>
      transportApi.planning.preview(input.orderId, { vehicleId: input.vehicleId }),
    onSuccess: (proposal) => {
      setPreview(proposal);
      setPlanKey(newCorrelationKey());
    },
  });
  const commitPlan = useMutation({
    mutationFn: (input: { orderId: string; vehicleId: string; idempotencyKey: string }) =>
      transportApi.planning.commit(input.orderId, {
        vehicleId: input.vehicleId,
        idempotencyKey: input.idempotencyKey,
      }),
    onSuccess: (_, input) => {
      const order = orders.data?.find((entry) => entry.id === input.orderId);
      const vehicle = vehicles.data?.find((entry) => entry.id === input.vehicleId);
      setPlanSuccess(
        `Đã giao đơn ${order?.code ?? input.orderId} cho xe ${vehicle?.registrationPlate ?? 'đã chọn'}`,
      );
      void queryClient.invalidateQueries({ queryKey: ['transport', 'orders'] });
      void queryClient.invalidateQueries({ queryKey: ['transport', 'runs'] });
    },
  });

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

  /** Ten khach doc duoc thay cho `customerId` — man hinh khong hien mot `cuid` bao gio. */
  const customerNameOf = (customerId: string | null): string =>
    customerId === null
      ? '—'
      : (customers.data?.find((customer) => customer.id === customerId)?.name ??
        'khách đã gỡ khỏi danh mục');

  /** Ma don doc duoc thay cho `orderId`. */
  const orderCodeOf = (orderId: string | null): string =>
    orderId === null
      ? '—'
      : (orders.data?.find((order) => order.id === orderId)?.code ?? 'đơn đã gỡ');

  const activePlan = orderPlans.data?.find((plan) => plan.cancelledAt === null) ?? null;
  const selectedOrder =
    openOrderId === null ? null : (orders.data.find((order) => order.id === openOrderId) ?? null);

  /** Chi khach DANG HOAT DONG moi la mot lua chon hop le cho mot don moi. */
  const activeCustomers = (customers.data ?? []).filter(
    (customer) => customer.status === 'ACTIVE',
  );

  return (
    <>
      <PageHeader
        title="Đơn hàng & vòng chạy"
        summary="Nghiệp vụ đi từ ĐƠN. Vòng chạy và chặng do hệ thống lập và tự đóng — không ai phải bấm tạo hay đóng vòng chạy."
      />

      {/*
       * KHACH HANG va CUOC la BAT BUOC o day, va do khong phai mot lua chon ve giao dien.
       *
       * May chu cho phep ca hai truong rong luc tao don — dung, vi mot don noi bo chua chot gia
       * van phai ghi duoc. Nhung so cong no khach hang chi nhan mot don vao "cho doi soat" khi
       * don DONG THOI: da `FULFILLED`, ket thuc thuong mai da `APPROVED`, co `customerId` va co
       * `freightAmount`. Thieu mot trong hai truong nay thi don van chay xong tren duong van hanh
       * roi DUNG LAI mai mai truoc cua doi soat — khong mot man hinh nao bao loi, va khong ai biet
       * tai sao tien khong bao gio len so.
       *
       * Nen mot don tao tu man hinh nay LUON di duoc het duong: tao -> giao -> doi soat -> phai
       * thu -> thu tien. Don khong co khach/cuoc van ton tai duoc qua API, chi khong sinh ra tu
       * day.
       */}
      <form
        className="tx-panel tx-filters"
        aria-label="Tạo đơn hàng"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          createOrder.mutate({
            code: String(data.get('code') ?? ''),
            originLabel: String(data.get('originLabel') ?? ''),
            destinationLabel: String(data.get('destinationLabel') ?? ''),
            businessDate: String(data.get('businessDate') ?? ''),
            customerId: String(data.get('customerId') ?? ''),
            freightAmount: Number(data.get('freightAmount')),
            cargoDescription: cargoOf(data),
          });
        }}
      >
        <h2>Tạo đơn mới</h2>
        <label className="tx-field">
          <span>Mã đơn</span>
          <input name="code" required />
        </label>
        <label className="tx-field">
          <span>Khách hàng</span>
          <select name="customerId" required defaultValue="">
            <option value="">— Chọn khách hàng —</option>
            {activeCustomers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
        </label>
        <label className="tx-field">
          <span>Điểm lấy hàng</span>
          <input name="originLabel" required />
        </label>
        <label className="tx-field">
          <span>Điểm giao hàng</span>
          <input name="destinationLabel" required />
        </label>
        <label className="tx-field">
          <span>Ngày vận hành</span>
          <input name="businessDate" type="date" required />
        </label>
        <label className="tx-field">
          <span>Cước (đ)</span>
          {/* KHONG dat `step`: moc buoc tinh tu `min`, nen `min=1 step=1000` lam trinh duyet coi
              5.000.000 la khong hop le va NUOT luon lan bam gui — khong mot thong bao nao cua ta. */}
          <input name="freightAmount" type="number" min="1" required />
        </label>
        <label className="tx-field">
          <span>Hàng hoá (tuỳ chọn)</span>
          <input name="cargoDescription" />
        </label>
        {activeCustomers.length === 0 ? (
          <p className="tx-note tx-note--warn">
            Chưa có khách hàng nào đang hoạt động trong danh mục, nên chưa tạo được đơn thương mại.
            Thêm khách ở mục Khách hàng trước.
          </p>
        ) : null}
        <button
          className="tx-btn"
          type="submit"
          disabled={createOrder.isPending || activeCustomers.length === 0}
        >
          Tạo đơn
        </button>
      </form>
      {createOrder.isError ? <ErrorState message={(createOrder.error as Error).message} /> : null}

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
          { key: 'customer', header: 'Khách', render: (order) => customerNameOf(order.customerId) },
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
              <StatusBadge
                label={ORDER_STATUS_LABEL[order.status]}
                tone={orderStatusTone(order.status)}
              />
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
          {(() => {
            const selected = orders.data?.find((entry) => entry.id === openOrderId);
            if (selected === undefined || activePlan !== null) return null;
            return (
              <form
                className="tx-panel tx-filters"
                aria-label={`Lập kế hoạch và giao xe cho đơn ${selected.code}`}
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  setPlanSuccess(null);
                  previewPlan.mutate({
                    orderId: selected.id,
                    vehicleId: String(data.get('vehicleId') ?? ''),
                  });
                }}
              >
                <h2>Lập kế hoạch từ đơn</h2>
                <label className="tx-field">
                  <span>Xe</span>
                  <select name="vehicleId" required defaultValue="">
                    <option value="">— Chọn xe —</option>
                    {(vehicles.data ?? []).map((vehicle) => (
                      <option key={vehicle.id} value={vehicle.id}>
                        {vehicle.registrationPlate}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="tx-btn" type="submit" disabled={previewPlan.isPending}>
                  Xem kế hoạch
                </button>
              </form>
            );
          })()}
          {previewPlan.isError ? (
            <ErrorState message={(previewPlan.error as Error).message} />
          ) : null}
          {preview !== null && planKey !== null && openOrderId === preview.orderId ? (
            <section
              className="tx-panel"
              role="region"
              aria-label={`Kế hoạch vận chuyển cho đơn ${orderCodeOf(openOrderId)}`}
            >
              <h2>Kế hoạch vận chuyển</h2>
              <ul className="tx-notes">
                {preview.legs.map((leg) => (
                  <li key={`${leg.sequence}-${leg.kind}`}>
                    <strong>{leg.kind === 'EMPTY' ? 'Chặng chạy rỗng' : 'Chặng có hàng'}</strong> ·{' '}
                    {leg.originLabel} → {leg.destinationLabel} · {km(leg.plannedDistanceKm)}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="tx-btn"
                disabled={commitPlan.isPending}
                onClick={() =>
                  commitPlan.mutate({
                    orderId: preview.orderId,
                    vehicleId: preview.vehicleId,
                    idempotencyKey: planKey,
                  })
                }
              >
                Xác nhận kế hoạch và giao xe
              </button>
            </section>
          ) : null}
          {commitPlan.isError ? <ErrorState message={(commitPlan.error as Error).message} /> : null}
          {planSuccess === null ? null : (
            <p className="tx-note" role="status">
              {planSuccess}
            </p>
          )}
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
          {/*
            `#376` — TIEN DO VONG CHAY dung ngay trong don: ca chang RONG (khong mang don nao) cung
            nam o day, vi vong chay chi dong khi MOI chang da xong, va nguoi lam viec voi DON khong
            phai di tim vong chay o bang nang cao ben duoi.
          */}
          {activePlan !== null && (
            <RunLegWorkflow
              runId={activePlan.runId}
              captionFor={(runCode) =>
                `Chặng của vòng chạy ${runCode} phục vụ đơn ${orderCodeOf(openOrderId)}`
              }
              orderCodeOf={orderCodeOf}
              asPanel
            />
          )}
          {selectedOrder === null ? null : (
            <OrderFulfilmentPanel order={selectedOrder} legs={orderLegs.data} />
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
              render: (run) => (
                <StatusBadge
                  label={RUN_STATUS_LABEL[run.status]}
                  tone={runStatusTone(run.status)}
                />
              ),
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
          {/* Cung bang + cung nut voi khoi tien do cua don (`#376`) — mot vong chay khong gan don nao
              (nhan viec tai dia diem, chieu chuyen cu) van tien chang duoc o day. */}
          <RunLegWorkflow
            runId={runDetail.data.run.id}
            captionFor={(runCode) => `Chặng của vòng chạy ${runCode}`}
            orderCodeOf={orderCodeOf}
            showDistance
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
