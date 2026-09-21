import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { PrismaService } from '../../config/prisma.service.js';
import { TransportCheckpointCoreFactsAdapter } from '../checkpoint/checkpoint-facts.port.js';
import { PrismaCheckpointRepository } from '../checkpoint/prisma-checkpoint.repository.js';
import { PrismaOperationalDocumentRepository } from '../document/prisma-document.repository.js';
import { PrismaPhysicalReceiptHandoverRepository } from '../document/prisma-handover.repository.js';
import { TransportFieldCoreFactsAdapter } from '../field/field-facts.port.js';
import { DriverFieldReadService } from '../field/field-read.service.js';
import { PrismaFleetRepository } from '../fleet/prisma-fleet.repository.js';
import { MovementService } from '../movement/movement.service.js';
import { PrismaMovementRepository } from '../movement/prisma-movement.repository.js';
import { summariseRunMovement } from '../movement/run-distance.js';
import { describeStorageError } from '../storage-conflict.js';
import { TransportDomainError } from '../transport.errors.js';
import { PrismaTripRepository } from '../trips/prisma-trip.repository.js';
import { PrismaWaitingSessionRepository } from '../waiting/prisma-waiting.repository.js';
import { PlanningService } from './planning.service.js';
import type { TransportPlanningPolicy } from './planning.types.js';
import { PrismaRunPlanRepository } from './prisma-planning.repository.js';

/**
 * LAP KE HOACH VONG CHAY tren POSTGRES THAT — `#276` Lane L.
 *
 * Ban trong bo nho khong chung minh duoc cai ma lane nay thuc su dua vao: unique MOT PHAN, trigger
 * bat bien, va hanh vi khi HAI giao dich den cung luc. `#276` L9 viet ro *"Use real Postgres for
 * concurrency/constraints where current persistence is Prisma-backed."*
 *
 * Nhung bai chi Postgres moi tra loi duoc:
 *
 *     bai 1   hai lan gui CUNG khoa, DONG THOI -> mot vong chay, mot chang co hang
 *     bai 2   hai lan gan cung mot don len hai xe, DONG THOI -> dung mot ban thang
 *     bai 4   chang da hoan thanh khong sua duoc, ke ca bang `UPDATE` viet tay
 *     bai 6   che do ONE bi cuong che O DB, khong chi o tang dich vu
 *     bai 17  phep chieu chuyen v1 van chay y nguyen
 *     BUG-01  lai xe THAY vong chay qua chinh phien dang nhap; thieu tai khoan hoac da ngung hoat
 *             dong thi tu choi truoc moi lan ghi
 *
 * Chay bang `RUN_PRISMA_IT=1`; khong co bien do thi ca khoi khong chay.
 */

const CODE_PREFIX = 'IT-PLAN';
const PLATE_PREFIX = 'IT-PLAN-XE';
const ACTOR = 'it-planning';
const CORE_POLICY = { timeZone: 'Asia/Ho_Chi_Minh' } as const;
const DEPOT_LABEL = 'IT-PLAN Bãi xe';

const planningPolicy = (over: Partial<TransportPlanningPolicy> = {}): TransportPlanningPolicy => ({
  grouping: 'ONE_ORDER_PER_RUN',
  depots: [{ code: 'IT-PLAN-DEPOT', label: DEPOT_LABEL }],
  closure: { idleHours: null },
  sweep: { intervalSeconds: 60, batchSize: 50 },
  ...over,
});

describe.runIf(process.env.RUN_PRISMA_IT === '1')(
  'lap ke hoach vong chay tren Postgres that (#276 Lane L)',
  () => {
    const prisma = new PrismaService();
    const movementRepo = new PrismaMovementRepository(prisma);
    const planRepo = new PrismaRunPlanRepository(prisma);
    const fleet = new PrismaFleetRepository(prisma);
    const trips = new PrismaTripRepository(prisma);
    const audit = new AuditLogService(new InMemoryAuditLogRepository());
    const movement = new MovementService(movementRepo, fleet, audit, CORE_POLICY, trips);

    const planner = (policy = planningPolicy()): PlanningService =>
      new PlanningService(movement, planRepo, fleet, audit, CORE_POLICY, policy);

    /**
     * MAN HIEN TRUONG THAT cua lai xe — dich vu va hai adapter y nhu `TransportFieldModule` dung,
     * tren CUNG Postgres ma `commit()` vua ghi. Chi thieu lop HTTP, va lop do chi doc `authUserId`
     * tu phien roi chuyen nguyen vao `workFor()`.
     */
    const field = new DriverFieldReadService(
      new TransportFieldCoreFactsAdapter(movementRepo),
      new TransportCheckpointCoreFactsAdapter(movementRepo, fleet),
      new PrismaCheckpointRepository(prisma),
      new PrismaWaitingSessionRepository(prisma),
      new PrismaOperationalDocumentRepository(prisma),
      new PrismaPhysicalReceiptHandoverRepository(prisma),
    );

    /**
     * Don dep theo THU TU AN TOAN VE KHOA NGOAI: ke hoach -> lien ket chuyen -> chang -> phan cong
     * -> vong chay -> don -> chuyen -> xe.
     *
     * `contains` chu KHONG `startsWith` cho ma vong chay: ma do he thong sinh (`RUN-S…`) khong
     * mang tien to cua bo test o dau chuoi. Cung cai bay ma `transport-movement.int.spec.ts` da
     * ghi lai.
     */
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
      const legs = await prisma.transportRunLeg.findMany({
        where: { runId: { in: runIds } },
        select: { id: true },
      });

      await prisma.transportOrderRunPlan.deleteMany({ where: { runId: { in: runIds } } });
      await prisma.transportTripRunLegLink.deleteMany({
        where: { legId: { in: legs.map((leg) => leg.id) } },
      });
      await prisma.transportRunLeg.deleteMany({ where: { runId: { in: runIds } } });
      await prisma.transportRunAssignment.deleteMany({ where: { runId: { in: runIds } } });
      await prisma.transportVehicleRun.deleteMany({ where: { id: { in: runIds } } });
      /*
       * `#275` Lane K: `projectTrip` cung ghi mot lien ket THUONG MAI, va khoa ngoai cua no la
       * `Restrict` — cung quy uoc voi `TransportTripRunLegLink` ngay tren.
       */
      await prisma.transportTripOrderLink.deleteMany({
        where: { order: { code: { contains: CODE_PREFIX } } },
      });
      await prisma.transportOrder.deleteMany({ where: { code: { contains: CODE_PREFIX } } });

      const tripRows = await prisma.transportTrip.findMany({
        where: { code: { contains: CODE_PREFIX } },
        select: { id: true },
      });
      const tripIds = tripRows.map((trip) => trip.id);
      await prisma.transportTripAssignment.deleteMany({ where: { tripId: { in: tripIds } } });
      await prisma.transportTrip.deleteMany({ where: { id: { in: tripIds } } });
      // TRUOC khi xoa xe: khoa ngoai cua ban phan cong lai xe tro vao ca xe lan lai xe, nen bo
      // sot dong nay se lam lan don sau do that bai voi mot loi trong khong lien quan gi toi no.
      await prisma.transportVehicleAssignment.deleteMany({
        where: { vehicleId: { in: vehicleIds } },
      });
      await prisma.transportVehicle.deleteMany({ where: { id: { in: vehicleIds } } });
      await prisma.transportDriver.deleteMany({ where: { phone: { startsWith: '0955PL' } } });
    }

    beforeAll(cleanup);
    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    let suffix = 0;
    const nextCode = (label: string): string => `${CODE_PREFIX}-${label}-${++suffix}`;

    /**
     * MOT CHIEC XE va NGUOI CAM NO — mac dinh la nguoi mo duoc man Hien truong.
     *
     * `commit()` doi mot lai xe dang phu trach, con hoat dong va CO tai khoan truoc khi mo vong
     * chay. So dien thoai giu tien to `0955PL` de `cleanup()` o tren don duoc; ban phan cong cung
     * phai duoc don, neu khong khoa ngoai se chan lan xoa xe. `authUserId` la unique tren bang lai
     * xe, nen mac dinh sinh rieng cho tung ho so; `holder` ghi de de dung duong tu choi.
     */
    const aVehicleHeldBy = async (
      holder: { authUserId?: string | null; status?: 'ACTIVE' | 'INACTIVE' } = {},
    ) => {
      const vehicle = await fleet.createVehicle({
        registrationPlate: `${PLATE_PREFIX}-${++suffix}`,
        vehicleClass: 'Dau keo',
      });
      const driver = await fleet.createDriver({
        fullName: `${CODE_PREFIX} Lai xe ${suffix}`,
        phone: `0955PL${suffix}`,
        licenceClass: 'FC',
        licenceExpiry: '2030-01-01',
        authUserId:
          holder.authUserId === undefined ? `${CODE_PREFIX}-auth-${suffix}` : holder.authUserId,
        status: holder.status ?? 'ACTIVE',
      });
      await fleet.assignDriverToVehicle(vehicle.id, driver.id, new Date());
      return { vehicle, driver };
    };

    const aVehicle = async () => (await aVehicleHeldBy()).vehicle;

    const anOrder = (origin: string, destination: string) =>
      movement.createOrder(
        {
          code: nextCode('ORD'),
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

    it('PL-IT-01 -- mot vong doi tron ven: lap ke hoach, chay, ve bai, he thong dong', async () => {
      const service = planner();
      const vehicle = await aVehicle();
      const order = await anOrder('IT-PLAN Kho A', 'IT-PLAN Cang B');

      const { run, legs, plan } = await service.commit(
        order.id,
        { vehicleId: vehicle.id, idempotencyKey: nextCode('KEY') },
        ACTOR,
      );
      expect(plan.grouping).toBe('ONE_ORDER_PER_RUN');
      expect(plan.outcome).toBe('NEW_RUN');
      expect(legs.map((leg) => leg.kind)).toEqual(['EMPTY', 'LOADED']);

      for (const leg of legs) await runLeg(leg.id);

      const home = await movement.addLeg(
        run.id,
        {
          sequence: 3,
          kind: 'EMPTY',
          originLabel: 'IT-PLAN Cang B',
          destinationLabel: DEPOT_LABEL,
        },
        ACTOR,
      );
      await runLeg(home.id);

      const outcome = await service.settleRunClosure(run.id);
      expect(outcome.closed).toBe(true);
      expect(outcome.verdict.trigger).toBe('DEPOT_RETURN');

      // `RUN CLOSED != ORDER COMPLETED` — chung minh tren DB that, khong chi tren ban trong bo nho.
      expect((await movement.getOrder(order.id)).status).toBe('OPEN');
    });

    it('PL-IT-02 -- bai 1: hai lan gui CUNG khoa DONG THOI chi tao MOT vong chay', async () => {
      const service = planner();
      const vehicle = await aVehicle();
      const order = await anOrder('IT-PLAN Kho A', 'IT-PLAN Cang B');
      const key = nextCode('KEY');

      const settled = await Promise.allSettled([
        service.commit(order.id, { vehicleId: vehicle.id, idempotencyKey: key }, ACTOR),
        service.commit(order.id, { vehicleId: vehicle.id, idempotencyKey: key }, ACTOR),
      ]);

      // It nhat mot ban thanh cong. Ban con lai hoac phat lai, hoac bao dang xu ly — KHONG bao gio
      // tao mot vong chay thu hai.
      expect(settled.filter((entry) => entry.status === 'fulfilled').length).toBeGreaterThanOrEqual(
        1,
      );

      expect(await planRepo.listForOrder(order.id)).toHaveLength(1);
      expect(
        await prisma.transportVehicleRun.findMany({ where: { vehicleId: vehicle.id } }),
      ).toHaveLength(1);
      expect(
        await prisma.transportRunLeg.findMany({ where: { orderId: order.id, kind: 'LOADED' } }),
      ).toHaveLength(1);
    });

    it('PL-IT-03 -- bai 2: gan cung mot don len HAI xe DONG THOI, dung mot ban thang', async () => {
      const service = planner();
      const first = await aVehicle();
      const second = await aVehicle();
      const order = await anOrder('IT-PLAN Kho A', 'IT-PLAN Cang B');

      const settled = await Promise.allSettled([
        service.commit(order.id, { vehicleId: first.id, idempotencyKey: nextCode('K1') }, ACTOR),
        service.commit(order.id, { vehicleId: second.id, idempotencyKey: nextCode('K2') }, ACTOR),
      ]);

      expect(settled.filter((entry) => entry.status === 'fulfilled')).toHaveLength(1);

      for (const loser of settled.filter(
        (entry): entry is PromiseRejectedResult => entry.status === 'rejected',
      )) {
        // Loi phai duoc DICH sang mien, khong phai mot `P2002` tho di len thanh `500`.
        expect(loser.reason, describeStorageError(loser.reason)).toBeInstanceOf(
          TransportDomainError,
        );
        expect((loser.reason as TransportDomainError).reason).toBe('PLAN_ORDER_ALREADY_PLANNED');
      }

      expect(await planRepo.listForOrder(order.id)).toHaveLength(1);
    });

    it('PL-IT-04 -- bai 6: unique MOT PHAN cam ke hoach thu hai tren mot vong chay o che do ONE', async () => {
      const service = planner();
      const vehicle = await aVehicle();
      const a = await anOrder('IT-PLAN Kho A', 'IT-PLAN Cang B');
      const b = await anOrder('IT-PLAN Cang B', 'IT-PLAN Kho C');

      const first = await service.commit(
        a.id,
        { vehicleId: vehicle.id, idempotencyKey: nextCode('K1') },
        ACTOR,
      );
      const leg = await movement.addLeg(
        first.run.id,
        {
          sequence: 50,
          kind: 'LOADED',
          orderId: b.id,
          originLabel: 'IT-PLAN Cang B',
          destinationLabel: 'IT-PLAN Kho C',
        },
        ACTOR,
      );

      // Ghi THANG vao kho, bo qua moi cong cua tang dich vu. Chi index moi chan duoc.
      await expect(
        planRepo.create({
          orderId: b.id,
          runId: first.run.id,
          vehicleId: vehicle.id,
          loadedLegId: leg.id,
          emptyLegId: null,
          grouping: 'ONE_ORDER_PER_RUN',
          outcome: 'APPENDED',
          idempotencyKey: nextCode('K2'),
          plannedBy: ACTOR,
          businessDate: '2026-09-11',
        }),
      ).rejects.toThrow();
    });

    it('PL-IT-05 -- bai 4: trigger tu choi mot `UPDATE` viet tay tren chang da hoan thanh', async () => {
      const service = planner();
      const vehicle = await aVehicle();
      const order = await anOrder('IT-PLAN Kho A', 'IT-PLAN Cang B');
      const { legs } = await service.commit(
        order.id,
        { vehicleId: vehicle.id, idempotencyKey: nextCode('KEY') },
        ACTOR,
      );
      const loaded = legs.find((leg) => leg.kind === 'LOADED')!;
      await runLeg(loaded.id);

      for (const [column, value] of [
        ['kind', `'EMPTY'`],
        ['status', `'PLANNED'`],
        ['orderId', 'NULL'],
        ['destinationLabel', `'noi khac'`],
      ] as const) {
        await expect(
          prisma.$executeRawUnsafe(
            `UPDATE "TransportRunLeg" SET "${column}" = ${value} WHERE "id" = $1`,
            loaded.id,
          ),
        ).rejects.toThrow(/transport_run_leg_completed_is_immutable/);
      }

      // Nhung km NHAP TAY thi VAN sua duoc — no ve sau khi chang da dong (`GD-14`).
      await prisma.$executeRawUnsafe(
        `UPDATE "TransportRunLeg" SET "distanceKm" = 118 WHERE "id" = $1`,
        loaded.id,
      );
      expect((await movement.getLeg(loaded.id)).distanceKm).toBe(118);
    });

    it('PL-IT-06 -- che do MULTI tren DB that: mot vong chay, DUNG MOT chang rong xen giua', async () => {
      const service = planner(planningPolicy({ grouping: 'MULTI_ORDER_RUN' }));
      const vehicle = await aVehicle();
      const a = await anOrder('IT-PLAN Kho A', 'IT-PLAN Cang B');
      const b = await anOrder('IT-PLAN Kho D', 'IT-PLAN Kho E');

      const first = await service.commit(
        a.id,
        { vehicleId: vehicle.id, idempotencyKey: nextCode('K1') },
        ACTOR,
      );
      const second = await service.commit(
        b.id,
        { vehicleId: vehicle.id, idempotencyKey: nextCode('K2') },
        ACTOR,
      );
      expect(second.run.id).toBe(first.run.id);

      const legs = await movement.legsOfRun(first.run.id);
      expect(legs.map((leg) => leg.kind)).toEqual(['EMPTY', 'LOADED', 'EMPTY', 'LOADED']);
      expect(
        legs.filter((leg) => leg.kind === 'EMPTY' && leg.originLabel === 'IT-PLAN Cang B'),
      ).toHaveLength(1);
      // `CHECK` cua DB da chan tu truoc, nhung khang dinh o day de bai noi ra dieu no dang giu.
      for (const leg of legs) if (leg.kind === 'EMPTY') expect(leg.orderId).toBeNull();
    });

    it('PL-IT-07 -- km DA DI va km DU DINH khong tron vao nhau tren DB that', async () => {
      const service = planner();
      const vehicle = await aVehicle();
      const order = await anOrder('IT-PLAN Kho A', 'IT-PLAN Cang B');
      const { legs } = await service.commit(
        order.id,
        {
          vehicleId: vehicle.id,
          idempotencyKey: nextCode('KEY'),
          distanceHint: { emptyKm: 8, loadedKm: 105 },
        },
        ACTOR,
      );

      const loaded = legs.find((leg) => leg.kind === 'LOADED')!;
      await runLeg(loaded.id);
      await prisma.$executeRawUnsafe(
        `UPDATE "TransportRunLeg" SET "distanceKm" = 111 WHERE "id" = $1`,
        loaded.id,
      );

      const summary = summariseRunMovement(await movement.legsOfRun(loaded.runId));
      // DA DI doc cot da ghi nhan (111), KHONG doc con so du kien (105).
      expect(summary.actual.loadedKm).toBe(111);
      expect(summary.actual.emptyKm).toBe(0);
      // DU DINH van la chang rong chua chay.
      expect(summary.planned.emptyKm).toBe(8);
    });

    it('PL-IT-08 -- `CHECK` tu choi km du kien am, nhung `NULL` van hop le', async () => {
      const service = planner();
      const vehicle = await aVehicle();
      const order = await anOrder('IT-PLAN Kho A', 'IT-PLAN Cang B');
      const { legs } = await service.commit(
        order.id,
        { vehicleId: vehicle.id, idempotencyKey: nextCode('KEY') },
        ACTOR,
      );
      const leg = legs[0]!;
      expect(leg.plannedDistanceKm).toBeNull();

      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE "TransportRunLeg" SET "plannedDistanceKm" = -1 WHERE "id" = $1`,
          leg.id,
        ),
      ).rejects.toThrow(/TransportRunLeg_planned_distance_non_negative/);
    });

    it('PL-IT-09 -- huy ke hoach giai phong don cho mot lan lap moi', async () => {
      const service = planner();
      const first = await aVehicle();
      const second = await aVehicle();
      const order = await anOrder('IT-PLAN Kho A', 'IT-PLAN Cang B');

      const before = await service.commit(
        order.id,
        { vehicleId: first.id, idempotencyKey: nextCode('K1') },
        ACTOR,
      );
      await service.cancelPlan(before.plan.id, 'dieu xe khac', ACTOR);

      const after = await service.commit(
        order.id,
        { vehicleId: second.id, idempotencyKey: nextCode('K2') },
        ACTOR,
      );
      expect(after.run.id).not.toBe(before.run.id);
      // Lich su khong bi xoa: hai ban ghi, mot da huy.
      const plans = await planRepo.listForOrder(order.id);
      expect(plans).toHaveLength(2);
      expect(plans.filter((plan) => plan.cancelledAt !== null)).toHaveLength(1);
    });

    it('PL-IT-10 -- bai 17: phep chieu chuyen v1 van chay y nguyen ben canh lop lap ke hoach', async () => {
      const vehicle = await aVehicle();
      const driver = await fleet.createDriver({
        fullName: 'IT-PLAN Lai xe',
        phone: `0955PL${++suffix}`,
        licenceClass: 'FC',
        licenceExpiry: '2030-01-01',
      });
      const trip = await trips.create({
        code: nextCode('TRIP'),
        kind: 'OWN_DIRECT',
        businessDate: '2026-09-11',
        originLabel: 'IT-PLAN Kho A',
        destinationLabel: 'IT-PLAN Cang B',
        freightAmount: 5_000_000,
      });
      await trips.assign(trip.id, {
        vehicleId: vehicle.id,
        driverId: driver.id,
        assignedBy: ACTOR,
        at: new Date(),
      });

      const projection = await movement.projectTrip(trip.id, ACTOR);
      expect(projection.run.vehicleId).toBe(vehicle.id);
      expect(projection.leg.kind).toBe('LOADED');
      // Chay lai KHONG sinh ban thu hai — tinh chat cu, van dung sau khi Lane L vao.
      expect((await movement.projectTrip(trip.id, ACTOR)).run.id).toBe(projection.run.id);

      // Vong chay duoc chieu ra KHONG mang mot ke hoach nao: hai duong doc lap.
      expect(await planRepo.listActiveForRun(projection.run.id)).toHaveLength(0);
    });

    /* ---------------------------------------------------------------- *
     * BUG-01 — giao xe thi giao ca nguoi, do QUA CUA DANG NHAP
     *
     * Man Hien truong di `phien.authUserId -> findDriverByAuthUserId -> driver.id ->
     * listOpenRunsForDriver`. Bai o day di dung chuoi do tren Postgres that: `authUserId` la
     * `@unique` that, va `listOpenRunsForDriver` la truy van Prisma that loc theo phan cong.
     * ---------------------------------------------------------------- */

    it('PL-IT-11 -- BUG-01: tai khoan cua nguoi cam xe THAY vong chay vua giao; tai khoan lai xe khac KHONG', async () => {
      const { vehicle, driver } = await aVehicleHeldBy();
      const { driver: other } = await aVehicleHeldBy();
      const login = driver.authUserId;
      const otherLogin = other.authUserId;
      if (login === null || otherLogin === null) throw new Error('fixture phai co tai khoan');
      const order = await anOrder('IT-PLAN Kho A', 'IT-PLAN Cang B');

      const { run } = await planner().commit(
        order.id,
        { vehicleId: vehicle.id, idempotencyKey: nextCode('KEY') },
        ACTOR,
      );

      const mine = await field.workFor(login);
      expect(mine.runs.map((entry) => entry.runId)).toEqual([run.id]);
      const loaded = mine.runs[0]?.legs.find((leg) => leg.kind === 'LOADED');
      expect(loaded?.orderCode).toBe(order.code);

      const theirs = await field.workFor(otherLogin);
      expect(theirs.runs.map((entry) => entry.runId)).not.toContain(run.id);

      // Hang Postgres nam duoi man hinh do: DUNG MOT phan cong hieu luc, cua dung nguoi cam xe.
      const active = await prisma.transportRunAssignment.findMany({
        where: { runId: run.id, effectiveTo: null },
        select: { driverId: true },
      });
      expect(active).toEqual([{ driverId: driver.id }]);
    });

    it.each([
      {
        label: 'lai xe cam xe CHUA co tai khoan (authUserId = NULL)',
        holder: { authUserId: null },
        reason: 'PLAN_VEHICLE_DRIVER_BINDING_MISSING',
      },
      {
        label: 'lai xe cam xe da NGUNG hoat dong (INACTIVE)',
        holder: { status: 'INACTIVE' as const },
        reason: 'PLAN_VEHICLE_DRIVER_INACTIVE',
      },
    ])('PL-IT-12 -- BUG-01: $label -> $reason, TRUOC moi lan ghi', async ({ holder, reason }) => {
      const { vehicle, driver } = await aVehicleHeldBy(holder);
      const order = await anOrder('IT-PLAN Kho A', 'IT-PLAN Cang B');
      const idempotencyKey = nextCode('KEY');

      const outcome = await planner()
        .commit(order.id, { vehicleId: vehicle.id, idempotencyKey }, ACTOR)
        .then(
          () => null,
          (error: unknown) => error,
        );
      expect(outcome, describeStorageError(outcome)).toBeInstanceOf(TransportDomainError);
      expect((outcome as TransportDomainError).reason).toBe(reason);

      // Do tren CHINH Postgres, khoanh theo xe / don / lai xe / khoa cua bai nay — khong tren so
      // toan cuc, vi job `integration` dung chung mot DB cho moi bo int spec.
      expect(await prisma.transportVehicleRun.count({ where: { vehicleId: vehicle.id } })).toBe(0);
      expect(await prisma.transportRunLeg.count({ where: { orderId: order.id } })).toBe(0);
      expect(await prisma.transportRunAssignment.count({ where: { driverId: driver.id } })).toBe(0);
      expect(await prisma.transportOrderRunPlan.count({ where: { orderId: order.id } })).toBe(0);
      expect(await prisma.transportOrderRunPlan.count({ where: { idempotencyKey } })).toBe(0);
    });
  },
);
