import type { OutboxItem, OutboxStore } from '@netviet/driver-outbox';
import type { SentEntry } from './sqlite-outbox-store';

/**
 * HOP DONG KHO HANG DOI TREN MAY — cai ma giao dien (trung tam dong bo) va nguoi gui (tien trinh
 * nhieu buoc) doi, NGOAI phan `OutboxStore` cua goi.
 *
 * Hai hien thuc: SQLite tren Android/iOS (`sqlite-outbox-store.ts`), IndexedDB tren PWA
 * (`idb-outbox-store.ts`). Ca hai chay CUNG mot bo test hanh vi (`outbox-store.contract.ts`) —
 * lech nhau o dau thi mot trong hai bai do, khong phai mot lai xe phat hien tren duong.
 */
export interface LocalOutboxStore extends OutboxStore {
  /** May chu + nguoi dung (`outboxScope`). Moi truy van loc theo no. */
  readonly scope: string;
  /** Muc DANG CHO (ke ca chua toi hen thu lai), cu nhat truoc. */
  listPending(): Promise<readonly OutboxItem[]>;
  /** So da gui — chi de hien thi, moi nhat truoc. */
  listSent(limit?: number): Promise<readonly SentEntry[]>;
  /** BLOCKED -> PENDING, chi theo lenh nguoi dung. */
  requeue(id: string, now: Date): Promise<void>;
  /** Bo han mot muc BLOCKED, chi theo lenh nguoi dung. */
  discard(id: string): Promise<void>;
  readProgress(itemId: string, step: string): Promise<string | null>;
  writeProgress(itemId: string, step: string, value: string): Promise<void>;
  /** So muc cua pham vi KHAC dang nam tren may. */
  countOtherScopes(): Promise<number>;
}

/** Tran so da gui cho MOI pham vi — ca hai hien thuc cat cung mot cho. */
export const SENT_JOURNAL_LIMIT = 200;
