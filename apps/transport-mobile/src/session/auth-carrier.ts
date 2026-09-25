import { HttpClient } from '../api/http';
import { CLIENT_TAG, DEFAULT_SERVER_URL } from '../config/build-info';
import { closeNativeSession, openNativeSession, type Credentials } from './auth-flow';
import {
  clearSession,
  forgetServer,
  loadServerUrl,
  loadSession,
  saveServerUrl,
  saveSession,
} from './secure-session-storage';
import type { StoredSession } from './session-types';

/**
 * CACH MANG PHIEN tren Android/iOS: `Authorization: Bearer`, token trong Keychain/Keystore.
 * Ban web (PWA cung origin) nam o `auth-carrier.web.ts` — cookie HttpOnly + CSRF.
 *
 * SessionProvider chi noi chuyen voi module nay, nen hai nen tang khac cach mang ma cung mot may
 * trang thai (booting -> needsServer/signedOut -> signedIn).
 */
export const CARRIER = 'bearer' as const;

/** May chu CO DINH (PWA phuc vu tu chinh may chu) — native thi nguoi dung chon. */
export function fixedServerUrl(): string | null {
  return null;
}

export function makeHttp(
  serverUrl: string,
  getToken: () => string | null,
  onUnauthenticated?: () => void,
): HttpClient {
  return new HttpClient({ baseUrl: serverUrl, clientTag: CLIENT_TAG, getToken, onUnauthenticated });
}

export async function restoreSession(): Promise<StoredSession | null> {
  return loadSession();
}

export async function rememberedServerUrl(): Promise<string | null> {
  return (await loadServerUrl().catch(() => null)) ?? DEFAULT_SERVER_URL;
}

export async function signInWith(
  serverUrl: string,
  credentials: Credentials,
): Promise<StoredSession> {
  const session = await openNativeSession(serverUrl, credentials, (token) =>
    makeHttp(serverUrl, () => token),
  );
  await saveSession(session);
  return session;
}

export async function signOutWith(
  http: HttpClient | null,
): Promise<'SERVER_CLOSED' | 'LOCAL_ONLY'> {
  const outcome = http ? await closeNativeSession(http) : 'LOCAL_ONLY';
  await clearSession();
  return outcome;
}

export const persistSession = saveSession;
export const forgetSession = clearSession;
export const persistServerUrl = saveServerUrl;
export const forgetServerUrl = forgetServer;
