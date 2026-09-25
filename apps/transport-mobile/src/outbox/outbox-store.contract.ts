import {
  OutboxEngine,
  type OutboxItem,
  type OutboxSender,
  type SendOutcome,
} from '@netviet/driver-outbox';
import { beforeEach, describe, expect, it } from 'vitest';
import { SENT_JOURNAL_LIMIT, type LocalOutboxStore } from './local-outbox-store';

/**
 * HOP DONG HANH VI cua kho hang doi tren may — MOT bo bai, chay cho MOI hien thuc (SQLite tren
 * Android/iOS, IndexedDB tren PWA). Moi bai mo ta mot dieu se xay ra tren mot chiec xe that neu kho
 * lam sai — cung tinh than bo test cua `@netviet/driver-outbox`, ma ban trong bo nho cua no la hop
 * dong ca hai kho phai khop.
 *
 * `openBackend` mo MOT co so du lieu moi cho moi bai va tra ham dung kho theo pham vi — hai kho
 * cung co so, khac pham vi, la cach duy nhat kiem duoc tinh cach ly.
 */
export type StoreFactory = (scope: string, now: () => Date) => LocalOutboxStore;

export function contractItem(
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

const item = contractItem;

export function describeOutboxStoreContract(
  name: string,
  openBackend: () => Promise<StoreFactory>,
): void {
  describe(`${name} — hop dong kho hang doi`, () => {
    let makeStore: StoreFactory;
    let store: LocalOutboxStore;
    const clock = new Date('2026-09-25T08:00:00.000Z');

    beforeEach(async () => {
      makeStore = await openBackend();
      store = makeStore('https://a.vn|user-1', () => clock);
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

    it('moc thoi gian hong bi tu choi luc xep, khong nam lang trong hang', async () => {
      await expect(
        store.append(item({ id: 'bad', clientEventId: 'e-bad', capturedAt: 'hom qua' })),
      ).rejects.toThrow(/khong hop le/);
      expect(await store.countByState()).toEqual({ pending: 0, blocked: 0 });
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
      expect((await store.claim('OBSERVATION', 10, clock)).map((row) => row.id)).toEqual(['obs']);
    });

    it('claim: cung capturedAt thi xep theo id — thu tu on dinh giua hai nen tang', async () => {
      await store.append(item({ id: 'r-2', clientEventId: 'e-2' }));
      await store.append(item({ id: 'r-1', clientEventId: 'e-1' }));

      expect((await store.claim('PROOF', 10, clock)).map((row) => row.id)).toEqual(['r-1', 'r-2']);
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
      expect(pending?.nextAttemptAt).toBe('2026-09-25T08:10:00.000Z');
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

    it('so DA GUI: tran 200 moi pham vi, moi nhat truoc, khong cat so cua nguoi khac', async () => {
      let tick = Date.parse('2026-09-25T08:00:00.000Z');
      const moving = makeStore('https://a.vn|user-1', () => new Date(tick));
      const other = makeStore('https://a.vn|user-2', () => new Date(tick));
      await other.append(item({ id: 'o1', clientEventId: 'o1' }));
      await other.remove(['o1']);
      const total = SENT_JOURNAL_LIMIT + 5;
      for (let n = 0; n < total; n += 1) {
        tick += 1_000;
        await moving.append(item({ id: `s${n}`, clientEventId: `s${n}` }));
        await moving.remove([`s${n}`]);
      }

      const journal = await moving.listSent(1_000);
      expect(journal).toHaveLength(SENT_JOURNAL_LIMIT);
      expect(journal[0]?.id).toBe(`s${total - 1}`);
      expect(journal.at(-1)?.id).toBe(`s${total - SENT_JOURNAL_LIMIT}`);
      expect((await moving.listSent(3)).map((row) => row.id)).toEqual([
        `s${total - 1}`,
        `s${total - 2}`,
        `s${total - 3}`,
      ]);
      expect((await other.listSent()).map((row) => row.id)).toEqual(['o1']);
    });

    it('PHAM VI: muc cua lai xe khac khong bao gio bi lay ra duoi phien nay', async () => {
      const other = makeStore('https://a.vn|user-2', () => clock);
      await other.append(item({ id: 'x', clientEventId: 'shared-id' }));
      // Cung clientEventId o pham vi khac la hai muc khac nhau — khong va nhau.
      await store.append(item({ id: 'y', clientEventId: 'shared-id' }));

      expect((await store.claim('PROOF', 10, clock)).map((row) => row.id)).toEqual(['y']);
      expect(await store.countOtherScopes()).toBe(1);
      await store.remove(['x']);
      expect(await other.countByState()).toEqual({ pending: 1, blocked: 0 });
      await store.block('x', 'X');
      await store.reschedule('x', new Date('2026-09-25T09:00:00.000Z'), 'X');
      expect((await other.claim('PROOF', 10, clock)).map((row) => row.id)).toEqual(['x']);
      expect(await store.listSent()).toEqual([]);
    });

    it('requeue/discard chi tac dong len muc BLOCKED', async () => {
      await store.append(item({ id: 'r1', clientEventId: 'e1' }));
      await store.discard('r1');
      expect(await store.countByState()).toEqual({ pending: 1, blocked: 0 });

      await store.block('r1', 'X');
      await store.requeue('r1', clock);
      expect((await store.claim('PROOF', 10, clock)).map((row) => row.id)).toEqual(['r1']);

      await store.block('r1', 'X');
      await store.writeProgress('r1', 'slipId', 'slip-9');
      await store.discard('r1');
      expect(await store.countByState()).toEqual({ pending: 0, blocked: 0 });
      expect(await store.listSent()).toEqual([]);
      expect(await store.readProgress('r1', 'slipId')).toBeNull();
    });

    it('tien trinh: ghi de theo (muc, buoc), buoc chua co tra null', async () => {
      await store.writeProgress('r1', 'evidenceBaseline', '2');
      await store.writeProgress('r1', 'evidenceBaseline', '3');
      await store.writeProgress('r1', 'slipId', 'slip-1');

      expect(await store.readProgress('r1', 'evidenceBaseline')).toBe('3');
      expect(await store.readProgress('r1', 'slipId')).toBe('slip-1');
      expect(await store.readProgress('r1', 'evidenceDone')).toBeNull();
      expect(await store.readProgress('r2', 'slipId')).toBeNull();
    });

    it('payload va tep dinh kem di qua kho nguyen ven (tieng Viet, so, long nhau)', async () => {
      const payload = { label: 'Rời điểm lấy hàng', body: { liters: 42.5, note: null } };
      const attachments = [
        { uri: 'idb://abc', contentType: 'image/jpeg', captureMode: 'LIVE_CAMERA' as const },
      ];
      await store.append(item({ id: 'r1', clientEventId: 'e1', payload, attachments }));

      const [claimed] = await store.claim('PROOF', 1, clock);
      expect(claimed?.payload).toEqual(payload);
      expect(claimed?.attachments).toEqual(attachments);
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
      const scoped = makeStore('https://a.vn|driver', () => now);
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
}
