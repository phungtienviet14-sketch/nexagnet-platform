'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { authApi, type AuthRole } from '../../lib/auth';
import { useAuth } from '../auth/AuthGate';
import { SettingsPanelState } from './SettingsPanelState';

const ROLE_LABELS: Record<AuthRole, string> = {
  SALE: 'Sale',
  MANAGER: 'Quản lý',
  ACCOUNTING: 'Kế toán',
  ADMIN: 'Quản trị',
};

export function UsersSettings() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const users = useQuery({
    queryKey: ['auth-users'],
    queryFn: authApi.users,
    enabled: auth.user?.role === 'ADMIN',
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['auth-users'] });
  const create = useMutation({ mutationFn: authApi.createUser, onSuccess: invalidate });
  const assign = useMutation({
    mutationFn: ({ id, role }: { id: string; role: AuthRole }) => authApi.assignRole(id, role),
    onSuccess: invalidate,
  });
  const disable = useMutation({ mutationFn: authApi.disableUser, onSuccess: invalidate });
  const reset = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      authApi.resetPassword(id, password),
    onSuccess: invalidate,
  });

  if (auth.user?.role !== 'ADMIN') {
    return (
      <SettingsPanelState
        title="Chỉ quản trị viên"
        detail="Vai trò hiện tại không được phép cấp tài khoản hoặc đổi quyền."
      />
    );
  }

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('');
    const form = new FormData(event.currentTarget);
    await create.mutateAsync({
      username: String(form.get('username') ?? ''),
      name: String(form.get('name') ?? ''),
      password: String(form.get('password') ?? ''),
      role: String(form.get('role') ?? 'SALE') as AuthRole,
    });
    event.currentTarget.reset();
    setMessage('Đã tạo tài khoản. Hãy chuyển mật khẩu ban đầu qua kênh an toàn.');
  };

  const handleReset = (id: string) => {
    const password = window.prompt('Nhập mật khẩu tạm mới (ít nhất 12 ký tự)');
    if (password) reset.mutate({ id, password });
  };

  const error = create.error ?? assign.error ?? disable.error ?? reset.error ?? users.error;

  return (
    <div className="settings-panel-body users-settings">
      <header className="settings-panel-heading">
        <div>
          <p className="settings-eyebrow">DANH TÍNH & QUYỀN</p>
          <h2>Tài khoản vận hành</h2>
        </div>
        <button
          type="button"
          className="settings-button settings-button--quiet"
          onClick={() => auth.logout()}
        >
          Đăng xuất
        </button>
      </header>

      <form className="users-create" onSubmit={handleCreate}>
        <label>Họ tên<input name="name" required maxLength={120} /></label>
        <label>Tên đăng nhập<input name="username" required minLength={3} maxLength={64} /></label>
        <label>
          Mật khẩu ban đầu
          <input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" />
        </label>
        <label>
          Vai trò
          <select name="role" defaultValue="SALE">
            {Object.entries(ROLE_LABELS).map(([role, label]) => <option key={role} value={role}>{label}</option>)}
          </select>
        </label>
        <button type="submit" className="settings-button" disabled={create.isPending}>Tạo tài khoản</button>
      </form>

      {message && <p className="users-notice" role="status">{message}</p>}
      {error && <p className="login-error" role="alert">{error.message}</p>}
      {users.isLoading ? (
        <SettingsPanelState title="Đang tải tài khoản" detail="Đối chiếu quyền đang được cấp…" />
      ) : (
        <div className="users-list">
          {users.data?.map((user) => (
            <article key={user.id} className={user.disabledAt ? 'is-disabled' : ''}>
              <div><strong>{user.name}</strong><small>@{user.username}{user.disabledAt ? ' · Đã vô hiệu hóa' : ''}</small></div>
              <select
                aria-label={`Vai trò của ${user.name}`}
                value={user.role}
                disabled={user.id === auth.user?.id || Boolean(user.disabledAt)}
                onChange={(event) => assign.mutate({ id: user.id, role: event.target.value as AuthRole })}
              >
                {Object.entries(ROLE_LABELS).map(([role, label]) => <option key={role} value={role}>{label}</option>)}
              </select>
              <button type="button" className="settings-button settings-button--quiet" onClick={() => handleReset(user.id)}>Đặt lại mật khẩu</button>
              <button
                type="button"
                className="settings-button settings-button--danger"
                disabled={user.id === auth.user?.id || Boolean(user.disabledAt)}
                onClick={() => window.confirm(`Vô hiệu hóa ${user.name}? Mọi phiên hiện tại sẽ hết hiệu lực.`) && disable.mutate(user.id)}
              >
                Vô hiệu hóa
              </button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
