'use client';

import { useMemo, useState } from 'react';
import { DataTable, PageHeader, StatusBadge } from '../components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../components/SectionState';
import {
  toSectionQuery,
  useDrivers,
  useNavigationInput,
  useVehicles,
} from '../hooks/useTransportWorkspace';
import { hasOperationsScope, operationsEmptyMessage } from '../transport-actions';
import {
  LICENCE_NOTE_SCOPE,
  NO_FLEET_WIDE_ASSIGNMENT_NOTE,
  toDriverRows,
  toVehicleRows,
  VEHICLE_STATUS_NOTE,
  type DriverRow,
  type VehicleRow,
} from '../workspace/fleet';

/**
 * Man DOI XE & LAI XE.
 *
 * Hai bang, mot man: khach doc "doi xe" nhu mot thu, va tach thanh hai muc dieu huong se bat ho
 * nho minh dang o dau. Chuyen giua hai bang la mot tab CUC BO, khong phai mot dia chi moi — cai
 * dang len dia chi la nhung thu dan duoc cho nguoi khac, con lua chon tab thi khong.
 */
type FleetTab = 'vehicles' | 'drivers';

/** Ngay nghiep vu HOM NAY theo lich may — dung de so han giay phep, khong dung de ghi du lieu. */
const todayBusinessDate = (): string => {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

export function FleetView() {
  const navigation = useNavigationInput();
  const vehicles = toSectionQuery(useVehicles(navigation));
  const drivers = toSectionQuery(useDrivers(navigation));
  const [tab, setTab] = useState<FleetTab>('vehicles');
  const today = useMemo(todayBusinessDate, []);

  if (!hasOperationsScope(navigation.role)) {
    return (
      <>
        <PageHeader title="Đội xe & lái xe" />
        <ErrorState message={operationsEmptyMessage(navigation.role)} />
      </>
    );
  }

  const vehicleRows = toVehicleRows(vehicles.data ?? []);
  const driverRows = toDriverRows(drivers.data ?? [], today);
  const expiring = driverRows.filter((row) => row.licenceStanding !== 'valid');

  return (
    <>
      <PageHeader
        title="Đội xe & lái xe"
        summary="Hồ sơ xe, hồ sơ lái xe, lịch sử phụ trách và số km đồng hồ."
      />

      <div className="tx-tabs" role="tablist" aria-label="Chọn bảng">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'vehicles'}
          className="tx-tab"
          onClick={() => setTab('vehicles')}
        >
          Xe ({vehicleRows.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'drivers'}
          className="tx-tab"
          onClick={() => setTab('drivers')}
        >
          Lái xe ({driverRows.length})
        </button>
      </div>

      {tab === 'vehicles' ? (
        <section aria-label="Danh sách xe">
          {vehicles.errorMessage === null ? null : (
            <ErrorState message={vehicles.errorMessage} onRetry={vehicles.refetch} />
          )}
          {vehicles.isLoading ? <LoadingState label="Đang đọc đội xe…" /> : null}
          {vehicleRows.length === 0 && !vehicles.isLoading ? (
            <EmptyState title="Chưa có xe nào trong đội." />
          ) : (
            <>
              <DataTable<VehicleRow>
                caption="Danh sách xe"
                rows={vehicleRows}
                rowKey={(row) => row.registrationPlate}
                columns={[
                  {
                    key: 'plate',
                    header: 'Biển số',
                    isRowHeader: true,
                    render: (row) => row.registrationPlate,
                  },
                  { key: 'class', header: 'Loại xe', render: (row) => row.vehicleClass },
                  {
                    key: 'status',
                    header: 'Trạng thái',
                    render: (row) => <StatusBadge label={row.statusLabel} tone={row.tone} />,
                  },
                  {
                    key: 'odo',
                    header: 'Đồng hồ',
                    isNumeric: true,
                    render: (row) => row.odometerLabel,
                  },
                  {
                    key: 'payload',
                    header: 'Tải cho phép',
                    isNumeric: true,
                    render: (row) => row.payloadLabel,
                  },
                ]}
              />
              <p className="tx-note">{VEHICLE_STATUS_NOTE}</p>
              <p className="tx-note">{NO_FLEET_WIDE_ASSIGNMENT_NOTE}</p>
            </>
          )}
        </section>
      ) : (
        <section aria-label="Danh sách lái xe">
          {drivers.errorMessage === null ? null : (
            <ErrorState message={drivers.errorMessage} onRetry={drivers.refetch} />
          )}
          {drivers.isLoading ? <LoadingState label="Đang đọc hồ sơ lái xe…" /> : null}
          {expiring.length === 0 ? null : (
            <p className="tx-note tx-note--warn" role="status">
              {expiring.length} lái xe có giấy phép đã hoặc sắp hết hạn.
            </p>
          )}
          {driverRows.length === 0 && !drivers.isLoading ? (
            <EmptyState title="Chưa có hồ sơ lái xe nào." />
          ) : (
            <>
              <DataTable<DriverRow>
                caption="Danh sách lái xe"
                rows={driverRows}
                rowKey={(row) => row.id}
                columns={[
                  {
                    key: 'name',
                    header: 'Họ tên',
                    isRowHeader: true,
                    render: (row) => row.fullName,
                  },
                  { key: 'phone', header: 'Điện thoại', render: (row) => row.phone },
                  { key: 'licence', header: 'Hạng GPLX', render: (row) => row.licenceClass },
                  {
                    key: 'expiry',
                    header: 'Hết hạn GPLX',
                    render: (row) =>
                      row.licenceNote === null ? (
                        row.licenceExpiryLabel
                      ) : (
                        <StatusBadge
                          label={row.licenceExpiryLabel}
                          tone={row.licenceStanding === 'expired' ? 'stop' : 'wait'}
                          title={row.licenceNote}
                        />
                      ),
                  },
                  { key: 'status', header: 'Trạng thái', render: (row) => row.statusLabel },
                  {
                    key: 'account',
                    header: 'Tài khoản',
                    render: (row) => (row.hasAuthUser ? 'Đã nối' : 'Chưa nối'),
                  },
                ]}
              />
              <p className="tx-note">{LICENCE_NOTE_SCOPE}</p>
              <p className="tx-note">
                Lái xe chưa nối tài khoản sẽ không mở được màn hình lái xe của chính mình.
              </p>
            </>
          )}
        </section>
      )}
    </>
  );
}
