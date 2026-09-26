import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { PrismaService } from '../../config/prisma.service.js';
import { withProtectedTriggersDisabled } from '../../it-trigger-cleanup.js';
import { PrismaCounterpartyRepository } from '../counterparty/prisma-counterparty.repository.js';
import { PrismaCounterpartySiteRepository } from '../counterparty/prisma-counterparty-site.repository.js';
import { CounterpartySiteService } from '../counterparty/site.service.js';
import { PrismaFleetRepository } from '../fleet/prisma-fleet.repository.js';
import { PlanningService } from '../planning/planning.service.js';
import type { TransportPlanningPolicy } from '../planning/planning.types.js';
import { PrismaRunPlanRepository } from '../planning/prisma-planning.repository.js';
import { PrismaGeofenceRepository } from '../proof/geofence.repository.js';
import { PrismaSiteIntakeCommercialStore } from '../site-intake/prisma-site-intake-commercial.store.js';
import { PrismaSiteIntakeConfirmationWriter } from '../site-intake/prisma-site-intake-confirmation.writer.js';
import { PrismaRunSiteIntakeRepository } from '../site-intake/prisma-site-intake.repository.js';
import { SiteIntakeCommercialService } from '../site-intake/site-intake-commercial.service.js';
import { SiteIntakePlanningPendingWorkSource } from '../site-intake/site-intake-composition.adapters.js';
import {
  TransportSiteIntakeCoreFactsAdapter,
  TransportSiteIntakeGeoFactsAdapter,
  TransportSiteIntakeLocationFacts,
  type SiteIntakeObservationFacts,
} from '../site-intake/site-intake-facts.port.js';
import { SiteIntakeReadinessReader } from '../site-intake/site-intake-readiness.reader.js';
import { SiteIntakeReviewService } from '../site-intake/site-intake-review.service.js';
import { SiteIntakeService } from '../site-intake/site-intake.service.js';
import { TransportDomainError } from '../transport.errors.js';
import { MovementService, type AddLegCommand } from './movement.service.js';
import { PrismaMovementRepository, lockOrderPlan } from './prisma-movement.repository.js';

/**
 * DON DA NHAN VIEC TAI XE KHONG LEN CHANG CO HANG THU HAI — `#398`, tren POSTGRES THAT.
 *
 * Ban trong bo nho chung minh LUAT (`movement.service.spec.ts` MV-013). Tep nay chung minh cai chi
 * Postgres co: cong nam DUOI khoa tu van cua don (`orderPlanLockKey`), cung khoa ma lenh gan don co
 * san gianh — nen "gan don vao viec tai xe" va "trinh sua tay them chang co hang cho don do" xep hang
 * va dung MOT ben thang. Kem doi chieu diem lay cua don co san (`ORDER_ORIGIN_MISMATCH`) tren kho
 * Prisma — cong do doc dia diem trong giao dich `withIntake`.
 *
 * Chay bang `RUN_PRISMA_IT=1`. Dem theo xe/don cua CHINH tep nay, khong so toan cuc.
 */

const PREFIX = 'IT-DDF';
const PLATE_PREFIX = `${PREFIX}-XE`;
const PHONE_PREFIX = '0966DF';
const PARTY_PREFIX = `${PREFIX} Phap nhan`;
const FENCE_PREFIX = `${PREFIX} Hang rao`;
const ACTOR_PREFIX = 'it-ddf';
const OFFICE = `${ACTOR_PREFIX}-van-phong`;
const CORE_POLICY = { timeZone: 'Asia/Ho_Chi_Minh' } as const;

/** TOA DO RIENG cua tep nay — khong trung hang rao cua spec nao khac chay song song. */
const ORIGIN = { latitude: 21.61, longitude: 106.61 };
const DESTINATION = { latitude: 21.64, longitude: 106.66 };
/** ~2 km ve phia bac kho A — ngoai dung sai doi chieu diem lay. */
const FAR_FROM_ORIGIN = { latitude: 21.628, longitude: 106.61 };

const PLANNING_POLICY: TransportPlanningPolicy = {
  grouping: 'ONE_ORDER_PER_RUN',
  depots: [{ code: `${PREFIX}-DEPOT`, label: `${PREFIX} Bai xe` }],
  closure: { idleHours: null },
  sweep: { intervalSeconds: 60, batchSize: 50 },
};

class NoLocationFacts extends TransportSiteIntakeLocationFacts {
  async findObservation(): Promise<SiteIntakeObservationFacts | null> {
    return null;
  }
}

const reasonOf = (settled: PromiseSettledResult<unknown>): string | null =>
  settled.status === 'rejected'
    ? settled.reason instanceof TransportDomainError
      ? settled.reason.reason
      : String(settled.reason)
    : null;

describe.runIf(process.env.RUN_PRISMA_IT === '1')(
  'don da nhan viec tai xe khong len chang co hang thu hai — Postgres that (#398)',
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
    const reader = new SiteIntakeReadinessReader(core, geo, PLANNING_POLICY);
    const commercial = new SiteIntakeCommercialService(store, intakes, core, geo, reader);
    const review = new SiteIntakeReviewService(
      store,
      intakes,
      movementRepo,
      planRepo,
      core,
      reader,
    );
    const planning = new PlanningService(
      movement,
      planRepo,
      fleet,
      audit,
      CORE_POLICY,
      PLANNING_POLICY,
    );
    const pendingWork = new SiteIntakePlanningPendingWorkSource(review);

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
        select: { orderId: true },
      });
      const intakeIds = (
        await prisma.transportRunSiteIntake.findMany({
          where: { runId: { in: runIds } },
          select: { id: true },
        })
      ).map((row) => row.id);
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
      return { auth, vehicleId: vehicle.id };
    };

    /** Tai xe bam "Nhan chuyen tai day" TRONG hang rao kho A. */
    const anIntake = async () => {
      const who = await aDriver();
      const intake = await intakeService.confirm({
        authUserId: who.auth,
        siteId,
        clientEventId: 'cham-mot',
        latitude: ORIGIN.latitude,
        longitude: ORIGIN.longitude,
        accuracyMetres: 10,
      });
      return { ...who, intake };
    };

    /** Mot vong chay LAP TAY (trinh sua van phong) tren mot xe rieng. */
    const aManualRun = async () => {
      const who = await aDriver();
      return movement.createRun(
        { code: `${PREFIX}-RUN-${++suffix}`, vehicleId: who.vehicleId, businessDate: '2026-09-26' },
        OFFICE,
      );
    };

    const anOfficeOrder = (originPoint?: { latitude: number; longitude: number }) =>
      movement.createOrder(
        {
          code: `${PREFIX}-ORD-${++suffix}`,
          originLabel: `${PREFIX} Kho A`,
          destinationLabel: `${PREFIX} Bai B`,
          businessDate: '2026-09-26',
          ...(originPoint ? { originPoint, destinationPoint: DESTINATION } : {}),
        },
        OFFICE,
      );

    const loadedLeg = (orderId: string | null, sequence = 1): AddLegCommand => ({
      sequence,
      kind: 'LOADED',
      orderId,
      originLabel: `${PREFIX} Kho A`,
      destinationLabel: `${PREFIX} Bai B`,
    });

    const liveLoadedLegsOf = (orderId: string) =>
      prisma.transportRunLeg.count({
        where: { orderId, kind: 'LOADED', status: { not: 'CANCELLED' } },
      });

    /* ---------------------------------------------------------------- *
     * Cong o kho Prisma
     * ---------------------------------------------------------------- */

    it('don TU TAO tu viec tai xe: chang co hang thu hai (vong chay khac hoac chinh vong chay do) -> 409, khong ghi gi', async () => {
      const { auth, intake } = await anIntake();
      const outcome = await commercial.chooseDestinationAsDriver({
        authUserId: auth,
        intakeId: intake.intakeId,
        clientEventId: 'diem-giao-1',
        choice: { kind: 'KNOWN_PLACE', placeId: destinationPlaceId },
      });
      expect(outcome).toMatchObject({ status: 'ORDER_BOUND', bindingMode: 'AUTO_CREATED' });
      const orderId = outcome.orderId ?? '';
      const manualRun = await aManualRun();

      const results = await Promise.allSettled([
        movement.addLeg(manualRun.id, loadedLeg(orderId), OFFICE),
        movement.addLeg(intake.runId, loadedLeg(orderId, 2), OFFICE),
      ]);
      for (const settled of results) {
        expect(reasonOf(settled)).toBe('LEG_ORDER_ADOPTED_BY_SITE_INTAKE');
        expect(settled.status === 'rejected' && (settled.reason as TransportDomainError).kind).toBe(
          'CONFLICT',
        );
      }
      expect(await liveLoadedLegsOf(orderId)).toBe(1);
      expect(await prisma.transportRunLeg.count({ where: { runId: manualRun.id } })).toBe(0);
    });

    /* ---------------------------------------------------------------- *
     * Van phong huy ke hoach ADOPTED — cong chan chang THU HAI, khong chan chang THAY THE
     * ---------------------------------------------------------------- */

    const anAutoOrder = async () => {
      const who = await anIntake();
      const outcome = await commercial.chooseDestinationAsDriver({
        authUserId: who.auth,
        intakeId: who.intake.intakeId,
        clientEventId: 'diem-giao-1',
        choice: { kind: 'KNOWN_PLACE', placeId: destinationPlaceId },
      });
      const orderId = outcome.orderId ?? '';
      const plan = await planRepo.findActiveForOrder(orderId);
      return { ...who, orderId, planId: plan?.id ?? '' };
    };

    it('xe CHUA chay: huy ke hoach ADOPTED roi lap lai cho xe khac -> DUNG mot chang co hang song, khong vong chay mo coi', async () => {
      const { intake, orderId, planId } = await anAutoOrder();
      await planning.cancelPlan(planId, 'Doi xe khac', OFFICE);
      expect(
        (await prisma.transportRunLeg.findUnique({ where: { id: intake.legId } }))?.status,
      ).toBe('CANCELLED');
      const other = await aDriver();

      const replanned = await planning.commit(
        orderId,
        { vehicleId: other.vehicleId, idempotencyKey: `${PREFIX}-lai-${++suffix}`, pendingWork },
        OFFICE,
      );

      expect(await liveLoadedLegsOf(orderId)).toBe(1);
      expect(replanned.plan.loadedLegId).not.toBe(intake.legId);
      expect(replanned.run.vehicleId).toBe(other.vehicleId);
    });

    it('xe DA chay: huy ke hoach ADOPTED roi lap lai -> LEG_ORDER_ADOPTED_BY_SITE_INTAKE TRUOC moi lan ghi', async () => {
      const { auth, intake, orderId, planId } = await anAutoOrder();
      await movement.transitionLeg(intake.legId, 'IN_TRANSIT', auth);
      // Chang dang chay thi `cancelPlan` giu nguyen chang, chi huy ke hoach.
      await planning.cancelPlan(planId, 'Nham ke hoach', OFFICE);
      const other = await aDriver();

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const [settled] = await Promise.allSettled([
          planning.commit(
            orderId,
            {
              vehicleId: other.vehicleId,
              idempotencyKey: `${PREFIX}-lai-${++suffix}`,
              pendingWork,
            },
            OFFICE,
          ),
        ]);
        expect(reasonOf(settled as PromiseSettledResult<unknown>)).toBe(
          'LEG_ORDER_ADOPTED_BY_SITE_INTAKE',
        );
      }
      expect(
        await prisma.transportVehicleRun.count({ where: { vehicleId: other.vehicleId } }),
      ).toBe(0);
      expect(await liveLoadedLegsOf(orderId)).toBe(1);
      expect(
        (await prisma.transportRunLeg.findUnique({ where: { id: intake.legId } }))?.status,
      ).toBe('IN_TRANSIT');
    });

    it('trinh sua tay khong doi nghia gi khac: don khac, chang chua co don, chang rong van them duoc', async () => {
      const manualRun = await aManualRun();
      const other = await anOfficeOrder();

      await movement.addLeg(manualRun.id, loadedLeg(other.id, 1), OFFICE);
      await movement.addLeg(manualRun.id, loadedLeg(null, 2), OFFICE);
      await movement.addLeg(
        manualRun.id,
        { sequence: 3, kind: 'EMPTY', originLabel: 'x', destinationLabel: 'y' },
        OFFICE,
      );
      const legs = await movementRepo.listLegs(manualRun.id);
      expect(legs.map((leg) => [leg.kind, leg.orderId])).toEqual([
        ['LOADED', other.id],
        ['LOADED', null],
        ['EMPTY', null],
      ]);
    });

    it('chang co hang cho mot don XEP HANG sau khoa tu van cua chinh don do', async () => {
      const manualRun = await aManualRun();
      const order = await anOfficeOrder();

      let release = (): void => {};
      const released = new Promise<void>((resolve) => {
        release = resolve;
      });
      let held = (): void => {};
      const lockHeld = new Promise<void>((resolve) => {
        held = resolve;
      });
      const holder = prisma.$transaction(
        async (tx: unknown) => {
          await lockOrderPlan(tx, order.id);
          held();
          await released;
        },
        { maxWait: 10_000, timeout: 30_000 },
      );
      await lockHeld;

      // Bat ket cuc NGAY — mot rejection som khong duoc thanh Unhandled Rejection.
      let settled = false;
      const adding = movement.addLeg(manualRun.id, loadedLeg(order.id), OFFICE).then(
        (leg) => {
          settled = true;
          return leg;
        },
        (error: unknown) => {
          settled = true;
          throw error;
        },
      );
      await new Promise((resolve) => setTimeout(resolve, 750));
      expect(settled).toBe(false);
      expect(await liveLoadedLegsOf(order.id)).toBe(0);

      release();
      await holder;
      const leg = await adding;
      expect(leg.orderId).toBe(order.id);
    });

    it('gan don co san vs trinh sua tay CUNG MOT don, cung luc: dung MOT ben thang, dung MOT chang co hang', async () => {
      for (let round = 0; round < 3; round += 1) {
        const { intake } = await anIntake();
        const manualRun = await aManualRun();
        const order = await anOfficeOrder();

        const [bound, added] = await Promise.allSettled([
          commercial.bindExistingOrder({
            actor: OFFICE,
            intakeId: intake.intakeId,
            orderId: order.id,
          }),
          movement.addLeg(manualRun.id, loadedLeg(order.id), OFFICE),
        ]);

        const bindWon = bound.status === 'fulfilled';
        const addWon = added.status === 'fulfilled';
        expect(bindWon !== addWon).toBe(true);
        if (bindWon) {
          expect(reasonOf(added)).toBe('LEG_ORDER_ADOPTED_BY_SITE_INTAKE');
        } else {
          // Chang tay thang: lenh gan doc `liveLegCount > 0` DUOI khoa don.
          expect(reasonOf(bound)).toBe('SITE_INTAKE_BINDING_DENIED');
          expect(
            (
              await prisma.transportSiteIntakeCommercial.findUnique({
                where: { intakeId: intake.intakeId },
                select: { status: true, orderId: true },
              })
            )?.status,
          ).toBe('PENDING');
        }
        expect(await liveLoadedLegsOf(order.id)).toBe(1);
      }
    }, 120_000);

    /* ---------------------------------------------------------------- *
     * Doi chieu diem lay cua don co san — kho Prisma
     * ---------------------------------------------------------------- */

    it('don co san lay hang o NOI KHAC: khong nam trong danh sach, gan thi SITE_INTAKE_ORDER_ORIGIN_MISMATCH, khong ghi gi', async () => {
      const { intake } = await anIntake();
      const far = await anOfficeOrder(FAR_FROM_ORIGIN);
      const near = await anOfficeOrder(ORIGIN);

      const listed = (await review.bindableOrders(intake.intakeId)).map((order) => order.id);
      expect(listed).toContain(near.id);
      expect(listed).not.toContain(far.id);

      const [denied] = await Promise.allSettled([
        commercial.bindExistingOrder({ actor: OFFICE, intakeId: intake.intakeId, orderId: far.id }),
      ]);
      expect(reasonOf(denied)).toBe('SITE_INTAKE_ORDER_ORIGIN_MISMATCH');
      expect(await liveLoadedLegsOf(far.id)).toBe(0);
      expect(await planRepo.findActiveForOrder(far.id)).toBeNull();
      expect((await movementRepo.findLeg(intake.legId))?.orderId).toBeNull();

      const bound = await commercial.bindExistingOrder({
        actor: OFFICE,
        intakeId: intake.intakeId,
        orderId: near.id,
      });
      expect(bound).toMatchObject({ status: 'ORDER_BOUND', orderId: near.id, bound: true });
      expect((await movementRepo.findLeg(intake.legId))?.orderId).toBe(near.id);
    });
  },
);
