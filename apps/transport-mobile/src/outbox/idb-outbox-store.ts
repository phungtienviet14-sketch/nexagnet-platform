import type {
  OutboxAttachment,
  OutboxItem,
  OutboxItemKind,
  OutboxItemState,
} from '@netviet/driver-outbox';
import { INDEX, STORE, prefixRange, transactionDone } from './idb';
import { SENT_JOURNAL_LIMIT, type LocalOutboxStore } from './local-outbox-store';
import type { SentEntry } from './sqlite-outbox-store';

/**
 * KHO HANG DOI cua PWA — hien thuc IndexedDB, KHOP TUNG NGU NGHIA voi `SqliteOutboxStore` (khoa
 * bang `outbox-store.contract.ts`, chay cho ca hai):
 *
 *   · pham vi (may chu + nguoi dung) loc MOI truy van;
 *   · (scope, clientEventId) duy nhat — lan bam DAU giu `capturedAt`, bam doi ra mot hang;
 *   · claim = dung loai + PENDING + da toi hen, cu nhat truoc (`capturedAt`, roi `id`), co gioi han;
 *   · so da gui tran 200 moi pham vi; xoa tien trinh khi muc len may chu hoac bi bo.
 *
 * `payload`/`attachments` luu dang JSON (nhu cot TEXT cua SQLite), khong phai structured clone: thu
 * nam trong hang doi la DUNG thu se len day mang, va hai nen tang doc lai ra cung mot gia tri.
 */

interface ItemRecord {
  readonly id: string;
  readonly scope: string;
  readonly clientEventId: string;
  readonly kind: string;
  readonly capturedAt: string;
  readonly capturedAtMs: number;
  readonly payload: string;
  readonly attachments: string;
  readonly attempts: number;
  readonly nextAttemptAt: string;
  readonly nextAttemptAtMs: number;
  readonly state: string;
  readonly lastError: string | null;
}

interface SentRecord {
  readonly id: string;
  readonly scope: string;
  readonly clientEventId: string;
  readonly kind: string;
  readonly capturedAt: string;
  readonly payload: string;
  readonly attempts: number;
  readonly sentAt: string;
  readonly sentAtMs: number;
}

interface ProgressRecord {
  readonly itemId: string;
  readonly step: string;
  readonly value: string;
}

function epochMs(iso: string): number {
  const value = Date.parse(iso);
  if (Number.isNaN(value)) throw new Error(`Moc thoi gian khong hop le: ${iso}`);
  return value;
}

function toRecord(scope: string, item: OutboxItem): ItemRecord {
  return {
    id: item.id,
    scope,
    clientEventId: item.clientEventId,
    kind: item.kind,
    capturedAt: item.capturedAt,
    capturedAtMs: epochMs(item.capturedAt),
    payload: JSON.stringify(item.payload),
    attachments: JSON.stringify(item.attachments),
    attempts: item.attempts,
    nextAttemptAt: item.nextAttemptAt,
    nextAttemptAtMs: epochMs(item.nextAttemptAt),
    state: item.state,
    lastError: item.lastError,
  };
}

function toItem(row: ItemRecord): OutboxItem {
  return {
    id: row.id,
    clientEventId: row.clientEventId,
    kind: row.kind as OutboxItemKind,
    capturedAt: row.capturedAt,
    payload: JSON.parse(row.payload) as Record<string, unknown>,
    attachments: JSON.parse(row.attachments) as OutboxAttachment[],
    attempts: row.attempts,
    nextAttemptAt: row.nextAttemptAt,
    state: row.state as OutboxItemState,
    lastError: row.lastError,
  };
}

function toSent(row: SentRecord): SentEntry {
  return {
    id: row.id,
    clientEventId: row.clientEventId,
    kind: row.kind as OutboxItemKind,
    capturedAt: row.capturedAt,
    payload: JSON.parse(row.payload) as Record<string, unknown>,
    attempts: row.attempts,
    sentAt: row.sentAt,
  };
}

export class IdbOutboxStore implements LocalOutboxStore {
  constructor(
    private readonly db: IDBDatabase,
    readonly scope: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async append(item: OutboxItem): Promise<OutboxItem> {
    const record = toRecord(this.scope, item);
    const tx = this.db.transaction(STORE.items, 'readwrite');
    const items = tx.objectStore(STORE.items);
    let stored: ItemRecord | null = null;
    // Doc-roi-them trong CUNG giao dich ghi: hai giao dich ghi tren mot kho chay noi tiep, nen
    // hai lan cham "Đã giao" khong the cung thay "chua co" — lan sau nhan lai hang cua lan dau.
    const lookup = items.index(INDEX.scopeEvent).get([this.scope, item.clientEventId]);
    lookup.onsuccess = () => {
      const existing = lookup.result as ItemRecord | undefined;
      if (existing) {
        stored = existing;
        return;
      }
      items.add(record);
      stored = record;
    };
    await transactionDone(tx);
    if (!stored) throw new Error('Không ghi được việc vào hàng đợi trên máy');
    return toItem(stored);
  }

  async claim(kind: OutboxItemKind, limit: number, now: Date): Promise<readonly OutboxItem[]> {
    if (limit <= 0) return [];
    const rows: ItemRecord[] = [];
    const tx = this.db.transaction(STORE.items, 'readonly');
    const range = prefixRange([this.scope, kind, 'PENDING']);
    const cursorRequest = tx.objectStore(STORE.items).index(INDEX.claim).openCursor(range);
    const due = now.getTime();
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) return;
      const row = cursor.value as ItemRecord;
      if (row.nextAttemptAtMs <= due) rows.push(row);
      if (rows.length < limit) cursor.continue();
    };
    await transactionDone(tx);
    return rows.map(toItem);
  }

  async remove(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    const sentAt = this.now();
    const tx = this.db.transaction([STORE.items, STORE.sent, STORE.progress], 'readwrite');
    const items = tx.objectStore(STORE.items);
    const sent = tx.objectStore(STORE.sent);
    let pending = ids.length;
    for (const id of ids) {
      const lookup = items.get(id);
      lookup.onsuccess = () => {
        const row = lookup.result as ItemRecord | undefined;
        if (row && row.scope === this.scope) {
          sent.put({
            id: row.id,
            scope: row.scope,
            clientEventId: row.clientEventId,
            kind: row.kind,
            capturedAt: row.capturedAt,
            payload: row.payload,
            attempts: row.attempts,
            sentAt: sentAt.toISOString(),
            sentAtMs: sentAt.getTime(),
          } satisfies SentRecord);
          items.delete(id);
          tx.objectStore(STORE.progress).delete(prefixRange([id]));
        }
        pending -= 1;
        // Cat so SAU khi moi dong moi da duoc dat vao: yeu cau trong mot giao dich chay dung thu tu.
        if (pending === 0) this.trimSentJournal(sent);
      };
    }
    await transactionDone(tx);
  }

  /** Dem truoc, roi chi xoa PHAN THUA tu dong cu nhat — khong duyet 200 dong moi lan gui xong. */
  private trimSentJournal(sent: IDBObjectStore): void {
    const index = sent.index(INDEX.sentRecent);
    const range = prefixRange([this.scope]);
    const countRequest = index.count(range);
    countRequest.onsuccess = () => {
      let excess = countRequest.result - SENT_JOURNAL_LIMIT;
      if (excess <= 0) return;
      const cursorRequest = index.openCursor(range);
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor || excess <= 0) return;
        cursor.delete();
        excess -= 1;
        if (excess > 0) cursor.continue();
      };
    };
  }

  /** Doc-sua-ghi MOT dong cua pham vi nay trong mot giao dich; `change` tra `null` = khong doi. */
  private async update(id: string, change: (row: ItemRecord) => ItemRecord | null): Promise<void> {
    const tx = this.db.transaction(STORE.items, 'readwrite');
    const items = tx.objectStore(STORE.items);
    const lookup = items.get(id);
    lookup.onsuccess = () => {
      const row = lookup.result as ItemRecord | undefined;
      if (!row || row.scope !== this.scope) return;
      const next = change(row);
      if (next) items.put(next);
    };
    await transactionDone(tx);
  }

  reschedule(id: string, nextAttemptAt: Date, error: string): Promise<void> {
    return this.update(id, (row) => ({
      ...row,
      attempts: row.attempts + 1,
      nextAttemptAt: nextAttemptAt.toISOString(),
      nextAttemptAtMs: nextAttemptAt.getTime(),
      lastError: error,
    }));
  }

  block(id: string, error: string): Promise<void> {
    return this.update(id, (row) => ({
      ...row,
      attempts: row.attempts + 1,
      state: 'BLOCKED',
      lastError: error,
    }));
  }

  /**
   * Dua mot muc BLOCKED ve PENDING — chi khi NGUOI DUNG chu dong bam "Gửi lại". Giu nguyen so lan
   * va loi cuoi, dung nhu SQLite.
   */
  requeue(id: string, now: Date): Promise<void> {
    return this.update(id, (row) =>
      row.state === 'BLOCKED'
        ? {
            ...row,
            state: 'PENDING',
            nextAttemptAt: now.toISOString(),
            nextAttemptAtMs: now.getTime(),
          }
        : null,
    );
  }

  /** Bo han mot muc BLOCKED — khong ghi vao so da gui: no KHONG len may chu. */
  async discard(id: string): Promise<void> {
    const tx = this.db.transaction([STORE.items, STORE.progress], 'readwrite');
    const items = tx.objectStore(STORE.items);
    const lookup = items.get(id);
    lookup.onsuccess = () => {
      const row = lookup.result as ItemRecord | undefined;
      if (!row || row.scope !== this.scope || row.state !== 'BLOCKED') return;
      items.delete(id);
      tx.objectStore(STORE.progress).delete(prefixRange([id]));
    };
    await transactionDone(tx);
  }

  async countByState(): Promise<{ readonly pending: number; readonly blocked: number }> {
    const tx = this.db.transaction(STORE.items, 'readonly');
    const index = tx.objectStore(STORE.items).index(INDEX.scopeState);
    const pending = index.count(prefixRange([this.scope, 'PENDING']));
    const blocked = index.count(prefixRange([this.scope, 'BLOCKED']));
    await transactionDone(tx);
    return { pending: pending.result, blocked: blocked.result };
  }

  private async listByState(state: OutboxItemState): Promise<readonly OutboxItem[]> {
    const tx = this.db.transaction(STORE.items, 'readonly');
    const request = tx
      .objectStore(STORE.items)
      .index(INDEX.scopeState)
      .getAll(prefixRange([this.scope, state]));
    await transactionDone(tx);
    return (request.result as ItemRecord[]).map(toItem);
  }

  listBlocked(): Promise<readonly OutboxItem[]> {
    return this.listByState('BLOCKED');
  }

  /** Muc DANG CHO (ke ca chua toi hen thu lai) — de trung tam dong bo liet ke. */
  listPending(): Promise<readonly OutboxItem[]> {
    return this.listByState('PENDING');
  }

  async listSent(limit = 50): Promise<readonly SentEntry[]> {
    const rows: SentRecord[] = [];
    if (limit <= 0) return [];
    const tx = this.db.transaction(STORE.sent, 'readonly');
    const range = prefixRange([this.scope]);
    const cursorRequest = tx
      .objectStore(STORE.sent)
      .index(INDEX.sentRecent)
      .openCursor(range, 'prev');
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) return;
      rows.push(cursor.value as SentRecord);
      if (rows.length < limit) cursor.continue();
    };
    await transactionDone(tx);
    return rows.map(toSent);
  }

  async readProgress(itemId: string, step: string): Promise<string | null> {
    const tx = this.db.transaction(STORE.progress, 'readonly');
    const request = tx.objectStore(STORE.progress).get([itemId, step]);
    await transactionDone(tx);
    return (request.result as ProgressRecord | undefined)?.value ?? null;
  }

  async writeProgress(itemId: string, step: string, value: string): Promise<void> {
    const tx = this.db.transaction(STORE.progress, 'readwrite');
    tx.objectStore(STORE.progress).put({
      itemId,
      step,
      value: String(value),
    } satisfies ProgressRecord);
    await transactionDone(tx);
  }

  /** So muc cua PHAM VI KHAC dang cho — de man dang xuat/doi nguoi noi thang ra. */
  async countOtherScopes(): Promise<number> {
    const tx = this.db.transaction(STORE.items, 'readonly');
    const items = tx.objectStore(STORE.items);
    const all = items.count();
    const mine = items.index(INDEX.scopeState).count(prefixRange([this.scope]));
    await transactionDone(tx);
    return all.result - mine.result;
  }
}

/** Moi URI tep con duoc tham chieu boi BAT KY pham vi nao — de don tep mo coi an toan. */
export async function referencedUrisIn(db: IDBDatabase): Promise<Set<string>> {
  const tx = db.transaction(STORE.items, 'readonly');
  const request = tx.objectStore(STORE.items).getAll();
  await transactionDone(tx);
  const uris = new Set<string>();
  for (const row of request.result as ItemRecord[]) {
    for (const attachment of JSON.parse(row.attachments) as OutboxAttachment[])
      uris.add(attachment.uri);
  }
  return uris;
}
