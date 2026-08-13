import { publicApiBase } from './api-base';

const API_BASE = publicApiBase();
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export type AuthRole = 'SALE' | 'MANAGER' | 'ACCOUNTING' | 'ADMIN';

export interface AuthUser {
  id: string;
  username: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  role: AuthRole;
  disabledAt?: string | null;
}

let csrfToken: string | null | undefined;

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const token = MUTATING_METHODS.has(method) ? await currentCsrfToken(input) : null;
  const headers = new Headers(init.headers);
  if (token) headers.set('x-csrf-token', token);
  return fetch(input, { ...init, headers, credentials: 'include' });
}

export const authApi = {
  config: async (): Promise<{ mode: 'api-key' | 'session' | 'none' }> =>
    readJson(await authFetch(`${API_BASE}/auth/config`)),
  me: async (): Promise<{ user: AuthUser; roles: readonly AuthRole[] }> =>
    readJson(await authFetch(`${API_BASE}/auth/me`, { cache: 'no-store' })),
  login: async (username: string, password: string): Promise<{ user: AuthUser; csrfToken: string }> => {
    const result = await readJson<{ user: AuthUser; csrfToken: string }>(
      await authFetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      }),
    );
    csrfToken = result.csrfToken;
    return result;
  },
  logout: async (): Promise<void> => {
    await readJson(await authFetch(`${API_BASE}/auth/logout`, { method: 'POST' }));
    csrfToken = undefined;
  },
  users: async (): Promise<AuthUser[]> =>
    readJson(await authFetch(`${API_BASE}/settings/users`, { cache: 'no-store' })),
  createUser: async (input: {
    username: string;
    name: string;
    password: string;
    role: AuthRole;
  }): Promise<AuthUser> =>
    readJson(
      await authFetch(`${API_BASE}/settings/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    ),
  assignRole: async (id: string, role: AuthRole): Promise<AuthUser> =>
    readJson(
      await authFetch(`${API_BASE}/settings/users/${encodeURIComponent(id)}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      }),
    ),
  disableUser: async (id: string): Promise<AuthUser> =>
    readJson(
      await authFetch(`${API_BASE}/settings/users/${encodeURIComponent(id)}/disable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed: true }),
      }),
    ),
  resetPassword: async (id: string, password: string): Promise<AuthUser> =>
    readJson(
      await authFetch(`${API_BASE}/settings/users/${encodeURIComponent(id)}/credentials/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      }),
    ),
};

async function currentCsrfToken(input: RequestInfo | URL): Promise<string | null> {
  if (csrfToken !== undefined) return csrfToken;
  const target = input instanceof Request ? input.url : input.toString();
  const absoluteBase = target.startsWith('http')
    ? target
    : API_BASE.startsWith('http')
      ? API_BASE
      : null;
  const csrfUrl = absoluteBase ? new URL('/auth/csrf', absoluteBase).toString() : '/auth/csrf';
  const response = await fetch(csrfUrl, { credentials: 'include', cache: 'no-store' });
  const result = await readJson<{ csrfToken?: string | null }>(response);
  // `?? null` la co y: khi API khong tra truong nao (AUTH_MODE=none/api-key) ma gan thang
  // `undefined` thi bo nho dem coi nhu CHUA hoi bao gio, nen MOI mutation lai bat them mot
  // vong `/auth/csrf` — im lang va khong bao gio dung lai. `null` = "da hoi, khong co token".
  csrfToken = result.csrfToken ?? null;
  return csrfToken;
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  const parsed = text ? (JSON.parse(text) as unknown) : null;
  if (!response.ok) {
    const record = typeof parsed === 'object' && parsed !== null ? (parsed as { message?: unknown }) : {};
    throw new Error(typeof record.message === 'string' ? record.message : `Yêu cầu thất bại (${response.status})`);
  }
  return parsed as T;
}

export function resetAuthClientForTests(): void {
  csrfToken = undefined;
}
