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

/**
 * Man nay phuc vu HAI viec khac nhau cua khach, nen no xuat hien o hai cho khac nhau:
 *  - `connection` — "Kết nối Zalo" trong nhom Vận hành: tai khoan nao dang nghe tin;
 *  - `groups`     — "Đại lý & nhóm Zalo" trong nhom Bán hàng: nhom nao cua dai ly nao.
 *
 * Gop ca hai vao mot the nhu ban cu bat khach di tim viec "gan dai ly cho nhom" trong mot man ten
 * la "Kênh Zalo" (#117 §2). Hai nua dung chung cac mutation (`mapping`, `hide`, `sync`) nen chung
 * o lai cung mot component va chi khac phan hien ra.
 */
export type ZaloSettingsView = 'all' | 'connection' | 'groups';

type Props = {
  summary: SettingsSummary;
  onRefresh: () => void;
  onOpenMembers: () => void;
  view?: ZaloSettingsView;
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
    return 'Zalo trả về nhóm nhưng không kèm UID thành viên nào. Đây là giới hạn phía Zalo, KHÔNG phải do quyền của tài khoản phụ: nhật ký cho thấy nhóm không bật khóa xem thành viên và không mã hóa đầu cuối, Zalo vẫn báo đúng số người mà chỉ bỏ trống danh sách. Chưa có ai bị thay đổi — phân loại đã lưu vẫn nguyên. Không cần làm gì thêm: danh sách thành viên tự đầy lên khi có người nhắn trong nhóm.';
  }
  return `Còn ${result.failedCount} thành viên chưa lấy được hồ sơ. Hệ thống KHÔNG đánh dấu ai không hoạt động trong lần đồng bộ thiếu này; bấm “Đồng bộ” lại sau ít phút.`;
}

export function ZaloSettings({ summary, onRefresh, onOpenMembers, view = 'all' }: Props) {
  const showConnection = view !== 'groups';
  const showGroups = view !== 'connection';
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
  // Go nhom khoi danh sach. Dung chung mutation cho ca go lan dua lai de chi co MOT duong ghi.
  const hideMutation = useMutation({
    mutationFn: ({ group, hidden }: { group: SettingsGroupSummary; hidden: boolean }) =>
      settingsApi.setGroupHidden(group.zcaChatId, hidden),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['settings-summary'] });
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

  const handleHide = (group: SettingsGroupSummary) => {
    const confirmed = window.confirm(
      `Gỡ “${group.name}” khỏi danh sách? Nhóm ngừng lên đơn ngay. Tin nhắn và đơn đã nhận vẫn được giữ nguyên, và có thể đưa nhóm trở lại bất cứ lúc nào.`,
    );
    if (confirmed) hideMutation.mutate({ group, hidden: true });
  };

  const handleLogout = () => {
    const confirmed = window.confirm(
      'Đăng xuất sẽ dừng listener, xóa phiên Zalo và allowlist cục bộ. Cấu hình thành viên đã lưu trong hệ thống vẫn được giữ. Tiếp tục?',
    );
    if (confirmed) logoutMutation.mutate();
  };

  const actionError =
    syncMutation.error ?? logoutMutation.error ?? mappingMutation.error ?? hideMutation.error;
  const dealers =
    (dealersQuery.data ?? []).find((section) => section.resource === 'dealers')?.rows ?? [];
  // Nhom da go van nam trong payload (de con dua lai duoc) nhung KHONG duoc tinh vao bang chinh
  // hay vao canh bao "chua chon dai ly" — nguoi van hanh da chu dong bo chung ra khoi luong.
  const visibleGroups = summary.groups.filter((group) => group.status !== 'ignored');
  const hiddenGroups = summary.groups.filter((group) => group.status === 'ignored');
  const pendingCount = visibleGroups.filter(
    (group) => group.allowed && group.status !== 'mapped',
  ).length;

  return (
    <div className="settings-section-stack">
      {showConnection && (
        <>
          <header className="settings-section-heading">
            <div>
              <p className="settings-eyebrow">Tài khoản đang nghe tin</p>
              <h2>Kết nối Zalo</h2>
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
        </>
      )}

      {/* Loi dung chung cho ca bon thao tac (dong bo, dang xuat, map, go) nen no o ngoai ca hai
          nua: nguoi dung phai thay loi o dung man hinh vua bam. */}
      {actionError && (
        <SettingsPanelState
          tone="error"
          title="Thao tác Zalo chưa hoàn tất"
          detail={actionError.message}
        />
      )}

      {/* Phan hoi cua viec GAN NHOM ↔ DAI LY: nam cung man voi bang nhom, khong nam ben man ket
          noi — nguoi vua bam phai doc duoc ket qua ngay tai cho vua bam. */}
      {showGroups && (
        <>
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

          {hideMutation.isSuccess && !hideMutation.isPending && (
            <SettingsPanelState
              tone={hideMutation.data.status === 'ignored' ? 'neutral' : 'success'}
              title={
                hideMutation.data.status === 'ignored'
                  ? 'Đã gỡ nhóm khỏi danh sách'
                  : 'Đã đưa nhóm trở lại'
              }
              detail={
                hideMutation.data.status === 'ignored'
                  ? 'Nhóm ngừng lên đơn từ tin tiếp theo. Tin nhắn và đơn đã nhận vẫn được giữ nguyên — mục “Nhóm đã gỡ” bên dưới đưa lại được bất cứ lúc nào.'
                  : hideMutation.data.status === 'mapped'
                    ? 'Nhóm chạy tiếp với đại lý đã lưu trước đó, không phải chọn lại.'
                    : 'Nhóm trở lại hàng chờ. Chọn đại lý để nhóm lên đơn được.'
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
        </>
      )}

      {showConnection && (
        <>
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
        </>
      )}

      {showGroups && (
        <>
          {view === 'groups' && (
            <header className="settings-section-heading">
              <div>
                <p className="settings-eyebrow">Nhóm nào của đại lý nào</p>
                <h2>Nhóm Zalo &amp; đại lý</h2>
                <p>
                  Gán mỗi nhóm cho một đại lý để hệ thống biết áp đúng bảng giá và chính sách cho
                  tin nhắn trong nhóm đó.
                </p>
              </div>
            </header>
          )}

          <section className="settings-table-section" aria-labelledby="settings-zalo-groups-title">
            <div className="settings-subheading">
              <div>
                <p className="settings-eyebrow">Chỉ nhóm allowlist</p>
                <h3 id="settings-zalo-groups-title">Đồng bộ thành viên</h3>
              </div>
              <span className="settings-count">
                {visibleGroups.filter((group) => group.allowed).length} nhóm được phép
              </span>
            </div>

            {visibleGroups.length === 0 ? (
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
                    {visibleGroups.map((group) => (
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
                            disabled={
                              !group.allowed || group.status !== 'mapped' || syncMutation.isPending
                            }
                            title={
                              group.status === 'mapped'
                                ? undefined
                                : 'Chọn đại lý cho nhóm này trước'
                            }
                            aria-label={`Đồng bộ thành viên nhóm ${group.name}`}
                            onClick={() => handleSync(group.zcaChatId, group.name)}
                          >
                            {syncMutation.isPending && syncMutation.variables === group.zcaChatId
                              ? 'Đang đồng bộ…'
                              : 'Đồng bộ'}
                          </button>
                          <button
                            type="button"
                            className="settings-text-action settings-text-action--danger"
                            disabled={hideMutation.isPending}
                            aria-label={`Gỡ nhóm ${group.name} khỏi danh sách`}
                            onClick={() => handleHide(group)}
                          >
                            Gỡ khỏi danh sách
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Nhom da go van hien o day chu khong bien mat han: hang DB con (tin nhan/don da nhan tro
          toi no), va nguoi van hanh phai dua lai duoc neu bam nham. */}
          {hiddenGroups.length > 0 && (
            <section
              className="settings-table-section"
              aria-labelledby="settings-zalo-hidden-title"
            >
              <div className="settings-subheading">
                <div>
                  <p className="settings-eyebrow">Không lên đơn, không tính vào cảnh báo</p>
                  <h3 id="settings-zalo-hidden-title">Nhóm đã gỡ</h3>
                </div>
                <span className="settings-count">{hiddenGroups.length} nhóm</span>
              </div>
              <div className="settings-table-wrap">
                <table className="settings-table">
                  <thead>
                    <tr>
                      <th>Nhóm</th>
                      <th>Đại lý đã lưu</th>
                      <th aria-label="Thao tác" />
                    </tr>
                  </thead>
                  <tbody>
                    {hiddenGroups.map((group) => (
                      <tr key={group.id}>
                        <td>
                          <strong>{group.name}</strong>
                          <small className="settings-cell-meta mono">{group.zcaChatId}</small>
                        </td>
                        <td>
                          {group.dealerName ?? '—'}
                          <small className="settings-cell-meta">
                            Đưa lại là chạy tiếp với đại lý này
                          </small>
                        </td>
                        <td className="settings-table__action">
                          <button
                            type="button"
                            className="settings-button settings-button--quiet"
                            disabled={hideMutation.isPending}
                            aria-label={`Đưa nhóm ${group.name} trở lại danh sách`}
                            onClick={() => hideMutation.mutate({ group, hidden: false })}
                          >
                            Đưa lại
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
