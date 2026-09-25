import * as SecureStore from 'expo-secure-store';
import type { StoredSession } from './session-types';

/**
 * PHIEN TRONG KEYCHAIN (iOS) / KEYSTORE (Android) — khong trong AsyncStorage, khong trong SQLite.
 *
 * `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`: doc duoc khi man hinh KHOA (tac vu bam vi tri nen can gui
 * du lieu trong luc lai xe khoa may), nhung khong theo ban sao luu sang may khac. KHONG bat
 * `requireAuthentication` — muc can van tay khong doc duoc tu tac vu nen. Tren Android, plugin
 * `expo-secure-store` (`configureAndroidBackup: true` o app.config.ts) loai kho nay khoi Auto Backup.
 */
const SESSION_KEY = 'nexagent.session.v1';
const SERVER_KEY = 'nexagent.server.v1';
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

export async function loadSession(): Promise<StoredSession | null> {
  const raw = await SecureStore.getItemAsync(SESSION_KEY, OPTIONS);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredSession;
    if (typeof parsed.token !== 'string' || typeof parsed.serverUrl !== 'string') return null;
    return parsed;
  } catch {
    // Du lieu hong thi bo — dang nhap lai re hon mot phien doan mo.
    await SecureStore.deleteItemAsync(SESSION_KEY, OPTIONS);
    return null;
  }
}

export async function saveSession(session: StoredSession): Promise<void> {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session), OPTIONS);
  await SecureStore.setItemAsync(SERVER_KEY, session.serverUrl, OPTIONS);
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY, OPTIONS);
}

export async function loadServerUrl(): Promise<string | null> {
  return SecureStore.getItemAsync(SERVER_KEY, OPTIONS);
}

export async function saveServerUrl(url: string): Promise<void> {
  await SecureStore.setItemAsync(SERVER_KEY, url, OPTIONS);
}

export async function forgetServer(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY, OPTIONS);
  await SecureStore.deleteItemAsync(SERVER_KEY, OPTIONS);
}
