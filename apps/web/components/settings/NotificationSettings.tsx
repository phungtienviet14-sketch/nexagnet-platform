'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  notificationsApi,
  type LeadHistoryItem,
  type NotificationSettingsView,
  type SettingsSummary,
} from '../../lib/settings';
import { formatSettingsDate } from './settings-format';

type Props = {
  summary: SettingsSummary;
  onRefreshSummary?: () => void;
};

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

  const [emailForm, setEmailForm] = useState<Partial<NotificationSettingsView['email']>>({});
  const [zaloNamesInput, setZaloNamesInput] = useState<string>('');
  const [testResult, setTestResult] = useState<{ channel: 'zalo' | 'email'; success: boolean; message: string } | null>(null);

  // Sync loaded settings into local form state
  const settings = settingsQuery.data;

  const updateEmailMutation = useMutation({
    mutationFn: (updated: Partial<NotificationSettingsView['email']>) =>
      notificationsApi.updateEmail(updated),
    onSuccess: (data) => {
      queryClient.setQueryData(['settings-notifications'], data);
      setTestResult({ channel: 'email', success: true, message: 'Đã lưu cấu hình Email thành công!' });
    },
    onError: (err: Error) => {
      setTestResult({ channel: 'email', success: false, message: `Lỗi lưu email: ${err.message}` });
    },
  });

  const updateZaloMutation = useMutation({
    mutationFn: (updated: Partial<NotificationSettingsView['zalo']>) =>
      notificationsApi.updateZalo(updated),
    onSuccess: (data) => {
      queryClient.setQueryData(['settings-notifications'], data);
      onRefreshSummary?.();
      setTestResult({ channel: 'zalo', success: true, message: 'Đã lưu cấu hình Zalo thành công!' });
    },
    onError: (err: Error) => {
      setTestResult({ channel: 'zalo', success: false, message: `Lỗi lưu Zalo: ${err.message}` });
    },
  });

  const testEmailMutation = useMutation({
    mutationFn: () => notificationsApi.testEmail({}),
    onSuccess: (res) => {
      setTestResult({
        channel: 'email',
        success: res.success,
        message: res.message || (res.success ? 'Email test gửi thành công!' : 'Email test thất bại.'),
      });
    },
    onError: (err: Error) => {
      setTestResult({ channel: 'email', success: false, message: `Lỗi gửi test: ${err.message}` });
    },
  });

  const testZaloMutation = useMutation({
    mutationFn: () => notificationsApi.testZalo({}),
    onSuccess: (res) => {
      setTestResult({
        channel: 'zalo',
        success: res.success,
        message:
          res.message ||
          (res.success
            ? `Zalo test gửi thành công tới: ${(res.recipientsSent || []).join(', ')}`
            : 'Gửi Zalo test thất bại.'),
      });
    },
    onError: (err: Error) => {
      setTestResult({ channel: 'zalo', success: false, message: `Lỗi gửi test: ${err.message}` });
    },
  });

  const retryLeadMutation = useMutation({
    mutationFn: (leadId: string) => notificationsApi.retryLead(leadId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['settings-notifications-leads'] });
      setTestResult({ channel: 'zalo', success: true, message: 'Đã thực hiện gửi lại lead thành công!' });
    },
    onError: (err: Error) => {
      setTestResult({ channel: 'zalo', success: false, message: `Lỗi gửi lại lead: ${err.message}` });
    },
  });

  const handleSaveEmail = (e: React.FormEvent) => {
    e.preventDefault();
    const current = settings?.email || {
      enabled: true,
      host: '',
      port: 587,
      secure: false,
      user: '',
      pass: '',
      from: '',
      recipients: [],
    };
    updateEmailMutation.mutate({
      ...current,
      ...emailForm,
    });
  };

  const handleSaveZalo = (e: React.FormEvent) => {
    e.preventDefault();
    const current = settings?.zalo || {
      enabled: true,
      targetMemberNames: ['Phùng Việt', 'Hiệu'],
      targetMemberIds: [],
      targetGroupIds: [],
    };
    const names = zaloNamesInput
      ? zaloNamesInput.split(',').map((n) => n.trim()).filter(Boolean)
      : current.targetMemberNames;

    updateZaloMutation.mutate({
      ...current,
      targetMemberNames: names,
    });
  };

  const zaloConnected = summary.zcaState === 'ready';

  return (
    <div className="settings-panel__content">
      <header className="settings-panel__header">
        <div>
          <h2>Thông báo & Điều phối Leads (Zalo & Email)</h2>
          <p>
            Tự động gửi thông tin khách hàng từ form <strong>“Đăng ký trao đổi giải pháp 1-1”</strong> (trên website marketing) về tin nhắn Zalo của thành viên phụ trách (<strong>Phùng Việt</strong> & <strong>Hiệu</strong>) và hòm thư Email quản trị.
          </p>
        </div>
      </header>

      {testResult && (
        <div
          className={`settings-banner ${testResult.success ? 'settings-banner--ok' : 'settings-banner--warn'}`}
          role="alert"
          style={{ marginBottom: '20px' }}
        >
          <strong>{testResult.success ? '✓ Thành công: ' : '⚠ Cảnh báo: '}</strong>
          {testResult.message}
        </div>
      )}

      {/* Grid 2 cột: Cấu hình Zalo & Cấu hình Email */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px', marginBottom: '32px' }}>
        {/* Khối Cấu hình Zalo */}
        <div className="settings-card" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>💬</span> Kênh gửi Zalo
            </h3>
            <span
              style={{
                fontSize: '12px',
                padding: '4px 8px',
                borderRadius: '9999px',
                backgroundColor: zaloConnected ? '#dcfce7' : '#fee2e2',
                color: zaloConnected ? '#166534' : '#991b1b',
                fontWeight: 500,
              }}
            >
              {zaloConnected ? '✓ Đang kết nối' : '● Chưa kết nối'}
            </span>
          </div>

          <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>
            Tài khoản gửi hiện tại: <strong>{summary.zcaDisplayName || 'Chưa đăng nhập'}</strong> (Chế độ: <code>{summary.channelMode}</code>).
          </p>

          <form onSubmit={handleSaveZalo}>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px', color: '#334155' }}>
                Thành viên Zalo nhận tin (cách nhau bởi dấu phẩy):
              </label>
              <input
                type="text"
                className="settings-input"
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                placeholder="Phùng Việt, Hiệu"
                defaultValue={(settings?.zalo.targetMemberNames || ['Phùng Việt', 'Hiệu']).join(', ')}
                onChange={(e) => setZaloNamesInput(e.target.value)}
              />
              <small style={{ color: '#64748b', fontSize: '12px', display: 'block', marginTop: '4px' }}>
                Hệ thống tự tra cứu theo tên trong các nhóm Zalo test đã đồng bộ trên server.
              </small>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button
                type="submit"
                className="btn btn--primary"
                disabled={updateZaloMutation.isPending}
                style={{ padding: '8px 16px', fontSize: '13px' }}
              >
                {updateZaloMutation.isPending ? 'Đang lưu...' : 'Lưu cấu hình Zalo'}
              </button>

              <button
                type="button"
                className="btn btn--secondary"
                disabled={testZaloMutation.isPending || !zaloConnected}
                onClick={() => testZaloMutation.mutate()}
                style={{ padding: '8px 16px', fontSize: '13px' }}
              >
                {testZaloMutation.isPending ? 'Đang gửi...' : 'Gửi Test Zalo'}
              </button>
            </div>
          </form>
        </div>

        {/* Khối Cấu hình Email SMTP */}
        <div className="settings-card" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>✉️</span> Cấu hình Email SMTP
            </h3>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                defaultChecked={settings?.email.enabled ?? false}
                onChange={(e) => setEmailForm({ ...emailForm, enabled: e.target.checked })}
              />
              <span>Bật gửi Email</span>
            </label>
          </div>

          <form onSubmit={handleSaveEmail}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px', color: '#334155' }}>
                  SMTP Host:
                </label>
                <input
                  type="text"
                  placeholder="smtp.gmail.com"
                  defaultValue={settings?.email.host || ''}
                  onChange={(e) => setEmailForm({ ...emailForm, host: e.target.value })}
                  style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px', color: '#334155' }}>
                  Cổng (Port):
                </label>
                <input
                  type="number"
                  placeholder="587"
                  defaultValue={settings?.email.port || 587}
                  onChange={(e) => setEmailForm({ ...emailForm, port: parseInt(e.target.value, 10) || 587 })}
                  style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px', color: '#334155' }}>
                  Tài khoản (Username / Email):
                </label>
                <input
                  type="text"
                  placeholder="user@example.com"
                  defaultValue={settings?.email.user || ''}
                  onChange={(e) => setEmailForm({ ...emailForm, user: e.target.value })}
                  style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px', color: '#334155' }}>
                  Mật khẩu / App Password:
                </label>
                <input
                  type="password"
                  placeholder={settings?.email.pass ? '********' : 'Nhập mật khẩu'}
                  onChange={(e) => setEmailForm({ ...emailForm, pass: e.target.value })}
                  style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px', color: '#334155' }}>
                Danh sách Email nhận thông báo (cách nhau bởi dấu phẩy):
              </label>
              <input
                type="text"
                placeholder="viet@nexagnet.com, hieu@nexagnet.com"
                defaultValue={(settings?.email.recipients || []).join(', ')}
                onChange={(e) =>
                  setEmailForm({
                    ...emailForm,
                    recipients: e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
              <button
                type="submit"
                className="btn btn--primary"
                disabled={updateEmailMutation.isPending}
                style={{ padding: '8px 16px', fontSize: '13px' }}
              >
                {updateEmailMutation.isPending ? 'Đang lưu...' : 'Lưu cấu hình Email'}
              </button>

              <button
                type="button"
                className="btn btn--secondary"
                disabled={testEmailMutation.isPending}
                onClick={() => testEmailMutation.mutate()}
                style={{ padding: '8px 16px', fontSize: '13px' }}
              >
                {testEmailMutation.isPending ? 'Đang gửi...' : 'Gửi Test Email'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Bảng Lịch sử & Nhật ký Leads */}
      <section className="settings-card" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>📋 Nhật ký Lead "Đăng ký trao đổi 1-1" gần đây</h3>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
              Theo dõi kết quả phát tin nhắn Zalo và gửi Email tự động đến đội ngũ tư vấn.
            </p>
          </div>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => leadsQuery.refetch()}
            style={{ fontSize: '12px' }}
          >
            Làm mới ↻
          </button>
        </div>

        {leadsQuery.isLoading ? (
          <p style={{ color: '#64748b', fontSize: '13px' }}>Đang tải nhật ký lead...</p>
        ) : (leadsQuery.data || []).length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', backgroundColor: '#f8fafc', borderRadius: '6px' }}>
            Chưa có yêu cầu đăng ký tư vấn nào được ghi nhận.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="settings-table" style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#64748b' }}>
                  <th style={{ padding: '8px 12px' }}>Thời gian</th>
                  <th style={{ padding: '8px 12px' }}>Khách hàng / Công ty</th>
                  <th style={{ padding: '8px 12px' }}>Liên hệ</th>
                  <th style={{ padding: '8px 12px' }}>Quy trình</th>
                  <th style={{ padding: '8px 12px' }}>Gửi Zalo</th>
                  <th style={{ padding: '8px 12px' }}>Gửi Email</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {(leadsQuery.data || []).map((item: LeadHistoryItem) => (
                  <tr key={item.leadId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 12px', color: '#64748b' }}>
                      {formatSettingsDate(item.createdAt || item.dispatchResult.dispatchedAt)}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <strong>{item.payload.fullName}</strong>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>{item.payload.company}</div>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div>📞 {item.payload.phone}</div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>✉️ {item.payload.email}</div>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ display: 'inline-block', backgroundColor: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>
                        {item.payload.workflow}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {item.dispatchResult.zalo.success ? (
                        <span style={{ color: '#16a34a', fontWeight: 500 }}>
                          ✓ Đã gửi ({item.dispatchResult.zalo.recipientsSent?.length || 0})
                        </span>
                      ) : (
                        <span style={{ color: '#dc2626', fontSize: '12px' }} title={item.dispatchResult.zalo.message}>
                          ✕ Lỗi ({item.dispatchResult.zalo.message || 'Không gửi được'})
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {item.dispatchResult.email.success ? (
                        <span style={{ color: '#16a34a', fontWeight: 500 }}>
                          ✓ Đã gửi ({item.dispatchResult.email.recipientsSent?.length || 0})
                        </span>
                      ) : (
                        <span style={{ color: '#dc2626', fontSize: '12px' }} title={item.dispatchResult.email.message}>
                          ✕ Lỗi ({item.dispatchResult.email.message || 'Không gửi được'})
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn btn--secondary"
                        onClick={() => retryLeadMutation.mutate(item.leadId)}
                        disabled={retryLeadMutation.isPending}
                        style={{ padding: '4px 10px', fontSize: '12px' }}
                      >
                        Gửi lại
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
