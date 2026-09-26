import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { InMemoryFleetRepository } from '../fleet/fleet.repository.js';
import { InMemoryMovementRepository } from '../movement/movement.repository.js';
import { MovementService, type AddLegCommand } from '../movement/movement.service.js';
import type { RunLeg } from '../movement/movement.types.js';
import { TransportDomainError } from '../transport.errors.js';
import { InMemoryRunPlanRepository } from './planning.repository.js';
import { PlanningService } from './planning.service.js';
import type { RunGrouping, TransportPlanningPolicy } from './planning.types.js';

/**
 * BAN THUA CONG KE HOACH CUA DON khong de lai viec song — `#398`.
 *
 * Tren Postgres, `createRun`/`createLeg` gianh khoa tu van cua don va tu choi
 * `PLAN_ORDER_ALREADY_PLANNED` khi mot lenh gan don vao viec tai xe nhan truc tiep vua thang (bai
 * ep thu tu that o `transport-site-intake-commercial.int.spec.ts`). Kho trong bo nho khong co cong
 * do, nen o day lan them chang bi TU CHOI bang tay dung ma ay — de khoa hanh vi don dep cua
 * `commit()`: chang rong da ghi phai bi huy, vong chay MOI phai bi huy, vong chay DANG CHAY thi
 * giu nguyen.
 */

const ACTOR = 'ke-toan';
const CORE_POLICY = { timeZone: 'Asia/Ho_Chi_Minh' } as const;

class RefusingMovementService extends MovementService {
  refuse: ((command: AddLegCommand) => boolean) | null = null;

  override async addLeg(runId: string, command: AddLegCommand, actor: string): Promise<RunLeg> {
    if (this.refuse?.(command)) {
      this.refuse = null;
      throw TransportDomainError.conflict('PLAN_ORDER_ALREADY_PLANNED', 'Don vua co ke hoach');
    }
    return super.addLeg(runId, command, actor);
  }
}

const policyOf = (grouping: RunGrouping): TransportPlanningPolicy => ({
  grouping,
  depots: [{ code: 'DEPOT-HN', label: 'Bai xe Ha Noi' }],
  closure: { idleHours: null },
  sweep: { intervalSeconds: 60, batchSize: 50 },
});

const reasonOf = async (run: () => Promise<unknown>): Promise<string> => {
  try {
    await run();
  } catch (error) {
    if (error instanceof TransportDomainError) return error.reason;
    throw error;
  }
  return 'KHONG-NEM';
};

describe('PlanningService.commit — thua cong ke hoach cua don giua chung (#398)', () => {
  let fleet: InMemoryFleetRepository;
  let movementRepo: InMemoryMovementRepository;
  let plans: InMemoryRunPlanRepository;
  let movement: RefusingMovementService;
  let vehicleId: string;

  const planner = (grouping: RunGrouping) =>
    new PlanningService(
      movement,
      plans,
      fleet,
      new AuditLogService(new InMemoryAuditLogRepository()),
      CORE_POLICY,
      policyOf(grouping),
    );

  beforeEach(async () => {
    fleet = new InMemoryFleetRepository();
    movementRepo = new InMemoryMovementRepository();
    plans = new InMemoryRunPlanRepository();
    movement = new RefusingMovementService(
      movementRepo,
      fleet,
      new AuditLogService(new InMemoryAuditLogRepository()),
      CORE_POLICY,
    );
    const vehicle = await fleet.createVehicle({
      registrationPlate: '29C-1',
      vehicleClass: 'Dau keo',
    });
    const driver = await fleet.createDriver({
      fullName: 'Lai xe',
      phone: '0901234567',
      licenceClass: 'FC',
      licenceExpiry: '2030-01-01',
      authUserId: 'auth-1',
    });
    await fleet.assignDriverToVehicle(vehicle.id, driver.id, new Date());
    vehicleId = vehicle.id;
  });

  const anOrder = (code: string, origin: string, destination: string) =>
    movement.createOrder(
      { code, originLabel: origin, destinationLabel: destination, businessDate: '2026-09-26' },
      ACTOR,
    );

  it('vong chay MOI, bi tu choi o chang CO HANG -> chang rong + vong chay deu bi huy', async () => {
    const order = await anOrder('ORD-A', 'Kho A', 'Cang B');
    movement.refuse = (command) => command.kind === 'LOADED';

    expect(
      await reasonOf(() =>
        planner('ONE_ORDER_PER_RUN').commit(order.id, { vehicleId, idempotencyKey: 'k' }, ACTOR),
      ),
    ).toBe('PLAN_ORDER_ALREADY_PLANNED');

    const runs = await movementRepo.listRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe('CANCELLED');
    const legs = await movementRepo.listLegs(runs[0]?.id ?? '');
    expect(legs.map((leg) => [leg.kind, leg.status])).toEqual([['EMPTY', 'CANCELLED']]);
    expect(await plans.findActiveForOrder(order.id)).toBeNull();
  });

  it('vong chay MOI, bi tu choi truoc chang dau -> vong chay rong bi huy', async () => {
    const order = await anOrder('ORD-A', 'Kho A', 'Cang B');
    movement.refuse = () => true;

    expect(
      await reasonOf(() =>
        planner('ONE_ORDER_PER_RUN').commit(order.id, { vehicleId, idempotencyKey: 'k' }, ACTOR),
      ),
    ).toBe('PLAN_ORDER_ALREADY_PLANNED');

    const runs = await movementRepo.listRuns();
    expect(runs.map((run) => run.status)).toEqual(['CANCELLED']);
    expect(await movementRepo.listLegs(runs[0]?.id ?? '')).toEqual([]);
  });

  it('noi vao vong chay DANG CO (MULTI) -> chi go chang lan nay vua noi, vong chay va don cu nguyen', async () => {
    const multi = planner('MULTI_ORDER_RUN');
    const first = await anOrder('ORD-A', 'Kho A', 'Cang B');
    const committed = await multi.commit(first.id, { vehicleId, idempotencyKey: 'a' }, ACTOR);
    const second = await anOrder('ORD-C', 'Kho C', 'Cang D');
    movement.refuse = (command) => command.kind === 'LOADED';

    expect(
      await reasonOf(() => multi.commit(second.id, { vehicleId, idempotencyKey: 'c' }, ACTOR)),
    ).toBe('PLAN_ORDER_ALREADY_PLANNED');

    const run = await movementRepo.findRun(committed.run.id);
    expect(run?.status).not.toBe('CANCELLED');
    const legs = await movementRepo.listLegs(committed.run.id);
    const kept = legs.filter((leg) => committed.legs.some((own) => own.id === leg.id));
    expect(kept.every((leg) => leg.status === 'PLANNED')).toBe(true);
    const added = legs.filter((leg) => !committed.legs.some((own) => own.id === leg.id));
    expect(added.map((leg) => [leg.kind, leg.status])).toEqual([['EMPTY', 'CANCELLED']]);
    expect(await plans.findActiveForOrder(first.id)).not.toBeNull();
    expect(await plans.findActiveForOrder(second.id)).toBeNull();
  });
});
