import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { PrismaService } from '../../config/prisma.service.js';
import { withProtectedTriggersDisabled } from '../../it-trigger-cleanup.js';
import { PrismaCounterpartyRepository } from '../counterparty/prisma-counterparty.repository.js';
import { PrismaCounterpartySiteRepository } from '../counterparty/prisma-counterparty-site.repository.js';
import { CounterpartySiteService } from '../counterparty/site.service.js';
import { PrismaFleetRepository } from '../fleet/prisma-fleet.repository.js';
import { MovementService } from '../movement/movement.service.js';
import { PrismaMovementRepository } from '../movement/prisma-movement.repository.js';
import { PlanningService } from '../planning/planning.service.js';
import type { RunGrouping, TransportPlanningPolicy } from '../planning/planning.types.js';
import { PrismaRunPlanRepository } from '../planning/prisma-planning.repository.js';
import { PrismaGeofenceRepository } from '../proof/geofence.repository.js';
import { TransportDomainError } from '../transport.errors.js';
import { PrismaSiteIntakeCommercialStore } from './prisma-site-intake-commercial.store.js';
import { PrismaSiteIntakeConfirmationWriter } from './prisma-site-intake-confirmation.writer.js';
import { PrismaRunSiteIntakeRepository } from './prisma-site-intake.repository.js';
import { SiteIntakeCommercialService } from './site-intake-commercial.service.js';
import { SiteIntakePlanningPendingWorkSource } from './site-intake-composition.adapters.js';
import {
  TransportSiteIntakeCoreFactsAdapter,
  TransportSiteIntakeGeoFactsAdapter,
  TransportSiteIntakeLocationFacts,
  type SiteIntakeObservationFacts,
} from './site-intake-facts.port.js';
import { SiteIntakeReadinessReader } from './site-intake-readiness.reader.js';
import { SiteIntakeReviewService } from './site-intake-review.service.js';
import { SiteIntakeService } from './site-intake.service.js';
import type { SiteIntakeResult } from './site-intake.types.js';

/**
 * HAI LO HONG O TANG DB cua `#398`, do tren POSTGRES THAT.
 *
 * B13 — LAN NHAN VIEC TRUOC #398 VO HINH. Truoc migration `20260926100100_...` khong co bang thuong
 * mai; kho chi tao hang do LUOI trong mot lenh thuong mai. Ca hai cong chan nhan doi cua bo lap ke
 * hoach (khoa xe cua kho + `pendingWork` cua dich vu) va hang "Can xu ly" CHI doc bang do — nen mot
 * viec tai xe nhan con mo luc deploy khong duoc bao ve. Migration dien bu mot hang `PENDING` trong
 * cho DUNG viec con dang do. Bai nay chay CHINH cau lenh dien bu doc tu tep migration (giua hai dong
 * danh dau), tren nhung lan nhan viec duoc dua ve DUNG hinh dang truoc #398.
 *
 * B12 — CHANG DOI DON BANG HAI LENH THO (`X -> NULL`, roi `NULL -> Y`). Trigger
 * `transport_run_leg_order_binding_once` nay chi cho `X -> NULL` khi do CHINH khoa ngoai
 * `ON DELETE SET NULL` ghi (do sau trigger > 1).
 *
 * Chay bang `RUN_PRISMA_IT=1`; khong co bien do thi ca khoi khong chay.
 */

const PREFIX = 'IT-DDB';
const PLATE_PREFIX = `${PREFIX}-XE`;
const PHONE_PREFIX = '0966DB';
const PARTY_PREFIX = `${PREFIX} Phap nhan`;
const FENCE_PREFIX = `${PREFIX} Hang rao`;
const ACTOR_PREFIX = 'it-ddb';
const OFFICE = `${ACTOR_PREFIX}-van-phong`;
const CORE_POLICY = { timeZone: 'Asia/Ho_Chi_Minh' } as const;

/** TOA DO RIENG cua tep nay — khong dung chung voi demo hay spec khac. */
const ORIGIN = { latitude: 21.73, longitude: 106.73 };

const MIGRATION = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../prisma/migrations/20260926100100_transport_site_intake_commercial/migration.sql',
);
const BACKFILL_BEGIN = '-- >>> DIEN-BU-398 BAT-DAU >>>';
const BACKFILL_END = '-- <<< DIEN-BU-398 KET-THUC <<<';

/** CHINH cau lenh dien bu cua migration — doc tu tep, KHONG chep lai o day. */
function backfillStatement(): string {
  const text = readFileSync(MIGRATION, 'utf8');
  const begin = text.indexOf(BACKFILL_BEGIN);
  const end = text.indexOf(BACKFILL_END);
  if (begin < 0 || end < begin) {
    throw new Error('migration mat hai dong danh dau cua lan dien bu');
  }
  return text
    .slice(begin + BACKFILL_BEGIN.length, end)
    .trim()
    .replace(/;\s*$/, '');
}

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

const reasonOf = (settled: PromiseSettledResult<unknown>): string | null =>
  settled.status === 'rejected'
    ? settled.reason instanceof TransportDomainError
      ? settled.reason.reason
      : String(settled.reason)
    : null;

interface IntakeCase {
  readonly auth: string;
  readonly driverId: string;
  readonly vehicleId: string;
  readonly intake: SiteIntakeResult;
}

describe.runIf(process.env.RUN_PRISMA_IT === '1')(
  'dien bu phan thuong mai truoc #398 + chang gan don mot lan tren Postgres that',
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

    const stackFor = (grouping: RunGrouping) => {
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
        planning: new PlanningService(movement, planRepo, fleet, audit, CORE_POLICY, policy),
      };
    };
    const one = stackFor('ONE_ORDER_PER_RUN');
    const multi = stackFor('MULTI_ORDER_RUN');

    const backfill = backfillStatement();
    const runBackfill = (): Promise<number> => prisma.$executeRawUnsafe(backfill);

    let siteId = '';
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
        where: { code: { startsWith: PREFIX } },
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

    /** Lan nhan viec qua DUONG THAT cua san pham: tai xe bam, vi tri nam trong hang rao kho A. */
    const anIntake = async (): Promise<IntakeCase> => {
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

    /** Dau vet cua MOT xe: vong chay, chang, ke hoach. */
    const footprint = async (vehicleId: string) => {
      const runs = await prisma.transportVehicleRun.findMany({
        where: { vehicleId },
        select: { id: true, status: true },
        orderBy: { id: 'asc' },
      });
      const runIds = runs.map((run) => run.id);
      const legs = await prisma.transportRunLeg.findMany({
        where: { runId: { in: runIds } },
        select: { id: true, status: true, orderId: true },
        orderBy: { id: 'asc' },
      });
      const plans = await prisma.transportOrderRunPlan.count({ where: { runId: { in: runIds } } });
      return { runs, legs, plans };
    };

    const commercialRowsOf = (intakeId: string) =>
      prisma.transportSiteIntakeCommercial.findMany({ where: { intakeId } });

    /**
     * Dua lan nhan viec ve DUNG hinh dang truoc #398: khong co hang thuong mai (bang chua ton tai)
     * va `siteMatch` la `NULL` (cot vua duoc them, hang cu khong co gia tri). Hai trigger bao ve tat
     * trong MOT giao dich — mot lan ghi cua chinh bo test, khong phai mot duong cua san pham.
     */
    const simulatePre398 = (intakeIds: readonly string[]) =>
      withProtectedTriggersDisabled(
        prisma,
        [
          ['TransportSiteIntakeCommercial', 'transport_site_intake_commercial_guard'],
          ['TransportRunSiteIntake', 'transport_run_site_intake_append_only'],
        ],
        async (tx) => {
          await tx.transportSiteIntakeCommercial.deleteMany({
            where: { intakeId: { in: [...intakeIds] } },
          });
          await tx.transportRunSiteIntake.updateMany({
            where: { id: { in: [...intakeIds] } },
            data: { siteMatch: null },
          });
        },
      );

    /*
     * Moi truong hop truot DUNG MOT dieu kien cua bo loc dien bu, de mot lan "khong co hang" noi
     * dung ly do cua no, khong phai mot ly do khac tinh co cung dung.
     */
    let open: IntakeCase;
    let inTransit: IntakeCase;
    let gap: IntakeCase;
    let closedRun: IntakeCase;
    let cancelledLeg: IntakeCase;
    let completedLeg: IntakeCase;
    let bound: IntakeCase;
    let boundOrderId = '';

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

      // Con dang do: vong chay PLANNED, chang co hang PLANNED chua mang don.
      open = await anIntake();
      // Con dang do, xe DA lan banh: chang IN_TRANSIT, vong chay tu sang ACTIVE.
      inTransit = await anIntake();
      await movement.transitionLeg(inTransit.intake.legId, 'IN_TRANSIT', inTransit.auth);
      // Con dang do — dung cho doi chung am (lap ke hoach TRUOC dien bu).
      gap = await anIntake();
      // Vong chay da dong (huy); chang van PLANNED, chua mang don.
      closedRun = await anIntake();
      await movement.cancelRun(closedRun.intake.runId, 'IT vong chay da dong', OFFICE);
      // Chang da huy; vong chay van PLANNED.
      cancelledLeg = await anIntake();
      await movement.cancelLeg(cancelledLeg.intake.legId, 'IT chang da huy', OFFICE);
      // Chang da xong; vong chay van ACTIVE.
      completedLeg = await anIntake();
      await movement.transitionLeg(completedLeg.intake.legId, 'IN_TRANSIT', completedLeg.auth);
      await movement.transitionLeg(completedLeg.intake.legId, 'COMPLETED', completedLeg.auth);
      // Chang da mang don; vong chay + chang van mo.
      bound = await anIntake();
      boundOrderId = (await anOfficeOrder()).id;
      await one.commercial.bindExistingOrder({
        actor: OFFICE,
        intakeId: bound.intake.intakeId,
        orderId: boundOrderId,
      });

      await simulatePre398(
        [open, inTransit, gap, closedRun, cancelledLeg, completedLeg, bound].map(
          (entry) => entry.intake.intakeId,
        ),
      );
    }, 180_000);

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    }, 180_000);

    /* ================================================================ *
     * 0. HINH DANG TRUOC #398 — moi truong hop truot DUNG mot dieu kien
     * ================================================================ */

    it('0. lan nhan viec duoc dua ve hinh dang truoc #398, moi truong hop dung trang thai da dinh', async () => {
      const shape = async (who: IntakeCase) => {
        const intake = await prisma.transportRunSiteIntake.findUniqueOrThrow({
          where: { id: who.intake.intakeId },
        });
        const run = await prisma.transportVehicleRun.findUniqueOrThrow({
          where: { id: who.intake.runId },
        });
        const leg = await prisma.transportRunLeg.findUniqueOrThrow({
          where: { id: who.intake.legId },
        });
        return {
          commercial: (await commercialRowsOf(who.intake.intakeId)).length,
          siteMatch: intake.siteMatch,
          run: run.status,
          leg: `${leg.kind}/${leg.status}`,
          orderId: leg.orderId,
        };
      };
      const pre = { commercial: 0, siteMatch: null };

      expect(await shape(open)).toEqual({
        ...pre,
        run: 'PLANNED',
        leg: 'LOADED/PLANNED',
        orderId: null,
      });
      expect(await shape(gap)).toEqual({
        ...pre,
        run: 'PLANNED',
        leg: 'LOADED/PLANNED',
        orderId: null,
      });
      expect(await shape(inTransit)).toEqual({
        ...pre,
        run: 'ACTIVE',
        leg: 'LOADED/IN_TRANSIT',
        orderId: null,
      });
      expect(await shape(closedRun)).toEqual({
        ...pre,
        run: 'CANCELLED',
        leg: 'LOADED/PLANNED',
        orderId: null,
      });
      expect(await shape(cancelledLeg)).toEqual({
        ...pre,
        run: 'PLANNED',
        leg: 'LOADED/CANCELLED',
        orderId: null,
      });
      expect(await shape(completedLeg)).toEqual({
        ...pre,
        run: 'ACTIVE',
        leg: 'LOADED/COMPLETED',
        orderId: null,
      });
      expect(await shape(bound)).toEqual({
        ...pre,
        run: 'PLANNED',
        leg: 'LOADED/PLANNED',
        orderId: boundOrderId,
      });
    });

    /* ================================================================ *
     * a. DOI CHUNG AM — truoc dien bu, viec dang do VO HINH
     * ================================================================ */

    it('a. truoc dien bu: viec dang do khong vao "Can xu ly", va lap ke hoach cho xe do SINH vong chay thu hai', async () => {
      expect(await store.listPendingForVehicle(open.vehicleId)).toEqual([]);
      expect(await one.pendingWork.pendingIntakeForVehicle(open.vehicleId)).toBeNull();
      expect(
        (await one.review.listNeedsReview()).some((fact) => fact.intakeId === open.intake.intakeId),
      ).toBe(false);

      // Chinh lo hong B13: xe `gap` dang giu viec tai xe nhan, van phong lap ke hoach don moi -> R2/L2.
      const before = await footprint(gap.vehicleId);
      const order = await anOfficeOrder();
      await one.planning.commit(
        order.id,
        { vehicleId: gap.vehicleId, idempotencyKey: `${PREFIX}-lo-hong` },
        OFFICE,
      );
      const after = await footprint(gap.vehicleId);
      expect(before.runs).toHaveLength(1);
      expect(after.runs).toHaveLength(2);
      expect(after.legs.filter((leg) => leg.orderId === order.id)).toHaveLength(1);
    });

    /* ================================================================ *
     * b + c. DIEN BU — dung, trong, va chay lai khong doi
     * ================================================================ */

    let backfilled: Awaited<ReturnType<typeof commercialRowsOf>> = [];

    it('b. dien bu: DUNG mot hang PENDING trong cho viec con dang do; viec da dong/huy/xong/gan don khong co hang', async () => {
      expect(backfill).toMatch(/^INSERT INTO "TransportSiteIntakeCommercial"/);

      const inserted = await runBackfill();
      expect(inserted).toBeGreaterThanOrEqual(3);

      backfilled = [];
      for (const who of [open, inTransit, gap]) {
        const rows = await commercialRowsOf(who.intake.intakeId);
        expect(rows).toHaveLength(1);
        const [row] = rows;
        expect(row).toMatchObject({
          intakeId: who.intake.intakeId,
          status: 'PENDING',
          destinationLabel: null,
          destinationLatitude: null,
          destinationLongitude: null,
          destinationSource: null,
          destinationRef: null,
          destinationSetBy: null,
          destinationSetByRole: null,
          destinationSetAt: null,
          destinationEventId: null,
          originAttestedBy: null,
          originAttestedAt: null,
          orderId: null,
          bindingMode: null,
          boundBy: null,
          boundAt: null,
          exceptionReason: null,
          exceptionOutcome: null,
          exceptionBy: null,
          exceptionAt: null,
          exceptionKey: null,
        });
        expect(row?.createdAt).toBeInstanceOf(Date);
        expect(row?.updatedAt).toBeInstanceOf(Date);
        backfilled.push(...rows);
      }

      for (const who of [closedRun, cancelledLeg, completedLeg, bound]) {
        expect(await commercialRowsOf(who.intake.intakeId)).toEqual([]);
      }

      // Lan dien bu KHONG sua ban ghi xac nhan: `siteMatch` van la "khong biet".
      const matches = await prisma.transportRunSiteIntake.findMany({
        where: { id: { in: [open, inTransit, gap].map((who) => who.intake.intakeId) } },
        select: { siteMatch: true },
      });
      expect(matches.map((row) => row.siteMatch)).toEqual([null, null, null]);
    });

    it('c. chay lai lan dien bu: khong chen them hang nao, hang cu giu nguyen', async () => {
      expect(backfilled).toHaveLength(3);

      expect(await runBackfill()).toBe(0);

      const again: typeof backfilled = [];
      for (const who of [open, inTransit, gap]) {
        again.push(...(await commercialRowsOf(who.intake.intakeId)));
      }
      expect(again).toEqual(backfilled);
      for (const who of [closedRun, cancelledLeg, completedLeg, bound]) {
        expect(await commercialRowsOf(who.intake.intakeId)).toEqual([]);
      }
    });

    /* ================================================================ *
     * d. SAU DIEN BU — hai cong cua bo lap ke hoach thay viec cu
     * ================================================================ */

    it.each([
      ['ONE_ORDER_PER_RUN', one],
      ['MULTI_ORDER_RUN', multi],
    ] as const)(
      'd. sau dien bu: lap ke hoach don moi cho xe dang giu viec cu (%s) -> PLAN_VEHICLE_HAS_PENDING_SITE_INTAKE, khong R2/L2',
      async (_grouping, stack) => {
        const order = await anOfficeOrder();
        const before = await footprint(open.vehicleId);

        // Cong DUOI khoa xe cua kho (khong `pendingWork`), roi cong cua dich vu (`pendingWork`).
        const settled = await Promise.allSettled([
          stack.planning.commit(
            order.id,
            { vehicleId: open.vehicleId, idempotencyKey: `${PREFIX}-kho-${stack.grouping}` },
            OFFICE,
          ),
        ]);
        const viaService = await Promise.allSettled([
          stack.planning.commit(
            order.id,
            {
              vehicleId: open.vehicleId,
              idempotencyKey: `${PREFIX}-dich-vu-${stack.grouping}`,
              pendingWork: stack.pendingWork,
            },
            OFFICE,
          ),
        ]);

        expect(reasonOf(settled[0] as PromiseSettledResult<unknown>)).toBe(
          'PLAN_VEHICLE_HAS_PENDING_SITE_INTAKE',
        );
        expect(reasonOf(viaService[0] as PromiseSettledResult<unknown>)).toBe(
          'PLAN_VEHICLE_HAS_PENDING_SITE_INTAKE',
        );
        expect(await footprint(open.vehicleId)).toEqual(before);
        expect(before.runs).toHaveLength(1);
        expect(before.legs).toHaveLength(1);
        expect(await prisma.transportRunLeg.count({ where: { orderId: order.id } })).toBe(0);
        expect(await prisma.transportOrderRunPlan.count({ where: { orderId: order.id } })).toBe(0);
      },
    );

    /* ================================================================ *
     * e. SAU DIEN BU — "Can xu ly" liet ke viec cu, KHONG gi tu dong
     * ================================================================ */

    it('e. sau dien bu: "Can xu ly" liet ke viec cu voi ORIGIN_LOCATION_UNVERIFIED; van phong bo sung, khong gi tu dong', async () => {
      const pending = await store.listByStatus('PENDING', 200);
      expect(pending.map((row) => row.intakeId)).toEqual(
        expect.arrayContaining([open.intake.intakeId, inTransit.intake.intakeId]),
      );

      const queue = await one.review.listNeedsReview();
      expect(queue.find((fact) => fact.intakeId === open.intake.intakeId)).toMatchObject({
        vehicleId: open.vehicleId,
        runId: open.intake.runId,
        reasons: ['DESTINATION_MISSING', 'ORIGIN_LOCATION_UNVERIFIED'],
      });
      for (const who of [closedRun, cancelledLeg, completedLeg, bound]) {
        expect(queue.some((fact) => fact.intakeId === who.intake.intakeId)).toBe(false);
      }

      const detail = await one.review.detail(open.intake.intakeId);
      expect(detail).toMatchObject({
        status: 'PENDING',
        location: { siteMatch: null },
        destination: null,
        originAttestedAt: null,
        order: null,
        readiness: { kind: 'NEEDS_REVIEW' },
        actions: { canSetDestination: true, canAttestOrigin: true, canBindExistingOrder: true },
      });

      expect(await one.pendingWork.pendingIntakeForVehicle(open.vehicleId)).toMatchObject({
        intakeId: open.intake.intakeId,
      });
      expect(await one.pendingWork.pendingIntakeForVehicle(bound.vehicleId)).toBeNull();
    });

    /* ================================================================ *
     * f. B12 — chang gan don MOT lan: `X -> NULL` chi qua khoa ngoai SET NULL
     * ================================================================ */

    describe('f. chang gan don mot lan o tang DB', () => {
      const legOrder = async (legId: string) =>
        (await prisma.transportRunLeg.findUniqueOrThrow({ where: { id: legId } })).orderId;

      it('X -> NULL viet tay bi tu choi: lenh tho, khoi DO, va lan gan lai hai buoc X -> NULL -> Y', async () => {
        const legId = bound.intake.legId;
        const other = await anOfficeOrder();

        await expect(
          prisma.$executeRaw`UPDATE "TransportRunLeg" SET "orderId" = NULL WHERE "id" = ${legId}`,
        ).rejects.toThrow(/transport_run_leg_order_binding_once: .* khong go don khoi chang/);

        // `DO` chay o do sau 1 nhu moi lenh tho — khong phai mot cua sau.
        await expect(
          prisma.$executeRawUnsafe(
            `DO $$ BEGIN UPDATE "TransportRunLeg" SET "orderId" = NULL WHERE "id" = '${legId}'; END $$`,
          ),
        ).rejects.toThrow(/transport_run_leg_order_binding_once/);

        await expect(
          prisma.$transaction(async (tx) => {
            await tx.$executeRaw`UPDATE "TransportRunLeg" SET "orderId" = NULL WHERE "id" = ${legId}`;
            await tx.$executeRaw`UPDATE "TransportRunLeg" SET "orderId" = ${other.id} WHERE "id" = ${legId}`;
          }),
        ).rejects.toThrow(/transport_run_leg_order_binding_once/);

        expect(await legOrder(legId)).toBe(boundOrderId);
        expect(await prisma.transportRunLeg.count({ where: { orderId: other.id } })).toBe(0);
      });

      it('xoa cung mot don dang nam tren chang -> khoa ngoai ON DELETE SET NULL van ghi NULL duoc', async () => {
        const who = await aDriver();
        const order = await anOfficeOrder();
        const run = await movement.createRun(
          {
            code: `${PREFIX}-RUN-${++suffix}`,
            vehicleId: who.vehicleId,
            businessDate: '2026-09-26',
            note: null,
          },
          OFFICE,
        );
        const leg = await movement.addLeg(
          run.id,
          {
            sequence: 1,
            kind: 'LOADED',
            orderId: order.id,
            originLabel: `${PREFIX} Kho A`,
            destinationLabel: `${PREFIX} Bai B`,
            businessDate: '2026-09-26',
            distanceKm: null,
            note: null,
          },
          OFFICE,
        );
        expect(leg.orderId).toBe(order.id);

        // Don thuong (khong qua lan nhan viec): lenh tho van bi chan.
        await expect(
          prisma.$executeRaw`UPDATE "TransportRunLeg" SET "orderId" = NULL WHERE "id" = ${leg.id}`,
        ).rejects.toThrow(/transport_run_leg_order_binding_once/);
        expect(await legOrder(leg.id)).toBe(order.id);

        // Duong con lai: Postgres ghi `NULL` qua khoa ngoai khi don bi xoa (reset demo di dung duong nay).
        await prisma.transportOrder.delete({ where: { id: order.id } });

        const after = await prisma.transportRunLeg.findUniqueOrThrow({ where: { id: leg.id } });
        expect(after).toMatchObject({
          runId: run.id,
          kind: 'LOADED',
          status: 'PLANNED',
          orderId: null,
        });
        expect(await prisma.transportOrder.count({ where: { id: order.id } })).toBe(0);
      });
    });
  },
);
