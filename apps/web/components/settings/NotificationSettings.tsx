'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type FormEvent } from 'react';
import { resolveChannelFocus, type NotificationChannel } from '../../lib/settings-focus';
import {
  notificationsApi,
  type LeadHistoryItem,
  type NotificationSettingsView,
  type SettingsSummary,
} from '../../lib/settings';
import {
  SettingsActionRow,
  SettingsAdvanced,
  SettingsStatusBar,
  SettingsWorkCard,
  useFocusIntent,
  useFocusOnKey,
} from './SettingsFocus';
import { formatSettingsDate } from './settings-format';
import { SettingsPanelState } from './SettingsPanelState';

type Props = {
  summary: SettingsSummary;
  onRefreshSummary?: () => void;
};

type EmailDraft = Partial<NotificationSettingsView['email']>;

/**
 * Thong bao — MOT KENH mot luc, va `Gửi thử` chi mo sau khi da luu (#146 §6).
 *
 * Ban cu dat hai the cau hinh canh nhau, moi the co `Lưu` va `Gửi test` ngang hang; nguoi van hanh
 * phai TU BIET rang gui thu chay tren cau hinh DA LUU o may chu chu khong phai tren nhung gi dang
 * go tren man hinh. O day trang thai `dirty` khoa nut gui thu lai va noi ro ly do.
 *
 * Toan bo `style={{…}}` cua ban cu da duoc go: man nay gio dung dung bo lop cua `/settings`, nen no
 * doi mau theo chu de sang/toi nhu moi man khac.
 *
 * O mat khau KHONG BAO GIO nhan lai bi mat dang co: `placeholder` chi noi rang da co mat khau.
 */
export function NotificationSettings({ summary, onRefreshSummary }: Props) {
  const queryClient = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: ['settings-notifications'],
    queryFn: notificationsApi.getSettings,
  });
  const leadsQuery = useQuery({
    queryKey: ['settings-notifications-leads'],
    queryFn: notificationsApi.getLeads,
    refetchInterval: 10_000,
  });

  const [channel, setChannel] = useState<NotificationChannel>('zalo');
  const [emailDraft, setEmailDraft] = useState<EmailDraft>({});
  const [zaloNames, setZaloNames] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);

  const settings = settingsQuery.data;
  const zaloConnected = summary.zcaState === 'ready';
  // `dirty` doc tu chinh o nhap, khong tu mot co rieng: mot co rieng se lech khoi thuc te ngay lan
  // dau nguoi dung go roi xoa di.
  const dirty = channel === 'zalo' ? zaloNames !== null : Object.keys(emailDraft).length > 0;
  const focus = resolveChannelFocus({ channel, dirty, connected: zaloConnected });

  const workHeading = useRef<HTMLHeadingElement>(null);
  const intent = useFocusIntent();
  useFocusOnKey(workHeading, `notify:${channel}`, intent);

  const afterWrite = (message: string) => {
    setNotice({ ok: true, message });
    onRefreshSummary?.();
  };

  const updateEmail = useMutation({
    mutationFn: (updated: EmailDraft) => notificationsApi.updateEmail(updated),
    onSuccess: (data) => {
      queryClient.setQueryData(['settings-notifications'], data);
      setEmailDraft({});
      afterWrite('Đã lưu cấu hình Email.');
    },
    onError: (err: Error) => setNotice({ ok: false, message: `Chưa lưu được Email: ${err.message}` }),
  });
  const updateZalo = useMutation({
    mutationFn: (updated: Partial<NotificationSettingsView['zalo']>) =>
      notificationsApi.updateZalo(updated),
    onSuccess: (data) => {
      queryClient.setQueryData(['settings-notifications'], data);
      setZaloNames(null);
      afterWrite('Đã lưu cấu hình Zalo.');
    },
    onError: (err: Error) => setNotice({ ok: false, message: `Chưa lưu được Zalo: ${err.message}` }),
  });
  const testEmail = useMutation({
    mutationFn: () => notificationsApi.testEmail({}),
    onSuccess: (res) =>
      setNotice({
        ok: res.success,
        message: res.message || (res.success ? 'Đã gửi thư thử.' : 'Gửi thư thử thất bại.'),
      }),
    onError: (err: Error) => setNotice({ ok: false, message: `Không gửi được: ${err.message}` }),
  });
  const testZalo = useMutation({
    mutationFn: () => notificationsApi.testZalo({}),
    onSuccess: (res) =>
      setNotice({
        ok: res.success,
        message:
          res.message ||
          (res.success
            ? `Đã gửi tin thử tới: ${(res.recipientsSent || []).join(', ')}`
            : 'Gửi tin thử qua Zalo thất bại.'),
      }),
    onError: (err: Error) => setNotice({ ok: false, message: `Không gửi được: ${err.message}` }),
  });
  const retryLead = useMutation({
    mutationFn: (leadId: string) => notificationsApi.retryLead(leadId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['settings-notifications-leads'] });
      setNotice({ ok: true, message: 'Đã gửi lại thông tin khách hàng này.' });
    },
    onError: (err: Error) =>
      setNotice({ ok: false, message: `Chưa gửi lại được: ${err.message}` }),
  });

  const handleSaveZalo = (event: FormEvent) => {
    event.preventDefault();
    const current = settings?.zalo ?? {
      enabled: true,
      targetMemberNames: [],
      targetMemberIds: [],
      targetGroupIds: [],
    };
    const names =
      zaloNames === null
        ? current.targetMemberNames
        : zaloNames
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean);
    updateZalo.mutate({ ...current, targetMemberNames: names });
  };

  const handleSaveEmail = (event: FormEvent) => {
    event.preventDefault();
    const current = settings?.email ?? {
      enabled: true,
      host: '',
      port: 587,
      secure: false,
      user: '',
      pass: '',
      from: '',
      recipients: [],
    };
    updateEmail.mutate({ ...current, ...emailDraft });
  };

  // API co the tra ve mot doi tuong loi thay vi mang; man hinh khong duoc vo vi chuyen do.
  const leads: readonly LeadHistoryItem[] = Array.isArray(leadsQuery.data) ? leadsQuery.data : [];
  const failedLeads = leads.filter(
    (item) => !item.dispatchResult.zalo.success || !item.dispatchResult.email.success,
  );
  const savePending = channel === 'zalo' ? updateZalo.isPending : updateEmail.isPending;
  const testPending = channel === 'zalo' ? testZalo.isPending : testEmail.isPending;

  return (
    <div className="settings-section-stack">
      <header className="settings-section-heading">
        <div>
          <p className="settings-eyebrow">Ai được báo khi có việc</p>
          <h2>Thông báo</h2>
          <p>
            Thông tin khách để lại trên website được gửi về Zalo của người phụ trách và hòm thư quản
            trị.
          </p>
        </div>
      </header>

      <SettingsStatusBar
        tone={zaloConnected && settings?.email.enabled ? 'ok' : 'attention'}
        title={
          zaloConnected && settings?.email.enabled
            ? 'Cả hai kênh báo việc đều đang bật'
            : 'Còn kênh báo việc chưa sẵn sàng'
        }
        detail="Nếu cả hai kênh cùng hỏng, việc mới sẽ không có ai được báo."
        facts={[
          { label: 'Zalo', value: zaloConnected ? 'Đang kết nối' : 'Chưa kết nối' },
          { label: 'Email', value: settings?.email.enabled ? 'Đang bật' : 'Đang tắt' },
          { label: 'Việc gửi lỗi', value: `${failedLeads.length}` },
        ]}
      />

      {notice && (
        <SettingsPanelState
          tone={notice.ok ? 'success' : 'error'}
          title={notice.ok ? 'Đã xong' : 'Chưa hoàn tất'}
          detail={notice.message}
        />
      )}

      <div className="settings-subheading">
        <h3 id="settings-notify-picker">Chọn kênh cần chỉnh</h3>
      </div>
      <div className="settings-focus-actions__main" role="group" aria-labelledby="settings-notify-picker">
        {(['zalo', 'email'] as const).map((value) => (
          <button
            key={value}
            type="button"
            // CO Y khong dung `--primary`: nut chinh la loi hua "bam cai nay truoc", va tren man
            // nay loi hua do thuoc ve `Lưu`/`Gửi thử` trong khoi viec. Chon kenh chi la chuyen
            // ngu canh, nen no dung kieu "dang chon" rieng.
            className="settings-button settings-button--quiet settings-focus-switch"
            aria-pressed={channel === value}
            onClick={() => {
              intent.requestFocus();
              setChannel(value);
              setNotice(null);
            }}
          >
            {value === 'zalo' ? 'Kênh Zalo' : 'Kênh Email'}
          </button>
        ))}
      </div>

      <SettingsWorkCard
        eyebrow={channel === 'zalo' ? 'Đang chỉnh kênh Zalo' : 'Đang chỉnh kênh Email'}
        title={focus.title}
        problem={focus.detail}
        tone={focus.tone}
        headingId="settings-notify-work"
        headingRef={workHeading}
        actions={
          <SettingsActionRow
            primary={
              dirty || !focus.canTest ? (
                <button
                  type="submit"
                  form={channel === 'zalo' ? 'settings-notify-zalo' : 'settings-notify-email'}
                  className="settings-button settings-button--primary"
                  disabled={savePending}
                >
                  {savePending ? 'Đang lưu…' : focus.primaryLabel}
                </button>
              ) : (
                <button
                  type="button"
                  className="settings-button settings-button--primary"
                  disabled={testPending}
                  onClick={() => (channel === 'zalo' ? testZalo.mutate() : testEmail.mutate())}
                >
                  {testPending ? 'Đang gửi…' : focus.primaryLabel}
                </button>
              )
            }
            secondary={
              dirty || !focus.canTest ? undefined : (
                <button
                  type="submit"
                  form={channel === 'zalo' ? 'settings-notify-zalo' : 'settings-notify-email'}
                  className="settings-button settings-button--quiet"
                  disabled={savePending}
                >
                  Lưu lại
                </button>
              )
            }
            blockedReason={focus.testBlockedReason}
          />
        }
      >
        {channel === 'zalo' ? (
          <form id="settings-notify-zalo" onSubmit={handleSaveZalo}>
            <p className="settings-muted">
              Tài khoản đang gửi: <strong>{summary.zcaDisplayName || 'chưa đăng nhập'}</strong>.
            </p>
            <label className="settings-focus-choice">
              <span>Người nhận trên Zalo (cách nhau bởi dấu phẩy)</span>
              <input
                type="text"
                placeholder="Tên người phụ trách 1, Tên người phụ trách 2"
                value={zaloNames ?? (settings?.zalo.targetMemberNames ?? []).join(', ')}
                onChange={(event) => setZaloNames(event.target.value)}
              />
              <small className="settings-muted">
                Hệ thống tra theo tên trong các nhóm Zalo đã đồng bộ.
              </small>
            </label>
          </form>
        ) : (
          <form id="settings-notify-email" onSubmit={handleSaveEmail}>
            <div className="settings-focus-grid">
              <label className="settings-focus-choice">
                <span>Máy chủ gửi thư</span>
                <input
                  type="text"
                  placeholder="smtp.example.com"
                  defaultValue={settings?.email.host ?? ''}
                  onChange={(event) =>
                    setEmailDraft((current) => ({ ...current, host: event.target.value }))
                  }
                />
              </label>
              <label className="settings-focus-choice">
                <span>Cổng</span>
                <input
                  type="number"
                  placeholder="587"
                  defaultValue={settings?.email.port ?? 587}
                  onChange={(event) =>
                    setEmailDraft((current) => ({
                      ...current,
                      port: Number.parseInt(event.target.value, 10) || 587,
                    }))
                  }
                />
              </label>
              <label className="settings-focus-choice">
                <span>Tài khoản gửi</span>
                <input
                  type="text"
                  placeholder="thongbao@example.com"
                  defaultValue={settings?.email.user ?? ''}
                  onChange={(event) =>
                    setEmailDraft((current) => ({ ...current, user: event.target.value }))
                  }
                />
              </label>
              <label className="settings-focus-choice">
                <span>Mật khẩu ứng dụng</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  // Khong bao gio do lai bi mat dang luu — chi noi la da co.
                  placeholder={settings?.email.pass ? 'Đã có mật khẩu — để trống nếu giữ nguyên' : 'Nhập mật khẩu'}
                  onChange={(event) =>
                    setEmailDraft((current) => ({ ...current, pass: event.target.value }))
                  }
                />
              </label>
            </div>
            <label className="settings-focus-choice">
              <span>Hòm thư nhận báo việc (cách nhau bởi dấu phẩy)</span>
              <input
                type="text"
                placeholder="sale@example.com, quanly@example.com"
                defaultValue={(settings?.email.recipients ?? []).join(', ')}
                onChange={(event) =>
                  setEmailDraft((current) => ({
                    ...current,
                    recipients: event.target.value
                      .split(',')
                      .map((value) => value.trim())
                      .filter(Boolean),
                  }))
                }
              />
            </label>
            <label className="settings-checkbox-field">
              <input
                type="checkbox"
                defaultChecked={settings?.email.enabled ?? false}
                onChange={(event) =>
                  setEmailDraft((current) => ({ ...current, enabled: event.target.checked }))
                }
              />
              <span>Bật gửi thông báo qua Email</span>
            </label>
          </form>
        )}
      </SettingsWorkCard>

      <SettingsAdvanced
        title="Khách đã để lại thông tin gần đây"
        hint={`${leads.length} lượt · ${failedLeads.length} lượt gửi lỗi`}
        defaultOpen={failedLeads.length > 0}
      >
        {leadsQuery.isLoading ? (
          <p className="settings-muted">Đang tải nhật ký…</p>
        ) : leads.length === 0 ? (
          <p className="settings-muted">Chưa có khách nào để lại thông tin.</p>
        ) : (
          <div className="settings-table-wrap">
            <table className="settings-table">
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>Khách hàng</th>
                  <th>Liên hệ</th>
                  <th>Gửi Zalo</th>
                  <th>Gửi Email</th>
                  <th aria-label="Thao tác" />
                </tr>
              </thead>
              <tbody>
                {leads.map((item) => {
                  const failed =
                    !item.dispatchResult.zalo.success || !item.dispatchResult.email.success;
                  return (
                    <tr key={item.leadId}>
                      <td>
                        {formatSettingsDate(item.createdAt || item.dispatchResult.dispatchedAt)}
                      </td>
                      <td>
                        <strong>{item.payload.fullName}</strong>
                        <small className="settings-cell-meta">{item.payload.company}</small>
                      </td>
                      <td>
                        {item.payload.phone}
                        <small className="settings-cell-meta">{item.payload.email}</small>
                      </td>
                      <td>
                        {item.dispatchResult.zalo.success ? (
                          `Đã gửi (${item.dispatchResult.zalo.recipientsSent?.length ?? 0})`
                        ) : (
                          <span className="settings-warning-text">
                            Lỗi: {item.dispatchResult.zalo.message || 'không gửi được'}
                          </span>
                        )}
                      </td>
                      <td>
                        {item.dispatchResult.email.success ? (
                          `Đã gửi (${item.dispatchResult.email.recipientsSent?.length ?? 0})`
                        ) : (
                          <span className="settings-warning-text">
                            Lỗi: {item.dispatchResult.email.message || 'không gửi được'}
                          </span>
                        )}
                      </td>
                      <td className="settings-table__action">
                        {/* Gui lai chi co nghia voi dong DA LOI — dong thanh cong khong can nut. */}
                        {failed && (
                          <button
                            type="button"
                            className="settings-button settings-button--quiet"
                            disabled={retryLead.isPending}
                            onClick={() => retryLead.mutate(item.leadId)}
                          >
                            Gửi lại
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SettingsAdvanced>
    </div>
  );
}
