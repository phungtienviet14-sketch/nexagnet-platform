'use client';

import { DataTable, PageHeader } from '../components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../components/SectionState';
import {
  toSectionQuery,
  useMyStakeholderVehicles,
  useNavigationInput,
} from '../hooks/useTransportWorkspace';
import { MANAGER_HAS_NO_TRANSPORT_SCOPE } from '../transport-actions';
import { TransportApiError } from '../transport-api';
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
 * Man nay cung la CHO DAP cua mot vai khong co pham vi van hanh (vd `MANAGER`): ho co the la co
 * dong, va chi may chu biet dieu do. Nguoi KHONG phai co dong doc duoc mot cau noi ro viec can
 * lam — xem khoi chu thich cua `notAStakeholder` ben duoi.
 */
export function StakeholderVehiclesView() {
  const navigation = useNavigationInput();
  const query = useMyStakeholderVehicles(navigation);
  const mine = toSectionQuery(query);
  const rows = toMyVehicleRows(mine.data ?? []);

  /**
   * `403` o day co nghia HEP va biet truoc: nguoi dang dang nhap KHONG phai ben huu quan.
   *
   * Cau cua may chu ("Tài khoản này không có quyền xem xe đã yêu cầu") dung nhung khong giup duoc
   * gi: no ta mot lan tu choi, khong ta viec can lam. Nguoi doc no o day la mot vai khong co pham
   * vi van hanh VA khong co co phan — viec can lam cua ho la hoi quan tri vien, dung nhu
   * `MANAGER_HAS_NO_TRANSPORT_SCOPE` noi.
   *
   * Moi ma loi KHAC van hien nguyen van: mot `500` hay mot loi mang khong duoc doi thanh "ban chua
   * duoc cap quyen", vi do se la mot cau tra loi sai cho mot su co that.
   */
  const notAStakeholder = query.error instanceof TransportApiError && query.error.status === 403;
  const errorMessage = notAStakeholder ? MANAGER_HAS_NO_TRANSPORT_SCOPE : mine.errorMessage;

  return (
    <>
      <PageHeader
        title="Xe tôi có cổ phần"
        summary="Những xe bạn đang nắm quyền lợi sở hữu, kèm tỷ lệ hiện tại và lịch sử của chính bạn."
      />

      {mine.isLoading ? <LoadingState label="Đang tải danh sách xe" /> : null}
      {errorMessage === null ? null : <ErrorState message={errorMessage} />}

      {errorMessage === null && rows.length === 0 && !mine.isLoading ? (
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
