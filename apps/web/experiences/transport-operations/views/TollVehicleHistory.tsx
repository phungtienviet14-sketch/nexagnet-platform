'use client';

import { useState } from 'react';
import { DataTable, StatusBadge } from '../components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../components/SectionState';
import { formatBusinessDate } from '../customer-view';
import { toSectionQuery, useTollVehicleLinks } from '../hooks/useTransportWorkspace';
import type { NavigationInput } from '../navigation';
import type { TollAccount, Vehicle } from '../transport-types';
import { toTollLinkRows, type TollLinkRow } from '../workspace/toll';
import {
  toTollVehicleOptions,
  tollAccountLabelOf,
  tollVehicleLabelOf,
} from '../workspace/toll-admin';

/**
 * LICH SU NHAN CHI TRA CUA MOT XE — qua MOI tai khoan. `#314` G7.
 *
 * So theo tai khoan chi ke MOT NUA cau chuyen "xe doi tai khoan": doan cu nam o tai khoan cu, doan
 * moi o tai khoan moi. Nguoi vua bi may chu tu choi vi hai doan chong nhau can nua con lai — *xe nay
 * DANG nhan chi tra tu dau* — ma khong phai mo tung tai khoan ra tim.
 *
 * "Dang hieu luc" do MAY CHU cham theo ngay nghiep vu cua no; man hinh noi ra moc ngay do.
 */
export function TollVehicleHistory({
  navigation,
  vehicles,
  accounts,
}: {
  readonly navigation: NavigationInput;
  readonly vehicles: readonly Vehicle[] | undefined;
  readonly accounts: readonly TollAccount[] | undefined;
}) {
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const options = toTollVehicleOptions(vehicles);

  return (
    <section className="tx-panel" aria-labelledby="toll-vehicle-history-heading">
      <h2 id="toll-vehicle-history-heading">Lịch sử nhận chi trả theo xe</h2>
      <p className="tx-panel__lead">
        Mỗi xe chỉ nhận chi trả từ một tài khoản giao thông tại mỗi thời điểm. Chọn một xe để thấy
        nó đã và đang nhận chi trả từ tài khoản nào — kể cả khi xe đã đổi tài khoản.
      </p>

      <label className="tx-field tx-field--inline">
        <span>Xe</span>
        <select
          aria-label="Xe cần xem lịch sử nhận chi trả"
          value={vehicleId ?? ''}
          onChange={(event) => setVehicleId(event.target.value === '' ? null : event.target.value)}
        >
          <option value="">— Chọn xe —</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {vehicleId === null ? null : (
        <VehicleLinkHistoryTable
          navigation={navigation}
          vehicleId={vehicleId}
          vehicles={vehicles}
          accounts={accounts}
          caption="Các đoạn thời gian xe đã chọn nhận chi trả, qua mọi tài khoản"
        />
      )}
    </section>
  );
}

/** Bang lich su cua MOT xe — dung o day va ngay trong bieu noi xe, truoc khi nguoi dung bam gui. */
export function VehicleLinkHistoryTable({
  navigation,
  vehicleId,
  vehicles,
  accounts,
  caption,
}: {
  readonly navigation: NavigationInput;
  readonly vehicleId: string;
  readonly vehicles: readonly Vehicle[] | undefined;
  readonly accounts: readonly TollAccount[] | undefined;
  readonly caption: string;
}) {
  const history = toSectionQuery(useTollVehicleLinks(navigation, vehicleId));

  if (history.isLoading) return <LoadingState label="Đang đọc lịch sử nhận chi trả của xe…" />;
  if (history.errorMessage !== null) {
    return <ErrorState message={history.errorMessage} onRetry={history.refetch} />;
  }
  if (history.isBlocked) {
    return <EmptyState title="Vai của bạn không đọc được sổ xe nhận chi trả." />;
  }
  if (history.data === undefined) return null;

  const onDateLabel = formatBusinessDate(history.data.onDate);
  const rows = toTollLinkRows(
    history.data,
    tollAccountLabelOf(accounts),
    tollVehicleLabelOf(vehicles),
  );

  if (rows.length === 0) {
    return (
      <EmptyState
        title={`Xe này chưa nhận chi trả từ tài khoản giao thông nào (tính đến ngày ${onDateLabel}).`}
      />
    );
  }

  return (
    <>
      <p className="tx-note">Tình trạng tính theo ngày {onDateLabel} của hệ thống.</p>
      <DataTable<TollLinkRow>
        caption={caption}
        rows={rows}
        rowKey={(row) => row.id}
        columns={[
          {
            key: 'account',
            header: 'Tài khoản',
            isRowHeader: true,
            render: (row) => row.accountLabel,
          },
          { key: 'period', header: 'Hiệu lực', render: (row) => row.periodLabel },
          {
            key: 'state',
            header: 'Tình trạng',
            render: (row) => <StatusBadge label={row.effectiveLabel} tone={row.effectiveTone} />,
          },
          {
            key: 'ref',
            header: 'Mã xe bên nhà cung cấp',
            render: (row) => row.providerVehicleRefLabel,
          },
          { key: 'provenance', header: 'Nguồn', render: (row) => row.provenanceLabel },
          { key: 'created', header: 'Khai lúc', render: (row) => row.createdLabel },
        ]}
      />
    </>
  );
}
