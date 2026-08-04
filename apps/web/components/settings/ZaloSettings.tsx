'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  settingsApi,
  type MemberSyncResult,
  type SettingsGroupSummary,
  type SettingsSummary,
} from '../../lib/settings';
import { formatSettingsDate } from './settings-format';
import { SettingsPanelState } from './SettingsPanelState';

type Props = {
  summary: SettingsSummary;
  onRefresh: () => void;
  onOpenMembers: () => void;
};

const STATE_LABELS: Readonly<Record<string, string>> = {
  ready: 'Đang kết nối',
  qr_ready: 'Đang chờ quét QR',
  qr_scanned: 'Đang chờ xác nhận',
  logged_out: 'Chưa đăng nhập',
  connecting: 'Đang kết nối',
  disabled: 'Đang tắt',
  error: 'Có lỗi',
  unknown: 'Chưa rõ',
};

/**
 * Ba ket qua dong bo khac han nhau, khong duoc gop lam mot:
 *  - day du            -> da ghi nhan, moi sang phan loai;
 *  - Zalo khong tra ai  -> KHONG phai "nhom rong", la loi doc du lieu (04/08/2026 gap that);
 *  - thieu mot phan     -> lay duoc mot so, so con lai chua co ho so.
 */
function syncMemberTitle(result: MemberSyncResult): string {
  if (result.complete) return `Đã đồng bộ ${result.upsertedCount} thành viên`;
  if (result.fetchedCount === 0) return 'Zalo không trả về danh sách thành viên';
  return `Đồng bộ một phần: ${result.fetchedCount}/${result.expectedCount} thành viên`;
}

function syncMemberDetail(result: MemberSyncResult): string {
  if (result.complete) {
    return `Ghi nhận lúc ${formatSettingsDate(result.syncedAt)}. ${result.deactivatedCount} người rời nhóm được đánh dấu không hoạt động, không ai bị xóa. Thành viên mới mặc định “Theo mặc định nhóm” — phân loại rồi mới đổi cách xử lý.`;
  }
  if (result.fetchedCount === 0) {
    return 'Tài khoản Zalo phụ nhìn thấy nhóm nhưng không đọc được danh sách thành viên. Chưa có ai bị thay đổi — phân loại đã lưu vẫn nguyên. Thử: mở nhóm đó trên Zalo bằng tài khoản phụ một lần rồi bấm Đồng bộ lại; nếu vẫn vậy thì tài khoản này chưa đủ quyền xem thành viên.';
  }
  return `Còn ${result.failedCount} thành viên chưa lấy được hồ sơ. Hệ thống KHÔNG đánh dấu ai không hoạt động trong lần đồng bộ thiếu này; bấm “Đồng bộ” lại sau ít phút.`;
}

export function ZaloSettings({ summary, onRefresh, onOpenMembers }: Props) {
  const queryClient = useQueryClient();
  // Danh sach dai ly de chon ngay tren dong nhom — truoc 04/08/2026 nguoi van hanh phai sang
  // trang Nguon su that va GO TAY chatId vao form thi nhom moi duoc map.
  // Cung queryKey voi SourceTruthSettings: sua ten dai ly ben do la dropdown nay cung moi theo.
  const dealersQuery = useQuery({
    queryKey: ['settings-source-truth'],
    queryFn: settingsApi.sourceTruth,
  });
  const mappingMutation = useMutation({
    mutationFn: ({ group, dealerId }: { group: SettingsGroupSummary; dealerId: string | null }) =>
      settingsApi.setGroupMapping(group.zcaChatId, { dealerId, name: group.name }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['settings-summary'] });
    },
  });
  const syncMutation = useMutation({
    mutationFn: settingsApi.syncMembers,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['settings-summary'] });
      void queryClient.invalidateQueries({ queryKey: ['settings-participants'] });
    },
  });
  const logoutMutation = useMutation({
    mutationFn: settingsApi.logoutZalo,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['settings-summary'] });
      void queryClient.invalidateQueries({ queryKey: ['zalo-status'] });
    },
  });

  const handleSync = (groupId: string, name: string) => {
    const confirmed = window.confirm(
      `Đồng bộ danh sách thành viên của “${name}” từ tài khoản Zalo phụ? Thành viên vắng mặt chỉ được đánh dấu không hoạt động, không bị xóa.`,
    );
    if (confirmed) syncMutation.mutate(groupId);
  };

  const handleLogout = () => {
    const confirmed = window.confirm(
      'Đăng xuất sẽ dừng listener, xóa phiên Zalo và allowlist cục bộ. Cấu hình thành viên đã lưu trong hệ thống vẫn được giữ. Tiếp tục?',
    );
    if (confirmed) logoutMutation.mutate();
  };

  const actionError = syncMutation.error ?? logoutMutation.error ?? mappingMutation.error;
  const dealers = (dealersQuery.data ?? []).find((section) => section.resource === 'dealers')?.rows ?? [];
  const pendingCount = summary.groups.filter(
    (group) => group.allowed && group.status !== 'mapped',
  ).length;

  return (
    <div className="settings-section-stack">
      <header className="settings-section-heading">
        <div>
          <p className="settings-eyebrow">Hai kênh · một chủ sở hữu tin</p>
          <h2>Kênh Zalo</h2>
          <p>Mỗi tin đi qua đúng kênh đã nhận. Hệ thống không tạo phản hồi dạng quote.</p>
        </div>
        <div className="settings-heading-actions">
          <a className="settings-button settings-button--quiet" href="/zalo">
            Quản lý QR & allowlist
          </a>
          <button
            type="button"
            className="settings-button settings-button--quiet"
            onClick={onRefresh}
          >
            Tải lại trạng thái
          </button>
        </div>
      </header>

      {actionError && (
        <SettingsPanelState
          tone="error"
          title="Thao tác Zalo chưa hoàn tất"
          detail={actionError.message}
        />
      )}

      {/* Ket qua dong bo tra ve day du so lieu nhung truoc 04/08/2026 bi bo di, nguoi van hanh
          bam xong khong biet co chay khong. Gio hien so + loi mo thang sang tab thanh vien. */}
      {syncMutation.isSuccess && !syncMutation.isPending && (
        <SettingsPanelState
          tone={syncMutation.data.complete ? 'success' : 'error'}
          title={syncMemberTitle(syncMutation.data)}
          detail={syncMemberDetail(syncMutation.data)}
          action={
            syncMutation.data.upsertedCount > 0 ? (
              <button
                type="button"
                className="settings-button settings-button--primary"
                onClick={onOpenMembers}
              >
                Xem &amp; phân loại thành viên
              </button>
            ) : undefined
          }
        />
      )}

      {mappingMutation.isSuccess && !mappingMutation.isPending && (
        <SettingsPanelState
          tone={mappingMutation.data.status === 'mapped' ? 'success' : 'neutral'}
          title={
            mappingMutation.data.status === 'mapped'
              ? 'Đã map nhóm vào đại lý'
              : 'Đã bỏ map nhóm'
          }
          detail={
            mappingMutation.data.status === 'mapped'
              ? 'Từ tin tiếp theo, nhóm này được tra giá theo đại lý vừa chọn và lên đơn cho Sale duyệt. Tin đã nhận trước đó vẫn nằm trong hệ thống.'
              : 'Nhóm quay về trạng thái chờ. Tin vẫn được lưu đầy đủ nhưng không đưa sang AI cho tới khi chọn lại đại lý.'
          }
        />
      )}

      {pendingCount > 0 && (
        <SettingsPanelState
          tone="error"
          title={`${pendingCount} nhóm đang nghe nhưng chưa chọn đại lý`}
          detail="Tin của các nhóm này vẫn được lưu đầy đủ, nhưng chưa được tra giá và chưa lên đơn. Chọn đại lý ở cột “Đại lý đang map” bên dưới là chạy ngay, không cần nhập ID."
        />
      )}

      {logoutMutation.isSuccess && !logoutMutation.isPending && (
        <SettingsPanelState
          tone="success"
          title="Đã đăng xuất tài khoản Zalo phụ"
          detail="Listener đã dừng, phiên đăng nhập và allowlist cục bộ đã xóa. Phân loại thành viên đã lưu vẫn còn nguyên trong hệ thống."
        />
      )}

      <section className="settings-channel-map" aria-label="Phân luồng hai kênh Zalo">
        <article className="settings-channel-card">
          <div className="settings-channel-card__head">
            <span className="settings-channel-mark">BOT</span>
            <span
              className={`settings-status-dot settings-status-dot--${summary.botIdentity.state}`}
            />
          </div>
          <h3>Bot Platform</h3>
          <strong>{STATE_LABELS[summary.botIdentity.state] ?? 'Chưa rõ'}</strong>
          <p>{summary.botIdentity.name ?? 'Chưa nhận diện tên Bot'}</p>
          {summary.botIdentity.id && <code>{summary.botIdentity.id}</code>}
          <small>Tin có @mention Bot</small>
        </article>

        <div className="settings-channel-rule" aria-hidden="true">
          <span>UID gốc</span>
          <i />
          <b>1 tin · 1 owner</b>
          <i />
          <span>fail-closed</span>
        </div>

        <article className="settings-channel-card">
          <div className="settings-channel-card__head">
            <span className="settings-channel-mark">ZCA</span>
            <span className={`settings-status-dot settings-status-dot--${summary.zcaState}`} />
          </div>
          <h3>Tài khoản cá nhân phụ</h3>
          <strong>{STATE_LABELS[summary.zcaState] ?? summary.zcaState}</strong>
          <p>{summary.zcaDisplayName ?? 'Chưa có tên tài khoản'}</p>
          <button
            type="button"
            className="settings-text-action settings-text-action--danger"
            disabled={logoutMutation.isPending || summary.zcaState === 'logged_out'}
            onClick={handleLogout}
          >
            {logoutMutation.isPending ? 'Đang đăng xuất…' : 'Đăng xuất an toàn'}
          </button>
          <small>Tin không tag Bot Platform</small>
        </article>
      </section>

      <section className="settings-table-section" aria-labelledby="settings-zalo-groups-title">
        <div className="settings-subheading">
          <div>
            <p className="settings-eyebrow">Chỉ nhóm allowlist</p>
            <h3 id="settings-zalo-groups-title">Đồng bộ thành viên</h3>
          </div>
          <span className="settings-count">
            {summary.groups.filter((group) => group.allowed).length} nhóm được phép
          </span>
        </div>

        {summary.groups.length === 0 ? (
          <SettingsPanelState
            title="Chưa có nhóm được phép"
            detail="Kết nối tài khoản Zalo phụ và chọn allowlist trước khi đồng bộ thành viên."
            action={
              <a className="settings-button settings-button--primary" href="/zalo">
                Mở kết nối Zalo
              </a>
            }
          />
        ) : (
          <div className="settings-table-wrap">
            <table className="settings-table">
              <thead>
                <tr>
                  <th>Nhóm</th>
                  <th>Đại lý đang map</th>
                  <th>Thành viên</th>
                  <th>Lần đồng bộ cuối</th>
                  <th aria-label="Thao tác" />
                </tr>
              </thead>
              <tbody>
                {summary.groups.map((group) => (
                  <tr key={group.id}>
                    <td>
                      <strong>{group.name}</strong>
                      <small className="settings-cell-meta mono">{group.zcaChatId}</small>
                    </td>
                    <td>
                      <select
                        className="settings-select"
                        value={group.dealerId ?? ''}
                        disabled={mappingMutation.isPending || dealersQuery.isPending}
                        aria-label={`Đại lý cho nhóm ${group.name}`}
                        onChange={(event) =>
                          mappingMutation.mutate({
                            group,
                            dealerId: event.target.value === '' ? null : event.target.value,
                          })
                        }
                      >
                        <option value="">— Chưa map —</option>
                        {dealers.map((dealer) => (
                          <option key={dealer.id} value={dealer.id}>
                            {dealer.label}
                          </option>
                        ))}
                      </select>
                      {group.status !== 'mapped' && (
                        <small className="settings-cell-meta settings-danger">
                          Tin vẫn được lưu, nhưng chưa lên đơn
                        </small>
                      )}
                    </td>
                    <td>
                      <span>{group.activeParticipants || group.memberCount} hoạt động</span>
                      {group.inactiveParticipants > 0 && (
                        <small className="settings-cell-meta">
                          {group.inactiveParticipants} không hoạt động
                        </small>
                      )}
                    </td>
                    <td>
                      {formatSettingsDate(group.lastSyncedAt)}
                      {group.lastSyncError && (
                        <small className="settings-cell-meta settings-danger">
                          {group.lastSyncError}
                        </small>
                      )}
                    </td>
                    <td className="settings-table__action">
                      <button
                        type="button"
                        className="settings-button settings-button--quiet"
                        // Chua map thi khong co hang Group de gan thanh vien -> dong bo se 400.
                        disabled={!group.allowed || group.status !== 'mapped' || syncMutation.isPending}
                        title={
                          group.status === 'mapped' ? undefined : 'Chọn đại lý cho nhóm này trước'
                        }
                        aria-label={`Đồng bộ thành viên nhóm ${group.name}`}
                        onClick={() => handleSync(group.zcaChatId, group.name)}
                      >
                        {syncMutation.isPending && syncMutation.variables === group.zcaChatId
                          ? 'Đang đồng bộ…'
                          : 'Đồng bộ'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
