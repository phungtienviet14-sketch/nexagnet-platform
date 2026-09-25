import { ApiError } from '../api/errors';
import { HttpClient, type CsrfSource } from '../api/http';
import { CLIENT_TAG } from '../config/build-info';
import type { Credentials } from './auth-flow';
import { parseSessionUser, type StoredSession } from './session-types';

/**
 * CACH MANG PHIEN cua PWA: DUNG mo hinh cua web hien tai — cookie phien HttpOnly + CSRF, CUNG
 * origin voi API (PWA duoc phuc vu tu chinh may chu cua doanh nghiep).
 *
 * Vi sao khong dung Bearer tren web: token nam trong JS (localStorage/IndexedDB) thi mot lo XSS bat
 * ky doc duoc va mang di. Cookie HttpOnly thi JS cua trang khong bao gio cham duoc. Duong
 * `POST /auth/native/session` cung tu choi yeu cau khong tu xung native — PWA khong xin token.
 *
 * Luu tren may CHI ho so nguoi dung (khong bi mat) de mo ung dung luc mat song van vao duoc man
 * hinh va xep viec; moi yeu cau van do cookie xac thuc tai may chu.
 */
export const CARRIER = 'cookie' as const;
const PROFILE_KEY = 'nexagent.profile.v1';

function origin(): string {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  return typeof window === 'undefined' ? '' : window.location.origin;
}

let csrfToken: string | null = null;

async function fetchCsrf(): Promise<string | null> {
  const response = await fetch(`${origin()}/auth/csrf`, {
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { csrfToken?: string | null };
  return body.csrfToken ?? null;
}

const csrf: CsrfSource = {
  async current() {
    csrfToken ??= await fetchCsrf();
    return csrfToken;
  },
  async refresh() {
    csrfToken = await fetchCsrf();
    return csrfToken;
  },
};

export function fixedServerUrl(): string | null {
  return origin();
}

export function makeHttp(
  serverUrl: string,
  _getToken: () => string | null,
  onUnauthenticated?: () => void,
): HttpClient {
  return new HttpClient({
    baseUrl: serverUrl,
    clientTag: CLIENT_TAG,
    getToken: () => null,
    mode: 'cookie',
    csrf,
    onUnauthenticated,
  });
}

function readProfile(): StoredSession | null {
  try {
    const raw = globalThis.localStorage?.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

function writeProfile(session: StoredSession | null): void {
  try {
    if (session) globalThis.localStorage?.setItem(PROFILE_KEY, JSON.stringify(session));
    else globalThis.localStorage?.removeItem(PROFILE_KEY);
  } catch {
    // Trinh duyet chan luu tru (che do rieng tu): van dung duoc khi co mang.
  }
}

/**
 * Hoi may chu bang cookie. Mat mang -> dung ho so da luu (neu co) de lam viec ngoai tuyen; 401 ->
 * chua dang nhap. Token luu trong ho so luon RONG — phien la cookie.
 */
export async function restoreSession(): Promise<StoredSession | null> {
  const serverUrl = origin();
  try {
    const body = await makeHttp(serverUrl, () => null).get<{ user?: unknown }>('/auth/me');
    const session: StoredSession = {
      serverUrl,
      token: '',
      user: parseSessionUser(body?.user),
      idleTimeoutMs: 8 * 60 * 60 * 1000,
      verifiedAt: new Date().toISOString(),
    };
    writeProfile(session);
    return session;
  } catch (error) {
    if (error instanceof ApiError && error.kind === 'UNAUTHENTICATED') {
      writeProfile(null);
      return null;
    }
    const cached = readProfile();
    return cached?.serverUrl === serverUrl ? cached : null;
  }
}

export async function rememberedServerUrl(): Promise<string | null> {
  return origin();
}

export async function signInWith(
  serverUrl: string,
  credentials: Credentials,
): Promise<StoredSession> {
  const http = makeHttp(serverUrl, () => null);
  const body = await http.post<{ user?: unknown; csrfToken?: string }>('/auth/login', {
    username: credentials.username.trim(),
    password: credentials.password,
  });
  // Dang nhap XOAY token CSRF (auth.controller.ts) — dung token moi cho moi lenh ghi sau do.
  csrfToken = body.csrfToken ?? null;
  const session: StoredSession = {
    serverUrl,
    token: '',
    user: parseSessionUser(body.user),
    idleTimeoutMs: 8 * 60 * 60 * 1000,
    verifiedAt: new Date().toISOString(),
  };
  writeProfile(session);
  return session;
}

export async function signOutWith(
  http: HttpClient | null,
): Promise<'SERVER_CLOSED' | 'LOCAL_ONLY'> {
  let outcome: 'SERVER_CLOSED' | 'LOCAL_ONLY' = 'LOCAL_ONLY';
  if (http) {
    try {
      await http.post('/auth/logout');
      outcome = 'SERVER_CLOSED';
    } catch {
      outcome = 'LOCAL_ONLY';
    }
  }
  csrfToken = null;
  writeProfile(null);
  return outcome;
}

export async function persistSession(session: StoredSession): Promise<void> {
  writeProfile(session);
}

export async function forgetSession(): Promise<void> {
  writeProfile(null);
}

export async function persistServerUrl(): Promise<void> {}

export async function forgetServerUrl(): Promise<void> {
  writeProfile(null);
}
