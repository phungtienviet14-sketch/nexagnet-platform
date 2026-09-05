'use client';

import { useMemo } from 'react';
import { DataTable, MetricCard, PageHeader, StatusBadge } from '../components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../components/SectionState';
import {
  toSectionQuery,
  useComplianceAlerts,
  useComplianceDocuments,
  useDrivers,
  useFleetStatus,
  useMaintenanceDue,
  useNavigationInput,
  useOperationalAlerts,
  useVehicles,
  useWorkOrders,
} from '../hooks/useTransportWorkspace';
import {
  toAssetDirectory,
  toComplianceAlertRows,
  toComplianceDocumentRows,
  toFleetStatusRows,
  toMaintenanceDueRows,
  toOperationalAlerts,
  toWorkOrderRows,
} from '../workspace/assets';

/**
 * `TX-06` tren man hinh — bao duong, giay to, trang thai hieu luc, bang canh bao.
 *
 * MOT CAM tuyet doi o day: man hinh KHONG BAO GIO tinh lai han bao duong hay trang thai hieu luc.
 * `state` va `effectiveStatus` deu do may chu quyet (`#170 §4.B`). Neu mot ngay nao do co mot phep
 * so `dueOnDate` voi hom nay o tep nay, hai nguoi o hai mui gio se doc ra hai ket qua.
 */
export function MaintenanceComplianceView() {
  const navigation = useNavigationInput();
  const vehicles = toSectionQuery(useVehicles(navigation));
  const drivers = toSectionQuery(useDrivers(navigation));
  const due = toSectionQuery(useMaintenanceDue(navigation));
  const workOrders = toSectionQuery(useWorkOrders(navigation));
  const documents = toSectionQuery(useComplianceDocuments(navigation));
  const complianceAlerts = toSectionQuery(useComplianceAlerts(navigation));
  const fleetStatus = toSectionQuery(useFleetStatus(navigation));
  const operational = toSectionQuery(useOperationalAlerts(navigation));

  const directory = useMemo(
    () => toAssetDirectory({ vehicles: vehicles.data ?? [], drivers: drivers.data ?? [] }),
    [vehicles.data, drivers.data],
  );

  const dueRows = toMaintenanceDueRows(due.data ?? [], directory);
  const orderRows = toWorkOrderRows(workOrders.data ?? [], directory);
  const documentRows = toComplianceDocumentRows(documents.data ?? [], directory);
  const alertRows = toComplianceAlertRows(complianceAlerts.data ?? [], directory);
  const statusRows = toFleetStatusRows(fleetStatus.data ?? []);
  const alerts = toOperationalAlerts(operational.data ?? null, directory);

  const overdueCount = (due.data ?? []).filter((row) => row.state === 'OVERDUE').length;
  const expiredCount = (complianceAlerts.data ?? []).filter(
    (row) => row.health === 'EXPIRED',
  ).length;
  const openOrderCount = orderRows.filter((row) => row.isOpen).length;
  const firstError = due.errorMessage ?? documents.errorMessage ?? fleetStatus.errorMessage ?? null;
  const isLoading = due.isLoading || documents.isLoading || fleetStatus.isLoading;

  return (
    <>
      <PageHeader
        title="Bảo dưỡng & giấy tờ"
        summary="Lịch bảo dưỡng đến hạn, lệnh sửa chữa, giấy tờ sắp hết hạn."
      />

      {firstError === null ? null : <ErrorState message={firstError} onRetry={due.refetch} />}
      {isLoading ? <LoadingState label="Đang đọc tình trạng đội xe…" /> : null}

      <section className="tx-cards" aria-label="Tình trạng đội xe">
        <MetricCard label="Kế hoạch quá hạn" value={String(overdueCount)} />
        <MetricCard label="Lệnh sửa đang mở" value={String(openOrderCount)} />
        <MetricCard label="Giấy tờ đã hết hạn" value={String(expiredCount)} />
        <MetricCard label="Cảnh báo cần xử lý ngay" value={String(alerts.criticalCount)} />
      </section>

      {/* BANG CANH BAO GOM CHUNG — cau ve nguon thieu phai hien TRUOC bang, khong o duoi. */}
      <section className="tx-panel" aria-label="Cảnh báo vận hành">
        <h2>Cảnh báo vận hành</h2>
        <p className="tx-panel__lead">{alerts.headline}</p>
        {alerts.unavailableNote === null ? null : (
          <p className="tx-note tx-note--warn" role="note">
            {alerts.unavailableNote}
          </p>
        )}
        {alerts.rows.length === 0 ? (
          <EmptyState title="Không có cảnh báo nào đang mở." />
        ) : (
          <ul className="tx-worklist">
            {alerts.rows.map((row) => (
              <li key={row.key}>
                <div>
                  <strong>{row.kindLabel}</strong>
                  <span>{row.subjectLabel}</span>
                  {row.details.length === 0 ? null : <span>{row.details.join(' · ')}</span>}
                </div>
                <StatusBadge label={row.severityLabel} tone={row.tone} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="tx-panel" aria-label="Bảo dưỡng đến hạn">
        <h2>Bảo dưỡng đến hạn</h2>
        {dueRows.length === 0 ? (
          <EmptyState title="Chưa có kế hoạch bảo dưỡng nào đến hạn." />
        ) : (
          <DataTable
            caption="Kế hoạch bảo dưỡng theo mức độ"
            rows={dueRows}
            rowKey={(row) => row.planId}
            columns={[
              {
                key: 'vehicle',
                header: 'Xe',
                isRowHeader: true,
                render: (row) => row.vehicleLabel,
              },
              { key: 'plan', header: 'Kế hoạch', render: (row) => row.planName },
              { key: 'trigger', header: 'Mốc theo', render: (row) => row.triggerLabel },
              {
                key: 'state',
                header: 'Tình trạng',
                render: (row) => <StatusBadge label={row.stateLabel} tone={row.tone} />,
              },
              { key: 'remaining', header: 'Còn lại', render: (row) => row.remainingLabel },
              { key: 'dueAt', header: 'Đến hạn tại', render: (row) => row.dueAtLabel },
              {
                key: 'last',
                header: 'Lần bảo dưỡng gần nhất',
                render: (row) => row.lastServicedLabel,
              },
            ]}
          />
        )}
      </section>

      <section className="tx-panel" aria-label="Lệnh sửa chữa">
        <h2>Lệnh sửa chữa</h2>
        {orderRows.length === 0 ? (
          <EmptyState title="Chưa có lệnh sửa chữa nào." />
        ) : (
          <DataTable
            caption="Lệnh sửa chữa và lịch sử"
            rows={orderRows}
            rowKey={(row) => row.id}
            columns={[
              {
                key: 'vehicle',
                header: 'Xe',
                isRowHeader: true,
                render: (row) => row.vehicleLabel,
              },
              { key: 'desc', header: 'Nội dung', render: (row) => row.description },
              {
                key: 'status',
                header: 'Trạng thái',
                render: (row) => <StatusBadge label={row.statusLabel} tone={row.tone} />,
              },
              { key: 'opened', header: 'Mở lúc', render: (row) => row.openedLabel },
              { key: 'done', header: 'Xong lúc', render: (row) => row.completedLabel },
              { key: 'cost', header: 'Chi phí', isNumeric: true, render: (row) => row.costLabel },
            ]}
          />
        )}
      </section>

      <section className="tx-panel" aria-label="Giấy tờ sắp hết hạn">
        <h2>Giấy tờ sắp hết hạn</h2>
        {alertRows.length === 0 ? (
          <EmptyState title="Không có giấy tờ nào sắp hoặc đã hết hạn." />
        ) : (
          <DataTable
            caption="Giấy tờ theo mức độ"
            rows={alertRows}
            rowKey={(row) => row.documentId}
            columns={[
              {
                key: 'subject',
                header: 'Đối tượng',
                isRowHeader: true,
                render: (row) => row.subjectLabel,
              },
              { key: 'type', header: 'Loại giấy tờ', render: (row) => row.typeLabel },
              {
                key: 'health',
                header: 'Tình trạng',
                render: (row) => <StatusBadge label={row.healthLabel} tone={row.tone} />,
              },
              { key: 'validTo', header: 'Hết hạn', render: (row) => row.validToLabel },
              { key: 'countdown', header: 'Còn lại', render: (row) => row.countdownLabel },
              { key: 'threshold', header: 'Ngưỡng cảnh báo', render: (row) => row.thresholdLabel },
            ]}
          />
        )}
      </section>

      <section className="tx-panel" aria-label="Hồ sơ giấy tờ">
        <h2>Hồ sơ giấy tờ</h2>
        {documentRows.length === 0 ? (
          <EmptyState title="Chưa có giấy tờ nào được ghi nhận." />
        ) : (
          <DataTable
            caption="Toàn bộ giấy tờ đã ghi nhận"
            rows={documentRows}
            rowKey={(row) => row.id}
            columns={[
              {
                key: 'subject',
                header: 'Đối tượng',
                isRowHeader: true,
                render: (row) => row.subjectLabel,
              },
              { key: 'type', header: 'Loại', render: (row) => row.typeLabel },
              { key: 'no', header: 'Số hiệu', render: (row) => row.documentNo ?? '—' },
              { key: 'from', header: 'Hiệu lực từ', render: (row) => row.validFromLabel },
              { key: 'to', header: 'Đến', render: (row) => row.validToLabel },
              { key: 'status', header: 'Trạng thái', render: (row) => row.statusLabel },
            ]}
          />
        )}
      </section>

      <section className="tx-panel" aria-label="Trạng thái hiệu lực của đội xe">
        <h2>Trạng thái hiệu lực của đội xe</h2>
        <p className="tx-panel__lead">
          Trạng thái này do máy chủ tính từ lệnh sửa chữa đang mở và chuyến đang chạy. Khi nó khác
          với trạng thái ghi trong hồ sơ, đó là một mâu thuẫn cần kiểm tra chứ không phải một con số
          để chọn.
        </p>
        {statusRows.length === 0 ? (
          <EmptyState title="Chưa đọc được trạng thái đội xe." />
        ) : (
          <DataTable
            caption="Trạng thái hiệu lực từng xe"
            rows={statusRows}
            rowKey={(row) => row.vehicleId}
            columns={[
              {
                key: 'plate',
                header: 'Biển số',
                isRowHeader: true,
                render: (row) => row.registrationPlate,
              },
              {
                key: 'effective',
                header: 'Hiệu lực',
                render: (row) => <StatusBadge label={row.effectiveLabel} tone={row.tone} />,
              },
              { key: 'reason', header: 'Vì sao', render: (row) => row.reasonLabel },
              { key: 'recorded', header: 'Ghi trong hồ sơ', render: (row) => row.recordedLabel },
              {
                key: 'issues',
                header: 'Mâu thuẫn',
                render: (row) =>
                  row.inconsistencies.length === 0 ? '—' : row.inconsistencies.join(' · '),
              },
            ]}
          />
        )}
      </section>
    </>
  );
}
