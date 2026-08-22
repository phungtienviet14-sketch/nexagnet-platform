'use client';

import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { authApi, type AuthUser } from '../../lib/auth';

interface AuthState {
  mode: 'api-key' | 'session' | 'none' | 'loading';
  user: AuthUser | null;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  mode: 'loading',
  user: null,
  refresh: async () => undefined,
  logout: async () => undefined,
});

export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [mode, setMode] = useState<AuthState['mode']>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);

  const refresh = async (): Promise<void> => {
    try {
      const config = await authApi.config();
      setMode(config.mode);
      if (config.mode !== 'session') {
        setUser(null);
        return;
      }
      try {
        const current = await authApi.me();
        setUser(current.user);
        if (pathname === '/login') router.replace('/');
      } catch {
        setUser(null);
        if (pathname !== '/login') router.replace('/login');
      }
    } catch {
      // Khi API endpoint khong phan hoi (vd: chay web doc lap / demo mock), fallback mode 'none'
      setMode('none');
      setUser(null);
    }
  };

  useEffect(() => {
    void refresh();
  }, [pathname]);

  const logout = async (): Promise<void> => {
    await authApi.logout();
    setUser(null);
    router.replace('/login');
  };

  if (mode === 'loading') {
    return <main className="auth-loading">Đang kiểm tra quyền truy cập…</main>;
  }
  if (mode === 'session' && !user && pathname !== '/login') {
    return <main className="auth-loading">Đang chuyển tới cổng đăng nhập…</main>;
  }
  return (
    <AuthContext.Provider value={{ mode, user, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
