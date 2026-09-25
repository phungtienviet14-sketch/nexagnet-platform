import type {
  OutboxAttachment,
  OutboxItem,
  OutboxItemKind,
  OutboxItemState,
  OutboxStore,
} from '@netviet/driver-outbox';
import type { SqlDatabase, SqlValue } from './sql';

/**
 * KHO HANG DOI BEN tren may — hien thuc SQLite cua `OutboxStore` (`@netviet/driver-outbox`).
 *
 * Phai khop DUNG ngu nghia cua `InMemoryOutboxStore` (ban tham chieu cua goi). Them hai dieu chi
 * ung dung that moi can:
 *
 * 1. PHAM VI (`scope` = may chu + nguoi dung). May chu lay danh tinh lai xe TU PHIEN, nen mot muc
 *    do lai xe A bam ma gui duoi phien cua lai xe B (doi ca, dung chung may) se bi ghi cho B. Moi
 *    truy van o day loc theo pham vi; muc cua nguoi khac nam yen cho den khi dung nguoi dang nhap.
 * 2. SO DA GUI (`outbox_sent`). Hang doi khong phai lich su — muc gui xong bi xoa khoi hang. Nhung
 *    lai xe can thay "viec da len may chu" de tin la no da len; nen `remove` chuyen dong sang mot
 *    so nho co gioi han, chi de hien thi, khong bao gio gui lai.
 *
 * TIEN TRINH mot muc nhieu buoc (vd: da tai tep len, co `fileId`) nam o `outbox_progress`, de lan
 * thu lai khong tai lai tep — tep tai len khong co khoa idempotency phia may chu.
 */

const SENT_JOURNAL_LIMIT = 200;

export const OUTBOX_SCHEMA = `
CREATE TABLE IF NOT EXISTS outbox_items (
  id TEXT PRIMARY KEY NOT NULL,
  scope TEXT NOT NULL,
  client_event_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  captured_at_ms INTEGER NOT NULL,
  payload TEXT NOT NULL,
  attachments TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  next_attempt_at_ms INTEGER NOT NULL,
  state TEXT NOT NULL,
  last_error TEXT,
  UNIQUE (scope, client_event_id)
);
CREATE INDEX IF NOT EXISTS outbox_items_claim
  ON outbox_items (scope, kind, state, next_attempt_at_ms, captured_at_ms);
CREATE TABLE IF NOT EXISTS outbox_progress (
  item_id TEXT NOT NULL,
  step TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (item_id, step)
);
CREATE TABLE IF NOT EXISTS outbox_sent (
  id TEXT PRIMARY KEY NOT NULL,
  scope TEXT NOT NULL,
  client_event_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  payload TEXT NOT NULL,
  attempts INTEGER NOT NULL,
  sent_at TEXT NOT NULL,
  sent_at_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS outbox_sent_recent ON outbox_sent (scope, sent_at_ms);
`;

interface ItemRow {
  readonly id: string;
  readonly client_event_id: string;
  readonly kind: string;
  readonly captured_at: string;
  readonly payload: string;
  readonly attachments: string;
  readonly attempts: number;
  readonly next_attempt_at: string;
  readonly state: string;
  readonly last_error: string | null;
}

interface SentRow {
  readonly id: string;
  readonly client_event_id: string;
  readonly kind: string;
  readonly captured_at: string;
  readonly payload: string;
  readonly attempts: number;
  readonly sent_at: string;
}

export interface SentEntry {
  readonly id: string;
  readonly clientEventId: string;
  readonly kind: OutboxItemKind;
  readonly capturedAt: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly attempts: number;
  readonly sentAt: string;
}

const ITEM_COLUMNS =
  'id, client_event_id, kind, captured_at, payload, attachments, attempts, next_attempt_at, state, last_error';

function toItem(row: ItemRow): OutboxItem {
  return {
    id: row.id,
    clientEventId: row.client_event_id,
    kind: row.kind as OutboxItemKind,
    capturedAt: row.captured_at,
    payload: JSON.parse(row.payload) as Record<string, unknown>,
    attachments: JSON.parse(row.attachments) as OutboxAttachment[],
    attempts: row.attempts,
    nextAttemptAt: row.next_attempt_at,
    state: row.state as OutboxItemState,
    lastError: row.last_error,
  };
}

function epochMs(iso: string): number {
  const value = Date.parse(iso);
  if (Number.isNaN(value)) throw new Error(`Moc thoi gian khong hop le: ${iso}`);
  return value;
}

export async function migrateOutbox(db: SqlDatabase): Promise<void> {
  await db.execAsync(OUTBOX_SCHEMA);
}

export class SqliteOutboxStore implements OutboxStore {
  constructor(
    private readonly db: SqlDatabase,
    readonly scope: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async append(item: OutboxItem): Promise<OutboxItem> {
    // `INSERT OR IGNORE` + doc lai: rang buoc UNIQUE (scope, client_event_id) la cong chong bam
    // doi — hai lan cham vao "Đã giao" ra MOT hang, va hang do giu `capturedAt` cua lan DAU.
    await this.db.runAsync(
      `INSERT OR IGNORE INTO outbox_items
        (id, scope, client_event_id, kind, captured_at, captured_at_ms, payload, attachments,
         attempts, next_attempt_at, next_attempt_at_ms, state, last_error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        this.scope,
        item.clientEventId,
        item.kind,
        item.capturedAt,
        epochMs(item.capturedAt),
        JSON.stringify(item.payload),
        JSON.stringify(item.attachments),
        item.attempts,
        item.nextAttemptAt,
        epochMs(item.nextAttemptAt),
        item.state,
        item.lastError,
      ],
    );
    const stored = await this.db.getFirstAsync<ItemRow>(
      `SELECT ${ITEM_COLUMNS} FROM outbox_items WHERE scope = ? AND client_event_id = ?`,
      [this.scope, item.clientEventId],
    );
    if (!stored) throw new Error('Không ghi được việc vào hàng đợi trên máy');
    return toItem(stored);
  }

  async claim(kind: OutboxItemKind, limit: number, now: Date): Promise<readonly OutboxItem[]> {
    const rows = await this.db.getAllAsync<ItemRow>(
      `SELECT ${ITEM_COLUMNS} FROM outbox_items
       WHERE scope = ? AND kind = ? AND state = 'PENDING' AND next_attempt_at_ms <= ?
       ORDER BY captured_at_ms ASC, id ASC
       LIMIT ?`,
      [this.scope, kind, now.getTime(), limit],
    );
    return rows.map(toItem);
  }

  async remove(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    const sentAt = this.now();
    await this.db.withTransactionAsync(async () => {
      for (const id of ids) {
        await this.db.runAsync(
          `INSERT OR REPLACE INTO outbox_sent
            (id, scope, client_event_id, kind, captured_at, payload, attempts, sent_at, sent_at_ms)
           SELECT id, scope, client_event_id, kind, captured_at, payload, attempts, ?, ?
           FROM outbox_items WHERE id = ? AND scope = ?`,
          [sentAt.toISOString(), sentAt.getTime(), id, this.scope],
        );
        await this.db.runAsync('DELETE FROM outbox_items WHERE id = ? AND scope = ?', [
          id,
          this.scope,
        ]);
        await this.db.runAsync('DELETE FROM outbox_progress WHERE item_id = ?', [id]);
      }
      await this.db.runAsync(
        `DELETE FROM outbox_sent WHERE scope = ? AND id NOT IN (
           SELECT id FROM outbox_sent WHERE scope = ? ORDER BY sent_at_ms DESC LIMIT ?)`,
        [this.scope, this.scope, SENT_JOURNAL_LIMIT],
      );
    });
  }

  async reschedule(id: string, nextAttemptAt: Date, error: string): Promise<void> {
    await this.db.runAsync(
      `UPDATE outbox_items
       SET attempts = attempts + 1, next_attempt_at = ?, next_attempt_at_ms = ?, last_error = ?
       WHERE id = ? AND scope = ?`,
      [nextAttemptAt.toISOString(), nextAttemptAt.getTime(), error, id, this.scope],
    );
  }

  async block(id: string, error: string): Promise<void> {
    await this.db.runAsync(
      `UPDATE outbox_items SET attempts = attempts + 1, state = 'BLOCKED', last_error = ?
       WHERE id = ? AND scope = ?`,
      [error, id, this.scope],
    );
  }

  async countByState(): Promise<{ readonly pending: number; readonly blocked: number }> {
    const rows = await this.db.getAllAsync<{ state: string; n: number }>(
      'SELECT state, COUNT(*) AS n FROM outbox_items WHERE scope = ? GROUP BY state',
      [this.scope],
    );
    const count = (state: string): number => rows.find((row) => row.state === state)?.n ?? 0;
    return { pending: count('PENDING'), blocked: count('BLOCKED') };
  }

  async listBlocked(): Promise<readonly OutboxItem[]> {
    const rows = await this.db.getAllAsync<ItemRow>(
      `SELECT ${ITEM_COLUMNS} FROM outbox_items WHERE scope = ? AND state = 'BLOCKED'
       ORDER BY captured_at_ms ASC`,
      [this.scope],
    );
    return rows.map(toItem);
  }

  /** Muc DANG CHO (ke ca chua toi hen thu lai) — de trung tam dong bo liet ke. */
  async listPending(): Promise<readonly OutboxItem[]> {
    const rows = await this.db.getAllAsync<ItemRow>(
      `SELECT ${ITEM_COLUMNS} FROM outbox_items WHERE scope = ? AND state = 'PENDING'
       ORDER BY captured_at_ms ASC`,
      [this.scope],
    );
    return rows.map(toItem);
  }

  async listSent(limit = 50): Promise<readonly SentEntry[]> {
    const rows = await this.db.getAllAsync<SentRow>(
      `SELECT id, client_event_id, kind, captured_at, payload, attempts, sent_at FROM outbox_sent
       WHERE scope = ? ORDER BY sent_at_ms DESC LIMIT ?`,
      [this.scope, limit],
    );
    return rows.map((row) => ({
      id: row.id,
      clientEventId: row.client_event_id,
      kind: row.kind as OutboxItemKind,
      capturedAt: row.captured_at,
      payload: JSON.parse(row.payload) as Record<string, unknown>,
      attempts: row.attempts,
      sentAt: row.sent_at,
    }));
  }

  /**
   * Dua mot muc BLOCKED ve PENDING — chi khi NGUOI DUNG chu dong bam "Thử lại" (vd: van phong vua
   * sua du lieu lam no bi tu choi). Hang doi khong bao gio tu lam viec nay.
   */
  async requeue(id: string, now: Date): Promise<void> {
    await this.db.runAsync(
      `UPDATE outbox_items SET state = 'PENDING', next_attempt_at = ?, next_attempt_at_ms = ?
       WHERE id = ? AND scope = ? AND state = 'BLOCKED'`,
      [now.toISOString(), now.getTime(), id, this.scope],
    );
  }

  /**
   * Bo han mot muc BLOCKED — chi theo lenh nguoi dung, sau khi da thay ly do. Khong ghi vao so da
   * gui: no KHONG len may chu.
   */
  async discard(id: string): Promise<void> {
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync(
        "DELETE FROM outbox_items WHERE id = ? AND scope = ? AND state = 'BLOCKED'",
        [id, this.scope],
      );
      await this.db.runAsync('DELETE FROM outbox_progress WHERE item_id = ?', [id]);
    });
  }

  async readProgress(itemId: string, step: string): Promise<string | null> {
    const row = await this.db.getFirstAsync<{ value: string }>(
      'SELECT value FROM outbox_progress WHERE item_id = ? AND step = ?',
      [itemId, step],
    );
    return row?.value ?? null;
  }

  async writeProgress(itemId: string, step: string, value: SqlValue): Promise<void> {
    await this.db.runAsync(
      'INSERT OR REPLACE INTO outbox_progress (item_id, step, value) VALUES (?, ?, ?)',
      [itemId, step, String(value)],
    );
  }

  /** So muc cua PHAM VI KHAC dang cho — de man dang xuat/doi nguoi noi thang ra. */
  async countOtherScopes(): Promise<number> {
    const row = await this.db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) AS n FROM outbox_items WHERE scope <> ?',
      [this.scope],
    );
    return row?.n ?? 0;
  }
}
