import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { PrismaService } from '../../config/prisma.service.js';
import { withProtectedTriggersDisabled } from '../../it-trigger-cleanup.js';
import { PrismaCounterpartyRepository } from '../counterparty/prisma-counterparty.repository.js';
import { PrismaCounterpartySiteRepository } from '../counterparty/prisma-counterparty-site.repository.js';
import { CounterpartySiteService } from '../counterparty/site.service.js';
import { PrismaFleetRepository } from '../fleet/prisma-fleet.repository.js';
import {
  MovementService,
  type AddLegCommand,
  type CreateRunCommand,
} from '../movement/movement.service.js';
import type { RunLeg, VehicleRun } from '../movement/movement.types.js';
import { PrismaMovementRepository } from '../movement/prisma-movement.repository.js';
import { PlanningService } from '../planning/planning.service.js';
import type { RunGrouping, TransportPlanningPolicy } from '../planning/planning.types.js';
import { PrismaRunPlanRepository } from '../planning/prisma-planning.repository.js';
import { PrismaGeofenceRepository } from '../proof/geofence.repository.js';
import { TransportDomainError } from '../transport.errors.js';
import { siteIntakeOrderCode, siteIntakePlanKey } from './commercial-readiness.js';
import { PrismaSiteIntakeCommercialStore } from './prisma-site-intake-commercial.store.js';
import { PrismaSiteIntakeConfirmationWriter } from './prisma-site-intake-confirmation.writer.js';
import { PrismaRunSiteIntakeRepository } from './prisma-site-intake.repository.js';
import { SiteIntakePlanningPendingWorkSource } from './site-intake-composition.adapters.js';
import {
  TransportSiteIntakeCoreFactsAdapter,
  TransportSiteIntakeGeoFactsAdapter,
  TransportSiteIntakeLocationFacts,
  type SiteIntakeObservationFacts,
} from './site-intake-facts.port.js';
import { SiteIntakeCommercialService } from './site-intake-commercial.service.js';
import { SiteIntakeReadinessReader } from './site-intake-readiness.reader.js';
import { SiteIntakeReviewService } from './site-intake-review.service.js';
import { SiteIntakeService } from './site-intake.service.js';
import type { SiteIntakeResult } from './site-intake.types.js';

/**
 * VIEC TAI XE NHAN TRUC TIEP -> DON TU DONG tren POSTGRES THAT — `#398` §11/§12.
 *
 * Ban trong bo nho xep hang moi lenh qua mot hang doi, nen no khong chung minh duoc cai ma lane nay
 * dua vao: khoa tu van cua lan nhan viec va cua don, khoa hang vong chay, hai trigger, muoi CHECK,
 * va hanh vi khi HAI giao dich den cung luc. Moi bai o day chay dich vu THAT (kho Prisma, bo lap ke
 * hoach that) va dem bang so da PHAM VI HOA theo xe/lai xe cua chinh tep nay — khong so toan cuc.
 *
 * Chay bang `RUN_PRISMA_IT=1`; khong co bien do thi ca khoi khong chay.
 */

const PREFIX = 'IT-DDO';
const PLATE_PREFIX = `${PREFIX}-XE`;
const PHONE_PREFIX = '0966DD';
const PARTY_PREFIX = `${PREFIX} Phap nhan`;
const FENCE_PREFIX = `${PREFIX} Hang rao`;
const ACTOR_PREFIX = 'it-ddo';
const OFFICE = `${ACTOR_PREFIX}-van-phong`;
const BOSS = `${ACTOR_PREFIX}-giam-doc`;
const CORE_POLICY = { timeZone: 'Asia/Ho_Chi_Minh' } as const;

/** TOA DO RIENG cua tep nay — khong dung chung voi demo hay spec khac (xem `transport-site-intake.int.spec.ts`). */
const ORIGIN = { latitude: 21.35, longitude: 106.35 };
const DESTINATION = { latitude: 21.37, longitude: 106.4 };

const planningPolicy = (grouping: RunGrouping): TransportPlanningPolicy => ({
  grouping,
  depots: [{ code: `${PREFIX}-DEPOT`, label: `${PREFIX} Bai xe` }],
  closure: { idleHours: null },
  sweep: { intervalSeconds: 60, batchSize: 50 },
});

class NoLocationFacts extends TransportSiteIntakeLocationFacts {
  async findObservation(): Promise<SiteIntakeObservationFacts | null> {
    return null;
  }
}

/**
 * CONG ep thu tu: chan lan them chang ma dieu kien khop, chay `action` TOI CUNG, roi moi cho lan
 * them chang di tiep. Dung de dat lenh gan don VAO GIUA hai buoc cua bo lap ke hoach — mot khe ma
 * mot lan dua ngau nhien chi thinh thoang trung.
 */
class GatedMovementService extends MovementService {
  private gate: {
    readonly when: (command: AddLegCommand) => boolean;
    readonly action: () => Promise<unknown>;
  } | null = null;

  arm(when: (command: AddLegCommand) => boolean, action: () => Promise<unknown>): void {
    this.gate = { when, action };
  }

  override async addLeg(runId: string, command: AddLegCommand, actor: string): Promise<RunLeg> {
    const gate = this.gate;
    if (gate !== null && gate.when(command)) {
      this.gate = null;
      await gate.action();
    }
    return super.addLeg(runId, command, actor);
  }
}

/**
 * CONG ep thu tu nhieu buoc cua BO LAP KE HOACH: chay `action` TOI CUNG ngay truoc buoc duoc chon,
 * roi moi cho buoc do di tiep. Ba buoc la ba khe that giua cac lan ghi cua `PlanningService.commit()`:
 *
 *   · `latestRunForVehicle` — sau phep hoi `pendingWork` (KHONG khoa), truoc khi chon vong chay dich;
 *   · `createRun`           — sau khi da chon "mo vong chay moi", truoc lan ghi dau tien;
 *   · `addLeg`              — vong chay moi DA commit (chua ai cam), chang chua ghi.
 */
type PlannerStep = 'latestRunForVehicle' | 'createRun' | 'addLeg';

class SteppedMovementService extends MovementService {
  private gate: { readonly step: PlannerStep; readonly action: () => Promise<unknown> } | null =
    null;

  arm(step: PlannerStep, action: () => Promise<unknown>): void {
    this.gate = { step, action };
  }

  private async pass(step: PlannerStep): Promise<void> {
    const gate = this.gate;
    if (gate === null || gate.step !== step) return;
    this.gate = null;
    await gate.action();
  }

  override async latestRunForVehicle(vehicleId: string): Promise<VehicleRun | null> {
    await this.pass('latestRunForVehicle');
    return super.latestRunForVehicle(vehicleId);
  }

  override async createRun(input: CreateRunCommand, actor: string): Promise<VehicleRun> {
    await this.pass('createRun');
    return super.createRun(input, actor);
  }

  override async addLeg(runId: string, command: AddLegCommand, actor: string): Promise<RunLeg> {
    await this.pass('addLeg');
    return super.addLeg(runId, command, actor);
  }
}

const reasonOf = (settled: PromiseSettledResult<unknown>): string | null =>
  settled.status === 'rejected'
    ? settled.reason instanceof TransportDomainError
      ? settled.reason.reason
      : String(settled.reason)
    : null;

describe.runIf(process.env.RUN_PRISMA_IT === '1')(
  'viec tai xe nhan truc tiep -> don tu dong tren Postgres that (#398)',
  () => {
    const prisma = new PrismaService();
    const sites = new PrismaCounterpartySiteRepository(prisma);
    const counterparties = new PrismaCounterpartyRepository(prisma);
    const fleet = new PrismaFleetRepository(prisma);
    const movementRepo = new PrismaMovementRepository(prisma);
    const planRepo = new PrismaRunPlanRepository(prisma);
    const geofences = new PrismaGeofenceRepository(prisma);
    const intakes = new PrismaRunSiteIntakeRepository(prisma);
    const audit = new AuditLogService(new InMemoryAuditLogRepository());
    const movement = new MovementService(movementRepo, fleet, audit, CORE_POLICY);
    const siteService = new CounterpartySiteService(sites, counterparties);
    const core = new TransportSiteIntakeCoreFactsAdapter(fleet, movementRepo, siteService);
    const geo = new TransportSiteIntakeGeoFactsAdapter(geofences, siteService);
    const intakeService = new SiteIntakeService(
      intakes,
      core,
      geo,
      new NoLocationFacts(),
      movement,
      new PrismaSiteIntakeConfirmationWriter(prisma, audit),
      CORE_POLICY,
    );
    const store = new PrismaSiteIntakeCommercialStore(prisma, audit);

    /** Mot bo dich vu THAT theo mot che do gom don — y nhu tang ghep dung. */
    const stackFor = (grouping: RunGrouping, planningMovement: MovementService = movement) => {
      const policy = planningPolicy(grouping);
      const reader = new SiteIntakeReadinessReader(core, geo, policy);
      const review = new SiteIntakeReviewService(
        store,
        intakes,
        movementRepo,
        planRepo,
        core,
        reader,
      );
      return {
        grouping,
        commercial: new SiteIntakeCommercialService(store, intakes, core, geo, reader),
        review,
        pendingWork: new SiteIntakePlanningPendingWorkSource(review),
        planning: new PlanningService(
          planningMovement,
          planRepo,
          fleet,
          audit,
          CORE_POLICY,
          policy,
        ),
      };
    };
    const one = stackFor('ONE_ORDER_PER_RUN');
    const multi = stackFor('MULTI_ORDER_RUN');

    let siteId = '';
    let destinationPlaceId = '';
    let suffix = 0;

    /* ---------------------------------------------------------------- *
     * Don dep — con truoc, cha sau; trigger bao ve tat trong MOT giao dich
     * ---------------------------------------------------------------- */

    async function cleanup(): Promise<void> {
      const vehicleIds = (
        await prisma.transportVehicle.findMany({
          where: { registrationPlate: { startsWith: PLATE_PREFIX } },
          select: { id: true },
        })
      ).map((row) => row.id);
      const runIds = (
        await prisma.transportVehicleRun.findMany({
          where: { vehicleId: { in: vehicleIds } },
          select: { id: true },
        })
      ).map((row) => row.id);
      const legs = await prisma.transportRunLeg.findMany({
        where: { runId: { in: runIds } },
        select: { id: true, orderId: true },
      });
      const intakeRows = await prisma.transportRunSiteIntake.findMany({
        where: { runId: { in: runIds } },
        select: { id: true },
      });
      const intakeIds = intakeRows.map((row) => row.id);
      const commercialRows = await prisma.transportSiteIntakeCommercial.findMany({
        where: { intakeId: { in: intakeIds } },
        select: { id: true, orderId: true },
      });
      const plans = await prisma.transportOrderRunPlan.findMany({
        where: { runId: { in: runIds } },
        select: { id: true, orderId: true },
      });
      const prefixedOrders = await prisma.transportOrder.findMany({
        where: { code: { contains: PREFIX } },
        select: { id: true },
      });
      const orderIds = [
        ...new Set([
          ...prefixedOrders.map((row) => row.id),
          ...legs.flatMap((leg) => (leg.orderId ? [leg.orderId] : [])),
          ...commercialRows.flatMap((row) => (row.orderId ? [row.orderId] : [])),
          ...plans.map((plan) => plan.orderId),
        ]),
      ];

      if (intakeIds.length > 0) {
        await withProtectedTriggersDisabled(
          prisma,
          [
            ['TransportSiteIntakeCommercial', 'transport_site_intake_commercial_guard'],
            ['TransportRunSiteIntake', 'transport_run_site_intake_append_only'],
          ],
          async (tx) => {
            await tx.transportSiteIntakeCommercial.deleteMany({
              where: { intakeId: { in: intakeIds } },
            });
            await tx.transportRunSiteIntake.deleteMany({ where: { id: { in: intakeIds } } });
          },
        );
      }
      await prisma.transportOrderRunPlan.deleteMany({
        where: { OR: [{ runId: { in: runIds } }, { orderId: { in: orderIds } }] },
      });
      await prisma.transportRunLeg.deleteMany({ where: { runId: { in: runIds } } });
      await prisma.transportRunAssignment.deleteMany({ where: { runId: { in: runIds } } });
      await prisma.transportVehicleRun.deleteMany({ where: { id: { in: runIds } } });
      await prisma.transportOrder.deleteMany({ where: { id: { in: orderIds } } });
      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            { actor: { startsWith: ACTOR_PREFIX } },
            { entityId: { in: [...orderIds, ...plans.map((plan) => plan.id)] } },
            { entityId: { in: commercialRows.map((row) => row.id) } },
          ],
        },
      });

      await prisma.transportGeofence.deleteMany({ where: { label: { startsWith: FENCE_PREFIX } } });
      await prisma.transportCounterpartySite.deleteMany({
        where: { counterparty: { name: { startsWith: PARTY_PREFIX } } },
      });
      await prisma.transportCounterparty.deleteMany({
        where: { name: { startsWith: PARTY_PREFIX } },
      });
      await prisma.transportVehicleAssignment.deleteMany({
        where: { vehicleId: { in: vehicleIds } },
      });
      await prisma.transportVehicle.deleteMany({ where: { id: { in: vehicleIds } } });
      await prisma.transportDriver.deleteMany({ where: { phone: { startsWith: PHONE_PREFIX } } });
    }

    beforeAll(async () => {
      await prisma.$connect();
      await cleanup();

      const party = await counterparties.create({ name: `${PARTY_PREFIX} ABC` });
      siteId = (
        await sites.create({
          counterpartyId: party.id,
          name: 'Kho A',
          address: null,
          note: null,
          status: 'ACTIVE',
          recordedBy: OFFICE,
        })
      ).id;
      await geofences.register({
        label: `${FENCE_PREFIX} Kho A`,
        subjectKind: 'COUNTERPARTY_SITE',
        subjectId: siteId,
        latitude: ORIGIN.latitude,
        longitude: ORIGIN.longitude,
        radiusMetres: 300,
        note: null,
        recordedBy: OFFICE,
      });
      destinationPlaceId = (
        await geofences.register({
          label: `${FENCE_PREFIX} Bai B`,
          subjectKind: 'DEPOT',
          subjectId: `${PREFIX}-BAI-B`,
          latitude: DESTINATION.latitude,
          longitude: DESTINATION.longitude,
          radiusMetres: 200,
          note: null,
          recordedBy: OFFICE,
        })
      ).id;
    }, 120_000);

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    }, 120_000);

    /* ---------------------------------------------------------------- *
     * Fixture
     * ---------------------------------------------------------------- */

    /** MOT lai xe CO tai khoan, dang cam MOT chiec xe rieng. */
    const aDriver = async () => {
      const n = ++suffix;
      const vehicle = await fleet.createVehicle({
        registrationPlate: `${PLATE_PREFIX}-${n}`,
        vehicleClass: 'Dau keo',
      });
      const auth = `${ACTOR_PREFIX}-auth-${n}`;
      const driver = await fleet.createDriver({
        fullName: `${PREFIX} Lai xe ${n}`,
        phone: `${PHONE_PREFIX}${String(n).padStart(3, '0')}`,
        licenceClass: 'FC',
        licenceExpiry: '2030-01-01',
        authUserId: auth,
      });
      await fleet.assignDriverToVehicle(vehicle.id, driver.id, new Date());
      return { auth, driverId: driver.id, vehicleId: vehicle.id };
    };

    /** Tai xe bam "Nhan chuyen tai day", vi tri NAM TRONG hang rao kho A. */
    const confirmAt = (auth: string, clientEventId = 'cham-mot') =>
      intakeService.confirm({
        authUserId: auth,
        siteId,
        clientEventId,
        latitude: ORIGIN.latitude,
        longitude: ORIGIN.longitude,
        accuracyMetres: 10,
      });

    const anIntake = async () => {
      const who = await aDriver();
      return { ...who, intake: await confirmAt(who.auth) };
    };

    const knownDestination = { kind: 'KNOWN_PLACE' as const, placeId: '' };
    const chooseDestination = (
      who: { auth: string; intake: SiteIntakeResult },
      clientEventId = 'diem-giao-1',
      stack = one,
    ) =>
      stack.commercial.chooseDestinationAsDriver({
        authUserId: who.auth,
        intakeId: who.intake.intakeId,
        clientEventId,
        choice: { ...knownDestination, placeId: destinationPlaceId },
      });

    const anOfficeOrder = () =>
      movement.createOrder(
        {
          code: `${PREFIX}-ORD-${++suffix}`,
          originLabel: `${PREFIX} Kho A`,
          destinationLabel: `${PREFIX} Bai B`,
          businessDate: '2026-09-26',
        },
        OFFICE,
      );

    /** Dau vet cua MOT xe: vong chay, chang, lan nhan viec, phan thuong mai, ke hoach, don. */
    const footprint = async (vehicleId: string) => {
      const runs = await prisma.transportVehicleRun.findMany({
        where: { vehicleId },
        select: { id: true, status: true },
      });
      const runIds = runs.map((run) => run.id);
      const legs = await prisma.transportRunLeg.findMany({ where: { runId: { in: runIds } } });
      const intakeRows = await prisma.transportRunSiteIntake.findMany({
        where: { runId: { in: runIds } },
        select: { id: true },
      });
      const commercialRows = await prisma.transportSiteIntakeCommercial.findMany({
        where: { intakeId: { in: intakeRows.map((row) => row.id) } },
      });
      const plans = await prisma.transportOrderRunPlan.findMany({
        where: { runId: { in: runIds } },
      });
      const orders = new Set([
        ...legs.flatMap((leg) => (leg.orderId ? [leg.orderId] : [])),
        ...commercialRows.flatMap((row) => (row.orderId ? [row.orderId] : [])),
        ...plans.map((plan) => plan.orderId),
      ]);
      return {
        runs: runs.length,
        activeRuns: runs.filter((run) => run.status !== 'CANCELLED').length,
        legs: legs.length,
        intakes: intakeRows.length,
        commercial: commercialRows.length,
        plans: plans.length,
        orders: orders.size,
      };
    };

    const commercialOf = (intakeId: string) =>
      prisma.transportSiteIntakeCommercial.findUniqueOrThrow({ where: { intakeId } });

    /* ================================================================ *
     * a. DE NGHI KHONG GHI
     * ================================================================ */

    it('a. de nghi 20 lan -> khong mot lan ghi nghiep vu nao', async () => {
      const who = await aDriver();
      const before = await footprint(who.vehicleId);

      const proposals = await Promise.all(
        Array.from({ length: 20 }, () =>
          intakeService.propose({
            authUserId: who.auth,
            latitude: ORIGIN.latitude,
            longitude: ORIGIN.longitude,
            accuracyMetres: 10,
          }),
        ),
      );

      expect(proposals.every((proposal) => proposal.outcome === 'UNIQUE')).toBe(true);
      expect(await footprint(who.vehicleId)).toEqual(before);
      expect(before).toMatchObject({ runs: 0, legs: 0, intakes: 0, commercial: 0, orders: 0 });
      expect(await prisma.transportRunSiteIntake.count({ where: { driverId: who.driverId } })).toBe(
        0,
      );
    });

    /* ================================================================ *
     * b. BAM DUP
     * ================================================================ */

    it('b. bam dup CUNG khoa -> dung MOT lan nhan viec/vong chay/chang, phan thuong mai PENDING ra cung', async () => {
      const who = await aDriver();

      const settled = await Promise.allSettled([confirmAt(who.auth), confirmAt(who.auth)]);

      expect(settled.some((entry) => entry.status === 'fulfilled')).toBe(true);
      for (const entry of settled) {
        if (entry.status === 'rejected') {
          expect(reasonOf(entry)).toMatch(/SITE_INTAKE_(REPLAYED|CREATE_IN_FLIGHT)/);
        }
      }
      expect(await footprint(who.vehicleId)).toMatchObject({
        runs: 1,
        legs: 1,
        intakes: 1,
        commercial: 1,
        plans: 0,
        orders: 0,
      });
      const intake = await prisma.transportRunSiteIntake.findFirstOrThrow({
        where: { driverId: who.driverId },
        include: { commercial: true },
      });
      expect(intake.siteMatch).toBe('UNIQUE_INSIDE');
      expect(intake.commercial).toMatchObject({ status: 'PENDING', orderId: null });
    });

    /* ================================================================ *
     * c + d. DU DIEU KIEN -> DON NHAN LAI VONG CHAY/CHANG CU
     * ================================================================ */

    let adopted: {
      auth: string;
      vehicleId: string;
      intake: SiteIntakeResult;
      orderId: string;
      planId: string;
    } | null = null;

    it('d. tai xe chon diem giao -> Don +1, Vong chay +0, Chang +0, cung id, ke hoach ADOPTED', async () => {
      const who = await anIntake();
      const before = await footprint(who.vehicleId);

      const outcome = await chooseDestination(who);

      expect(outcome).toMatchObject({
        status: 'ORDER_BOUND',
        bindingMode: 'AUTO_CREATED',
        bound: true,
        replayed: false,
      });
      const orderId = outcome.orderId ?? '';
      expect(await footprint(who.vehicleId)).toEqual({
        ...before,
        plans: before.plans + 1,
        orders: before.orders + 1,
      });

      const leg = await prisma.transportRunLeg.findUniqueOrThrow({
        where: { id: who.intake.legId },
      });
      expect(leg.runId).toBe(who.intake.runId);
      expect(leg.orderId).toBe(orderId);
      expect(leg.kind).toBe('LOADED');

      const plan = await prisma.transportOrderRunPlan.findFirstOrThrow({
        where: { orderId, cancelledAt: null },
      });
      expect(plan).toMatchObject({
        runId: who.intake.runId,
        vehicleId: who.vehicleId,
        loadedLegId: who.intake.legId,
        emptyLegId: null,
        outcome: 'ADOPTED',
        idempotencyKey: siteIntakePlanKey(who.intake.intakeId),
      });

      const order = await movement.getOrder(orderId);
      expect(order.code).toBe(siteIntakeOrderCode(who.intake.businessDate, who.intake.intakeId));
      expect(order.freightAmount).toBeNull();
      expect(order.customerId).toBeNull();
      expect(order.status).toBe('OPEN');
      expect(order.originPoint).toEqual(ORIGIN);
      expect(order.destinationPoint).toEqual(DESTINATION);
      expect(order.originLabel).toBe(`${PARTY_PREFIX} ABC — Kho A`);

      // Kiem toan ghi CUNG giao dich.
      const commercial = await commercialOf(who.intake.intakeId);
      const actions = (
        await prisma.auditLog.findMany({
          where: { entityId: { in: [orderId, plan.id, commercial.id] } },
          select: { action: true },
        })
      ).map((row) => row.action);
      expect(actions).toEqual(
        expect.arrayContaining([
          'transport.site_intake.destination',
          'transport.order.create',
          'transport.planning.adopt',
          'transport.site_intake.order_bound',
        ]),
      );
      expect(actions.filter((action) => action === 'transport.order.create')).toHaveLength(1);

      adopted = { ...who, orderId, planId: plan.id };
    });

    it('c. mat phan hoi roi gui lai CUNG khoa -> dung don cu, phan hoi la ban phat lai', async () => {
      const who = adopted;
      if (!who) throw new Error('bai d chua chay');
      const before = await footprint(who.vehicleId);

      const retry = await chooseDestination(who);
      expect(retry).toMatchObject({ orderId: who.orderId, replayed: true, bound: false });
      expect(await footprint(who.vehicleId)).toEqual(before);

      // Hai lan gui CUNG khoa DONG THOI tren mot lan nhan viec moi: van mot don.
      const fresh = await anIntake();
      const pair = await Promise.allSettled([chooseDestination(fresh), chooseDestination(fresh)]);
      const fulfilled = pair.flatMap((entry) =>
        entry.status === 'fulfilled' ? [entry.value] : [],
      );
      expect(fulfilled).toHaveLength(2);
      expect(fulfilled.filter((entry) => entry.bound)).toHaveLength(1);
      expect(fulfilled.filter((entry) => entry.replayed)).toHaveLength(1);
      expect(new Set(fulfilled.map((entry) => entry.orderId)).size).toBe(1);
      expect(await footprint(fresh.vehicleId)).toMatchObject({
        runs: 1,
        legs: 1,
        orders: 1,
        plans: 1,
      });
      expect(
        await prisma.transportOrder.count({
          where: { code: siteIntakeOrderCode(fresh.intake.businessDate, fresh.intake.intakeId) },
        }),
      ).toBe(1);
    });

    /* ================================================================ *
     * e. LAP KE HOACH SAU DO
     * ================================================================ */

    it.each([
      ['ONE_ORDER_PER_RUN', one],
      ['MULTI_ORDER_RUN', multi],
    ] as const)(
      'e. lap ke hoach lai cho don tu tao (%s) -> PLAN_ORDER_ALREADY_PLANNED, khong vong chay/chang them',
      async (_grouping, stack) => {
        const who = adopted;
        if (!who) throw new Error('bai d chua chay');
        const before = await footprint(who.vehicleId);

        const settled = await Promise.allSettled([
          stack.planning.commit(
            who.orderId,
            {
              vehicleId: who.vehicleId,
              idempotencyKey: `${PREFIX}-lap-lai-${stack.grouping}`,
              pendingWork: stack.pendingWork,
            },
            OFFICE,
          ),
        ]);
        expect(reasonOf(settled[0] as PromiseSettledResult<unknown>)).toBe(
          'PLAN_ORDER_ALREADY_PLANNED',
        );
        expect(await footprint(who.vehicleId)).toEqual(before);
      },
    );

    /* ================================================================ *
     * f. KICH BAN DO CUA ISSUE
     * ================================================================ */

    it.each([
      ['ONE_ORDER_PER_RUN', one],
      ['MULTI_ORDER_RUN', multi],
    ] as const)(
      'f. van phong tao don rieng + lap ke hoach cho xe dang giu viec chua co don (%s) -> tu choi, khong R2/L2',
      async (_grouping, stack) => {
        const who = await anIntake();
        const order = await anOfficeOrder();
        const before = await footprint(who.vehicleId);

        const [settled] = await Promise.allSettled([
          stack.planning.commit(
            order.id,
            {
              vehicleId: who.vehicleId,
              idempotencyKey: `${PREFIX}-do-${stack.grouping}`,
              pendingWork: stack.pendingWork,
            },
            OFFICE,
          ),
        ]);

        expect(reasonOf(settled as PromiseSettledResult<unknown>)).toBe(
          'PLAN_VEHICLE_HAS_PENDING_SITE_INTAKE',
        );
        expect(await footprint(who.vehicleId)).toEqual(before);
        expect(before).toMatchObject({ runs: 1, legs: 1, plans: 0, orders: 0 });
        expect(await prisma.transportOrderRunPlan.count({ where: { orderId: order.id } })).toBe(0);
        expect(await prisma.transportRunLeg.count({ where: { orderId: order.id } })).toBe(0);
      },
    );

    /**
     * HAI LOP CHAN. Truoc day bai nay la DOI CHUNG AM: bo cong `pendingWork` ra thi chinh kich ban
     * tren SINH R2/L2. Tu khi kho hoi lai cau do DUOI khoa tu van cua xe (`createRun`/`createLeg` co
     * `planGuardOrderId`), vang cong o tang dich vu cung KHONG con lot: ONE bi chan o lan mo vong
     * chay, MULTI bi chan o chang dau tien noi vao vong chay cua tai xe — va khong de lai gi. Doi
     * chung am cua CHINH khoa xe la cac bai dua ep thu tu o muc `o.` ben duoi.
     */
    it.each([
      ['ONE_ORDER_PER_RUN', one],
      ['MULTI_ORDER_RUN', multi],
    ] as const)(
      'f. vang cong viec dang do o tang dich vu (%s) -> khoa xe cua kho van chan, khong R2/L2',
      async (_grouping, stack) => {
        const who = await anIntake();
        const order = await anOfficeOrder();
        const before = await footprint(who.vehicleId);

        const [settled] = await Promise.allSettled([
          stack.planning.commit(
            order.id,
            { vehicleId: who.vehicleId, idempotencyKey: `${PREFIX}-am-${stack.grouping}` },
            OFFICE,
          ),
        ]);

        expect(reasonOf(settled as PromiseSettledResult<unknown>)).toBe(
          'PLAN_VEHICLE_HAS_PENDING_SITE_INTAKE',
        );
        expect(await footprint(who.vehicleId)).toEqual(before);
        expect(await prisma.transportRunLeg.count({ where: { orderId: order.id } })).toBe(0);
        expect(await prisma.transportOrderRunPlan.count({ where: { orderId: order.id } })).toBe(0);
      },
    );

    /* ================================================================ *
     * g + i. DUA NHAU THANG CAP
     * ================================================================ */

    it('g. hai van phong hoan thien + tai xe chon diem giao CUNG LUC -> dung mot don, mot ke hoach ADOPTED', async () => {
      for (let round = 0; round < 3; round += 1) {
        const who = await anIntake();
        const choice = { kind: 'KNOWN_PLACE' as const, placeId: destinationPlaceId };

        const settled = await Promise.allSettled([
          one.commercial.completeAsOffice({
            actor: OFFICE,
            intakeId: who.intake.intakeId,
            idempotencyKey: `hoan-thien-a-${round}`,
            choice,
          }),
          one.commercial.completeAsOffice({
            actor: OFFICE,
            intakeId: who.intake.intakeId,
            idempotencyKey: `hoan-thien-b-${round}`,
            choice,
          }),
          chooseDestination(who, `tai-xe-${round}`),
        ]);

        const fulfilled = settled.flatMap((entry) =>
          entry.status === 'fulfilled' ? [entry.value] : [],
        );
        expect(fulfilled, JSON.stringify(settled.map(reasonOf))).toHaveLength(3);
        expect(fulfilled.filter((entry) => entry.bound)).toHaveLength(1);
        expect(new Set(fulfilled.map((entry) => entry.orderId)).size).toBe(1);
        expect(await footprint(who.vehicleId)).toMatchObject({
          runs: 1,
          legs: 1,
          orders: 1,
          plans: 1,
        });
        expect(
          await prisma.transportOrderRunPlan.count({
            where: { runId: who.intake.runId, outcome: 'ADOPTED', cancelledAt: null },
          }),
        ).toBe(1);
      }
    });

    it('i. van phong hoan thien DUA voi tai xe tu du dieu kien -> mot don', async () => {
      for (let round = 0; round < 3; round += 1) {
        const who = await anIntake();
        const settled = await Promise.allSettled([
          chooseDestination(who, `tai-xe-i-${round}`),
          one.commercial.completeAsOffice({
            actor: OFFICE,
            intakeId: who.intake.intakeId,
            idempotencyKey: `van-phong-i-${round}`,
            choice: { kind: 'KNOWN_PLACE', placeId: destinationPlaceId },
          }),
        ]);
        const fulfilled = settled.flatMap((entry) =>
          entry.status === 'fulfilled' ? [entry.value] : [],
        );
        expect(fulfilled).toHaveLength(2);
        expect(fulfilled.filter((entry) => entry.bound)).toHaveLength(1);
        const commercial = await commercialOf(who.intake.intakeId);
        expect(commercial.status).toBe('ORDER_BOUND');
        expect(['AUTO_CREATED', 'OFFICE_COMPLETED']).toContain(commercial.bindingMode);
        expect(await footprint(who.vehicleId)).toMatchObject({ runs: 1, legs: 1, orders: 1 });
      }
    });

    /* ================================================================ *
     * h. GAN DON CO SAN DUA VOI LAP KE HOACH CHO CUNG DON
     * ================================================================ */

    /** Moi su that phai dung SAU mot lan dua gan don Y vs lap ke hoach Y. */
    const expectOneHomeFor = async (
      orderId: string,
      intake: SiteIntakeResult,
      plannerVehicleId: string,
    ) => {
      const liveLoaded = await prisma.transportRunLeg.findMany({
        where: { orderId, kind: 'LOADED', status: { not: 'CANCELLED' } },
      });
      expect(liveLoaded).toHaveLength(1);
      expect(
        await prisma.transportOrderRunPlan.count({ where: { orderId, cancelledAt: null } }),
      ).toBe(1);

      const plannerRuns = await prisma.transportVehicleRun.findMany({
        where: { vehicleId: plannerVehicleId },
        include: { legs: true },
      });
      const bindWon = liveLoaded[0]?.id === intake.legId;
      if (bindWon) {
        // Ban thua (bo lap ke hoach) chi duoc de lai mot vong chay DA HUY — khong chang song nao.
        for (const run of plannerRuns) {
          expect(run.status, `vong chay ${run.code} cua bo lap ke hoach thua`).toBe('CANCELLED');
          expect(run.legs.filter((leg) => leg.status !== 'CANCELLED')).toEqual([]);
        }
        expect((await commercialOf(intake.intakeId)).orderId).toBe(orderId);
      } else {
        expect(plannerRuns.filter((run) => run.status !== 'CANCELLED')).toHaveLength(1);
        expect((await commercialOf(intake.intakeId)).status).toBe('PENDING');
        expect(
          (await prisma.transportRunLeg.findUniqueOrThrow({ where: { id: intake.legId } })).orderId,
        ).toBeNull();
      }
      return bindWon;
    };

    it('h. gan don Y vao viec tai xe DUA voi lap ke hoach Y (lap lai) -> khong bao gio ca hai thang', async () => {
      const winners: string[] = [];
      for (let round = 0; round < 4; round += 1) {
        const who = await anIntake();
        const planner = await aDriver();
        const order = await anOfficeOrder();

        const settled = await Promise.allSettled([
          one.commercial.bindExistingOrder({
            actor: OFFICE,
            intakeId: who.intake.intakeId,
            orderId: order.id,
          }),
          one.planning.commit(
            order.id,
            {
              vehicleId: planner.vehicleId,
              idempotencyKey: `${PREFIX}-dua-${round}`,
              pendingWork: one.pendingWork,
            },
            OFFICE,
          ),
        ]);

        const [bind, plan] = settled;
        expect(
          settled.filter((entry) => entry.status === 'fulfilled'),
          JSON.stringify(settled.map(reasonOf)),
        ).toHaveLength(1);
        const bindWon = await expectOneHomeFor(order.id, who.intake, planner.vehicleId);
        winners.push(bindWon ? 'gan-don' : 'lap-ke-hoach');
        if (bindWon) {
          expect(reasonOf(plan as PromiseSettledResult<unknown>)).toBe(
            'PLAN_ORDER_ALREADY_PLANNED',
          );
        } else {
          expect(reasonOf(bind as PromiseSettledResult<unknown>)).toBe(
            'SITE_INTAKE_BINDING_DENIED',
          );
        }
        // Viec tai xe KHONG bao gio sinh vong chay thu hai.
        expect((await footprint(who.vehicleId)).runs).toBe(1);
      }
      expect(winners).toHaveLength(4);
    });

    /**
     * CUNG cuoc dua, nhung THU TU bi ep: lenh gan don chay TRON trong khe giua hai buoc cua bo lap
     * ke hoach. Hai khe, hai bai: (1) vong chay moi da ghi, chua co chang nao; (2) chang RONG da
     * ghi, chang CO HANG chua. Ca hai khe, ban thua khong duoc de lai viec song tren xe cua no.
     */
    it.each([
      ['truoc chang dau tien', (_command: AddLegCommand): boolean => true],
      [
        'giua chang rong va chang co hang',
        (command: AddLegCommand): boolean => command.kind === 'LOADED',
      ],
    ] as const)(
      'h. gan don thang trong khe cua bo lap ke hoach (%s) -> ban thua khong de lai viec song',
      async (_label, when) => {
        const gated = new GatedMovementService(movementRepo, fleet, audit, CORE_POLICY);
        const stack = stackFor('ONE_ORDER_PER_RUN', gated);
        const who = await anIntake();
        const planner = await aDriver();
        const order = await anOfficeOrder();

        let bound: unknown = null;
        gated.arm(when, async () => {
          bound = await stack.commercial.bindExistingOrder({
            actor: OFFICE,
            intakeId: who.intake.intakeId,
            orderId: order.id,
          });
        });

        const [settled] = await Promise.allSettled([
          stack.planning.commit(
            order.id,
            {
              vehicleId: planner.vehicleId,
              idempotencyKey: `${PREFIX}-khe-${suffix}`,
              pendingWork: stack.pendingWork,
            },
            OFFICE,
          ),
        ]);

        expect(bound).toMatchObject({ bound: true, orderId: order.id });
        expect(reasonOf(settled as PromiseSettledResult<unknown>)).toBe(
          'PLAN_ORDER_ALREADY_PLANNED',
        );
        expect(await expectOneHomeFor(order.id, who.intake, planner.vehicleId)).toBe(true);
        expect((await footprint(planner.vehicleId)).activeRuns).toBe(0);
      },
    );

    /* ================================================================ *
     * j. X ROI Y
     * ================================================================ */

    it('j. gan don X roi gan don Y -> tu choi tat dinh, DB khong doi', async () => {
      const who = await anIntake();
      const x = await anOfficeOrder();
      const y = await anOfficeOrder();

      await one.commercial.bindExistingOrder({
        actor: OFFICE,
        intakeId: who.intake.intakeId,
        orderId: x.id,
      });
      const snapshot = await commercialOf(who.intake.intakeId);
      const before = await footprint(who.vehicleId);

      const [settled] = await Promise.allSettled([
        one.commercial.bindExistingOrder({
          actor: OFFICE,
          intakeId: who.intake.intakeId,
          orderId: y.id,
        }),
      ]);
      expect(reasonOf(settled as PromiseSettledResult<unknown>)).toBe(
        'SITE_INTAKE_BOUND_TO_OTHER_ORDER',
      );

      expect(await commercialOf(who.intake.intakeId)).toEqual(snapshot);
      expect(await footprint(who.vehicleId)).toEqual(before);
      expect(
        (await prisma.transportRunLeg.findUniqueOrThrow({ where: { id: who.intake.legId } }))
          .orderId,
      ).toBe(x.id);
      expect(await prisma.transportOrderRunPlan.count({ where: { orderId: y.id } })).toBe(0);
    });

    /* ================================================================ *
     * k. RANG BUOC CUA DB — do bang SQL tho, khong qua dich vu
     * ================================================================ */

    describe('k. rang buoc cua DB', () => {
      it('trigger chan doi don cua chang da nhan (X -> Y)', async () => {
        const who = adopted;
        if (!who) throw new Error('bai d chua chay');
        const other = await anOfficeOrder();
        await expect(
          prisma.$executeRaw`UPDATE "TransportRunLeg" SET "orderId" = ${other.id} WHERE "id" = ${who.intake.legId}`,
        ).rejects.toThrow(/transport_run_leg_order_binding_once/);
        expect(
          (await prisma.transportRunLeg.findUniqueOrThrow({ where: { id: who.intake.legId } }))
            .orderId,
        ).toBe(who.orderId);
      });

      it('trigger chan doi don cua phan thuong mai, chan quay nguoc, chan xoa', async () => {
        const who = adopted;
        if (!who) throw new Error('bai d chua chay');
        const other = await anOfficeOrder();
        const row = await commercialOf(who.intake.intakeId);

        await expect(
          prisma.$executeRaw`UPDATE "TransportSiteIntakeCommercial" SET "orderId" = ${other.id} WHERE "id" = ${row.id}`,
        ).rejects.toThrow(/transport_site_intake_commercial_guard/);
        await expect(
          prisma.$executeRaw`UPDATE "TransportSiteIntakeCommercial" SET "status" = 'PENDING', "orderId" = NULL, "bindingMode" = NULL, "boundBy" = NULL, "boundAt" = NULL WHERE "id" = ${row.id}`,
        ).rejects.toThrow(/transport_site_intake_commercial_guard/);
        await expect(
          prisma.$executeRaw`DELETE FROM "TransportSiteIntakeCommercial" WHERE "id" = ${row.id}`,
        ).rejects.toThrow(/transport_site_intake_commercial_guard/);
        expect(await commercialOf(who.intake.intakeId)).toEqual(row);
      });

      it('CHECK chan nua khoi diem giao, null island, va ORDER_BOUND khong co don', async () => {
        const who = await anIntake();
        const row = await commercialOf(who.intake.intakeId);

        await expect(
          prisma.$executeRaw`UPDATE "TransportSiteIntakeCommercial" SET "destinationLabel" = 'Kho B' WHERE "id" = ${row.id}`,
        ).rejects.toThrow(/destination_complete/);
        await expect(
          prisma.$executeRaw`
            UPDATE "TransportSiteIntakeCommercial"
               SET "destinationLabel" = 'Dao rong', "destinationLatitude" = 0, "destinationLongitude" = 0,
                   "destinationSource" = 'PLACE_SEARCH', "destinationSetBy" = ${OFFICE},
                   "destinationSetByRole" = 'OFFICE', "destinationSetAt" = now()
             WHERE "id" = ${row.id}`,
        ).rejects.toThrow(/not_null_island/);
        await expect(
          prisma.$executeRaw`UPDATE "TransportSiteIntakeCommercial" SET "status" = 'ORDER_BOUND' WHERE "id" = ${row.id}`,
        ).rejects.toThrow(/binding_shape/);
        await expect(
          prisma.$executeRaw`UPDATE "TransportSiteIntakeCommercial" SET "status" = 'REJECTED' WHERE "id" = ${row.id}`,
        ).rejects.toThrow(/rejected_has_reason/);
        expect(await commercialOf(who.intake.intakeId)).toEqual(row);
      });
    });

    /* ================================================================ *
     * l. BAO BAT THUONG
     * ================================================================ */

    it('l. xe CHUA chay: huy don + vong chay + chang + ke hoach, KHONG xoa hang nao', async () => {
      const who = await anIntake();
      const outcome = await chooseDestination(who);
      const orderId = outcome.orderId ?? '';
      const before = await footprint(who.vehicleId);

      const exception = await one.commercial.reportException({
        actor: BOSS,
        intakeId: who.intake.intakeId,
        reason: 'Khach huy don',
        idempotencyKey: 'bat-thuong-1',
      });

      expect(exception).toMatchObject({
        outcome: 'ORDER_CANCELLED_WORK_CANCELLED',
        orderId,
        operationPreserved: false,
      });
      expect(await footprint(who.vehicleId)).toEqual({ ...before, activeRuns: 0 });
      expect(
        (await prisma.transportOrder.findUniqueOrThrow({ where: { id: orderId } })).status,
      ).toBe('CANCELLED');
      expect(
        (await prisma.transportVehicleRun.findUniqueOrThrow({ where: { id: who.intake.runId } }))
          .status,
      ).toBe('CANCELLED');
      expect(
        (await prisma.transportRunLeg.findUniqueOrThrow({ where: { id: who.intake.legId } }))
          .status,
      ).toBe('CANCELLED');
      const plan = await prisma.transportOrderRunPlan.findFirstOrThrow({ where: { orderId } });
      expect(plan.cancelledAt).not.toBeNull();
      const commercial = await commercialOf(who.intake.intakeId);
      expect(commercial).toMatchObject({
        status: 'ORDER_BOUND',
        exceptionOutcome: 'ORDER_CANCELLED_WORK_CANCELLED',
        exceptionKey: 'bat-thuong-1',
      });
      expect(
        await prisma.auditLog.count({
          where: { entityId: commercial.id, action: 'transport.site_intake.exception' },
        }),
      ).toBe(1);
    });

    it('l. xe DA chay: chi huy don; vong chay/chang giu nguyen; gui lai = ket cuc cu, khoa khac bi tu choi', async () => {
      const who = await anIntake();
      const outcome = await chooseDestination(who);
      const orderId = outcome.orderId ?? '';
      await movement.transitionLeg(who.intake.legId, 'IN_TRANSIT', who.auth);
      const runBefore = await prisma.transportVehicleRun.findUniqueOrThrow({
        where: { id: who.intake.runId },
      });

      const command = {
        actor: BOSS,
        intakeId: who.intake.intakeId,
        reason: 'Khach doi y giua duong',
        idempotencyKey: 'bat-thuong-1',
      };
      const exception = await one.commercial.reportException(command);
      expect(exception).toMatchObject({
        outcome: 'ORDER_CANCELLED_OPERATION_PRESERVED',
        operationPreserved: true,
        replayed: false,
      });
      expect(
        (await prisma.transportOrder.findUniqueOrThrow({ where: { id: orderId } })).status,
      ).toBe('CANCELLED');
      const runAfter = await prisma.transportVehicleRun.findUniqueOrThrow({
        where: { id: who.intake.runId },
      });
      expect(runAfter.status).toBe(runBefore.status);
      expect(runAfter.status).not.toBe('CANCELLED');
      expect(
        (await prisma.transportRunLeg.findUniqueOrThrow({ where: { id: who.intake.legId } }))
          .status,
      ).toBe('IN_TRANSIT');

      expect(await one.commercial.reportException(command)).toMatchObject({
        outcome: 'ORDER_CANCELLED_OPERATION_PRESERVED',
        replayed: true,
      });
      const [other] = await Promise.allSettled([
        one.commercial.reportException({ ...command, idempotencyKey: 'bat-thuong-2' }),
      ]);
      expect(reasonOf(other as PromiseSettledResult<unknown>)).toBe(
        'SITE_INTAKE_EXCEPTION_ALREADY_RECORDED',
      );
    });

    /* ================================================================ *
     * m. MO HINH DOC: ban tin + hang Can xu ly
     * ================================================================ */

    it('m. ban tin liet ke don tu tao DUNG mot lan; Can xu ly liet ke viec thieu diem giao, khong liet ke don tu tao', async () => {
      const auto = await anIntake();
      const outcome = await chooseDestination(auto);
      // Goi thang cap lai nhieu lan — khong duoc nhan doi dong ban tin.
      await chooseDestination(auto);
      await chooseDestination(auto, 'diem-giao-2');
      await one.commercial.completeAsOffice({
        actor: OFFICE,
        intakeId: auto.intake.intakeId,
        idempotencyKey: 'lai-lan-nua',
        choice: { kind: 'KNOWN_PLACE', placeId: destinationPlaceId },
      });

      const pending = await anIntake();

      const activity = await one.review.activity(24);
      expect(activity.filter((item) => item.orderId === outcome.orderId)).toHaveLength(1);
      expect(activity.find((item) => item.orderId === outcome.orderId)).toMatchObject({
        intakeId: auto.intake.intakeId,
        bindingMode: 'AUTO_CREATED',
        orderStatus: 'OPEN',
      });
      expect(activity.some((item) => item.intakeId === pending.intake.intakeId)).toBe(false);

      const queue = await one.review.listNeedsReview();
      const mine = queue.filter((fact) =>
        [auto.intake.intakeId, pending.intake.intakeId].includes(fact.intakeId),
      );
      expect(mine).toEqual([
        expect.objectContaining({
          intakeId: pending.intake.intakeId,
          vehicleId: pending.vehicleId,
          reasons: ['DESTINATION_MISSING'],
        }),
      ]);
      expect(await one.pendingWork.pendingIntakeForVehicle(pending.vehicleId)).toMatchObject({
        intakeId: pending.intake.intakeId,
      });
      expect(await one.pendingWork.pendingIntakeForVehicle(auto.vehicleId)).toBeNull();

      expect(await one.review.sourceOfOrder(outcome.orderId ?? '')).toMatchObject({
        intakeId: auto.intake.intakeId,
        siteMatch: 'UNIQUE_INSIDE',
        movementStarted: false,
      });
      expect(await one.review.driverIntake(auto.auth, auto.intake.intakeId)).toMatchObject({
        stage: 'CONFIRMED',
        destinationLabel: `${PREFIX} Hang rao Bai B`,
      });
    });

    /* ================================================================ *
     * n. TAI CHINH KHONG DOI
     * ================================================================ */

    it('n. don tu tao KHONG sinh doi soat, cong no, nghiem thu thuong mai hay lien ket chuyen', async () => {
      const who = adopted;
      if (!who) throw new Error('bai d chua chay');
      const where = { where: { orderId: who.orderId } };
      expect(
        await Promise.all([
          prisma.transportCommercialAcceptance.count(where),
          prisma.transportCustomerReconciliation.count(where),
          prisma.transportCustomerReconciliationBatchLine.count(where),
          prisma.transportTripOrderLink.count(where),
          prisma.transportOperationalDocument.count(where),
        ]),
      ).toEqual([0, 0, 0, 0, 0]);
      const order = await prisma.transportOrder.findUniqueOrThrow({ where: { id: who.orderId } });
      expect(order.freightAmount).toBeNull();
      expect(order.customerId).toBeNull();
    });

    /* ================================================================ *
     * o. TAI XE XAC NHAN DUA VOI LAP KE HOACH TREN CUNG XE — khoa tu van cua xe
     * ================================================================ */

    const OPEN: readonly string[] = ['PLANNED', 'ACTIVE'];

    /**
     * Moi su that phai dung SAU mot lan dua "tai xe D xac nhan tren xe V" vs "van phong lap don Y len
     * xe V". Tra ve `true` neu tai xe thang.
     */
    const expectOneJobOn = async (
      who: { readonly vehicleId: string; readonly driverId: string },
      orderId: string,
    ): Promise<boolean> => {
      const runs = await prisma.transportVehicleRun.findMany({
        where: { vehicleId: who.vehicleId },
        include: { legs: true, siteIntake: { include: { commercial: true } } },
      });
      const open = runs.filter((run) => OPEN.includes(run.status));
      // (1) KHONG BAO GIO hai vong chay mo tren mot xe.
      expect(open, 'hai vong chay mo tren mot xe').toHaveLength(1);

      const liveLoadedForOrder = await prisma.transportRunLeg.count({
        where: { orderId, kind: 'LOADED', status: { not: 'CANCELLED' } },
      });
      // (2) KHONG BAO GIO mot chang CO HANG song cua Y khi viec tai xe tren xe van `PENDING`.
      if (open.some((run) => run.siteIntake?.commercial?.status === 'PENDING')) {
        expect(liveLoadedForOrder).toBe(0);
      }

      const activePlans = await prisma.transportOrderRunPlan.count({
        where: { orderId, cancelledAt: null },
      });
      const intakes = await prisma.transportRunSiteIntake.count({
        where: { driverId: who.driverId },
      });
      const driverWon = intakes === 1;
      if (driverWon) {
        // (3) Bo lap ke hoach thua: vong chay cua no (neu co) DA HUY, khong chang song nao.
        for (const run of runs.filter((entry) => entry.siteIntake === null)) {
          expect(run.status, `vong chay ${run.code} cua bo lap ke hoach thua`).toBe('CANCELLED');
          expect(run.legs.filter((leg) => leg.status !== 'CANCELLED')).toEqual([]);
        }
        const intakeRun = runs.find((entry) => entry.siteIntake !== null);
        expect(intakeRun?.legs.filter((leg) => leg.status !== 'CANCELLED')).toHaveLength(1);
        expect(liveLoadedForOrder).toBe(0);
        expect(activePlans).toBe(0);
      } else {
        // (4) Tai xe thua: KHONG mot hang nao cua lan xac nhan.
        expect(intakes).toBe(0);
        expect(liveLoadedForOrder).toBe(1);
        expect(activePlans).toBe(1);
      }
      return driverWon;
    };

    it.each([
      ['ONE_ORDER_PER_RUN', one],
      ['MULTI_ORDER_RUN', multi],
    ] as const)(
      'o. tai xe xac nhan DUA voi lap ke hoach cho CUNG xe (%s, lap lai) -> dung mot ben thang, khong hai vong chay mo',
      async (_grouping, stack) => {
        const winners: string[] = [];
        for (let round = 0; round < 4; round += 1) {
          const who = await aDriver();
          const order = await anOfficeOrder();

          const settled = await Promise.allSettled([
            confirmAt(who.auth, `dua-xe-${round}`),
            stack.planning.commit(
              order.id,
              {
                vehicleId: who.vehicleId,
                idempotencyKey: `${PREFIX}-dua-xe-${stack.grouping}-${round}`,
                pendingWork: stack.pendingWork,
              },
              OFFICE,
            ),
          ]);

          const [confirmed, planned] = settled;
          expect(
            settled.filter((entry) => entry.status === 'fulfilled'),
            JSON.stringify(settled.map(reasonOf)),
          ).toHaveLength(1);
          const driverWon = await expectOneJobOn(who, order.id);
          if (driverWon) {
            expect(confirmed?.status).toBe('fulfilled');
            expect(reasonOf(planned as PromiseSettledResult<unknown>)).toBe(
              'PLAN_VEHICLE_HAS_PENDING_SITE_INTAKE',
            );
          } else {
            expect(planned?.status).toBe('fulfilled');
            expect(reasonOf(confirmed as PromiseSettledResult<unknown>)).toMatch(
              /^SITE_INTAKE_(VEHICLE_BUSY|OPEN_RUN_EXISTS)$/,
            );
          }
          winners.push(driverWon ? 'tai-xe' : 'lap-ke-hoach');
        }
        expect(winners).toHaveLength(4);
      },
    );

    /**
     * CUNG cuoc dua, THU TU bi ep vao dung ba khe cua bo lap ke hoach. Hai khe dau: lan xac nhan
     * commit SAU phep hoi `pendingWork` (khong khoa) — chi khoa xe cua kho con bat duoc. Khe thu ba:
     * vong chay moi cua bo lap ke hoach da commit nhung chua ai cam — phep kiem "lai xe dang cam
     * vong chay mo" khong thay no, chi phep kiem XE duoi khoa thay.
     */
    it.each([
      ['ONE_ORDER_PER_RUN', 'createRun', 'tai-xe'],
      ['MULTI_ORDER_RUN', 'latestRunForVehicle', 'tai-xe'],
      ['ONE_ORDER_PER_RUN', 'addLeg', 'lap-ke-hoach'],
    ] as const)(
      'o. xac nhan chen vao khe cua bo lap ke hoach (%s, truoc %s) -> %s thang, ben kia khong de lai viec song',
      async (grouping, step, winner) => {
        const stepped = new SteppedMovementService(movementRepo, fleet, audit, CORE_POLICY);
        const stack = stackFor(grouping, stepped);
        const who = await aDriver();
        const order = await anOfficeOrder();

        const confirmed: PromiseSettledResult<SiteIntakeResult>[] = [];
        stepped.arm(step, async () => {
          confirmed.push(...(await Promise.allSettled([confirmAt(who.auth, `khe-${step}`)])));
        });

        const [planned] = await Promise.allSettled([
          stack.planning.commit(
            order.id,
            {
              vehicleId: who.vehicleId,
              idempotencyKey: `${PREFIX}-khe-xe-${grouping}-${step}`,
              pendingWork: stack.pendingWork,
            },
            OFFICE,
          ),
        ]);

        expect(confirmed).toHaveLength(1);
        const driverWon = await expectOneJobOn(who, order.id);
        expect(driverWon ? 'tai-xe' : 'lap-ke-hoach').toBe(winner);
        if (winner === 'tai-xe') {
          expect(confirmed[0]?.status).toBe('fulfilled');
          expect(reasonOf(planned as PromiseSettledResult<unknown>)).toBe(
            'PLAN_VEHICLE_HAS_PENDING_SITE_INTAKE',
          );
        } else {
          expect(planned?.status).toBe('fulfilled');
          expect(reasonOf(confirmed[0] as PromiseSettledResult<unknown>)).toBe(
            'SITE_INTAKE_VEHICLE_BUSY',
          );
        }
      },
    );

    it('o. hai lan bam KHAC khoa cua cung mot tai xe cung luc -> dung mot vong chay, lan kia OPEN_RUN_EXISTS', async () => {
      for (let round = 0; round < 3; round += 1) {
        const who = await aDriver();

        const settled = await Promise.allSettled([
          confirmAt(who.auth, `may-a-${round}`),
          confirmAt(who.auth, `may-b-${round}`),
        ]);

        expect(
          settled.filter((entry) => entry.status === 'fulfilled'),
          JSON.stringify(settled.map(reasonOf)),
        ).toHaveLength(1);
        expect(settled.map(reasonOf).filter((reason) => reason !== null)).toEqual([
          'SITE_INTAKE_OPEN_RUN_EXISTS',
        ]);
        expect(await footprint(who.vehicleId)).toMatchObject({
          runs: 1,
          activeRuns: 1,
          legs: 1,
          intakes: 1,
          commercial: 1,
        });
      }
    });

    it('o. xe dang co vong chay mo CHUA AI CAM -> SITE_INTAKE_VEHICLE_BUSY, khong ghi gi', async () => {
      const who = await aDriver();
      await movement.createRun(
        {
          code: `${PREFIX}-BAN-${++suffix}`,
          vehicleId: who.vehicleId,
          businessDate: '2026-09-26',
          note: null,
        },
        OFFICE,
      );
      const before = await footprint(who.vehicleId);

      const [settled] = await Promise.allSettled([confirmAt(who.auth, 'xe-ban')]);

      expect(reasonOf(settled as PromiseSettledResult<unknown>)).toBe('SITE_INTAKE_VEHICLE_BUSY');
      expect(await footprint(who.vehicleId)).toEqual(before);
      expect(before).toMatchObject({ runs: 1, activeRuns: 1, legs: 0, intakes: 0 });
      expect(await prisma.transportRunSiteIntake.count({ where: { driverId: who.driverId } })).toBe(
        0,
      );
      expect(await prisma.auditLog.count({ where: { actor: who.auth } })).toBe(0);
    });

    it('o. lan xac nhan ghi kiem toan tao vong chay / phan cong / them chang CUNG giao dich', async () => {
      const who = await anIntake();
      const assignment = await prisma.transportRunAssignment.findFirstOrThrow({
        where: { runId: who.intake.runId, effectiveTo: null },
      });
      expect(assignment.driverId).toBe(who.driverId);
      expect(assignment.assignedBy).toBe(who.auth);
      const intake = await prisma.transportRunSiteIntake.findUniqueOrThrow({
        where: { id: who.intake.intakeId },
      });
      expect(assignment.effectiveFrom.toISOString()).toBe(intake.confirmedAt.toISOString());

      const rows = await prisma.auditLog.findMany({
        where: { entityId: { in: [who.intake.runId, assignment.id, who.intake.legId] } },
      });
      const byAction = new Map(rows.map((row) => [row.action, row]));
      expect(rows).toHaveLength(3);
      expect(byAction.get('transport.run.create')).toMatchObject({
        entityType: 'TransportVehicleRun',
        entityId: who.intake.runId,
        actor: who.auth,
        after: expect.objectContaining({ code: who.intake.runCode, status: 'PLANNED' }),
      });
      expect(byAction.get('transport.run.assign')).toMatchObject({
        entityType: 'TransportRunAssignment',
        entityId: assignment.id,
        actor: who.auth,
      });
      expect(byAction.get('transport.run.leg.add')).toMatchObject({
        entityType: 'TransportRunLeg',
        entityId: who.intake.legId,
        actor: who.auth,
        after: expect.objectContaining({ kind: 'LOADED', orderId: null, sequence: 1 }),
      });
    });
  },
);
