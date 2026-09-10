import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { PrismaService } from '../../config/prisma.service.js';
import { PrismaAuditLogRepository } from '../../audit/prisma-audit-log.repository.js';
import { PrismaFleetRepository } from '../fleet/prisma-fleet.repository.js';
import { MovementService } from '../movement/movement.service.js';
import { PrismaMovementRepository } from '../movement/prisma-movement.repository.js';
import { PlanningService } from './planning.service.js';
import type { TransportPlanningPolicy } from './planning.types.js';
import { PrismaRunPlanRepository } from './prisma-planning.repository.js';
import { RunClosureService } from './run-closure.service.js';

/**
 * DONG VONG CHAY tren POSTGRES THAT — `#293` Lane R.
 *
 * ============================================================================================
 * VI SAO BAN TRONG BO NHO KHONG DU
 * ============================================================================================
 *
 * Hai thu ma lane nay dua vao chi ton tai duoi Postgres:
 *
 *   · `UPDATE ... WHERE status = 'ACTIVE'` la thu DUY NHAT chan duoc hai worker dong cung mot vong
 *     chay. Ban trong bo nho don luong, nen no khong bao gio chay vao kich ban do — va do chinh la
 *     ly do mot bai kiem xanh o do khong noi duoc gi ve production;
 *   · `completedAt` nam lai trong bang, nen mot TIEN TRINH MOI doc lai duoc su that cu. "Khoi phuc
 *     sau khi chet" chi co nghia khi co mot cai gi do song sot qua cai chet.
 *
 * Chay bang `RUN_PRISMA_IT=1`; khong co bien do thi ca khoi khong chay.
 */

const CODE_PREFIX = 'IT-R293';
const PLATE_PREFIX = 'IT-R293-XE';
const ACTOR = 'it-lane-r';
const CORE_POLICY = { timeZone: 'Asia/Ho_Chi_Minh' } as const;
const DEPOT_LABEL = 'IT-R293 Bãi xe';
const HOUR_MS = 3_600_000;

const policyWith = (over: Partial<TransportPlanningPolicy> = {}): TransportPlanningPolicy => ({
  grouping: over.grouping ?? 'ONE_ORDER_PER_RUN',
  depots: over.depots ?? [{ code: 'IT-R293-DEPOT', label: DEPOT_LABEL }],
  closure: over.closure ?? { idleHours: null },
  sweep: over.sweep ?? { intervalSeconds: 60, batchSize: 50 },
});

describe.runIf(process.env.RUN_PRISMA_IT === '1')(
  'dong vong chay tren Postgres that (#293 Lane R)',
  () => {
    const prisma = new PrismaService();
    const movementRepo = new PrismaMovementRepository(prisma);
    const planRepo = new PrismaRunPlanRepository(prisma);
    const fleet = new PrismaFleetRepository(prisma);
    /*
     * So dau vet THAT, khong phai ban trong bo nho: bai kiem dong thoi dem "co may lan dong" tren
     * chinh bang ma van hanh doc. Mot ban trong bo nho se dem dung ca khi tang luu tru ghi sai.
     */
    const audit = new AuditLogService(new PrismaAuditLogRepository(prisma));
    const movement = new MovementService(movementRepo, fleet, audit, CORE_POLICY);

    const planner = (policy: TransportPlanningPolicy = policyWith()): PlanningService =>
      new PlanningService(movement, planRepo, fleet, audit, CORE_POLICY, policy);

    const closures = (policy: TransportPlanningPolicy = policyWith()): RunClosureService =>
      new RunClosureService(planner(policy), movement, policy);

    async function cleanup(): Promise<void> {
      const vehicles = await prisma.transportVehicle.findMany({
        where: { registrationPlate: { startsWith: PLATE_PREFIX } },
        select: { id: true },
      });
      const vehicleIds = vehicles.map((vehicle) => vehicle.id);

      const runs = await prisma.transportVehicleRun.findMany({
        where: { OR: [{ vehicleId: { in: vehicleIds } }, { code: { contains: CODE_PREFIX } }] },
        select: { id: true },
      });
      const runIds = runs.map((run) => run.id);

      await prisma.transportOrderRunPlan.deleteMany({ where: { runId: { in: runIds } } });
      await prisma.transportRunLeg.deleteMany({ where: { runId: { in: runIds } } });
      await prisma.transportRunAssignment.deleteMany({ where: { runId: { in: runIds } } });
      await prisma.transportVehicleRun.deleteMany({ where: { id: { in: runIds } } });
      await prisma.transportOrder.deleteMany({ where: { code: { contains: CODE_PREFIX } } });
      await prisma.transportVehicle.deleteMany({ where: { id: { in: vehicleIds } } });
      await prisma.auditLog.deleteMany({ where: { actor: { startsWith: ACTOR } } });
    }

    beforeAll(cleanup);
    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    let suffix = 0;
    const next = (label: string): string => `${CODE_PREFIX}-${label}-${++suffix}`;

    const aVehicle = () =>
      fleet.createVehicle({
        registrationPlate: `${PLATE_PREFIX}-${++suffix}`,
        vehicleClass: 'Dau keo',
      });

    const anOrder = (origin: string, destination: string) =>
      movement.createOrder(
        {
          code: next('ORD'),
          originLabel: origin,
          destinationLabel: destination,
          businessDate: '2026-09-11',
        },
        ACTOR,
      );

    const runLeg = async (legId: string) => {
      await movement.transitionLeg(legId, 'IN_TRANSIT', ACTOR);
      return movement.transitionLeg(legId, 'COMPLETED', ACTOR);
    };

    /** Mot vong chay da xong viec, chang cuoi ket thuc TAI BAI. */
    const completedAtDepot = async () => {
      const plannerNow = planner();
      const vehicle = await aVehicle();
      const order = await anOrder('IT-R293 Kho A', DEPOT_LABEL);
      const { run, legs } = await plannerNow.commit(
        order.id,
        { vehicleId: vehicle.id, idempotencyKey: next('KEY') },
        ACTOR,
      );
      for (const leg of legs) await runLeg(leg.id);
      return { run, order, vehicle };
    };

    const closeAuditCount = (runId: string) =>
      prisma.auditLog.count({
        where: { action: 'transport.run.close.system', entityId: runId },
      });

    it('R-IT-01 — hai worker DONG THOI: dung mot lan dong, mot dong dau vet', async () => {
      const service = closures();
      const { run } = await completedAtDepot();

      /*
       * HAI DOI TUONG DICH VU DOC LAP tren cung mot bang — dung hinh dang cua hai worker trong hai
       * tien trinh khac nhau. Ca hai deu doc thay `ACTIVE`, ca hai deu ket luan "dong duoc", va ca
       * hai deu goi `closeRunAsSystem`. Thu phan xu chung khong phai tang ung dung (no khong the
       * nhin thay ban kia) ma la cau `UPDATE ... WHERE status = 'ACTIVE'`.
       */
      const [first, second] = await Promise.all([
        service.attempt(run.id, 'LEG_CHANGED'),
        service.attempt(run.id, 'LEG_CHANGED'),
      ]);

      const closedCount = [first, second].filter((outcome) => outcome.closed).length;
      expect(closedCount).toBe(1);
      expect(first.run.status).toBe('COMPLETED');
      expect(second.run.status).toBe('COMPLETED');
      expect(await closeAuditCount(run.id)).toBe(1);

      const persisted = await movement.getRun(run.id);
      expect(persisted.run.status).toBe('COMPLETED');
      expect(persisted.run.completedAt).not.toBeNull();
    });

    it('R-IT-02 — nam worker cung luot quet: van dung mot lan dong', async () => {
      const service = closures();
      const { run } = await completedAtDepot();

      const outcomes = await Promise.all(
        Array.from({ length: 5 }, () => service.attempt(run.id, 'IDLE_SWEEP')),
      );

      expect(outcomes.filter((outcome) => outcome.closed)).toHaveLength(1);
      expect(await closeAuditCount(run.id)).toBe(1);
    });

    it('R-IT-03 — TIEN TRINH MOI (khoi phuc sau khi chet) van tim lai va dong duoc', async () => {
      const { run } = await completedAtDepot();

      /*
       * "Tien trinh chet" o day dung nghia nhat kiem duoc: moi doi tuong dich vu bi bo di va dung
       * lai tu dau — kho, dong ho, bo lap ke hoach, tat ca. Khong mot con tro, mot `Map`, hay mot
       * bien dem nao song qua ranh gioi nay; thu duy nhat con lai la nhung hang da ghi.
       */
      const restartedRepo = new PrismaMovementRepository(prisma);
      const restartedMovement = new MovementService(restartedRepo, fleet, audit, CORE_POLICY);
      const restartedPolicy = policyWith({ closure: { idleHours: 1 } });
      const restarted = new RunClosureService(
        new PlanningService(
          restartedMovement,
          new PrismaRunPlanRepository(prisma),
          fleet,
          audit,
          CORE_POLICY,
          restartedPolicy,
        ),
        restartedMovement,
        restartedPolicy,
        undefined,
        undefined,
        // Dong ho cua tien trinh MOI: no khong biet gi ve "su kien" nao da xay ra truoc do. Mot
        // gio sau, nguong nghi da troi qua, va cau tra loi phai giong het.
        () => new Date(Date.now() + 2 * HOUR_MS),
      );

      const result = await restarted.sweep();

      expect(result.closed).toBeGreaterThanOrEqual(1);
      expect((await movement.getRun(run.id)).run.status).toBe('COMPLETED');
      expect(await closeAuditCount(run.id)).toBe(1);
    });

    it('R-IT-04 — luot quet chay tren DB that: nguong nghi quyet dinh, va khong dong qua som', async () => {
      const vehicle = await aVehicle();
      const order = await anOrder('IT-R293 Kho B', 'IT-R293 Cang xa');
      const planNow = planner();
      const { run, legs } = await planNow.commit(
        order.id,
        { vehicleId: vehicle.id, idempotencyKey: next('KEY') },
        ACTOR,
      );
      for (const leg of legs) await runLeg(leg.id);

      // Chua qua nguong: ung vien theo cau truy van nhung phan xu tu choi dong.
      const tooEarly = new RunClosureService(
        planNow,
        movement,
        policyWith({ closure: { idleHours: 12 } }),
        undefined,
        undefined,
        () => new Date(Date.now() + HOUR_MS),
      );
      expect((await tooEarly.sweep()).closed).toBe(0);
      expect((await movement.getRun(run.id)).run.status).toBe('ACTIVE');

      // Qua nguong: dong.
      const late = new RunClosureService(
        planNow,
        movement,
        policyWith({ closure: { idleHours: 12 } }),
        undefined,
        undefined,
        () => new Date(Date.now() + 13 * HOUR_MS),
      );
      expect((await late.sweep()).closed).toBe(1);
      expect((await movement.getRun(run.id)).run.status).toBe('COMPLETED');
      expect(await closeAuditCount(run.id)).toBe(1);
    });

    it('R-IT-05 — dong vong chay KHONG dung toi nghia vu thuong mai cua don', async () => {
      const service = closures();
      const { run, order } = await completedAtDepot();
      const before = await prisma.transportOrder.findUniqueOrThrow({ where: { id: order.id } });

      await service.attempt(run.id, 'LEG_CHANGED');

      const after = await prisma.transportOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(after).toEqual(before);
      expect(after.status).toBe('OPEN');
    });
  },
);
