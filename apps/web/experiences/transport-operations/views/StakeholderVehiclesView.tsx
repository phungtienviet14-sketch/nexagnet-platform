'use client';

import { DataTable, PageHeader } from '../components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../components/SectionState';
import {
  toSectionQuery,
  useMyStakeholderVehicles,
  useNavigationInput,
} from '../hooks/useTransportWorkspace';
import { toMyVehicleRows, type MyVehicleRow } from '../workspace/asset-ownership';

/**
 * Man "XE TOI CO CO PHAN" — be mat cua BEN HUU QUAN (`TX-08`, #242 E3/E5).
 *
 * Ba dieu man nay CO Y khong lam:
 *
 *   1. KHONG hoi `canPerform`. Pham vi co dong khong den tu mot vai — no den tu mot hang
 *      `TransportAssetStakeholder.authUserId` ma CHI may chu doc duoc. Doan truoc o client se hoac
 *      chan nham mot co dong that, hoac hua hen mot man hinh ma may chu se tu choi.
 *   2. KHONG nhan hay gui `stakeholderId`. Danh tinh den tu phien.
 *   3. KHONG co mot nut ghi nao. Mot dong so huu khong dieu duoc xe va khong sua duoc ty le cua
 *      chinh minh — nen o day khong co gi de tranh luan ve quyen.
 *
 * `403` tu may chu duoc hien NGUYEN VAN qua `ErrorState`: no la cau tra loi dung cho mot nguoi
 * dang nhap ma khong phai ben huu quan, va viet lai no thanh cau cua minh se che mat ly do that.
 */
export function StakeholderVehiclesView() {
  const navigation = useNavigationInput();
  const mine = toSectionQuery(useMyStakeholderVehicles(navigation));
  const rows = toMyVehicleRows(mine.data ?? []);

  return (
    <>
      <PageHeader
        title="Xe tôi có cổ phần"
        summary="Những xe bạn đang nắm quyền lợi sở hữu, kèm tỷ lệ hiện tại và lịch sử của chính bạn."
      />

      {mine.isLoading ? <LoadingState label="Đang tải danh sách xe" /> : null}
      {mine.errorMessage === null ? null : <ErrorState message={mine.errorMessage} />}

      {mine.errorMessage === null && rows.length === 0 && !mine.isLoading ? (
        <EmptyState title="Bạn hiện không có cổ phần trong xe nào." />
      ) : null}

      {rows.length === 0 ? null : (
        <>
          <DataTable
            caption="Xe tôi có cổ phần"
            rows={rows}
            rowKey={(row: MyVehicleRow) => row.vehicleId}
            columns={[
              { key: 'plate', header: 'Biển số', render: (row: MyVehicleRow) => row.plate },
              { key: 'class', header: 'Hạng xe', render: (row: MyVehicleRow) => row.vehicleClass },
              {
                key: 'share',
                header: 'Tỷ lệ của tôi',
                render: (row: MyVehicleRow) => row.shareLabel,
              },
              { key: 'since', header: 'Từ ngày', render: (row: MyVehicleRow) => row.sinceLabel },
              {
                key: 'status',
                header: 'Trạng thái',
                render: (row: MyVehicleRow) => row.statusLabel,
              },
              {
                key: 'odo',
                header: 'Số km đồng hồ',
                render: (row: MyVehicleRow) => row.odometerLabel,
              },
              {
                key: 'control',
                header: 'Điều hành',
                render: (row: MyVehicleRow) => row.controlLabel,
              },
              {
                key: 'driver',
                header: 'Lái xe hiện tại',
                render: (row: MyVehicleRow) => row.driverLabel,
              },
            ]}
          />

          <section className="tx-panel" aria-label="Lịch sử sở hữu của tôi">
            <h3>Lịch sử sở hữu của tôi</h3>
            <p className="tx-note">
              Mỗi đoạn là một khoảng thời gian bạn nắm một tỷ lệ. Khi tỷ lệ thay đổi, đoạn cũ được
              đóng lại chứ không bị ghi đè — nên lịch sử luôn đọc lại được.
            </p>
            {rows.map((row) => (
              <div key={row.vehicleId} className="tx-note">
                <strong>{row.plate}</strong>
                <ul>
                  {row.historyLabels.map((label) => (
                    <li key={label}>{label}</li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        </>
      )}
    </>
  );
}
