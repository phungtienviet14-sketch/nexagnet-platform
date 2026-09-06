'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useAuth } from '../../../components/auth/AuthGate';
import { accountSummaryLine, toAccountPanel } from '../workspace/account';

/**
 * O TAI KHOAN — #222 P1-D.
 *
 * ==============================================================================================
 * MOT COMPONENT, HAI VO
 *
 * `variant="rail"` cho thanh ben van hanh (1440px), `variant="compact"` cho thanh dau lai xe
 * (390px). Cung mot mo hinh, cung mot duong dang xuat; chi khac cach bay. Viet hai component se
 * lam mot lan sua chinh sach phien chi vao mot nua so man hinh.
 *
 * ==============================================================================================
 * DANG XUAT PHAI LAM BA VIEC, va bo mot viec la de lai mot lo hong that
 *
 * ```text
 * 1. `POST /auth/logout`   — huy phien o MAY CHU (cookie httpOnly + CSRF)
 * 2. don bo nho dem query  — xoa moi du lieu cua nguoi vua dang xuat khoi bo nho trinh duyet
 * 3. ve trang dang nhap    — `AuthGate.logout` lo phan nay
 * ```
 *
 * #222 viet ro: *"Do not merely delete a client variable."* Buoc 2 la buoc de quen nhat va la buoc
 * lo nhat: `@tanstack/react-query` giu nguyen ket qua cu trong bo nho, nen nguoi dang nhap KE TIEP
 * tren cung may se thay danh sach chuyen, phieu dau va so quy cua nguoi truoc trong khoanh khac
 * truoc khi query dau tien ve. `queryClient.clear()` dong dung cua so do.
 */
export function AccountMenu({ variant }: { readonly variant: 'rail' | 'compact' }) {
  const { mode, user, logout } = useAuth();
  const queryClient = useQueryClient();
  const [isOpen, setOpen] = useState(false);
  const [isLeaving, setLeaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const panel = toAccountPanel(mode, user);

  const signOut = async () => {
    setLeaving(true);
    setFailure(null);
    try {
      // Don bo nho dem TRUOC khi doi trang: sau `logout()` component nay da bi go, va mot lenh don
      // chay sau do se khong bao gio toi noi.
      queryClient.clear();
      await logout();
    } catch (error: unknown) {
      // NOI THAT khi khong dang xuat duoc. Im lang o day la truong hop nguy hiem nhat cua ca man
      // hinh: nguoi dung tuong minh da thoat, dung day may, va phien van con song.
      setLeaving(false);
      setFailure(
        error instanceof Error
          ? `Chưa đăng xuất được: ${error.message}`
          : 'Chưa đăng xuất được. Hãy thử lại.',
      );
    }
  };

  if (panel.identity === null) {
    return (
      <div className="tx-account" data-variant={variant}>
        <p className="tx-account__note">{panel.note}</p>
      </div>
    );
  }

  return (
    <div className="tx-account" data-variant={variant} data-open={isOpen ? 'open' : 'closed'}>
      <button
        type="button"
        className="tx-account__trigger"
        aria-expanded={isOpen}
        aria-controls="tx-account-panel"
        onClick={() => setOpen((open) => !open)}
      >
        {/*
          390px chi du cho MOT dong. Ba manh thong tin van co du — chung nam trong o mo ra ngay
          duoi, chu khong bi cat mat.
        */}
        <span className="tx-account__who">{accountSummaryLine(panel.identity)}</span>
        <span className="tx-account__caret" aria-hidden="true">
          {isOpen ? '▲' : '▼'}
        </span>
      </button>

      <div className="tx-account__panel" id="tx-account-panel" hidden={!isOpen}>
        <dl className="tx-account__facts">
          <div>
            <dt>Tên</dt>
            <dd>{panel.identity.displayName}</dd>
          </div>
          <div>
            <dt>Tài khoản</dt>
            <dd>{panel.identity.username}</dd>
          </div>
          <div>
            <dt>Vai trò</dt>
            <dd>{panel.identity.roleLabel}</dd>
          </div>
        </dl>

        {failure === null ? null : (
          <p className="tx-account__failure" role="alert">
            {failure}
          </p>
        )}

        {panel.canSignOut ? (
          <button
            type="button"
            className="tx-btn tx-btn--stop"
            disabled={isLeaving}
            onClick={() => void signOut()}
          >
            {isLeaving ? 'Đang đăng xuất…' : 'Đăng xuất'}
          </button>
        ) : null}
      </div>
    </div>
  );
}
