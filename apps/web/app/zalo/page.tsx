'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { zaloStateLabel } from '../../lib/zalo';

export default function ZaloLoginPage() {
  const queryClient = useQueryClient();
  const [acceptedRisk, setAcceptedRisk] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const statusQuery = useQuery({
    queryKey: ['zalo-status'],
    queryFn: api.zaloStatus,
    refetchInterval: 2_000,
  });
  const status = statusQuery.data;
  const qrQuery = useQuery({
    queryKey: ['zalo-qr', status?.qrVersion],
    queryFn: api.zaloQr,
    enabled: status?.state === 'qr_ready',
    retry: false,
  });
  const groupsQuery = useQuery({
    queryKey: ['zalo-groups'],
    queryFn: api.zaloGroups,
    enabled: status?.state === 'ready',
  });

  useEffect(() => {
    if (status) setSelectedGroups([...status.allowedGroupIds]);
  }, [status?.allowedGroupIds.join('|')]);

  const loginMutation = useMutation({
    mutationFn: api.zaloLogin,
    onSuccess: (next) => queryClient.setQueryData(['zalo-status'], next),
  });
  const saveMutation = useMutation({
    mutationFn: api.saveZaloGroups,
    onSuccess: (next) => {
      queryClient.setQueryData(['zalo-status'], next);
      void queryClient.invalidateQueries({ queryKey: ['zalo-groups'] });
    },
  });
  const logoutMutation = useMutation({
    mutationFn: api.zaloLogout,
    onSuccess: (next) => {
      setSelectedGroups([]);
      setAcceptedRisk(false);
      queryClient.setQueryData(['zalo-status'], next);
      queryClient.removeQueries({ queryKey: ['zalo-groups'] });
      queryClient.removeQueries({ queryKey: ['zalo-qr'] });
    },
  });

  const toggleGroup = (id: string) => {
    setSelectedGroups((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };
  const error =
    statusQuery.error ?? loginMutation.error ?? groupsQuery.error ?? saveMutation.error ?? logoutMutation.error;

  const handleLogout = () => {
    if (
      window.confirm(
        'Đăng xuất sẽ dừng nhận tin, xóa phiên Zalo đã lưu và xóa toàn bộ nhóm trong allowlist. Bạn sẽ phải quét QR lại. Tiếp tục?',
      )
    ) {
      logoutMutation.mutate();
    }
  };

  return (
    <main className="zalo-operator">
      <a className="operator-back" href="/">← Trung tâm điều hành</a>
      <section className="operator-card">
        <p className="operator-kicker">Kênh nhận tin thật</p>
        <h1>Kết nối tài khoản Zalo</h1>
        <p className="operator-lead">
          ZCA chạy bằng tài khoản Zalo cá nhân. Phiên đăng nhập chỉ lưu trong volume riêng trên server;
          mật khẩu và cookie không đi qua trình duyệt.
        </p>

        <div className={`operator-status state-${status?.state ?? 'connecting'}`} role="status">
          <span className="dot" />
          <strong>{status ? zaloStateLabel(status.state) : 'Đang kiểm tra…'}</strong>
          {status?.displayName && <span>{status.displayName}</span>}
        </div>

        {status && status.state !== 'logged_out' && (
          <div className="operator-session-actions">
            <span>Đăng xuất sẽ dừng listener và xóa phiên đăng nhập lưu trên máy chủ.</span>
            <button
              type="button"
              className="btn btn-danger"
              disabled={logoutMutation.isPending}
              onClick={handleLogout}
            >
              {logoutMutation.isPending ? 'Đang đăng xuất…' : 'Đăng xuất tài khoản Zalo'}
            </button>
          </div>
        )}

        {error && <div className="error-banner">⚠ {error.message}</div>}
        {status?.error && <div className="error-banner">⚠ {status.error}</div>}
        {status?.channelMode === 'hybrid' && (
          <div className={status.botIdentity?.state === 'ready' ? 'operator-callout' : 'error-banner'}>
            Bot Zalo chính thức:{' '}
            {status.botIdentity?.state === 'ready'
              ? `${status.botIdentity.name ?? 'Bot'} · ID ${status.botIdentity.id}`
              : 'chưa xác định được danh tính; zca đang fail-closed để tránh hai Bot cùng xử lý.'}
          </div>
        )}

        {(status?.state === 'logged_out' || status?.state === 'error') && (
          <div className="risk-box">
            <h2>Trước khi tạo QR</h2>
            <ul>
              <li>Dùng tài khoản phụ/SIM riêng, không dùng tài khoản Sale chính.</li>
              <li>zca-js không phải kênh chính thức và tài khoản có thể bị Zalo khóa.</li>
              <li>Chỉ các nhóm chọn ở bước dưới mới được gửi sang Flowise/DeepSeek.</li>
            </ul>
            <label className="risk-check">
              <input
                type="checkbox"
                checked={acceptedRisk}
                onChange={(event) => setAcceptedRisk(event.target.checked)}
              />
              Tôi hiểu rủi ro và đang dùng tài khoản phụ cho buổi demo
            </label>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!acceptedRisk || loginMutation.isPending}
              onClick={() => loginMutation.mutate()}
            >
              {loginMutation.isPending ? 'Đang tạo QR…' : 'Tạo mã QR đăng nhập'}
            </button>
          </div>
        )}

        {status?.state === 'qr_ready' && (
          <div className="qr-panel">
            {qrQuery.data?.image ? (
              <img src={qrQuery.data.image} alt="Mã QR đăng nhập Zalo" width={320} height={320} />
            ) : (
              <div className="qr-placeholder">Đang tải QR…</div>
            )}
            <ol>
              <li>Mở Zalo trên điện thoại.</li>
              <li>Chọn biểu tượng QR và quét mã.</li>
              <li>Xác nhận đăng nhập trên điện thoại.</li>
            </ol>
          </div>
        )}

        {status?.state === 'qr_scanned' && (
          <div className="operator-callout">Đã nhận QR. Hãy bấm xác nhận đăng nhập trên điện thoại.</div>
        )}
      </section>

      {status?.state === 'ready' && (
        <section className="operator-card">
          <p className="operator-kicker">Privacy allowlist</p>
          <h2>Chọn nhóm được phép xử lý</h2>
          <p>
            Mặc định hệ thống không đưa bất kỳ nhóm nào vào AI. Chọn tối đa 10 nhóm demo; các nhóm khác
            bị bỏ qua trước khi lưu tin và trước khi gọi LLM.
          </p>
          {groupsQuery.isLoading && <p>Đang lấy danh sách nhóm…</p>}
          <div className="group-picker">
            {groupsQuery.data?.map((group) => (
              <label key={group.id} className="group-option">
                <input
                  type="checkbox"
                  checked={selectedGroups.includes(group.id)}
                  disabled={!selectedGroups.includes(group.id) && selectedGroups.length >= 10}
                  onChange={() => toggleGroup(group.id)}
                />
                <span>
                  <strong>{group.name}</strong>
                  <small>{group.memberCount} thành viên · {group.id}</small>
                </span>
              </label>
            ))}
          </div>
          <div className="operator-actions">
            <span>{selectedGroups.length}/10 nhóm được chọn</span>
            <button
              type="button"
              className="btn btn-primary"
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate(selectedGroups)}
            >
              {saveMutation.isPending ? 'Đang lưu…' : 'Lưu và bắt đầu nhận tin'}
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
