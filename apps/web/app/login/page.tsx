'use client';

import { useState, type FormEvent } from 'react';
import { useBranding } from '../../lib/branding';
import { authApi } from '../../lib/auth';
import { useAuth } from '../../components/auth/AuthGate';

export default function LoginPage() {
  const branding = useBranding();
  const auth = useAuth();
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setIsBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      await authApi.login(String(form.get('username') ?? ''), String(form.get('password') ?? ''));
      await auth.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể đăng nhập');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <main className="login-shell">
      <section className="login-brief" aria-labelledby="login-title">
        <p className="login-kicker">TRUNG TÂM ĐIỀU HÀNH · CỔNG 01</p>
        <h1 id="login-title">Mỗi thao tác quan trọng đều có người chịu trách nhiệm.</h1>
        <p>
          Đăng nhập để xử lý đơn, duyệt chiến dịch và thay đổi nguồn sự thật theo đúng vai trò được
          giao.
        </p>
        <dl>
          <div><dt>Phiên</dt><dd>Cookie bảo mật · tự hết hạn</dd></div>
          <div><dt>Thay đổi</dt><dd>Ghi audit theo tài khoản</dd></div>
          <div><dt>Phân quyền</dt><dd>Sale · Quản lý · Kế toán · Admin</dd></div>
        </dl>
      </section>
      <section className="login-card" aria-label="Đăng nhập">
        <span className="login-card__mark">{branding.shortName.slice(0, 2).toUpperCase()}</span>
        <p className="login-kicker">XÁC NHẬN DANH TÍNH</p>
        <h2>Vào ca làm việc</h2>
        <form onSubmit={handleSubmit}>
          <label htmlFor="username">Tên đăng nhập</label>
          <input id="username" name="username" autoComplete="username" required minLength={3} />
          <label htmlFor="password">Mật khẩu</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
          {error && <p className="login-error" role="alert">{error}</p>}
          <button type="submit" disabled={isBusy}>
            {isBusy ? 'Đang xác minh…' : 'Bắt đầu ca làm việc'}
          </button>
        </form>
        <small>Không có tài khoản? Liên hệ quản trị viên nội bộ để được cấp quyền.</small>
      </section>
    </main>
  );
}
