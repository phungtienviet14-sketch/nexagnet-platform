import { beforeEach, describe, expect, it } from 'vitest';
import { CheckpointService } from '../checkpoint/checkpoint.service.js';
import {
  TransportCheckpointCoreFacts,
  TransportCheckpointLocationFacts,
  type CheckpointDriverFacts,
  type CheckpointLegFacts,
  type CheckpointObservationFacts,
  type CheckpointRunFacts,
} from '../checkpoint/checkpoint-facts.port.js';
import { DEFAULT_CHECKPOINT_POLICY } from '../checkpoint/checkpoint-lifecycle.js';
import { InMemoryCheckpointRepository } from '../checkpoint/checkpoint.repository.js';
import { TransportDomainError } from '../transport.errors.js';
import { InMemoryWaitingSessionRepository } from './waiting.repository.js';
import { WaitingSessionService } from './waiting.service.js';

/**
 * NGHIEM THU DOI KHANG cua phien cho — `#279` O13 bai 2, 3, 4, 5.
 *
 * Moi bai mo ta mot LAN TAN CONG cu the, khong phai mot nhanh code. Bo nay chay tren kho
 * TRONG-BO-NHO — tuc duong mac dinh cua demo/CI. Bo Postgres that (`transport-waiting.int.spec.ts`)
 * do lai cung nhung dieu do o tang rang buoc.
 */

const TZ = 'Asia/Ho_Chi_Minh';

class FakeCoreFacts extends TransportCheckpointCoreFacts {
  readonly drivers = new Map<string, CheckpointDriverFacts>();
  readonly runs = new Map<string, CheckpointRunFacts>();
  readonly legs = new Map<string, CheckpointLegFacts>();
  readonly assignments = new Map<string, string[]>();

  async findDriverByAuthUserId(authUserId: string): Promise<CheckpointDriverFacts | null> {
    return this.drivers.get(authUserId) ?? null;
  }
  async findRun(runId: string): Promise<CheckpointRunFacts | null> {
    return this.runs.get(runId) ?? null;
  }
  async findLeg(legId: string): Promise<CheckpointLegFacts | null> {
    return this.legs.get(legId) ?? null;
  }
  async wasDriverEverAssignedToRun(runId: string, driverId: string): Promise<boolean> {
    return (this.assignments.get(runId) ?? []).includes(driverId);
  }
}

class FakeLocationFacts extends TransportCheckpointLocationFacts {
  readonly observations = new Map<string, CheckpointObservationFacts>();
  async findObservation(observationId: string): Promise<CheckpointObservationFacts | null> {
    return this.observations.get(observationId) ?? null;
  }
}

const reasonOf = async (run: Promise<unknown>): Promise<string> => {
  try {
    await run;
    return 'NO_ERROR_THROWN';
  } catch (error) {
    return error instanceof TransportDomainError ? error.reason : `UNEXPECTED:${String(error)}`;
  }
};

describe('WaitingSessionService — WT-020', () => {
  let checkpoints: InMemoryCheckpointRepository;
  let sessions: InMemoryWaitingSessionRepository;
  let core: FakeCoreFacts;
  let location: FakeLocationFacts;
  let checkpointService: CheckpointService;
  let waiting: WaitingSessionService;
  let now: Date;

  /** Dua chang `leg_1` toi dung truoc luc co the mo phien cho, va tra ve moc `DELIVERY_ARRIVAL`. */
  const arriveAtDelivery = async (): Promise<string> => {
    for (const type of ['PICKUP_ARRIVAL', 'PICKUP_DEPARTURE'] as const) {
      await checkpointService.recordAsDriver({
        type,
        runId: 'run_1',
        legId: 'leg_1',
        authUserId: 'u.binh',
        clientEventId: `e.${type}`,
      });
    }
    location.observations.set('obs_1', { id: 'obs_1', capturedAt: now, driverId: 'drv_a' });
    const arrival = await checkpointService.recordAsDriver({
      type: 'DELIVERY_ARRIVAL',
      runId: 'run_1',
      legId: 'leg_1',
      authUserId: 'u.binh',
      observationId: 'obs_1',
      clientEventId: 'e.arrival',
    });
    return arrival.id;
  };

  const acceptDelivery = async (clientEventId = 'e.accepted'): Promise<void> => {
    location.observations.set(clientEventId, {
      id: clientEventId,
      capturedAt: now,
      driverId: 'drv_a',
    });
    await checkpointService.recordAsDriver({
      type: 'DELIVERY_ACCEPTED',
      runId: 'run_1',
      legId: 'leg_1',
      authUserId: 'u.binh',
      observationId: clientEventId,
      clientEventId,
    });
  };

  beforeEach(() => {
    checkpoints = new InMemoryCheckpointRepository();
    sessions = new InMemoryWaitingSessionRepository();
    core = new FakeCoreFacts();
    location = new FakeLocationFacts();
    now = new Date('2026-09-09T02:00:00.000Z');

    core.drivers.set('u.binh', { id: 'drv_a', fullName: 'Nguyen Van Binh' });
    core.drivers.set('u.cuong', { id: 'drv_b', fullName: 'Tran Van Cuong' });
    core.runs.set('run_1', { id: 'run_1', code: 'VC-001', status: 'ACTIVE' });
    core.runs.set('run_2', { id: 'run_2', code: 'VC-002', status: 'ACTIVE' });
    core.legs.set('leg_1', { id: 'leg_1', runId: 'run_1' });
    core.legs.set('leg_9', { id: 'leg_9', runId: 'run_2' });
    core.assignments.set('run_1', ['drv_a']);
    core.assignments.set('run_2', ['drv_b']);

    waiting = new WaitingSessionService(
      sessions,
      checkpoints,
      core,
      { timeZone: TZ },
      undefined,
      () => now,
    );
    checkpointService = new CheckpointService(
      checkpoints,
      core,
      location,
      { timeZone: TZ },
      DEFAULT_CHECKPOINT_POLICY,
      undefined,
      () => now,
      waiting,
    );
  });

  const startWaiting = (over: Record<string, unknown> = {}) =>
    waiting.start({
      runId: 'run_1',
      legId: 'leg_1',
      arrivalCheckpointId: 'PLACEHOLDER',
      reason: 'RECEIVER_NOT_READY',
      clientEventId: 'w.1',
      authUserId: 'u.binh',
      ...over,
    } as Parameters<typeof waiting.start>[0]);

  it('mo mot phien cho gan vao dung lan den noi cua chinh lai xe do', async () => {
    const arrivalId = await arriveAtDelivery();
    const session = await startWaiting({ arrivalCheckpointId: arrivalId });

    expect(session.status).toBe('OPEN');
    expect(session.arrivalCheckpointId).toBe(arrivalId);
    expect(session.driverId).toBe('drv_a');
    expect(session.startedAt).toEqual(now);
    expect(session.startedBy).toBe('u.binh');
    expect(session.businessDate).toBe('2026-09-09');
  });

  /** `#279` O13 bai 2 — gui lai dung lenh cu tra ve chinh phien do, khong mo phien thu hai. */
  it('gui lai mot lenh mo khong tao phien thu hai', async () => {
    const arrivalId = await arriveAtDelivery();
    const first = await startWaiting({ arrivalCheckpointId: arrivalId });
    const again = await startWaiting({ arrivalCheckpointId: arrivalId });

    expect(again.id).toBe(first.id);
    expect(await sessions.listForLeg('leg_1')).toHaveLength(1);
  });

  /**
   * `#279` O13 bai 5 — HAI lan bam KHAC NHAU cung luc.
   *
   * Khac bai tren: hai `clientEventId` khac nhau, nen duong gui lai khong cuu duoc. Chi rang buoc
   * "mot chang mot phien mo" moi chan duoc, va no phai chan bang mot ma nguoi dung doc duoc.
   */
  it('hai lan bam khac nhau cung luc chi tao mot phien dang mo', async () => {
    const arrivalId = await arriveAtDelivery();
    await startWaiting({ arrivalCheckpointId: arrivalId, clientEventId: 'w.1' });

    expect(
      await reasonOf(startWaiting({ arrivalCheckpointId: arrivalId, clientEventId: 'w.2' })),
    ).toBe('WAITING_ALREADY_OPEN');
    expect(
      (await sessions.listForLeg('leg_1')).filter((row) => row.status === 'OPEN'),
    ).toHaveLength(1);
  });

  it('khong mo duoc phien khi chua bam `Da den noi`', async () => {
    await checkpointService.recordAsDriver({
      type: 'PICKUP_ARRIVAL',
      runId: 'run_1',
      legId: 'leg_1',
      authUserId: 'u.binh',
      clientEventId: 'e.pickup',
    });
    expect(await reasonOf(startWaiting({ arrivalCheckpointId: 'khong-co-that' }))).toBe(
      'WAITING_ARRIVAL_NOT_FOUND',
    );
  });

  /** `#279` O12 — lai xe A khong muon duoc lan den noi cua lai xe B lam neo. */
  it('khong neo duoc vao lan den noi cua lai xe khac', async () => {
    const arrivalId = await arriveAtDelivery();
    core.assignments.set('run_1', ['drv_a', 'drv_b']);

    expect(
      await reasonOf(
        startWaiting({
          arrivalCheckpointId: arrivalId,
          authUserId: 'u.cuong',
          clientEventId: 'w.b',
        }),
      ),
    ).toBe('WAITING_ARRIVAL_NOT_OWNED');
  });

  it('khong neo duoc vao mot moc khong phai lan den noi giao', async () => {
    await arriveAtDelivery();
    const pickup = (await checkpoints.listForLeg('leg_1')).find(
      (row) => row.type === 'PICKUP_ARRIVAL',
    );
    expect(await reasonOf(startWaiting({ arrivalCheckpointId: pickup?.id ?? '' }))).toBe(
      'WAITING_ARRIVAL_NOT_APPLICABLE',
    );
  });

  it('lai xe khong cam vong chay do thi khong mo duoc phien', async () => {
    const arrivalId = await arriveAtDelivery();
    expect(
      await reasonOf(
        startWaiting({
          arrivalCheckpointId: arrivalId,
          authUserId: 'u.cuong',
          clientEventId: 'w.b',
        }),
      ),
    ).toBe('WAITING_DRIVER_NOT_ASSIGNED');
  });

  /**
   * BAI TRUNG TAM cua tranche: MOT cham dong ca hai su that.
   *
   * Lai xe bam `Khach da nhan hang` — mot moc — va phien cho dong theo, voi `endedAt` la DUNG
   * `receivedAt` cua moc do. Khong co lenh thu hai, nen khong co khoang chenh nao giua hai lan goi
   * de roi vao con so phu cap.
   */
  it('moc `Khach da nhan hang` dong phien cho, bang dung gio may chu cua chinh no', async () => {
    const arrivalId = await arriveAtDelivery();
    const session = await startWaiting({ arrivalCheckpointId: arrivalId });

    now = new Date('2026-09-09T05:30:00.000Z');
    await acceptDelivery();

    const closed = await sessions.find(session.id);
    expect(closed?.status).toBe('CLOSED');
    expect(closed?.closeReason).toBe('RECEIVER_ACCEPTED');
    expect(closed?.endedAt).toEqual(new Date('2026-09-09T05:30:00.000Z'));
    expect(closed?.endedBy).toBe('u.binh');
    expect(waiting.view(closed!).elapsedSeconds).toBe(3 * 3600 + 30 * 60);
  });

  /**
   * `#279` O10 — mot lan mat song dung GIUA hai buoc phai tu sua duoc.
   *
   * Duong hoi tu: moc da ghi nhung phien chua dong (vi cong `DeliveryWaitingCloser` chua duoc buoc
   * luc do). Lan gui lai di vao nhanh `CHECKPOINT_REPLAYED` — va van dong duoc phien. Neu cong chi
   * duoc goi o duong ghi MOI thi trang thai nay khong bao gio tu sua duoc.
   */
  it('gui lai moc `Khach da nhan hang` hoan tat not viec dong phien con dang do', async () => {
    const arrivalId = await arriveAtDelivery();
    const session = await startWaiting({ arrivalCheckpointId: arrivalId });

    // Lan ghi THU NHAT di qua mot dich vu KHONG co cong — moc vao so, phien van mo.
    const withoutBridge = new CheckpointService(
      checkpoints,
      core,
      location,
      { timeZone: TZ },
      DEFAULT_CHECKPOINT_POLICY,
      undefined,
      () => now,
    );
    location.observations.set('obs_acc', { id: 'obs_acc', capturedAt: now, driverId: 'drv_a' });
    await withoutBridge.recordAsDriver({
      type: 'DELIVERY_ACCEPTED',
      runId: 'run_1',
      legId: 'leg_1',
      authUserId: 'u.binh',
      observationId: 'obs_acc',
      clientEventId: 'e.accepted',
    });
    expect((await sessions.find(session.id))?.status).toBe('OPEN');

    // Lan GUI LAI di qua dich vu CO cong — va no hoan tat not viec con do.
    await checkpointService.recordAsDriver({
      type: 'DELIVERY_ACCEPTED',
      runId: 'run_1',
      legId: 'leg_1',
      authUserId: 'u.binh',
      observationId: 'obs_acc',
      clientEventId: 'e.accepted',
    });
    expect((await sessions.find(session.id))?.status).toBe('CLOSED');
    expect(await checkpoints.listForLeg('leg_1')).toHaveLength(4);
  });

  it('mot lan giao khong phai cho van ghi duoc moc nhan hang binh thuong', async () => {
    await arriveAtDelivery();
    await acceptDelivery();
    expect(await sessions.listForLeg('leg_1')).toHaveLength(0);
  });

  it('khong mo duoc phien cho sau khi nguoi nhan da nhan hang', async () => {
    const arrivalId = await arriveAtDelivery();
    await acceptDelivery();
    expect(await reasonOf(startWaiting({ arrivalCheckpointId: arrivalId }))).toBe(
      'WAITING_DELIVERY_ALREADY_ACCEPTED',
    );
  });

  it('van hanh dong duoc mot phien bo quen, kem ly do', async () => {
    const arrivalId = await arriveAtDelivery();
    const session = await startWaiting({ arrivalCheckpointId: arrivalId });

    now = new Date('2026-09-12T02:00:00.000Z');
    const closed = await waiting.closeByOperator({
      sessionId: session.id,
      note: 'Chuyen bi huy, lai xe quen bam',
      authUserId: 'u.admin',
    });

    expect(closed.status).toBe('CLOSED');
    expect(closed.closeReason).toBe('OPERATOR_CLOSED');
    expect(closed.closeNote).toBe('Chuyen bi huy, lai xe quen bam');
    expect(closed.closingCheckpointId).toBeNull();
  });

  it('dong hai lan bang duong van hanh thi lan hai bi tu choi', async () => {
    const arrivalId = await arriveAtDelivery();
    const session = await startWaiting({ arrivalCheckpointId: arrivalId });
    await waiting.closeByOperator({ sessionId: session.id, note: 'x', authUserId: 'u.admin' });

    expect(
      await reasonOf(
        waiting.closeByOperator({ sessionId: session.id, note: 'x', authUserId: 'u.admin' }),
      ),
    ).toBe('WAITING_ALREADY_CLOSED');
  });

  /**
   * `#279` O13 bai 3 — DONG HO MAY KHACH khong doi duoc thoi luong.
   *
   * Bai nay do dieu do o cho no duoc quyet: ca `start` lan duong dong deu KHONG NHAN mot truong
   * thoi gian nao tu ben goi, nen "sua dong ho may khach" khong co duong nao vao he thong. `now`
   * o day la dong ho MAY CHU (`TRANSPORT_CLOCK`), va no la nguon duy nhat cua ca hai moc.
   */
  it('thoi luong doc tu dong ho may chu, khong tu bat ky truong nao ben goi gui len', async () => {
    const arrivalId = await arriveAtDelivery();
    const session = await startWaiting({ arrivalCheckpointId: arrivalId });

    // Mot may khach co gang khai gio: lieu do bi `.strict()` cua zod chan tu bien vao HTTP, va o
    // tang mien thi lenh KHONG CO truong nao de nhet vao.
    expect(Object.keys(session)).not.toContain('capturedAt');
    expect(session.startedAt).toEqual(new Date('2026-09-09T02:00:00.000Z'));

    now = new Date('2026-09-09T04:00:00.000Z');
    expect(waiting.view(session).elapsedSeconds).toBe(2 * 3600);
  });

  /** Phien cho SONG SOT qua mot lan khoi dong lai — kho la nguon, khong phai bo nho tien trinh. */
  it('phien dang mo van doc lai duoc qua mot the hien dich vu moi', async () => {
    const arrivalId = await arriveAtDelivery();
    const session = await startWaiting({ arrivalCheckpointId: arrivalId });

    const restarted = new WaitingSessionService(
      sessions,
      checkpoints,
      core,
      { timeZone: TZ },
      undefined,
      () => new Date('2026-09-09T06:00:00.000Z'),
    );
    const own = await restarted.listOwn('u.binh');
    expect(own).toHaveLength(1);
    expect(own[0]?.id).toBe(session.id);
    expect(restarted.viewAll(own)[0]?.elapsedSeconds).toBe(4 * 3600);
  });

  /** `#279` O9 — lieu do cua lai xe khong mang mot truong tien nao. */
  it('khung nhin phien cho khong mang mot truong tien nao', async () => {
    const arrivalId = await arriveAtDelivery();
    const view = waiting.view(await startWaiting({ arrivalCheckpointId: arrivalId }));
    const keys = Object.keys(view).join('|').toLowerCase();
    for (const forbidden of ['amount', 'freight', 'revenue', 'price', 'vnd', 'allowance']) {
      expect(keys).not.toContain(forbidden);
    }
  });
});
