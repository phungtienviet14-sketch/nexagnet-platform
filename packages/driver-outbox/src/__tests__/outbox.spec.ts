import { beforeEach, describe, expect, it } from 'vitest';
import { backoffDelayMs } from '../backoff.js';
import { InMemoryOutboxStore } from '../memory-store.js';
import { OutboxEngine, type OutboxSender } from '../outbox.js';
import { DEFAULT_OUTBOX_POLICY, type OutboxItem, type SendOutcome } from '../outbox.types.js';

/**
 * OUTBOX-010 — hang doi ngoai tuyen cua ung dung lai xe.
 *
 * Bo test nay la thu DUY NHAT chung minh goi nay dung, vi chua co ung dung nao dung no. Nen no
 * duoc viet theo huong "mot cach hong cu the" chu khong theo huong "phu tung nhanh code": moi bai
 * duoi day mo ta mot dieu se xay ra TREN MOT CHIEC XE THAT neu dong co lam sai.
 */

/** Nguoi gui gia — ghi lai da duoc goi voi gi, va tra ve ket cuc do bai test dat truoc. */
function fakeSender(script: readonly SendOutcome[][] = []) {
  const calls: OutboxItem[][] = [];
  let turn = 0;
  const sender: OutboxSender = {
    async sendBatch(items) {
      calls.push([...items]);
      const outcomes = script[turn];
      turn += 1;
      // Khong khai kich ban thi mac dinh NHAN HET — de bai nao chi quan tam den thu tu/kich thuoc
      // lo khong phai viet thua mot kich ban.
      return outcomes ?? items.map(() => ({ kind: 'ACCEPTED' as const }));
    },
  };
  return { sender, calls };
}

describe('Hang doi ngoai tuyen — OUTBOX-010', () => {
  let store: InMemoryOutboxStore;
  let clock: Date;
  let ids: number;

  const engineWith = (sender: OutboxSender, policy = DEFAULT_OUTBOX_POLICY) =>
    new OutboxEngine({
      store,
      sender,
      now: () => clock,
      newId: () => {
        ids += 1;
        return `row-${ids}`;
      },
      policy,
    });

  const observation = (eventId: string, capturedAt: string) => ({
    clientEventId: eventId,
    kind: 'OBSERVATION' as const,
    capturedAt,
    payload: { latitude: 21.0285, longitude: 105.8542 },
  });

  beforeEach(() => {
    store = new InMemoryOutboxStore();
    clock = new Date('2026-09-08T07:00:00.000Z');
    ids = 0;
  });

  describe('`capturedAt` — dau thoi gian cua LUC BAM', () => {
    it('KHONG bi viet lai khi gui lai bon tieng sau', async () => {
      const { sender } = fakeSender([[{ kind: 'RETRY', reason: 'OFFLINE' }]]);
      const engine = engineWith(sender);

      await engine.enqueue(observation('evt-1', '2026-09-08T07:00:00.000Z'));
      await engine.drain('OBSERVATION');

      // Bon tieng sau, may co song tro lai.
      clock = new Date('2026-09-08T11:00:00.000Z');
      const row = store.peek('evt-1');

      // Neu dong co dat lai `capturedAt` = bay gio, may chu se nhan mot ban dinh vi mang nhan
      // 11:00 cho mot viec da xay ra luc 07:00 — va tinh ra mot quang duong khong ai di.
      expect(row?.capturedAt).toBe('2026-09-08T07:00:00.000Z');
    });

    it('den TU NGUOI GOI, khong tu dong ho luc xep hang', async () => {
      const { sender } = fakeSender();
      const engine = engineWith(sender);

      // Bam luc 06:30; xep hang luc 07:00 (dong ho hien tai).
      const item = await engine.enqueue(observation('evt-2', '2026-09-08T06:30:00.000Z'));
      expect(item.capturedAt).toBe('2026-09-08T06:30:00.000Z');
    });
  });

  describe('`clientEventId` — khoa idempotency', () => {
    it('xep hai lan cung mot khoa chi tao MOT dong', async () => {
      const { sender } = fakeSender();
      const engine = engineWith(sender);

      const first = await engine.enqueue(observation('evt-3', '2026-09-08T07:00:00.000Z'));
      // Cham hai lan / xoay man hinh / ung dung dung lai roi gui lai cung mot viec.
      const second = await engine.enqueue(observation('evt-3', '2026-09-08T07:00:05.000Z'));

      expect(second.id).toBe(first.id);
      expect((await engine.status()).pending).toBe(1);
      // Va ban GIU LAI la ban dau tien — lan bam thu hai khong duoc doi dau thoi gian.
      expect(second.capturedAt).toBe('2026-09-08T07:00:00.000Z');
    });

    it('giu nguyen khoa qua moi lan gui lai', async () => {
      const { sender, calls } = fakeSender([
        [{ kind: 'RETRY', reason: 'OFFLINE' }],
        [{ kind: 'ACCEPTED' }],
      ]);
      const engine = engineWith(sender);
      await engine.enqueue(observation('evt-4', '2026-09-08T07:00:00.000Z'));

      await engine.drain('OBSERVATION');
      clock = new Date('2026-09-08T07:30:00.000Z');
      await engine.drain('OBSERVATION');

      expect(calls).toHaveLength(2);
      expect(calls[0]?.[0]?.clientEventId).toBe('evt-4');
      // Sinh khoa moi o lan hai se lam may chu ghi mot hang THU HAI cho cung mot viec.
      expect(calls[1]?.[0]?.clientEventId).toBe('evt-4');
    });
  });

  describe('muc bi tu choi vinh vien khong duoc chan hang doi', () => {
    it('mot muc REJECTED sang BLOCKED, cac muc con lai VAN di duoc', async () => {
      const { sender } = fakeSender([
        [
          { kind: 'REJECTED', reason: 'PROOF_DRIVER_NOT_ASSIGNED' },
          { kind: 'ACCEPTED' },
          { kind: 'ACCEPTED' },
        ],
      ]);
      const engine = engineWith(sender);
      await engine.enqueue(observation('evt-bad', '2026-09-08T07:00:00.000Z'));
      await engine.enqueue(observation('evt-ok-1', '2026-09-08T07:00:01.000Z'));
      await engine.enqueue(observation('evt-ok-2', '2026-09-08T07:00:02.000Z'));

      const accepted = await engine.drain('OBSERVATION');

      expect(accepted).toBe(2);
      const status = await engine.status();
      expect(status.blocked).toBe(1);
      expect(status.pending).toBe(0);
    });

    it('muc da BLOCKED khong duoc gui lai o lan sau', async () => {
      const { sender, calls } = fakeSender([[{ kind: 'REJECTED', reason: 'SAI_HINH_DANG' }]]);
      const engine = engineWith(sender);
      await engine.enqueue(observation('evt-blocked', '2026-09-08T07:00:00.000Z'));

      await engine.drain('OBSERVATION');
      clock = new Date('2026-09-08T09:00:00.000Z');
      await engine.drain('OBSERVATION');

      // Lan hai khong co gi de lay, nen `sendBatch` khong duoc goi lan nao nua.
      expect(calls).toHaveLength(1);
    });

    it('muc bi chan VAN liet ke duoc — giao dien phai bay ra, khong duoc giau', async () => {
      const { sender } = fakeSender([[{ kind: 'REJECTED', reason: 'PROOF_PHOTO_REQUIRED' }]]);
      const engine = engineWith(sender);
      await engine.enqueue(observation('evt-show', '2026-09-08T07:00:00.000Z'));
      await engine.drain('OBSERVATION');

      const blocked = await engine.blocked();
      expect(blocked).toHaveLength(1);
      expect(blocked[0]?.lastError).toBe('PROOF_PHOTO_REQUIRED');
    });
  });

  describe('lo va thu tu', () => {
    it('KHONG vuot tran mot lo, ke ca sau mot doan dai mat song', async () => {
      const { sender, calls } = fakeSender();
      const engine = engineWith(sender, { ...DEFAULT_OUTBOX_POLICY, maxBatchSize: 5 });

      for (let index = 0; index < 12; index += 1) {
        const seconds = String(index).padStart(2, '0');
        await engine.enqueue(observation(`evt-batch-${index}`, `2026-09-08T07:00:${seconds}.000Z`));
      }
      await engine.drain('OBSERVATION');

      expect(calls[0]).toHaveLength(5);
    });

    it('gui CU NHAT TRUOC theo dong ho luc bam', async () => {
      const { sender, calls } = fakeSender();
      const engine = engineWith(sender);

      // Xep hang lon xon — hang doi phai tu sap theo luc BAM, khong theo luc xep.
      await engine.enqueue(observation('evt-late', '2026-09-08T07:00:30.000Z'));
      await engine.enqueue(observation('evt-early', '2026-09-08T07:00:10.000Z'));
      await engine.enqueue(observation('evt-mid', '2026-09-08T07:00:20.000Z'));

      await engine.drain('OBSERVATION');

      expect(calls[0]?.map((item) => item.clientEventId)).toEqual([
        'evt-early',
        'evt-mid',
        'evt-late',
      ]);
    });

    it('khong tron hai loai viec vao mot lo', async () => {
      const { sender, calls } = fakeSender();
      const engine = engineWith(sender);
      await engine.enqueue(observation('evt-obs', '2026-09-08T07:00:00.000Z'));
      await engine.enqueue({
        clientEventId: 'evt-proof',
        kind: 'PROOF',
        capturedAt: '2026-09-08T07:00:01.000Z',
        payload: { kind: 'DELIVERY' },
        attachments: [
          { uri: 'file:///anh.jpg', contentType: 'image/jpeg', captureMode: 'LIVE_CAMERA' },
        ],
      });

      await engine.drain('OBSERVATION');

      expect(calls[0]?.map((item) => item.clientEventId)).toEqual(['evt-obs']);
    });
  });

  describe('cach cho giua hai lan thu', () => {
    it('mot muc vua that bai KHONG duoc lay lai ngay lap tuc', async () => {
      const { sender, calls } = fakeSender([[{ kind: 'RETRY', reason: 'OFFLINE' }]]);
      const engine = engineWith(sender);
      await engine.enqueue(observation('evt-wait', '2026-09-08T07:00:00.000Z'));

      await engine.drain('OBSERVATION');
      // Cung mot khoanh khac — chua toi han.
      await engine.drain('OBSERVATION');

      expect(calls).toHaveLength(1);
    });

    it('den han thi duoc lay lai', async () => {
      const { sender, calls } = fakeSender([[{ kind: 'RETRY', reason: 'OFFLINE' }]]);
      const engine = engineWith(sender);
      await engine.enqueue(observation('evt-due', '2026-09-08T07:00:00.000Z'));

      await engine.drain('OBSERVATION');
      clock = new Date(clock.getTime() + DEFAULT_OUTBOX_POLICY.baseDelayMs * 4);
      await engine.drain('OBSERVATION');

      expect(calls).toHaveLength(2);
    });

    it('nhan doi, nhung KHONG vuot tran', () => {
      const policy = { ...DEFAULT_OUTBOX_POLICY, baseDelayMs: 1_000, maxDelayMs: 10_000 };
      expect(backoffDelayMs(1, policy)).toBe(2_000);
      expect(backoffDelayMs(2, policy)).toBe(4_000);
      expect(backoffDelayMs(3, policy)).toBe(8_000);
      expect(backoffDelayMs(4, policy)).toBe(10_000);
      // Mot ngay mat song khong duoc day khoang cho len hang gio.
      expect(backoffDelayMs(500, policy)).toBe(10_000);
    });
  });

  describe('mot lan nem tu duong mang', () => {
    it('lui lich CA LO, khong chan muc nao', async () => {
      const sender: OutboxSender = {
        async sendBatch() {
          throw new Error('Network request failed');
        },
      };
      const engine = engineWith(sender);
      await engine.enqueue(observation('evt-throw-1', '2026-09-08T07:00:00.000Z'));
      await engine.enqueue(observation('evt-throw-2', '2026-09-08T07:00:01.000Z'));

      const accepted = await engine.drain('OBSERVATION');

      expect(accepted).toBe(0);
      const status = await engine.status();
      // Mot loi mang khong phai mot phan quyet cua may chu — khong muc nao duoc coi la hong.
      expect(status.blocked).toBe(0);
      expect(status.pending).toBe(2);
      expect(status.lastError).toBe('Network request failed');
    });
  });

  describe('may chu tra ve thieu ket cuc', () => {
    it('phan thieu duoc coi la THU LAI, khong phai da nhan', async () => {
      // Hai muc gui di, may chu chi tra ve mot ket cuc — sai hop dong.
      const { sender } = fakeSender([[{ kind: 'ACCEPTED' }]]);
      const engine = engineWith(sender);
      await engine.enqueue(observation('evt-partial-1', '2026-09-08T07:00:00.000Z'));
      await engine.enqueue(observation('evt-partial-2', '2026-09-08T07:00:01.000Z'));

      const accepted = await engine.drain('OBSERVATION');

      expect(accepted).toBe(1);
      // Gia su "da nhan" cho muc thieu se lam MAT bang chung vinh vien — huong sai duy nhat khong
      // sua duoc, nen dong co chon huong con lai.
      expect((await engine.status()).pending).toBe(1);
    });
  });

  describe('trang thai dong bo cho giao dien', () => {
    it('noi duoc CA BA dieu: con bao nhieu, hong bao nhieu, lan cuoi thu la khi nao', async () => {
      const { sender } = fakeSender([
        [
          { kind: 'REJECTED', reason: 'SAI' },
          { kind: 'RETRY', reason: 'OFFLINE' },
        ],
      ]);
      const engine = engineWith(sender);
      await engine.enqueue(observation('evt-s1', '2026-09-08T07:00:00.000Z'));
      await engine.enqueue(observation('evt-s2', '2026-09-08T07:00:01.000Z'));

      expect((await engine.status()).lastAttemptAt).toBeNull();

      await engine.drain('OBSERVATION');
      const status = await engine.status();

      expect(status.blocked).toBe(1);
      expect(status.pending).toBe(1);
      expect(status.lastAttemptAt).toBe('2026-09-08T07:00:00.000Z');
    });
  });

  describe('anh chung cu', () => {
    it('hang doi giu THAM CHIEU tep, khong giu byte', async () => {
      const { sender } = fakeSender();
      const engine = engineWith(sender);
      const item = await engine.enqueue({
        clientEventId: 'evt-photo',
        kind: 'PROOF',
        capturedAt: '2026-09-08T07:00:00.000Z',
        payload: { kind: 'DELIVERY', tripId: 'trip-1' },
        attachments: [
          { uri: 'file:///data/anh-1.jpg', contentType: 'image/jpeg', captureMode: 'LIVE_CAMERA' },
        ],
      });

      // 30 lan giao x 3 tam anh 4MB nam trong mot bang SQLite la cach nhanh nhat de mot hang doi
      // tro thanh mot van de bo nho. Giu duong dan thi lan gui lai doc lai tu dia.
      expect(item.attachments[0]?.uri).toBe('file:///data/anh-1.jpg');
      expect(JSON.stringify(item).length).toBeLessThan(1_000);
    });

    it('cach lay anh di theo tung tam, khong gop thanh mot muc tin cay chung', async () => {
      const { sender } = fakeSender();
      const engine = engineWith(sender);
      const item = await engine.enqueue({
        clientEventId: 'evt-mixed',
        kind: 'PROOF',
        capturedAt: '2026-09-08T07:00:00.000Z',
        payload: { kind: 'DELIVERY' },
        attachments: [
          { uri: 'file:///a.jpg', contentType: 'image/jpeg', captureMode: 'LIVE_CAMERA' },
          { uri: 'file:///b.jpg', contentType: 'image/jpeg', captureMode: 'GALLERY' },
        ],
      });

      expect(item.attachments.map((photo) => photo.captureMode)).toEqual([
        'LIVE_CAMERA',
        'GALLERY',
      ]);
    });
  });
});
