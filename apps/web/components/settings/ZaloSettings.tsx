'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { groupJobKind, resolveGroupJob, resolveZaloJob } from '../../lib/settings-focus';
import {
  settingsApi,
  type MemberSyncResult,
  type SettingsGroupSummary,
  type SettingsSummary,
} from '../../lib/settings';
import {
  SettingsActionRow,
  SettingsAdvanced,
  SettingsFocusModal,
  SettingsStatusBar,
  SettingsWorkCard,
  useFocusOnKey,
  useRestoreFocus,
} from './SettingsFocus';
import { formatSettingsDate } from './settings-format';
import { SettingsPanelState } from './SettingsPanelState';

/**
 * Man nay phuc vu HAI viec khac nhau cua khach, nen no xuat hien o hai cho khac nhau:
 *  - `connection` — "Kết nối Zalo" trong nhom Vận hành: tai khoan nao dang nghe tin;
 *  - `groups`     — "Đại lý & nhóm Zalo" trong nhom Bán hàng: nhom nao cua dai ly nao.
 *
 * #146 §2/§7 doi THU TU SU CHU Y, khong doi ngu nghia map/sync/auth:
 *  - nua `groups` mo dau bang DUNG MOT nhom dang can xu ly, chu khong bang ca bang;
 *  - `Đồng bộ thành viên` van khoa khi nhom chua map, nhung ly do nam ngay canh nut;
 *  - nua `connection` khi dang ket noi thi KHONG khuyen khich dang xuat: `Đăng xuất an toàn` la
 *    hanh dong pha huy hang ba, tach khoi cum nut chinh.
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
 *  - Zalo khong tra ai -> KHONG phai "nhom rong", la loi doc du lieu (04/08/2026 gap that);
 *  - thieu mot phan    -> lay duoc mot so, so con lai chua co ho so.
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
  const [pendingSync, setPendingSync] = useState<SettingsGroupSummary | null>(null);
  const [pendingHide, setPendingHide] = useState<SettingsGroupSummary | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  // Danh sach dai ly de chon ngay tren the viec — cung queryKey voi SourceTruthSettings, nen sua
  // ten dai ly ben do la o chon nay cung moi theo.
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
      setPendingSync(null);
      void queryClient.invalidateQueries({ queryKey: ['settings-summary'] });
      void queryClient.invalidateQueries({ queryKey: ['settings-participants'] });
    },
  });
  // Go nhom khoi danh sach. Dung chung mutation cho ca go lan dua lai de chi co MOT duong ghi.
  const hideMutation = useMutation({
    mutationFn: ({ group, hidden }: { group: SettingsGroupSummary; hidden: boolean }) =>
      settingsApi.setGroupHidden(group.zcaChatId, hidden),
    onSuccess: () => {
      setPendingHide(null);
      void queryClient.invalidateQueries({ queryKey: ['settings-summary'] });
    },
  });
  const logoutMutation = useMutation({
    mutationFn: settingsApi.logoutZalo,
    onSuccess: () => {
      setLoggingOut(false);
      void queryClient.invalidateQueries({ queryKey: ['settings-summary'] });
      void queryClient.invalidateQueries({ queryKey: ['zalo-status'] });
    },
  });

  const actionError =
    syncMutation.error ?? logoutMutation.error ?? mappingMutation.error ?? hideMutation.error;
  const dealers =
    (dealersQuery.data ?? []).find((section) => section.resource === 'dealers')?.rows ?? [];
  // Nhom da go van nam trong payload (de con dua lai duoc) nhung KHONG duoc tinh vao bang chinh
  // hay vao canh bao "chua chon dai ly" — nguoi van hanh da chu dong bo chung ra khoi luong.
  const visibleGroups = summary.groups.filter((group) => group.status !== 'ignored');
  const hiddenGroups = summary.groups.filter((group) => group.status === 'ignored');
  const allowedGroups = visibleGroups.filter((group) => group.allowed);
  const pendingCount = allowedGroups.filter((group) => group.status !== 'mapped').length;

  const groupJob = resolveGroupJob(summary.groups);
  const jobKind = groupJobKind(groupJob);
  const groupHeading = useRef<HTMLHeadingElement>(null);
  const connectionHeading = useRef<HTMLHeadingElement>(null);
  useFocusOnKey(groupHeading, showGroups ? groupJob.key : null);

  const zaloJob = resolveZaloJob(summary.zcaState);
  useFocusOnKey(connectionHeading, showConnection && !showGroups ? zaloJob.key : null);
  const { rememberTrigger } = useRestoreFocus(
    Boolean(pendingSync) || Boolean(pendingHide) || loggingOut,
  );

  return (
    <div className="settings-section-stack">
      {showGroups && view === 'groups' && (
        <header className="settings-section-heading">
          <div>
            <p className="settings-eyebrow">Nhóm nào của đại lý nào</p>
            <h2>Đại lý &amp; nhóm Zalo</h2>
            <p>
              Gán mỗi nhóm cho một đại lý để hệ thống biết áp đúng bảng giá và chính sách cho tin
              nhắn trong nhóm đó.
            </p>
          </div>
        </header>
      )}

      {showConnection && !showGroups && (
        <header className="settings-section-heading">
          <div>
            <p className="settings-eyebrow">Tài khoản đang nghe tin</p>
            <h2>Kết nối Zalo</h2>
            <p>Mỗi tin đi qua đúng kênh đã nhận. Hệ thống không tạo phản hồi dạng quote.</p>
          </div>
        </header>
      )}

      {/* Loi dung chung cho ca bon thao tac nen no o ngoai ca hai nua: nguoi dung phai thay loi o
          dung man hinh vua bam. */}
      {actionError && (
        <SettingsPanelState
          tone="error"
          title="Thao tác Zalo chưa hoàn tất"
          detail={actionError.message}
        />
      )}

      {showGroups && (
        <>
          <SettingsStatusBar
            tone={pendingCount > 0 ? 'blocked' : 'ok'}
            title={
              pendingCount > 0
                ? `${pendingCount} nhóm đang nghe nhưng chưa chọn đại lý`
                : 'Mọi nhóm đang nghe đều đã có đại lý'
            }
            detail="Tin của nhóm chưa chọn đại lý vẫn được lưu đầy đủ, nhưng chưa tra được giá và chưa lên đơn."
            facts={[
              { label: 'Nhóm được phép', value: `${allowedGroups.length}` },
              { label: 'Đã gỡ khỏi danh sách', value: `${hiddenGroups.length}` },
            ]}
          />

          {/* Phan hoi cua viec GAN NHOM ↔ DAI LY nam cung man voi bang nhom: nguoi vua bam phai
              doc duoc ket qua ngay tai cho vua bam (#117 §4). */}
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
                  ? 'Nhóm ngừng lên đơn từ tin tiếp theo. Tin nhắn và đơn đã nhận vẫn được giữ nguyên — mục “Nhóm đã gỡ khỏi danh sách” bên dưới đưa lại được bất cứ lúc nào.'
                  : hideMutation.data.status === 'mapped'
                    ? 'Nhóm chạy tiếp với đại lý đã lưu trước đó, không phải chọn lại.'
                    : 'Nhóm trở lại hàng chờ. Chọn đại lý để nhóm lên đơn được.'
              }
            />
          )}

          {syncMutation.isSuccess && !syncMutation.isPending && (
            <SettingsPanelState
              tone={syncMutation.data.complete ? 'success' : 'error'}
              title={syncMemberTitle(syncMutation.data)}
              detail={syncMemberDetail(syncMutation.data)}
              action={
                syncMutation.data.upsertedCount > 0 ? (
                  <button
                    type="button"
                    className="settings-button settings-button--quiet"
                    onClick={onOpenMembers}
                  >
                    Xem &amp; phân loại thành viên
                  </button>
                ) : undefined
              }
            />
          )}

          <GroupWorkCard
            job={groupJob}
            jobKind={jobKind}
            headingRef={groupHeading}
            dealers={dealers}
            dealersPending={dealersQuery.isPending}
            mappingPending={mappingMutation.isPending}
            syncPending={syncMutation.isPending}
            rememberTrigger={rememberTrigger}
            onMap={(group, dealerId) => mappingMutation.mutate({ group, dealerId })}
            onSync={setPendingSync}
          />

          <SettingsAdvanced
            title="Tất cả nhóm đang nghe"
            hint={`${allowedGroups.length} nhóm được phép`}
            // Con nhom chua xu ly thi bang day la boi canh; het viec roi thi no la noi dung chinh.
            defaultOpen={pendingCount === 0}
          >
            {visibleGroups.length === 0 ? (
              <SettingsPanelState
                title="Chưa có nhóm được phép"
                detail="Kết nối tài khoản Zalo phụ và chọn danh sách nhóm được phép trước khi đồng bộ thành viên."
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
                            onClick={(event) => {
                              rememberTrigger(event.currentTarget);
                              setPendingSync(group);
                            }}
                          >
                            Đồng bộ
                          </button>
                          <button
                            type="button"
                            className="settings-text-action settings-text-action--danger"
                            disabled={hideMutation.isPending}
                            aria-label={`Gỡ nhóm ${group.name} khỏi danh sách`}
                            onClick={(event) => {
                              rememberTrigger(event.currentTarget);
                              setPendingHide(group);
                            }}
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
          </SettingsAdvanced>

          {/* Nhom da go van hien o day chu khong bien mat han: hang DB con (tin nhan/don da nhan
              tro toi no), va nguoi van hanh phai dua lai duoc neu bam nham. */}
          {hiddenGroups.length > 0 && (
            <SettingsAdvanced
              title="Nhóm đã gỡ khỏi danh sách"
              hint={`${hiddenGroups.length} nhóm · không lên đơn, không tính vào cảnh báo`}
            >
              <ul className="settings-focus-queue">
                {hiddenGroups.map((group) => (
                  <li key={group.id}>
                    <div>
                      <strong>{group.name}</strong>
                    </div>
                    <button
                      type="button"
                      className="settings-button settings-button--quiet"
                      disabled={hideMutation.isPending}
                      aria-label={`Đưa nhóm ${group.name} trở lại danh sách`}
                      onClick={() => hideMutation.mutate({ group, hidden: false })}
                    >
                      Đưa lại
                    </button>
                    <small>
                      Đại lý đã lưu: {group.dealerName ?? '—'} · đưa lại là chạy tiếp với đại lý này
                    </small>
                  </li>
                ))}
              </ul>
            </SettingsAdvanced>
          )}
        </>
      )}

      {showConnection && !showGroups && (
        <>
          <SettingsStatusBar
            tone={zaloJob.tone}
            title={STATE_LABELS[summary.zcaState] ?? summary.zcaState}
            detail={`Tài khoản: ${summary.zcaDisplayName ?? 'chưa có tên tài khoản'}.`}
            facts={[
              { label: 'Nhóm được phép', value: `${allowedGroups.length}` },
              {
                label: 'Bot Platform',
                value: STATE_LABELS[summary.botIdentity.state] ?? 'Chưa rõ',
              },
            ]}
          />

          {logoutMutation.isSuccess && !logoutMutation.isPending && (
            <SettingsPanelState
              tone="success"
              title="Đã đăng xuất tài khoản Zalo phụ"
              detail="Listener đã dừng, phiên đăng nhập và danh sách nhóm được phép cục bộ đã xóa. Phân loại thành viên đã lưu vẫn còn nguyên trong hệ thống."
            />
          )}

          <SettingsWorkCard
            eyebrow={zaloJob.subject === 'ready' ? 'Không cần làm gì thêm' : 'Việc cần làm ngay'}
            title={zaloJob.title}
            problem={zaloJob.detail}
            tone={zaloJob.tone}
            headingId="settings-zalo-work"
            headingRef={connectionHeading}
            actions={
              <SettingsActionRow
                primary={
                  zaloJob.subject === 'connect' ? (
                    <a className="settings-button settings-button--primary" href="/zalo">
                      Mở màn kết nối &amp; quét QR
                    </a>
                  ) : undefined
                }
                secondary={
                  <button
                    type="button"
                    className="settings-button settings-button--quiet"
                    onClick={onRefresh}
                  >
                    Tải lại trạng thái
                  </button>
                }
                tertiary={
                  <button
                    type="button"
                    className="settings-text-action settings-text-action--danger"
                    disabled={logoutMutation.isPending || summary.zcaState === 'logged_out'}
                    onClick={(event) => {
                      rememberTrigger(event.currentTarget);
                      setLoggingOut(true);
                    }}
                  >
                    Đăng xuất an toàn
                  </button>
                }
              />
            }
          />

          <SettingsAdvanced title="Chi tiết hai kênh Zalo" hint="Chỉ cần khi đang tìm nguyên nhân">
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
                  <span
                    className={`settings-status-dot settings-status-dot--${summary.zcaState}`}
                  />
                </div>
                <h3>Tài khoản cá nhân phụ</h3>
                <strong>{STATE_LABELS[summary.zcaState] ?? summary.zcaState}</strong>
                <p>{summary.zcaDisplayName ?? 'Chưa có tên tài khoản'}</p>
                <small>Tin không tag Bot Platform</small>
              </article>
            </section>
          </SettingsAdvanced>
        </>
      )}

      {pendingSync && (
        <SettingsFocusModal
          title={`Đồng bộ thành viên nhóm “${pendingSync.name}”?`}
          description="Hệ thống đọc danh sách thành viên từ tài khoản Zalo phụ và ghi nhận vào hồ sơ nhóm."
          confirmLabel="Đồng bộ thành viên"
          tone="primary"
          pending={syncMutation.isPending}
          onCancel={() => setPendingSync(null)}
          onConfirm={() => syncMutation.mutate(pendingSync.zcaChatId)}
        >
          <ul className="settings-confirmation">
            <li>Thành viên vắng mặt chỉ được đánh dấu không hoạt động, không ai bị xóa.</li>
            <li>Phân loại thành viên đã lưu trước đó vẫn giữ nguyên.</li>
          </ul>
        </SettingsFocusModal>
      )}

      {pendingHide && (
        <SettingsFocusModal
          title={`Gỡ “${pendingHide.name}” khỏi danh sách?`}
          description="Nhóm ngừng lên đơn ngay từ tin tiếp theo."
          confirmLabel="Gỡ khỏi danh sách"
          pending={hideMutation.isPending}
          onCancel={() => setPendingHide(null)}
          onConfirm={() => hideMutation.mutate({ group: pendingHide, hidden: true })}
        >
          <ul className="settings-confirmation">
            <li>Tin nhắn và đơn đã nhận vẫn được giữ nguyên.</li>
            <li>Hoàn tác: mục “Nhóm đã gỡ khỏi danh sách” đưa nhóm trở lại bất cứ lúc nào.</li>
          </ul>
        </SettingsFocusModal>
      )}

      {loggingOut && (
        <SettingsFocusModal
          title="Đăng xuất tài khoản Zalo phụ?"
          description="Hệ thống sẽ ngừng nhận tin từ Zalo cho tới khi đăng nhập lại bằng mã QR."
          confirmLabel="Đăng xuất"
          pending={logoutMutation.isPending}
          onCancel={() => setLoggingOut(false)}
          onConfirm={() => logoutMutation.mutate()}
        >
          <ul className="settings-confirmation">
            <li>Phiên đăng nhập và danh sách nhóm được phép cục bộ sẽ bị xóa.</li>
            <li>Cấu hình thành viên đã lưu trong hệ thống vẫn được giữ.</li>
          </ul>
        </SettingsFocusModal>
      )}
    </div>
  );
}

type DealerRow = { id: string; label: string };

function GroupWorkCard({
  job,
  jobKind: kind,
  headingRef,
  dealers,
  dealersPending,
  mappingPending,
  syncPending,
  rememberTrigger,
  onMap,
  onSync,
}: {
  job: ReturnType<typeof resolveGroupJob>;
  jobKind: ReturnType<typeof groupJobKind>;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  dealers: readonly DealerRow[];
  dealersPending: boolean;
  mappingPending: boolean;
  syncPending: boolean;
  rememberTrigger: (node: HTMLElement | null) => void;
  onMap: (group: SettingsGroupSummary, dealerId: string | null) => void;
  onSync: (group: SettingsGroupSummary) => void;
}) {
  const group = job.subject;
  return (
    <SettingsWorkCard
      eyebrow={kind === 'settled' ? 'Không còn nhóm nào chờ' : 'Nhóm cần xử lý'}
      title={job.title}
      problem={job.detail}
      tone={job.tone}
      headingId="settings-groups-work"
      headingRef={headingRef}
      actions={
        group ? (
          <SettingsActionRow
            primary={
              kind === 'sync-members' ? (
                <button
                  type="button"
                  className="settings-button settings-button--primary"
                  disabled={syncPending}
                  onClick={(event) => {
                    rememberTrigger(event.currentTarget);
                    onSync(group);
                  }}
                >
                  Đồng bộ thành viên
                </button>
              ) : undefined
            }
            blockedReason={
              kind === 'map-group'
                ? 'Đồng bộ thành viên chỉ mở ra sau khi nhóm này đã có đại lý.'
                : undefined
            }
          />
        ) : undefined
      }
    >
      {kind === 'map-group' && group && (
        <label className="settings-focus-choice">
          {/* Ten doc duoc phai KHAC voi o chon cung nhom trong bang ben duoi: hai control cung ten
              lam trinh doc man hinh (va Playwright) khong phan biet noi cai nao. */}
          <span>Đại lý phụ trách nhóm “{group.name}”</span>
          <select
            value={group.dealerId ?? ''}
            disabled={mappingPending || dealersPending}
            onChange={(event) => onMap(group, event.target.value === '' ? null : event.target.value)}
          >
            <option value="">— Chọn đại lý —</option>
            {dealers.map((dealer) => (
              <option key={dealer.id} value={dealer.id}>
                {dealer.label}
              </option>
            ))}
          </select>
          <small className="settings-muted">
            Chọn xong là nhóm chạy ngay, không cần nhập mã nhóm bằng tay.
          </small>
        </label>
      )}
      {kind === 'sync-members' && group && (
        <p className="settings-muted">
          Nhóm đang gán cho <strong>{group.dealerName ?? group.dealerId}</strong>.
        </p>
      )}
    </SettingsWorkCard>
  );
}
