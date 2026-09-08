'use client';

import { useCallback } from 'react';
import { DataTable, PageHeader } from '../components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../components/SectionState';
import {
  toSectionQuery,
  useMyStakeholderVehicles,
  useMyVehicleActivity,
  useNavigationInput,
} from '../hooks/useTransportWorkspace';
import { MANAGER_HAS_NO_TRANSPORT_SCOPE } from '../transport-actions';
import { TransportApiError } from '../transport-api';
import { loadedVsEmptyOption, type ChartPalette } from '../visual/chart-options';
import { TransportChart } from '../visual/TransportChart';
import { toMyVehicleRows, type MyVehicleRow } from '../workspace/asset-ownership';
import {
  toStakeholderActivity,
  type StakeholderActivityRow,
} from '../workspace/stakeholder-activity';

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

  /*
   * LAN DOC THU HAI, CO Y TACH RIENG.
   *
   * Danh sach xe va bang hoat dong di qua hai lan goi khac nhau, nen mot lan doc hong o phia hoat
   * dong KHONG lam mat luon danh sach xe va ty le so huu — thu ma nguoi so huu vao day de xem
   * truoc tien. Gop hai lan lam mot se bien mot su co cua phan bao duong thanh mot man hinh trang.
   */
  const activityQuery = toSectionQuery(useMyVehicleActivity(navigation));
  const activity =
    activityQuery.data === undefined ? null : toStakeholderActivity(activityQuery.data);

  const chart = activity?.chart;
  const buildChartOption = useCallback(
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

          <section className="tx-panel" aria-label="Hoạt động của xe tôi có cổ phần">
            <h3>Xe của tôi chạy thế nào</h3>
            {activity === null ? (
              activityQuery.isLoading ? (
                <LoadingState label="Đang tải số liệu hoạt động" />
              ) : activityQuery.errorMessage === null ? null : (
                <ErrorState message={activityQuery.errorMessage} />
              )
            ) : (
              <>
                <p className="tx-note">
                  Khoảng {activity.rangeLabel}. {activity.utilisationNote}
                </p>
                {activity.maintenanceNote === null ? null : (
                  <p className="tx-note tx-note--warn">{activity.maintenanceNote}</p>
                )}

                <DataTable
                  caption="Hoạt động của xe tôi có cổ phần"
                  rows={activity.rows}
                  rowKey={(row: StakeholderActivityRow) => row.key}
                  columns={[
                    {
                      key: 'plate',
                      header: 'Biển số',
                      render: (row: StakeholderActivityRow) => row.plate,
                      isRowHeader: true,
                    },
                    {
                      key: 'runs',
                      header: 'Số vòng chạy',
                      render: (row: StakeholderActivityRow) => row.runCount,
                      isNumeric: true,
                    },
                    {
                      key: 'days',
                      header: 'Ngày có việc',
                      render: (row: StakeholderActivityRow) => row.activeDays,
                      isNumeric: true,
                    },
                    {
                      key: 'use',
                      header: 'Tỷ lệ sử dụng',
                      render: (row: StakeholderActivityRow) => row.utilisation,
                      isNumeric: true,
                    },
                    {
                      key: 'loaded',
                      header: 'Km có hàng',
                      render: (row: StakeholderActivityRow) => row.loadedKm,
                      isNumeric: true,
                    },
                    {
                      key: 'empty',
                      header: 'Km rỗng',
                      render: (row: StakeholderActivityRow) => row.emptyKm,
                      isNumeric: true,
                    },
                    {
                      key: 'ratio',
                      header: 'Tỷ lệ rỗng',
                      render: (row: StakeholderActivityRow) => row.emptyRatio,
                      isNumeric: true,
                    },
                    {
                      key: 'downtime',
                      header: 'Ngày-lệnh sửa',
                      render: (row: StakeholderActivityRow) => row.downtimeDays,
                      isNumeric: true,
                    },
                    {
                      key: 'open',
                      header: 'Lệnh đang mở',
                      render: (row: StakeholderActivityRow) => row.openWorkOrders,
                      isNumeric: true,
                    },
                  ]}
                />

                {/*
                 * Cot "Ngay-lenh sua" CONG THANG hai lenh cung mo tren mot xe. Goi no la "so ngay
                 * xe nghi" se ra mot cau sai khi xe vao xuong hai viec cung luc — nen ten cot va
                 * cau nay phai di cung nhau.
                 */}
                <p className="tx-note">
                  “Ngày-lệnh sửa” cộng thẳng số ngày của từng lệnh sửa. Hai lệnh cùng mở trong một
                  ngày tính là hai — đây không phải số ngày xe vắng mặt.
                </p>

                {activity.rows.some((row) => row.missingNote !== null) ? (
                  <ul className="tx-notes">
                    {activity.rows
                      .filter((row) => row.missingNote !== null)
                      .map((row) => (
                        <li key={row.key}>
                          <strong>{row.plate}</strong> — {row.missingNote}
                        </li>
                      ))}
                  </ul>
                ) : null}

                {activity.chart.plates.length === 0 ? (
                  <EmptyState title="Chưa xe nào đủ số km để vẽ biểu đồ." />
                ) : (
                  <TransportChart
                    ariaLabel="Biểu đồ km có hàng và km rỗng của xe tôi có cổ phần"
                    buildOption={buildChartOption}
                  />
                )}
                {activity.chart.omittedVehicles > 0 ? (
                  <p className="tx-note tx-note--warn">
                    {activity.chart.omittedVehicles} xe không có trên biểu đồ vì còn chặng chưa nhập
                    km.
                  </p>
                ) : null}
              </>
            )}
          </section>

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
