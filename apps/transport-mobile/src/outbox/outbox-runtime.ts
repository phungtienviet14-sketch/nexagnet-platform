import {
  OutboxEngine,
  type OutboxItem,
  type OutboxSender,
  type SendOutcome,
} from '@netviet/driver-outbox';
import { randomUUID } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';
import type { HttpClient } from '../api/http';
import { BUILD_INFO } from '../config/build-info';
import type { StoredSession } from '../session/session-types';
import { outboxScope } from '../session/session-types';
import { formWithFile } from './attachments';
import { executeFieldAction, type DeviceBinding } from './field-actions';
import { sendProofBatch } from './proof-sender';
import { sendObservationBatch } from './observation-sender';
import type { SqlDatabase } from './sql';
import { SqliteOutboxStore, migrateOutbox } from './sqlite-outbox-store';

/**
 * LAP RAP hang doi tren may — dung chung cho giao dien (OutboxProvider) va tac vu vi tri nen
 * (background-task.ts, co the chay khi giao dien khong mo).
 */
const DB_NAME = 'nexagent-outbox.db';
let dbPromise: Promise<SQLiteDatabase> | null = null;

export function openOutboxDatabase(): Promise<SQLiteDatabase> {
  dbPromise ??= (async () => {
    const db = await openDatabaseAsync(DB_NAME);
    // WAL: tac vu nen ghi trong luc giao dien doc — khong khoa lan nhau.
    await db.execAsync('PRAGMA journal_mode = WAL;');
    await migrateOutbox(db as unknown as SqlDatabase);
    await db.execAsync(
      'CREATE TABLE IF NOT EXISTS app_kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);',
    );
    return db;
  })();
  return dbPromise;
}

export async function readKv(key: string): Promise<string | null> {
  const db = await openOutboxDatabase();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_kv WHERE key = ?', [
    key,
  ]);
  return row?.value ?? null;
}

export async function writeKv(key: string, value: string | null): Promise<void> {
  const db = await openOutboxDatabase();
  if (value === null) await db.runAsync('DELETE FROM app_kv WHERE key = ?', [key]);
  else await db.runAsync('INSERT OR REPLACE INTO app_kv (key, value) VALUES (?, ?)', [key, value]);
}

const INSTALLATION_KEY = 'nexagent.installation.v1';

/**
 * `installationId` gui kem phien bam vi tri. May chu GAN no vinh vien cho lai xe DAU TIEN dung no
 * (`DEVICE_BOUND_TO_ANOTHER_DRIVER`) — nen mot may dung chung giua hai lai xe se khoa lai xe thu
 * hai. Ghep ma cai dat voi ma nguoi dung: moi (ban cai x nguoi dung) la mot "thiet bi" rieng, dung
 * voi nghia "ung dung nay, cua nguoi nay".
 */
export async function deviceBinding(userId: string): Promise<DeviceBinding | null> {
  if (Platform.OS === 'web') return null;
  let install = await SecureStore.getItemAsync(INSTALLATION_KEY);
  if (!install) {
    install = randomUUID();
    await SecureStore.setItemAsync(INSTALLATION_KEY, install);
  }
  return {
    installationId: `${install}:${userId}`.slice(0, 200),
    platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID',
    appVersion: `${BUILD_INFO.version}+${BUILD_INFO.buildNumber}`.slice(0, 50),
  };
}

export interface OutboxRuntime {
  readonly store: SqliteOutboxStore;
  readonly engine: OutboxEngine;
}

function sender(
  http: HttpClient,
  store: SqliteOutboxStore,
  device: DeviceBinding | null,
): OutboxSender {
  return {
    async sendBatch(items: readonly OutboxItem[]): Promise<readonly SendOutcome[]> {
      if (items[0]?.kind === 'OBSERVATION') return sendObservationBatch(items, http, device);
      // Viec bam: TUAN TU, FIFO theo vong chay/chang, ke ca voi viec truoc dang lui hen.
      const inBatch = new Set(items.map((item) => item.id));
      const outside = (await store.listPending()).filter(
        (item) => item.kind === 'PROOF' && !inBatch.has(item.id),
      );
      return sendProofBatch(
        items,
        (item) => executeFieldAction(item, { http, progress: store, device, formWithFile }),
        outside,
      );
    },
  };
}

export async function createOutboxRuntime(
  session: StoredSession,
  http: HttpClient,
): Promise<OutboxRuntime> {
  const db = await openOutboxDatabase();
  const store = new SqliteOutboxStore(db as unknown as SqlDatabase, outboxScope(session));
  const device = await deviceBinding(session.user.id);
  const engine = new OutboxEngine({
    store,
    sender: sender(http, store, device),
    now: () => new Date(),
    newId: () => randomUUID(),
    // Viec bam: lo nho (gui tung cai) de mot viec cham khong giu ca hang. Ban dinh vi: tran 200.
    policy: { maxBatchSize: 25, baseDelayMs: 3_000, maxDelayMs: 300_000 },
  });
  return { store, engine };
}

/** Moi URI tep con duoc tham chieu boi BAT KY pham vi nao — de don tep mo coi an toan. */
export async function referencedAttachmentUris(): Promise<Set<string>> {
  const db = await openOutboxDatabase();
  const rows = await db.getAllAsync<{ attachments: string }>(
    'SELECT attachments FROM outbox_items',
    [],
  );
  const uris = new Set<string>();
  for (const row of rows) {
    for (const attachment of JSON.parse(row.attachments) as Array<{ uri: string }>)
      uris.add(attachment.uri);
  }
  return uris;
}
