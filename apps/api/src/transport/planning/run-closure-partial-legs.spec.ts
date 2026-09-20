import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { InMemoryFleetRepository } from '../fleet/fleet.repository.js';
import { InMemoryMovementRepository } from '../movement/movement.repository.js';
import { MovementService } from '../movement/movement.service.js';
import { InMemoryRunPlanRepository } from './planning.repository.js';
import { PlanningService } from './planning.service.js';
import type { TransportPlanningPolicy } from './planning.types.js';
import { RunClosureService } from './run-closure.service.js';

/**
 * UAT BUG-02 (#332) — mot chang RONG xong KHONG duoc dong ca vong chay.
 *
 * Bien ban UAT 20-21/09/2026 tren transport-preview: RUN-S260919-6233EDD5 chuyen `COMPLETED` sau
 * khi chi chang 1 (RONG) hoan tat, trong khi chang 2 CO HANG chua chay. Bo bai o day dung lai
 * DUNG hinh dang do tren duong phan xu that, va do anh chup ngay TRUOC luc terminalize.
 */

const ACTOR = 'ke-toan';
const CORE_POLICY = { timeZone: 'Asia/Ho_Chi_Minh' } as const;
const DEPOT_LABEL = 'Bãi xe Hà Nội';

const policyWith = (over: Partial<TransportPlanningPolicy> = {}): TransportPlanningPolicy => ({
  grouping: over.grouping ?? 'ONE_ORDER_PER_RUN',
  depots: over.depots ?? [{ code: 'DEPOT-HN', label: DEPOT_LABEL }],
  closure: over.closure ?? { idleHours: null },
  sweep: over.sweep ?? { intervalSeconds: 60, batchSize: 50 },
});

describe('UAT BUG-02 — chang RONG xong khong duoc dong vong chay (#332)', () => {
  let fleet: InMemoryFleetRepository;
  let movementRepo: InMemoryMovementRepository;
  let plans: InMemoryRunPlanRepository;
  let movementAudit: InMemoryAuditLogRepository;
  let movement: MovementService;
  let planning: PlanningService;
  let closures: RunClosureService;
  let now: Date;
  let sequence = 0;

  const configure = (over: Partial<TransportPlanningPolicy> = {}) => {
    const policy = policyWith(over);
    planning = new PlanningService(
      movement,
      plans,
      fleet,
      new AuditLogService(new InMemoryAuditLogRepository()),
      CORE_POLICY,
      policy,
      undefined,
      () => now,
    );
    closures = new RunClosureService(planning, movement, policy, undefined, undefined, () => now);
  };

  beforeEach(() => {
    now = new Date();
    sequence = 0;
    fleet = new InMemoryFleetRepository();
    movementAudit = new InMemoryAuditLogRepository();
    movementRepo = new InMemoryMovementRepository(movementAudit);
    plans = new InMemoryRunPlanRepository();
    movement = new MovementService(
      movementRepo,
      fleet,
      new AuditLogService(movementAudit),
      CORE_POLICY,
    );
    configure();
  });

  const next = (prefix: string): string => `${prefix}-${(sequence += 1)}`;

  const uatRun = async () => {
    const vehicle = await fleet.createVehicle({
      registrationPlate: `29C-${10000 + (sequence += 1)}`,
      vehicleClass: 'Đầu kéo',
    });
    const order = await movement.createOrder(
      {
        code: next('ORD'),
        originLabel: 'Kho Hà Nội',
        destinationLabel: 'Hải Phòng',
        businessDate: '2026-09-19',
      },
      ACTOR,
    );
    return planning.commit(
      order.id,
      { vehicleId: vehicle.id, idempotencyKey: next('k') },
      ACTOR,
    );
  };

  const runLeg = async (legId: string) => {
    await movement.transitionLeg(legId, 'IN_TRANSIT', ACTOR);
    return movement.transitionLeg(legId, 'COMPLETED', ACTOR);
  };

  it('ke hoach sinh dung hai chang: RONG truoc, CO HANG sau', async () => {
    const { legs } = await uatRun();
    expect(legs.map((leg) => leg.kind)).toEqual(['EMPTY', 'LOADED']);
  });

  it('xong chang RONG thi vong chay VAN ACTIVE va bi chan boi LEG_STILL_OPEN', async () => {
    const { run, legs } = await uatRun();
    await runLeg(legs[0]!.id);

    const before = await movement.getRun(run.id);
    expect(before.run.status).toBe('ACTIVE');
    expect(before.legs.map((leg) => leg.status)).toEqual(['COMPLETED', 'PLANNED']);

    const outcome = await closures.attempt(run.id, 'LEG_CHANGED');
    expect(outcome.verdict.blockers).toContain('LEG_STILL_OPEN');
    expect(outcome.closed).toBe(false);
    expect((await movement.getRun(run.id)).run.status).toBe('ACTIVE');
  });

  it('chang CO HANG con lai van ghi duoc sau khi chang RONG xong', async () => {
    const { legs } = await uatRun();
    await runLeg(legs[0]!.id);
    const loaded = await movement.transitionLeg(legs[1]!.id, 'IN_TRANSIT', ACTOR);
    expect(loaded.status).toBe('IN_TRANSIT');
  });
});
