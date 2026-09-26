import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { InMemoryFleetRepository } from '../fleet/fleet.repository.js';
import { InMemoryMovementRepository } from '../movement/movement.repository.js';
import { MovementService } from '../movement/movement.service.js';
import { TransportDomainError } from '../transport.errors.js';
import {
  NoPlanningPendingWorkSource,
  PlanningPendingWorkSource,
  type PendingVehicleWork,
} from './planning-pending-work.port.js';
import { InMemoryRunPlanRepository } from './planning.repository.js';
import { PlanningService } from './planning.service.js';
import type { RunGrouping, TransportPlanningPolicy } from './planning.types.js';

/**
 * CONG "VIEC DANG DO CUA XE" cua lan lap ke hoach — `#398`.
 *
 * Hai dieu duoc khoa o day: (1) tu choi `PLAN_VEHICLE_HAS_PENDING_SITE_INTAKE` xay ra TRUOC moi
 * lan ghi — khong vong chay, khong chang, khong ke hoach, khong dong kiem toan; (2) vang cong
 * (khach chi bat `transport-core`) thi lap ke hoach chay y nhu truoc `#398`.
 */

const ACTOR = 'ke-toan';
const CORE_POLICY = { timeZone: 'Asia/Ho_Chi_Minh' } as const;

/** Cong gia: tra ve dung cau tra loi duoc dat, va dem so lan duoc hoi. */
class StubPendingWork extends PlanningPendingWorkSource {
  calls: string[] = [];
  constructor(public answer: PendingVehicleWork | null) {
    super();
  }

  async pendingIntakeForVehicle(vehicleId: string): Promise<PendingVehicleWork | null> {
    this.calls.push(vehicleId);
    return this.answer;
  }
}

const PENDING: PendingVehicleWork = { intakeId: 'intake-1', runCode: 'RUN-A260926-ABCDEF01' };

const reasonOf = async (run: () => Promise<unknown>): Promise<string> => {
  try {
    await run();
  } catch (error) {
    if (error instanceof TransportDomainError) return error.reason;
    throw error;
  }
  return 'KHONG-NEM';
};

describe.each(['ONE_ORDER_PER_RUN', 'MULTI_ORDER_RUN'] as const)(
  'PlanningService.commit + viec dang do cua xe (%s)',
  (grouping: RunGrouping) => {
    let fleet: InMemoryFleetRepository;
    let movementRepo: InMemoryMovementRepository;
    let plans: InMemoryRunPlanRepository;
    let auditRepo: InMemoryAuditLogRepository;
    let movement: MovementService;
    let planning: PlanningService;
    let vehicleId: string;

    const policy: TransportPlanningPolicy = {
      grouping,
      depots: [{ code: 'DEPOT-HN', label: 'Bai xe Ha Noi' }],
      closure: { idleHours: null },
      sweep: { intervalSeconds: 60, batchSize: 50 },
    };

    beforeEach(async () => {
      fleet = new InMemoryFleetRepository();
      movementRepo = new InMemoryMovementRepository();
      plans = new InMemoryRunPlanRepository();
      auditRepo = new InMemoryAuditLogRepository();
      const audit = new AuditLogService(auditRepo);
      movement = new MovementService(movementRepo, fleet, audit, CORE_POLICY);
      planning = new PlanningService(movement, plans, fleet, audit, CORE_POLICY, policy);

      const vehicle = await fleet.createVehicle({
        registrationPlate: '29C-11111',
        vehicleClass: 'Dau keo',
      });
      const driver = await fleet.createDriver({
        fullName: 'Lai xe 29C',
        phone: '0901111111',
        licenceClass: 'FC',
        licenceExpiry: '2030-01-01',
        authUserId: 'auth-29c',
      });
      await fleet.assignDriverToVehicle(vehicle.id, driver.id, new Date());
      vehicleId = vehicle.id;
    });

    const anOrder = (code: string) =>
      movement.createOrder(
        { code, originLabel: 'Kho A', destinationLabel: 'Cang B', businessDate: '2026-09-26' },
        ACTOR,
      );

    /** Moi dau vet ma mot lan lap ke hoach de lai: vong chay, chang, phan cong, ke hoach, kiem toan. */
    const writes = async () => {
      const runs = await movementRepo.listRuns();
      return {
        runs: runs.length,
        plans: (await plans.listActiveForRuns(runs.map((run) => run.id))).length,
        audit: (
          await Promise.all(
            [
              'transport.run.create',
              'transport.run.leg.add',
              'transport.run.assign',
              'transport.planning.commit',
            ].map((action) => auditRepo.list({ action })),
          )
        ).flat().length,
      };
    };

    it('xe dang giu viec tai xe nhan chua co don -> tu choi TRUOC moi lan ghi', async () => {
      const order = await anOrder('ORD-A');
      const source = new StubPendingWork(PENDING);
      const before = await writes();

      expect(
        await reasonOf(() =>
          planning.commit(
            order.id,
            { vehicleId, idempotencyKey: 'k-1', pendingWork: source },
            ACTOR,
          ),
        ),
      ).toBe('PLAN_VEHICLE_HAS_PENDING_SITE_INTAKE');

      expect(source.calls).toEqual([vehicleId]);
      expect(await writes()).toEqual(before);
      expect(await movementRepo.listRuns()).toEqual([]);
      expect(await plans.findActiveForOrder(order.id)).toBeNull();
      expect(await plans.findByIdempotencyKey('k-1')).toBeNull();
    });

    it('tu choi khong de lai dau: viec do xong thi CUNG khoa lap ke hoach binh thuong', async () => {
      const order = await anOrder('ORD-A');
      const source = new StubPendingWork(PENDING);
      await reasonOf(() =>
        planning.commit(order.id, { vehicleId, idempotencyKey: 'k-1', pendingWork: source }, ACTOR),
      );

      source.answer = null;
      const committed = await planning.commit(
        order.id,
        { vehicleId, idempotencyKey: 'k-1', pendingWork: source },
        ACTOR,
      );
      expect(committed.replayed).toBe(false);
      expect(committed.plan.outcome).toBe('NEW_RUN');
    });

    it('vang cong (chi bat transport-core) -> lap ke hoach y nhu truoc #398', async () => {
      const order = await anOrder('ORD-A');
      const committed = await planning.commit(
        order.id,
        { vehicleId, idempotencyKey: 'k-1' },
        ACTOR,
      );
      expect(committed.plan.outcome).toBe('NEW_RUN');
      expect(committed.legs.some((leg) => leg.kind === 'LOADED' && leg.orderId === order.id)).toBe(
        true,
      );
      expect(await movementRepo.listRuns()).toHaveLength(1);
    });

    it('cong rong mac dinh (NoPlanningPendingWorkSource) khong chan gi', async () => {
      const order = await anOrder('ORD-A');
      const committed = await planning.commit(
        order.id,
        { vehicleId, idempotencyKey: 'k-1', pendingWork: new NoPlanningPendingWorkSource() },
        ACTOR,
      );
      expect(committed.plan.outcome).toBe('NEW_RUN');
    });

    it('gui lai mot lan DA thanh cong van tra ket qua cu, du xe vua co viec dang do', async () => {
      const order = await anOrder('ORD-A');
      const first = await planning.commit(order.id, { vehicleId, idempotencyKey: 'k-1' }, ACTOR);
      const source = new StubPendingWork(PENDING);

      const replay = await planning.commit(
        order.id,
        { vehicleId, idempotencyKey: 'k-1', pendingWork: source },
        ACTOR,
      );
      expect(replay.replayed).toBe(true);
      expect(replay.plan.id).toBe(first.plan.id);
      expect(source.calls).toEqual([]);
    });

    it('don da co ke hoach -> PLAN_ORDER_ALREADY_PLANNED, cong khong can hoi', async () => {
      const order = await anOrder('ORD-A');
      await planning.commit(order.id, { vehicleId, idempotencyKey: 'k-1' }, ACTOR);
      const source = new StubPendingWork(PENDING);

      expect(
        await reasonOf(() =>
          planning.commit(
            order.id,
            { vehicleId, idempotencyKey: 'k-2', pendingWork: source },
            ACTOR,
          ),
        ),
      ).toBe('PLAN_ORDER_ALREADY_PLANNED');
      expect(source.calls).toEqual([]);
    });
  },
);
