'use client';

import { useId, useState, type FormEvent } from 'react';
import { authApi, type AuthUser } from '../../lib/auth';
import { useBranding } from '../../lib/branding';
import {
  passwordExpiryLabel,
  passwordChangeProblems,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from './session-signals';

/**
 * DOI MAT KHAU BAT BUOC (`#395`) — man hinh TOAN CUC, thay cho moi experience.
 *
 * Tai khoan moi, hoac vua duoc Giam doc dat lai mat khau, dang nhap bang MAT KHAU TAM. May chu chan
 * moi viec khac (`403 PASSWORD_CHANGE_REQUIRED`) cho toi khi nguoi do dat mat khau rieng. Man nay la
 * cau noi TRUOC cua dieu do — thuong mo tren dien thoai cua lai xe, nen bo cuc la mot cot, o nhap to,
 * nut rong het be ngang (`auth.css`).
 */

export function ForcedPasswordChange({
  user,
  onChanged,
  onLogout,
}: {
  readonly user: AuthUser;
  readonly onChanged: () => Promise<void>;
  readonly onLogout: () => Promise<void>;
}) {
  const branding = useBranding();
  const hintId = useId();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isVisible, setIsVisible] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [problems, setProblems] = useState<readonly string[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const expiry = passwordExpiryLabel(user.temporaryPasswordExpiresAt);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setServerError(null);
    const found = passwordChangeProblems({ current, next, confirm });
    setProblems(found);
    if (found.length > 0) return;
    setIsBusy(true);
    try {
      await authApi.changePassword(current, next);
      await onChanged();
    } catch (caught) {
      setServerError(
        caught instanceof Error ? caught.message : 'Chưa đổi được mật khẩu. Hãy thử lại.',
      );
    } finally {
      setIsBusy(false);
    }
  };

  const inputType = isVisible ? 'text' : 'password';

  return (
    <main className="login-shell login-shell--single">
      <section className="login-card login-card--change" aria-labelledby="forced-change-title">
        <span className="login-card__mark">{branding.shortName.slice(0, 2).toUpperCase()}</span>
        <p className="login-kicker">MẬT KHẨU TẠM</p>
        <h1 id="forced-change-title">Đặt mật khẩu của riêng bạn</h1>
        <p className="login-card__lead">
          Xin chào {user.name}. Tài khoản <strong>{user.username}</strong> đang dùng mật khẩu tạm do
          Giám đốc cấp. Đặt mật khẩu riêng để bắt đầu làm việc — từ lần sau chỉ bạn biết mật khẩu
          này.
        </p>
        {expiry === null ? null : (
          <p className="login-card__expiry">Mật khẩu tạm hết hạn lúc {expiry}.</p>
        )}
        <form onSubmit={handleSubmit} noValidate aria-describedby={hintId}>
          <label htmlFor="forced-current">Mật khẩu tạm đang dùng</label>
          <input
            id="forced-current"
            type={inputType}
            autoComplete="current-password"
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
            required
          />
          <label htmlFor="forced-next">Mật khẩu mới</label>
          <input
            id="forced-next"
            type={inputType}
            autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
            maxLength={PASSWORD_MAX_LENGTH}
            value={next}
            onChange={(event) => setNext(event.target.value)}
            required
          />
          <label htmlFor="forced-confirm">Nhập lại mật khẩu mới</label>
          <input
            id="forced-confirm"
            type={inputType}
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            required
          />
          <p className="login-card__hint" id={hintId}>
            Ít nhất {PASSWORD_MIN_LENGTH} ký tự. Nên dùng một câu dễ nhớ với bạn, khó đoán với người
            khác.
          </p>
          <label className="login-card__toggle">
            <input
              type="checkbox"
              checked={isVisible}
              onChange={(event) => setIsVisible(event.target.checked)}
            />
            Hiện mật khẩu
          </label>
          {problems.length === 0 && serverError === null ? null : (
            <div className="login-error" role="alert">
              {serverError !== null ? <p>{serverError}</p> : null}
              {problems.length === 0 ? null : (
                <ul>
                  {problems.map((problem) => (
                    <li key={problem}>{problem}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <button type="submit" disabled={isBusy}>
            {isBusy ? 'Đang lưu…' : 'Lưu mật khẩu và bắt đầu'}
          </button>
        </form>
        <button type="button" className="login-card__secondary" onClick={() => void onLogout()}>
          Đăng xuất
        </button>
      </section>
    </main>
  );
}
