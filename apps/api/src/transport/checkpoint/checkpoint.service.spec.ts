import { beforeEach, describe, expect, it } from 'vitest';
import { TransportDomainError } from '../transport.errors.js';
import {
  TransportCheckpointCoreFacts,
  TransportCheckpointLocationFacts,
  type CheckpointDriverFacts,
  type CheckpointLegFacts,
  type CheckpointObservationFacts,
  type CheckpointRunFacts,
} from './checkpoint-facts.port.js';
import { DEFAULT_CHECKPOINT_POLICY } from './checkpoint-lifecycle.js';
import { InMemoryCheckpointRepository } from './checkpoint.repository.js';
import { CheckpointService } from './checkpoint.service.js';

/**
 * NGHIEM THU DOI KHANG cua F1 — `#243` F7.
 *
 * Moi bai o day mo ta mot LAN TAN CONG cu the, khong phai mot nhanh code. Cai duoc bao ve la mot
 * su that nghiep vu: mot lai xe khong muon duoc vi tri cua dong nghiep, mot lan bam hai lan khong
 * thanh hai moc, va mot chiec dien thoai van dong ho khong viet lai duoc lich su.
 */

const TZ = 'Asia/Ho_Chi_Minh';

class FakeCoreFacts extends TransportCheckpointCoreFacts {
  readonly drivers = new Map<string, CheckpointDriverFacts>();
  readonly runs = new Map<string, CheckpointRunFacts>();
  readonly legs = new Map<string, CheckpointLegFacts>();
  /** `runId` -> danh sach `driverId` DA TUNG cam vong chay do. */
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

describe('CheckpointService', () => {
  let repository: InMemoryCheckpointRepository;
  let core: FakeCoreFacts;
  let location: FakeLocationFacts;
  let service: CheckpointService;
  let now: Date;

  beforeEach(() => {
    repository = new InMemoryCheckpointRepository();
    core = new FakeCoreFacts();
    location = new FakeLocationFacts();
    now = new Date('2026-09-07T08:15:00Z');

    core.drivers.set('u.binh', { id: 'drv_a', fullName: 'Nguyen Van Binh' });
    core.drivers.set('u.cuong', { id: 'drv_b', fullName: 'Tran Van Cuong' });
    core.runs.set('run_1', { id: 'run_1', code: 'VC-001', status: 'ACTIVE' });
    core.runs.set('run_2', { id: 'run_2', code: 'VC-002', status: 'ACTIVE' });
    core.legs.set('leg_1', { id: 'leg_1', runId: 'run_1' });
    core.legs.set('leg_9', { id: 'leg_9', runId: 'run_2' });
    core.assignments.set('run_1', ['drv_a']);
    core.assignments.set('run_2', ['drv_b']);

    service = new CheckpointService(
      repository,
      core,
      location,
      { timeZone: TZ },
      DEFAULT_CHECKPOINT_POLICY,
      undefined,
      () => now,
    );
  });

  const arriveAtPickup = (clientEventId = 'evt_1') =>
    service.recordAsDriver({
      type: 'PICKUP_ARRIVAL',
      runId: 'run_1',
      legId: 'leg_1',
      authUserId: 'u.binh',
      clientEventId,
    });

  describe('quyen tren vong chay', () => {
    it('lai xe khong cam vong chay thi khong ghi duoc moc', async () => {
      const reason = await reasonOf(
        service.recordAsDriver({
          type: 'PICKUP_ARRIVAL',
          runId: 'run_1',
          legId: 'leg_1',
          authUserId: 'u.cuong',
          clientEventId: 'evt_x',
        }),
      );
      expect(reason).toBe('CHECKPOINT_DRIVER_NOT_ASSIGNED');
    });

    it('tai khoan chua noi voi ho so lai xe thi bi chan truoc moi thu khac', async () => {
      const reason = await reasonOf(
        service.recordAsDriver({
          type: 'PICKUP_ARRIVAL',
          runId: 'run_1',
          legId: 'leg_1',
          authUserId: 'u.ke-toan',
          clientEventId: 'evt_x',
        }),
      );
      expect(reason).toBe('CHECKPOINT_DRIVER_BINDING_MISSING');
    });

    it('chang cua vong chay khac khong gan vao day duoc', async () => {
      const reason = await reasonOf(
        service.recordAsDriver({
          type: 'PICKUP_ARRIVAL',
          runId: 'run_1',
          legId: 'leg_9',
          authUserId: 'u.binh',
          clientEventId: 'evt_x',
        }),
      );
      expect(reason).toBe('CHECKPOINT_LEG_NOT_IN_RUN');
    });

    it('lai xe chi doc duoc moc cua chinh minh', async () => {
      await arriveAtPickup();
      expect(await service.listOwn('u.binh')).toHaveLength(1);
      expect(await service.listOwn('u.cuong')).toHaveLength(0);
    });
  });

  describe('gui lai khong sinh moc thu hai', () => {
    it('cung mot clientEventId tra ve dung moc cu', async () => {
      const first = await arriveAtPickup('evt_1');
      const second = await arriveAtPickup('evt_1');
      expect(second.id).toBe(first.id);
      expect(await repository.listForRun('run_1')).toHaveLength(1);
    });

    it('clientEventId khac thi bi chan vi moc da ghi, khong phai ghi them ban thu hai', async () => {
      await arriveAtPickup('evt_1');
      const reason = await reasonOf(arriveAtPickup('evt_2'));
      expect(reason).toBe('CHECKPOINT_ALREADY_RECORDED');
      expect(await repository.listForRun('run_1')).toHaveLength(1);
    });
  });

  describe('ban dinh vi', () => {
    beforeEach(() => {
      location.observations.set('obs_a', {
        id: 'obs_a',
        capturedAt: new Date('2026-09-07T14:00:00Z'),
        driverId: 'drv_a',
      });
      location.observations.set('obs_b', {
        id: 'obs_b',
        capturedAt: new Date('2026-09-07T14:00:00Z'),
        driverId: 'drv_b',
      });
    });

    const reachDelivery = async () => {
      await arriveAtPickup('evt_1');
      await service.recordAsDriver({
        type: 'PICKUP_DEPARTURE',
        runId: 'run_1',
        legId: 'leg_1',
        authUserId: 'u.binh',
        clientEventId: 'evt_2',
      });
    };

    it('den noi giao khong kem vi tri thi bi tu choi', async () => {
      await reachDelivery();
      const reason = await reasonOf(
        service.recordAsDriver({
          type: 'DELIVERY_ARRIVAL',
          runId: 'run_1',
          legId: 'leg_1',
          authUserId: 'u.binh',
          clientEventId: 'evt_3',
        }),
      );
      expect(reason).toBe('CHECKPOINT_LOCATION_REQUIRED');
    });

    /** BAI TRUNG TAM: khong muon duoc vi tri cua dong nghiep lam bang chung cho minh. */
    it('ban dinh vi cua lai xe khac thi bi tu choi', async () => {
      await reachDelivery();
      const reason = await reasonOf(
        service.recordAsDriver({
          type: 'DELIVERY_ARRIVAL',
          runId: 'run_1',
          legId: 'leg_1',
          authUserId: 'u.binh',
          observationId: 'obs_b',
          clientEventId: 'evt_3',
        }),
      );
      expect(reason).toBe('CHECKPOINT_OBSERVATION_NOT_OWNED');
    });

    it('mot ban dinh vi chi dung cho mot moc', async () => {
      await reachDelivery();
      await service.recordAsDriver({
        type: 'DELIVERY_ARRIVAL',
        runId: 'run_1',
        legId: 'leg_1',
        authUserId: 'u.binh',
        observationId: 'obs_a',
        clientEventId: 'evt_3',
      });
      const reason = await reasonOf(
        service.recordAsDriver({
          type: 'DELIVERY_ACCEPTED',
          runId: 'run_1',
          legId: 'leg_1',
          authUserId: 'u.binh',
          observationId: 'obs_a',
          clientEventId: 'evt_4',
        }),
      );
      expect(reason).toBe('CHECKPOINT_OBSERVATION_ALREADY_USED');
    });

    it('ban dinh vi khong ton tai thi bi tu choi', async () => {
      await reachDelivery();
      const reason = await reasonOf(
        service.recordAsDriver({
          type: 'DELIVERY_ARRIVAL',
          runId: 'run_1',
          legId: 'leg_1',
          authUserId: 'u.binh',
          observationId: 'obs_khong-co',
          clientEventId: 'evt_3',
        }),
      );
      expect(reason).toBe('CHECKPOINT_OBSERVATION_NOT_FOUND');
    });
  });

  describe('gio', () => {
    /**
     * `capturedAt` lay tu BAN DINH VI, khong tu than yeu cau; `receivedAt` lay tu dong ho may chu.
     * Mot may khach van nguoc dong ho khong dat duoc moc vao qua khu — bai `F7`.
     */
    it('gio ghi nhan la gio may chu, gio chup la gio cua ban dinh vi', async () => {
      location.observations.set('obs_a', {
        id: 'obs_a',
        capturedAt: new Date('2026-09-06T23:00:00Z'),
        driverId: 'drv_a',
      });
      await arriveAtPickup('evt_1');
      await service.recordAsDriver({
        type: 'PICKUP_DEPARTURE',
        runId: 'run_1',
        legId: 'leg_1',
        authUserId: 'u.binh',
        clientEventId: 'evt_2',
      });
      now = new Date('2026-09-07T14:05:00Z');
      const checkpoint = await service.recordAsDriver({
        type: 'DELIVERY_ARRIVAL',
        runId: 'run_1',
        legId: 'leg_1',
        authUserId: 'u.binh',
        observationId: 'obs_a',
        clientEventId: 'evt_3',
      });
      expect(checkpoint.receivedAt.toISOString()).toBe('2026-09-07T14:05:00.000Z');
      expect(checkpoint.capturedAt?.toISOString()).toBe('2026-09-06T23:00:00.000Z');
      expect(checkpoint.businessDate).toBe('2026-09-07');
    });
  });

  describe('duong dieu hanh', () => {
    it('dieu hanh ghi duoc moc giao viec ma khong can ho so lai xe', async () => {
      const checkpoint = await service.recordAsOperator({
        type: 'ASSIGNED',
        runId: 'run_1',
        authUserId: 'u.dieu-hanh',
        clientEventId: 'evt_1',
      });
      expect(checkpoint.driverId).toBeNull();
      expect(checkpoint.legId).toBeNull();
      expect(checkpoint.recordedBy).toBe('u.dieu-hanh');
    });

    /** Nguoi ngoi van phong khong o hien truong: ban dinh vi kem theo bi BO, khong duoc ghi. */
    it('dieu hanh khong dinh kem duoc ban dinh vi', async () => {
      location.observations.set('obs_a', {
        id: 'obs_a',
        capturedAt: now,
        driverId: 'drv_a',
      });
      await service.recordAsOperator({
        type: 'ASSIGNED',
        runId: 'run_1',
        authUserId: 'u.dieu-hanh',
        observationId: 'obs_a',
        clientEventId: 'evt_1',
      });
      const rows = await repository.listForRun('run_1');
      expect(rows[0]?.observationId).toBeNull();
    });
  });

  describe('vong chay da dong', () => {
    it('khong ghi them moc vao vong chay da hoan thanh', async () => {
      core.runs.set('run_1', { id: 'run_1', code: 'VC-001', status: 'COMPLETED' });
      const reason = await reasonOf(arriveAtPickup());
      expect(reason).toBe('CHECKPOINT_RUN_TERMINAL');
    });
  });

  describe('dong thoi gian', () => {
    it('dung tu chuoi moc da ghi, khong tu mot bang thu hai', async () => {
      await service.recordAsOperator({
        type: 'ASSIGNED',
        runId: 'run_1',
        authUserId: 'u.dieu-hanh',
        clientEventId: 'evt_0',
      });
      await arriveAtPickup('evt_1');
      const timeline = await service.timelineForRun('run_1');
      expect(timeline.entries.map((entry) => entry.type)).toEqual(['ASSIGNED', 'PICKUP_ARRIVAL']);
      expect(timeline.legPhases).toEqual({ leg_1: 'AT_PICKUP' });
    });
  });
});
