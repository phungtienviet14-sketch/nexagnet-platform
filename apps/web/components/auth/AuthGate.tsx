'use client';

import { useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { authApi, type AuthUser } from '../../lib/auth';
import { ForcedPasswordChange } from './ForcedPasswordChange';
import {
  createRefreshGate,
  permissionsKey,
  SESSION_ENDED_NOTICE,
  sessionSignalOf,
} from './session-signals';

interface AuthState {
  mode: 'api-key' | 'session' | 'none' | 'loading';
  user: AuthUser | null;
  /**
   * Tap quyen HIEU LUC tu `/auth/me` (`#395`). `null` = may chu khong tra (may chu cu, che do khong
   * phien) — man hinh roi ve ban guong theo vai. Cung noi dung thi CUNG doi tuong (xem `useMemo`).
   */
  permissions: ReadonlySet<string> | null;
  /** Cau cho trang dang nhap khi phien vua bi ket thuc tu phia may chu (dat lai mat khau, khoa). */
  notice: string | null;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  mode: 'loading',
  user: null,
  permissions: null,
  notice: null,
  refresh: async () => undefined,
  logout: async () => undefined,
});

/** Mot `403`/lan quay lai tab chi doc lai `/auth/me` toi da mot lan moi khoang nay. */
const REFRESH_MIN_INTERVAL_MS = 4_000;

export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<AuthState['mode']>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [grantKey, setGrantKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const config = await authApi.config();
      setMode(config.mode);
      if (config.mode !== 'session') {
        setUser(null);
        setGrantKey(null);
        return;
      }
      try {
        const current = await authApi.me();
        setUser(current.user);
        setGrantKey(permissionsKey(current.permissions));
        setNotice(null);
        if (pathname === '/login') router.replace('/');
      } catch {
        setUser(null);
        setGrantKey(null);
        if (pathname !== '/login') router.replace('/login');
      }
    } catch {
      // Khi API endpoint khong phan hoi (vd: chay web doc lap / demo mock), fallback mode 'none'
      setMode('none');
      setUser(null);
      setGrantKey(null);
    }
  }, [pathname, router]);

  useEffect(() => {
    void refresh();
  }, [pathname]);

  /*
   * THEO KIP THAY DOI TU MAY CHU (`#395`). Toan bo be mat van tai song o `/` va doi muc bang chuoi
   * truy van, nen "doc lai khi doi duong dan" o tren gan nhu khong bao gio chay lai. Hai dieu duoi
   * lap cho do:
   *
   *   · quay lai tab (`visibilitychange`) → doc lai `/auth/me`: Giam doc vua cap quyen thi lan mo
   *     tab ke tiep danh muc da dung;
   *   · mot lan goi API bi `401` → phien da chet: ve dang nhap kem cau noi vi sao; bi `403` → doc
   *     lai `/auth/me` de danh muc va nut bam khop quyen moi.
   *
   * Ref giu ham `refresh` MOI NHAT — dang ky mot lan, khong dang ky lai moi lan ve.
   */
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const userRef = useRef(user);
  userRef.current = user;
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    const gate = createRefreshGate(REFRESH_MIN_INTERVAL_MS);
    const onFailure = (error: unknown): void => {
      if (modeRef.current !== 'session') return;
      const signal = sessionSignalOf(error);
      if (signal === null) return;
      if (signal === 'SESSION_ENDED' && userRef.current !== null) setNotice(SESSION_ENDED_NOTICE);
      if (signal === 'SESSION_ENDED' || gate()) void refreshRef.current();
    };
    const queries = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'error') onFailure(event.action.error);
    });
    const mutations = queryClient.getMutationCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'error') onFailure(event.action.error);
    });
    const onVisible = (): void => {
      if (document.visibilityState !== 'visible' || modeRef.current !== 'session') return;
      if (gate()) void refreshRef.current();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      queries();
      mutations();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [queryClient]);

  const permissions = useMemo<ReadonlySet<string> | null>(
    () => (grantKey === null ? null : new Set(grantKey.length === 0 ? [] : grantKey.split('\n'))),
    [grantKey],
  );

  const logout = useCallback(async (): Promise<void> => {
    await authApi.logout();
    setUser(null);
    setGrantKey(null);
    router.replace('/login');
  }, [router]);

  const value = useMemo<AuthState>(
    () => ({ mode, user, permissions, notice, refresh, logout }),
    [mode, user, permissions, notice, refresh, logout],
  );

  if (mode === 'loading') {
    return <main className="auth-loading">Đang kiểm tra quyền truy cập…</main>;
  }
  if (mode === 'session' && !user && pathname !== '/login') {
    return <main className="auth-loading">Đang chuyển tới cổng đăng nhập…</main>;
  }
  /*
   * MAT KHAU TAM → doi truoc khi lam bat cu viec gi. May chu da chan moi route khac bang `403
   * PASSWORD_CHANGE_REQUIRED`; man hinh noi dieu do TRUOC, thay vi de moi muc hien mot o loi.
   */
  if (mode === 'session' && user?.mustChangePassword === true && pathname !== '/login') {
    return (
      <AuthContext.Provider value={value}>
        <ForcedPasswordChange user={user} onChanged={refresh} onLogout={logout} />
      </AuthContext.Provider>
    );
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
