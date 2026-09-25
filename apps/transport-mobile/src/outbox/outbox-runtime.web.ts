import { OutboxEngine } from '@netviet/driver-outbox';
import { randomUUID } from 'expo-crypto';
import type { HttpClient } from '../api/http';
import type { StoredSession } from '../session/session-types';
import { outboxScope } from '../session/session-types';
import { formWithFile } from './attachments.web';
import type { DeviceBinding } from './field-actions';
import { createFieldSender } from './field-sender';
import { STORE, requestResult, sharedOutboxIdb, transactionDone } from './idb';
import { IdbOutboxStore, referencedUrisIn } from './idb-outbox-store';
import type * as NativeRuntime from './outbox-runtime';

/**
 * LAP RAP hang doi tren PWA — cung ten xuat voi `outbox-runtime.ts` (Metro chon tep nay khi dong
 * goi web; `expo-sqlite` ban web can WASM worker ma Metro khong dong goi duoc). Kho la IndexedDB,
 * nguoi gui la CUNG ban voi native (`field-sender.ts`).
 *
 * Khong co tac vu nen tren trinh duyet: hang doi chi xa khi trang mo (OutboxProvider).
 */
export function openOutboxDatabase(): Promise<IDBDatabase> {
  return sharedOutboxIdb();
}

export async function readKv(key: string): Promise<string | null> {
  const db = await sharedOutboxIdb();
  const tx = db.transaction(STORE.kv, 'readonly');
  const row = (await requestResult(tx.objectStore(STORE.kv).get(key))) as
    { value: string } | undefined;
  return row?.value ?? null;
}

export async function writeKv(key: string, value: string | null): Promise<void> {
  const db = await sharedOutboxIdb();
  const tx = db.transaction(STORE.kv, 'readwrite');
  if (value === null) tx.objectStore(STORE.kv).delete(key);
  else tx.objectStore(STORE.kv).put({ key, value });
  await transactionDone(tx);
}

/**
 * PWA KHONG gan thiet bi: may chu GAN `installationId` vinh vien cho lai xe dau tien, ma trinh
 * duyet xoa du lieu trang la mat ma — moi lan xoa se de lai mot "thiet bi" mo coi khoa lai xe.
 * Moc/vi tri tu PWA di khong kem `device`, dung nhu ban web cu.
 */
export async function deviceBinding(_userId: string): Promise<DeviceBinding | null> {
  return null;
}

export interface OutboxRuntime {
  readonly store: IdbOutboxStore;
  readonly engine: OutboxEngine;
}

export async function createOutboxRuntime(
  session: StoredSession,
  http: HttpClient,
): Promise<OutboxRuntime> {
  const db = await sharedOutboxIdb();
  const store = new IdbOutboxStore(db, outboxScope(session));
  const engine = new OutboxEngine({
    store,
    sender: createFieldSender(http, store, null, formWithFile),
    now: () => new Date(),
    newId: () => randomUUID(),
    // Cung chinh sach voi native: lo nho cho viec bam, tran 200 cho ban dinh vi.
    policy: { maxBatchSize: 25, baseDelayMs: 3_000, maxDelayMs: 300_000 },
  });
  return { store, engine };
}

/** Moi URI tep con duoc tham chieu boi BAT KY pham vi nao — de don tep mo coi an toan. */
export async function referencedAttachmentUris(): Promise<Set<string>> {
  return referencedUrisIn(await sharedOutboxIdb());
}

/**
 * KHOA HOP DONG giua hai ban: `tsc` chi thay ban native khi kiem cac cho goi (OutboxProvider,
 * background-task), nen mot ten xuat THIEU o day chi lo ra luc chay tren trinh duyet. Dong duoi day
 * bat dieu do luc bien dich.
 */
type WebRuntimeExports = Record<keyof typeof NativeRuntime, unknown> &
  Pick<typeof NativeRuntime, 'readKv' | 'writeKv' | 'deviceBinding' | 'referencedAttachmentUris'>;
const _parity: WebRuntimeExports = {
  openOutboxDatabase,
  readKv,
  writeKv,
  deviceBinding,
  createOutboxRuntime,
  referencedAttachmentUris,
};
