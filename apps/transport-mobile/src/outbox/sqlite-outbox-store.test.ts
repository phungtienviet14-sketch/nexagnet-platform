import { DatabaseSync } from 'node:sqlite';
import {
  OutboxEngine,
  type OutboxItem,
  type OutboxSender,
  type SendOutcome,
} from '@netviet/driver-outbox';
import { beforeEach, describe, expect, it } from 'vitest';
import type { SqlDatabase, SqlValue } from './sql';
import { SqliteOutboxStore, migrateOutbox } from './sqlite-outbox-store';

/**
 * CHAY SQL THAT (`node:sqlite`) qua dung giao dien ma `expo-sqlite` cung cap tren may. Moi bai mo
 * ta mot dieu se xay ra tren mot chiec xe that neu kho lam sai — cung tinh than bo test cua
 * `@netviet/driver-outbox`, ma ban trong bo nho cua no la hop dong kho nay phai khop.
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

function item(
  overrides: Partial<OutboxItem> & Pick<OutboxItem, 'id' | 'clientEventId'>,
): OutboxItem {
  return {
    kind: 'PROOF',
    capturedAt: '2026-09-25T07:00:00.000Z',
    payload: { type: 'CHECKPOINT' },
    attachments: [],
    attempts: 0,
    nextAttemptAt: '2026-09-25T07:00:00.000Z',
    state: 'PENDING',
    lastError: null,
    ...overrides,
  };
}

describe('SqliteOutboxStore — SQL that', () => {
  let db: SqlDatabase;
  let store: SqliteOutboxStore;
  const clock = new Date('2026-09-25T08:00:00.000Z');

  beforeEach(async () => {
    db = nodeSqlite();
    await migrateOutbox(db);
    await migrateOutbox(db); // chay lai khong hong — ung dung goi moi lan mo
    store = new SqliteOutboxStore(db, 'https://a.vn|user-1', () => clock);
  });

  it('bam doi cung clientEventId ra MOT hang, giu capturedAt cua lan dau', async () => {
    await store.append(
      item({ id: 'r1', clientEventId: 'evt-1', capturedAt: '2026-09-25T07:00:00.000Z' }),
    );
    const second = await store.append(
      item({ id: 'r2', clientEventId: 'evt-1', capturedAt: '2026-09-25T07:05:00.000Z' }),
    );

    expect(second.id).toBe('r1');
    expect(second.capturedAt).toBe('2026-09-25T07:00:00.000Z');
    expect(await store.countByState()).toEqual({ pending: 1, blocked: 0 });
  });

  it('claim: dung loai, chi PENDING da toi hen, cu nhat truoc, co gioi han', async () => {
    await store.append(
      item({ id: 'b', clientEventId: 'e-b', capturedAt: '2026-09-25T07:02:00.000Z' }),
    );
    await store.append(
      item({ id: 'a', clientEventId: 'e-a', capturedAt: '2026-09-25T07:01:00.000Z' }),
    );
    await store.append(
      item({ id: 'later', clientEventId: 'e-later', nextAttemptAt: '2026-09-25T09:00:00.000Z' }),
    );
    await store.append(item({ id: 'obs', clientEventId: 'e-obs', kind: 'OBSERVATION' }));

    const claimed = await store.claim('PROOF', 10, clock);

    expect(claimed.map((row) => row.id)).toEqual(['a', 'b']);
    expect((await store.claim('PROOF', 1, clock)).map((row) => row.id)).toEqual(['a']);
  });

  it('reschedule cong so lan va lui hen; block tach khoi hang ma khong mat', async () => {
    await store.append(item({ id: 'r1', clientEventId: 'e1' }));
    await store.append(item({ id: 'r2', clientEventId: 'e2' }));

    await store.reschedule('r1', new Date('2026-09-25T08:10:00.000Z'), 'OFFLINE');
    await store.block('r2', 'CHECKPOINT_PREDECESSOR_MISSING');

    expect(await store.claim('PROOF', 10, clock)).toEqual([]);
    expect(await store.countByState()).toEqual({ pending: 1, blocked: 1 });
    const [blocked] = await store.listBlocked();
    expect(blocked).toMatchObject({ id: 'r2', state: 'BLOCKED', attempts: 1 });
    expect(blocked?.lastError).toBe('CHECKPOINT_PREDECESSOR_MISSING');
    const [pending] = await store.listPending();
    expect(pending).toMatchObject({ id: 'r1', attempts: 1, lastError: 'OFFLINE' });
  });

  it('remove chuyen sang so DA GUI (chi de hien thi) va xoa tien trinh', async () => {
    await store.append(item({ id: 'r1', clientEventId: 'e1', payload: { label: 'Đã đến nơi' } }));
    await store.writeProgress('r1', 'fileId', 'file-123');

    await store.remove(['r1']);

    expect(await store.countByState()).toEqual({ pending: 0, blocked: 0 });
    expect(await store.readProgress('r1', 'fileId')).toBeNull();
    const [sent] = await store.listSent();
    expect(sent).toMatchObject({
      id: 'r1',
      clientEventId: 'e1',
      payload: { label: 'Đã đến nơi' },
      sentAt: clock.toISOString(),
    });
  });

  it('PHAM VI: muc cua lai xe khac khong bao gio bi lay ra duoi phien nay', async () => {
    const other = new SqliteOutboxStore(db, 'https://a.vn|user-2', () => clock);
    await other.append(item({ id: 'x', clientEventId: 'shared-id' }));
    // Cung clientEventId o pham vi khac la hai muc khac nhau — khong va nhau.
    await store.append(item({ id: 'y', clientEventId: 'shared-id' }));

    expect((await store.claim('PROOF', 10, clock)).map((row) => row.id)).toEqual(['y']);
    expect(await store.countOtherScopes()).toBe(1);
    await store.remove(['x']);
    expect(await other.countByState()).toEqual({ pending: 1, blocked: 0 });
  });

  it('requeue/discard chi tac dong len muc BLOCKED', async () => {
    await store.append(item({ id: 'r1', clientEventId: 'e1' }));
    await store.discard('r1');
    expect(await store.countByState()).toEqual({ pending: 1, blocked: 0 });

    await store.block('r1', 'X');
    await store.requeue('r1', clock);
    expect((await store.claim('PROOF', 10, clock)).map((row) => row.id)).toEqual(['r1']);

    await store.block('r1', 'X');
    await store.discard('r1');
    expect(await store.countByState()).toEqual({ pending: 0, blocked: 0 });
    expect(await store.listSent()).toEqual([]);
  });

  it('dong co cua goi chay tren kho nay: mat song roi co lai, khong trung, khong mat', async () => {
    let now = new Date('2026-09-25T07:00:00.000Z');
    let online = false;
    const sentEventIds: string[] = [];
    const sender: OutboxSender = {
      async sendBatch(batch) {
        if (!online) throw new Error('Network request failed');
        sentEventIds.push(...batch.map((row) => row.clientEventId));
        return batch.map((): SendOutcome => ({ kind: 'ACCEPTED' }));
      },
    };
    const scoped = new SqliteOutboxStore(db, 'https://a.vn|driver', () => now);
    let seq = 0;
    const engine = new OutboxEngine({
      store: scoped,
      sender,
      now: () => now,
      newId: () => `row-${++seq}`,
    });

    await engine.enqueue({
      clientEventId: 'cp-1',
      kind: 'PROOF',
      capturedAt: now.toISOString(),
      payload: {},
    });
    await engine.enqueue({
      clientEventId: 'cp-1',
      kind: 'PROOF',
      capturedAt: now.toISOString(),
      payload: {},
    });
    expect(await engine.drain('PROOF')).toBe(0);

    online = true;
    now = new Date('2026-09-25T07:10:00.000Z');
    expect(await engine.drain('PROOF')).toBe(1);
    expect(await engine.drain('PROOF')).toBe(0);

    expect(sentEventIds).toEqual(['cp-1']);
    expect((await scoped.listSent()).map((row) => row.clientEventId)).toEqual(['cp-1']);
  });
});
