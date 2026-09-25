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
import { ApiError } from '../api/errors';
import type { HttpClient } from '../api/http';
import {
  CARRIER,
  fixedServerUrl,
  forgetServerUrl,
  forgetSession,
  makeHttp as carrierHttp,
  persistServerUrl,
  persistSession,
  rememberedServerUrl,
  restoreSession,
  signInWith,
  signOutWith,
} from './auth-carrier';
import { verifySession, type Credentials } from './auth-flow';
import type { StoredSession } from './session-types';

/**
 * TRANG THAI PHIEN — may trang thai nho, NGOAI TUYEN TRUOC, chung cho native va PWA.
 *
 * Lai xe mo ung dung luc 5 gio sang o bai xe khong song. Neu ung dung doi may chu xac nhan phien
 * roi moi cho vao, lai xe khong bam duoc gi ca — trong khi hang doi ngoai tuyen sinh ra chinh la
 * de lam viec luc do. Nen: co phien da luu -> vao ngay, xac minh o nen; chi khi MAY CHU noi 401
 * moi day ra man dang nhap. Mat mang KHONG phai 401.
 *
 * Cach MANG phien khac nhau theo nen tang (`auth-carrier.ts` Bearer/Keychain, `auth-carrier.web.ts`
 * cookie HttpOnly + CSRF); may trang thai nay khong biet — va khong can biet.
 */
export type SessionStatus = 'booting' | 'needsServer' | 'signedOut' | 'signedIn';

interface SessionState {
  readonly status: SessionStatus;
  readonly serverUrl: string | null;
  readonly session: StoredSession | null;
  /** Mot cau cho nguoi dung vi sao ho bi dua ve man dang nhap (het phien, bi khoa...). */
  readonly notice: string | null;
  /** Lan xac minh gan nhat co noi duoc may chu khong. `null` = khong loi. */
  readonly lastVerifyError: string | null;
}

interface SessionApi extends SessionState {
  readonly http: HttpClient | null;
  readonly carrier: typeof CARRIER;
  /** PWA phuc vu tu chinh may chu: khong co buoc chon may chu. */
  readonly serverFixed: boolean;
  chooseServer(url: string): Promise<void>;
  changeServer(): Promise<void>;
  signIn(credentials: Credentials): Promise<void>;
  signOut(): Promise<'SERVER_CLOSED' | 'LOCAL_ONLY'>;
  reverify(): Promise<void>;
}

const SessionContext = createContext<SessionApi | null>(null);

export function makeHttp(
  serverUrl: string,
  getToken: () => string | null,
  onUnauthenticated?: () => void,
): HttpClient {
  return carrierHttp(serverUrl, getToken, onUnauthenticated);
}

const EXPIRED_NOTICE =
  'Phiên đăng nhập đã hết hạn hoặc bị thu hồi. Đăng nhập lại để tiếp tục — việc chưa gửi vẫn nằm trên máy.';

export function SessionProvider({ children }: { readonly children: ReactNode }) {
  const serverFixed = fixedServerUrl() !== null;
  const [state, setState] = useState<SessionState>({
    status: 'booting',
    serverUrl: null,
    session: null,
    notice: null,
    lastVerifyError: null,
  });
  const tokenRef = useRef<string | null>(null);

  const expire = useCallback((notice: string) => {
    tokenRef.current = null;
    void forgetSession();
    setState((previous) => ({
      ...previous,
      status: previous.serverUrl ? 'signedOut' : 'needsServer',
      session: null,
      notice,
    }));
  }, []);

  const onUnauthenticated = useCallback(() => expire(EXPIRED_NOTICE), [expire]);

  const http = useMemo(
    () =>
      state.serverUrl && state.session
        ? makeHttp(state.serverUrl, () => tokenRef.current, onUnauthenticated)
        : null,
    [state.serverUrl, state.session, onUnauthenticated],
  );

  const verifyInBackground = useCallback(
    async (stored: StoredSession) => {
      try {
        const user = await verifySession(makeHttp(stored.serverUrl, () => tokenRef.current));
        const refreshed: StoredSession = { ...stored, user, verifiedAt: new Date().toISOString() };
        await persistSession(refreshed);
        setState((previous) =>
          previous.session?.user.id === stored.user.id
            ? { ...previous, session: refreshed, lastVerifyError: null }
            : previous,
        );
      } catch (error) {
        if (error instanceof ApiError && error.kind === 'UNAUTHENTICATED') {
          onUnauthenticated();
          return;
        }
        const message = error instanceof Error ? error.message : 'Không kết nối được máy chủ';
        setState((previous) => ({ ...previous, lastVerifyError: message }));
      }
    },
    [onUnauthenticated],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await restoreSession().catch(() => null);
      const server = stored?.serverUrl ?? (await rememberedServerUrl());
      if (cancelled) return;
      if (stored) {
        tokenRef.current = stored.token || null;
        setState({
          status: 'signedIn',
          serverUrl: stored.serverUrl,
          session: stored,
          notice: null,
          lastVerifyError: null,
        });
        if (CARRIER === 'bearer') void verifyInBackground(stored);
        return;
      }
      setState({
        status: server ? 'signedOut' : 'needsServer',
        serverUrl: server,
        session: null,
        notice: null,
        lastVerifyError: null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [verifyInBackground]);

  const chooseServer = useCallback(async (url: string) => {
    await persistServerUrl(url);
    setState((previous) => ({ ...previous, status: 'signedOut', serverUrl: url, notice: null }));
  }, []);

  const changeServer = useCallback(async () => {
    tokenRef.current = null;
    await forgetServerUrl();
    setState({
      status: serverFixed ? 'signedOut' : 'needsServer',
      serverUrl: fixedServerUrl(),
      session: null,
      notice: null,
      lastVerifyError: null,
    });
  }, [serverFixed]);

  const signIn = useCallback(
    async (credentials: Credentials) => {
      const serverUrl = state.serverUrl;
      if (!serverUrl && !serverFixed) throw new Error('Chưa chọn máy chủ');
      const session = await signInWith(serverUrl ?? '', credentials);
      tokenRef.current = session.token || null;
      setState({
        status: 'signedIn',
        serverUrl: session.serverUrl,
        session,
        notice: null,
        lastVerifyError: null,
      });
    },
    [state.serverUrl, serverFixed],
  );

  const signOut = useCallback(async () => {
    const outcome = await signOutWith(http);
    tokenRef.current = null;
    setState((previous) => ({ ...previous, status: 'signedOut', session: null, notice: null }));
    return outcome;
  }, [http]);

  const reverify = useCallback(async () => {
    if (state.session) await verifyInBackground(state.session);
  }, [state.session, verifyInBackground]);

  const value = useMemo<SessionApi>(
    () => ({
      ...state,
      http,
      carrier: CARRIER,
      serverFixed,
      chooseServer,
      changeServer,
      signIn,
      signOut,
      reverify,
    }),
    [state, http, serverFixed, chooseServer, changeServer, signIn, signOut, reverify],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionApi {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession phai nam trong SessionProvider');
  return value;
}

/** Cho man hinh da dang nhap: tra `HttpClient` chac chan co. */
export function useHttp(): HttpClient {
  const { http } = useSession();
  if (!http) throw new Error('Chưa đăng nhập');
  return http;
}
