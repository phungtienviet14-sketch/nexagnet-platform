import { DatabaseSync } from 'node:sqlite';
import { describeOutboxStoreContract } from './outbox-store.contract';
import type { SqlDatabase, SqlValue } from './sql';
import { SqliteOutboxStore, migrateOutbox } from './sqlite-outbox-store';

/**
 * CHAY SQL THAT (`node:sqlite`) qua dung giao dien ma `expo-sqlite` cung cap tren may. Bo bai la hop
 * dong CHUNG voi kho IndexedDB cua PWA (`outbox-store.contract.ts`) — hai nen tang khong duoc lech.
 */
function nodeSqlite(): SqlDatabase {
  const db = new DatabaseSync(':memory:');
  const bind = (params: readonly SqlValue[]) => params as SqlValue[];
  return {
    async execAsync(source) {
      db.exec(source);
    },
    async runAsync(source, params) {
      const result = db.prepare(source).run(...bind(params));
      return { changes: Number(result.changes) };
    },
    async getAllAsync<T>(source: string, params: readonly SqlValue[]) {
      return db.prepare(source).all(...bind(params)) as T[];
    },
    async getFirstAsync<T>(source: string, params: readonly SqlValue[]) {
      return (db.prepare(source).get(...bind(params)) as T | undefined) ?? null;
    },
    async withTransactionAsync(task) {
      db.exec('BEGIN');
      try {
        await task();
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

describeOutboxStoreContract('SqliteOutboxStore (SQL that)', async () => {
  const db = nodeSqlite();
  await migrateOutbox(db);
  await migrateOutbox(db); // chay lai khong hong — ung dung goi moi lan mo
  return (scope, now) => new SqliteOutboxStore(db, scope, now);
});
