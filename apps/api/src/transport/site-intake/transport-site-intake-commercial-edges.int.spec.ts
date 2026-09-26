import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { PrismaService } from '../../config/prisma.service.js';
import { withProtectedTriggersDisabled } from '../../it-trigger-cleanup.js';
import {
  TransportCheckpointCoreFactsAdapter,
  TransportCheckpointLocationFacts,
} from '../checkpoint/checkpoint-facts.port.js';
import { CheckpointService } from '../checkpoint/checkpoint.service.js';
import type { RunCheckpointType } from '../checkpoint/checkpoint.types.js';
import { PrismaCheckpointRepository } from '../checkpoint/prisma-checkpoint.repository.js';
import { PrismaCounterpartyRepository } from '../counterparty/prisma-counterparty.repository.js';
import { PrismaCounterpartySiteRepository } from '../counterparty/prisma-counterparty-site.repository.js';
import { CounterpartySiteService } from '../counterparty/site.service.js';
import { PrismaFleetRepository } from '../fleet/prisma-fleet.repository.js';
import { MovementService } from '../movement/movement.service.js';
import { PrismaMovementRepository } from '../movement/prisma-movement.repository.js';
import { MovementRunWriteGuard } from '../movement/run-write-guard.port.js';
import { PlanningService } from '../planning/planning.service.js';
import type { TransportPlanningPolicy } from '../planning/planning.types.js';
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
 * VIEC TAI XE NHAN TRUC TIEP -> DON TU DONG: CAC CANH tren POSTGRES THAT — `#398`.
 *
 * Tep anh em cua `transport-site-intake-commercial.int.spec.ts`. Bon canh ma tep kia chua dong:
 *
 *   a. gan tay mot don DA co cho o (ke hoach hieu luc / chang song) tren XE KHAC -> tu choi co ma,
 *      khong mot hang nao doi;
 *   b. bao bat thuong tren don DA `FULFILLED` qua vong doi da chap nhan -> chi GHI NHAN, don giu
 *      nguyen, viec van hanh giu nguyen — ke ca khi xe chua lan banh; ly do trong bi DB chan;
 *   c. xe lan banh duoc CHUNG MINH bang MOC hien truong (khong phai bang trang thai chang) -> chi
 *      huy phan THUONG MAI, vong chay / chang / moc o nguyen tung hang;
 *   d. dau vet kiem toan cua mot lan tu tao don: hang nao mang nguon, lai xe, xe, dia diem, lan
 *      nhan viec — khang dinh DUNG cai kho ghi.
 *
 * Tien to `IT-DDE` / dien thoai `0977DE` / toa do rieng: khong tien to nao o day la tien to cua tep
 * khac (don dep dung `startsWith`), va hang rao cua tep kia khong nam trong ban kinh cua hang rao o
 * day (hai tep chay song song tren cung CSDL).
 *
 * Chay bang `RUN_PRISMA_IT=1`; khong co bien do thi ca khoi khong chay.
 */

const PREFIX = 'IT-DDE';
const PLATE_PREFIX = `${PREFIX}-XE`;
const PHONE_PREFIX = '0977DE';
const PARTY_PREFIX = `${PREFIX} Phap nhan`;
const FENCE_PREFIX = `${PREFIX} Hang rao`;
const ACTOR_PREFIX = 'it-dde';
const OFFICE = `${ACTOR_PREFIX}-van-phong`;
const BOSS = `${ACTOR_PREFIX}-giam-doc`;
const CORE_POLICY = { timeZone: 'Asia/Ho_Chi_Minh' } as const;

/** TOA DO RIENG cua tep nay — cach hang rao cua `IT-DDO` (21.35, 106.35) hang chuc km. */
const ORIGIN = { latitude: 21.4321, longitude: 106.4567 };
const DESTINATION = { latitude: 21.4521, longitude: 106.4967 };

const PLANNING_POLICY: TransportPlanningPolicy = {
  grouping: 'ONE_ORDER_PER_RUN',
  depots: [{ code: `${PREFIX}-DEPOT`, label: `${PREFIX} Bai xe` }],
  closure: { idleHours: null },
  sweep: { intervalSeconds: 60, batchSize: 50 },
};

const PROTECTED_TRIGGERS = [
  ['TransportSiteIntakeCommercial', 'transport_site_intake_commercial_guard'],
  ['TransportRunSiteIntake', 'transport_run_site_intake_append_only'],
  ['TransportRunCheckpoint', 'transport_run_checkpoint_append_only'],
] as const;

class NoLocationFacts extends TransportSiteIntakeLocationFacts {
  async findObservation(): Promise<SiteIntakeObservationFacts | null> {
    return null;
  }
}

class NoCheckpointLocation extends TransportCheckpointLocationFacts {
  async findObservation(): Promise<null> {
    return null;
  }
}

/** Nguyen loi mien — de khang dinh ca MA lan LOAI (-> ma HTTP). */
const domainErrorOf = async (work: Promise<unknown>): Promise<TransportDomainError> => {
  try {
    await work;
  } catch (error) {
    if (error instanceof TransportDomainError) return error;
    throw error;
  }
  throw new Error('khong nem loi nao ca');
};

describe.runIf(process.env.RUN_PRISMA_IT === '1')(
  'viec tai xe nhan truc tiep -> don tu dong: cac canh tren Postgres that (#398)',
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
    const pendingWork = new SiteIntakePlanningPendingWorkSource(review);
    const planning = new PlanningService(
      movement,
      planRepo,
      fleet,
      audit,
      CORE_POLICY,
      PLANNING_POLICY,
    );
    /** Bo `transport-checkpoint` THAT — kho Prisma, khoa vong chay that; chinh sach vi tri RONG. */
    const checkpoints = new CheckpointService(
      new PrismaCheckpointRepository(prisma),
      new TransportCheckpointCoreFactsAdapter(movementRepo, fleet),
      new NoCheckpointLocation(),
      new MovementRunWriteGuard(movementRepo),
      CORE_POLICY,
      { locationRequiredTypes: [] },
    );

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

      if (runIds.length > 0) {
        await withProtectedTriggersDisabled(prisma, PROTECTED_TRIGGERS, async (tx) => {
          await tx.transportRunCheckpoint.deleteMany({ where: { runId: { in: runIds } } });
          await tx.transportSiteIntakeCommercial.deleteMany({
            where: { intakeId: { in: intakeIds } },
          });
          await tx.transportRunSiteIntake.deleteMany({ where: { id: { in: intakeIds } } });
        });
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

      const party = await counterparties.create({ name: `${PARTY_PREFIX} XYZ` });
      siteId = (
        await sites.create({
          counterpartyId: party.id,
          name: 'Kho E',
          address: null,
          note: null,
          status: 'ACTIVE',
          recordedBy: OFFICE,
        })
      ).id;
      await geofences.register({
        label: `${FENCE_PREFIX} Kho E`,
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
          label: `${FENCE_PREFIX} Bai F`,
          subjectKind: 'DEPOT',
          subjectId: `${PREFIX}-BAI-F`,
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

    /** Tai xe bam "Nhan chuyen tai day", vi tri NAM TRONG hang rao kho E. */
    const anIntake = async () => {
      const who = await aDriver();
      const intake: SiteIntakeResult = await intakeService.confirm({
        authUserId: who.auth,
        siteId,
        clientEventId: `cham-${suffix}`,
        latitude: ORIGIN.latitude,
        longitude: ORIGIN.longitude,
        accuracyMetres: 10,
      });
      return { ...who, intake };
    };

    /** Tai xe chon diem giao da biet -> du dieu kien -> he thong TU tao don. */
    const anAutoOrder = async () => {
      const who = await anIntake();
      const outcome = await commercial.chooseDestinationAsDriver({
        authUserId: who.auth,
        intakeId: who.intake.intakeId,
        clientEventId: `diem-giao-${suffix}`,
        choice: { kind: 'KNOWN_PLACE', placeId: destinationPlaceId },
      });
      expect(outcome).toMatchObject({ status: 'ORDER_BOUND', bindingMode: 'AUTO_CREATED' });
      if (outcome.orderId === null) throw new Error('khong tu tao duoc don');
      return { ...who, orderId: outcome.orderId };
    };

    const anOfficeOrder = () =>
      movement.createOrder(
        {
          code: `${PREFIX}-ORD-${++suffix}`,
          originLabel: `${PREFIX} Kho E`,
          destinationLabel: `${PREFIX} Bai F`,
          businessDate: '2026-09-26',
        },
        OFFICE,
      );

    /** Dem theo MOT xe: vong chay, chang, lan nhan viec, phan thuong mai, ke hoach, don. */
    const footprint = async (vehicleId: string) => {
      const runIds = (
        await prisma.transportVehicleRun.findMany({ where: { vehicleId }, select: { id: true } })
      ).map((run) => run.id);
      const legs = await prisma.transportRunLeg.findMany({ where: { runId: { in: runIds } } });
      const intakeIds = (
        await prisma.transportRunSiteIntake.findMany({
          where: { runId: { in: runIds } },
          select: { id: true },
        })
      ).map((row) => row.id);
      return {
        runs: runIds.length,
        legs: legs.length,
        liveLegs: legs.filter((leg) => leg.status !== 'CANCELLED').length,
        intakes: intakeIds.length,
        commercial: await prisma.transportSiteIntakeCommercial.count({
          where: { intakeId: { in: intakeIds } },
        }),
        plans: await prisma.transportOrderRunPlan.count({ where: { runId: { in: runIds } } }),
        activePlans: await prisma.transportOrderRunPlan.count({
          where: { runId: { in: runIds }, cancelledAt: null },
        }),
      };
    };

    const commercialOf = (intakeId: string) =>
      prisma.transportSiteIntakeCommercial.findUniqueOrThrow({ where: { intakeId } });

    /** HANG THAT cua viec van hanh — so sanh truoc/sau tung cot, khong chi trang thai. */
    const operationRows = async (runId: string, legId: string) => ({
      run: await prisma.transportVehicleRun.findUniqueOrThrow({ where: { id: runId } }),
      leg: await prisma.transportRunLeg.findUniqueOrThrow({ where: { id: legId } }),
      assignments: await prisma.transportRunAssignment.findMany({
        where: { runId },
        orderBy: { id: 'asc' },
      }),
      checkpoints: await prisma.transportRunCheckpoint.findMany({
        where: { runId },
        orderBy: { id: 'asc' },
      }),
    });

    const auditActions = async (entityIds: readonly string[]) =>
      (
        await prisma.auditLog.findMany({
          where: { entityId: { in: [...entityIds] } },
          select: { action: true },
        })
      )
        .map((row) => row.action)
        .sort();

    /* ================================================================ *
     * a. GAN DON DA CO CHO O TREN XE KHAC
     * ================================================================ */

    describe('a. gan tay mot don DA co cho o tren xe khac', () => {
      /** Moi thu co the bi mot lan gan don cham toi — doc TRUOC va SAU lenh bi tu choi. */
      const snapshotFor = async (
        who: { vehicleId: string; intake: SiteIntakeResult },
        otherVehicleId: string,
        orderId: string,
      ) => {
        const row = await commercialOf(who.intake.intakeId);
        return {
          intakeSide: await footprint(who.vehicleId),
          otherSide: await footprint(otherVehicleId),
          commercial: row,
          intakeLeg: await prisma.transportRunLeg.findUniqueOrThrow({
            where: { id: who.intake.legId },
          }),
          order: await prisma.transportOrder.findUniqueOrThrow({ where: { id: orderId } }),
          plansOfOrder: await prisma.transportOrderRunPlan.findMany({ where: { orderId } }),
          legsOfOrder: await prisma.transportRunLeg.findMany({ where: { orderId } }),
          commercialAudit: await auditActions([row.id]),
        };
      };

      it('don DA lap ke hoach (PlanningService.commit) len xe khac -> SITE_INTAKE_BINDING_DENIED (ORDER_ALREADY_PLANNED), khong hang nao doi, viec van PENDING', async () => {
        const who = await anIntake();
        const other = await aDriver();
        const order = await anOfficeOrder();
        const planned = await planning.commit(
          order.id,
          { vehicleId: other.vehicleId, idempotencyKey: `${PREFIX}-a-plan-${suffix}`, pendingWork },
          OFFICE,
        );
        expect(planned.plan).toMatchObject({ vehicleId: other.vehicleId, cancelledAt: null });
        const before = await snapshotFor(who, other.vehicleId, order.id);
        expect(before.otherSide).toMatchObject({ runs: 1, activePlans: 1 });
        expect(before.intakeSide).toMatchObject({ runs: 1, legs: 1, plans: 0, commercial: 1 });

        const error = await domainErrorOf(
          commercial.bindExistingOrder({
            actor: OFFICE,
            intakeId: who.intake.intakeId,
            orderId: order.id,
          }),
        );

        expect(error.reason).toBe('SITE_INTAKE_BINDING_DENIED');
        expect(error.kind).toBe('CONFLICT');
        expect(error.message).toContain('ORDER_ALREADY_PLANNED');
        expect(await snapshotFor(who, other.vehicleId, order.id)).toEqual(before);
        expect(before.commercial).toMatchObject({ status: 'PENDING', orderId: null });
        expect(before.intakeLeg.orderId).toBeNull();
        expect(await review.pendingIntakeForVehicle(who.vehicleId)).toMatchObject({
          intakeId: who.intake.intakeId,
        });
      });

      it('don DANG NAM tren mot chang song cua xe khac (khong ke hoach) -> ORDER_ALREADY_ON_RUN, khong hang nao doi', async () => {
        const who = await anIntake();
        const other = await aDriver();
        const order = await anOfficeOrder();
        const run = await movement.createRun(
          {
            code: `${PREFIX}-RUN-${++suffix}`,
            vehicleId: other.vehicleId,
            businessDate: '2026-09-26',
            note: null,
          },
          OFFICE,
        );
        await movement.addLeg(
          run.id,
          {
            sequence: 1,
            kind: 'LOADED',
            orderId: order.id,
            originLabel: `${PREFIX} Kho E`,
            destinationLabel: `${PREFIX} Bai F`,
          },
          OFFICE,
        );
        const before = await snapshotFor(who, other.vehicleId, order.id);
        expect(before.plansOfOrder).toEqual([]);
        expect(before.legsOfOrder).toHaveLength(1);

        const error = await domainErrorOf(
          commercial.bindExistingOrder({
            actor: OFFICE,
            intakeId: who.intake.intakeId,
            orderId: order.id,
          }),
        );

        expect(error.reason).toBe('SITE_INTAKE_BINDING_DENIED');
        expect(error.message).toContain('ORDER_ALREADY_ON_RUN');
        expect(await snapshotFor(who, other.vehicleId, order.id)).toEqual(before);
        expect(before.commercial.status).toBe('PENDING');
      });
    });

    /* ================================================================ *
     * b. BAO BAT THUONG TREN DON DA GIAO XONG
     * ================================================================ */

    describe('b. bao bat thuong tren don tu tao DA FULFILLED', () => {
      it.each([
        ['xe CHUA lan banh', false],
        ['xe DA lan banh', true],
      ] as const)(
        '%s -> chi ghi nhan ANOMALY_RECORDED_ORDER_TERMINAL; don giu FULFILLED; vong chay/chang/ke hoach giu nguyen',
        async (_label, rolled) => {
          const who = await anAutoOrder();
          if (rolled) await movement.transitionLeg(who.intake.legId, 'IN_TRANSIT', who.auth);
          // Vong doi DA CHAP NHAN — cung duong voi `POST /transport/orders/:id/transition`.
          await movement.transitionOrder(who.orderId, 'FULFILLED', OFFICE);

          const orderBefore = await prisma.transportOrder.findUniqueOrThrow({
            where: { id: who.orderId },
          });
          const rowsBefore = await operationRows(who.intake.runId, who.intake.legId);
          const plansBefore = await prisma.transportOrderRunPlan.findMany({
            where: { orderId: who.orderId },
          });
          const commercialBefore = await commercialOf(who.intake.intakeId);
          expect(orderBefore.status).toBe('FULFILLED');
          expect(rowsBefore.leg.status).toBe(rolled ? 'IN_TRANSIT' : 'PLANNED');
          expect(plansBefore.filter((plan) => plan.cancelledAt === null)).toHaveLength(1);

          // LY DO BAT BUOC — tang HTTP doi >= 3 ky tu, CHINH tang dich vu cung doi (sau khi cat
          // khoang trang), va duoi ca hai con CHECK `exception_shape` cua DB.
          await expect(
            commercial.reportException({
              actor: BOSS,
              intakeId: who.intake.intakeId,
              reason: '   ',
              idempotencyKey: 'bat-thuong-rong',
            }),
          ).rejects.toMatchObject({ reason: 'SITE_INTAKE_EXCEPTION_REASON_REQUIRED' });
          expect(await commercialOf(who.intake.intakeId)).toEqual(commercialBefore);
          expect(await auditActions([commercialBefore.id])).not.toContain(
            'transport.site_intake.exception',
          );

          const outcome = await commercial.reportException({
            actor: BOSS,
            intakeId: who.intake.intakeId,
            reason: 'Khach bao thieu hang sau khi da giao',
            idempotencyKey: 'bat-thuong-1',
          });

          expect(outcome).toMatchObject({
            outcome: 'ANOMALY_RECORDED_ORDER_TERMINAL',
            status: 'ORDER_BOUND',
            orderId: who.orderId,
            replayed: false,
          });
          expect(
            await prisma.transportOrder.findUniqueOrThrow({ where: { id: who.orderId } }),
          ).toEqual(orderBefore);
          expect(await operationRows(who.intake.runId, who.intake.legId)).toEqual(rowsBefore);
          expect(
            await prisma.transportOrderRunPlan.findMany({ where: { orderId: who.orderId } }),
          ).toEqual(plansBefore);

          expect(await commercialOf(who.intake.intakeId)).toMatchObject({
            status: 'ORDER_BOUND',
            orderId: who.orderId,
            bindingMode: 'AUTO_CREATED',
            exceptionOutcome: 'ANOMALY_RECORDED_ORDER_TERMINAL',
            exceptionReason: 'Khach bao thieu hang sau khi da giao',
            exceptionBy: BOSS,
            exceptionKey: 'bat-thuong-1',
          });
          // Chi MOT dau vet: lan ghi nhan. Khong lan huy don/ke hoach/chang/vong chay nao.
          const actions = await auditActions([
            commercialBefore.id,
            who.orderId,
            who.intake.runId,
            who.intake.legId,
            ...plansBefore.map((plan) => plan.id),
          ]);
          expect(actions.filter((action) => action === 'transport.site_intake.exception')).toEqual([
            'transport.site_intake.exception',
          ]);
          for (const cancel of [
            'transport.order.cancel',
            'transport.planning.cancel',
            'transport.run.leg.cancel',
            'transport.run.cancel',
          ]) {
            expect(actions).not.toContain(cancel);
          }
        },
      );
    });

    /* ================================================================ *
     * c. XE LAN BANH DUOC CHUNG MINH BANG MOC
     * ================================================================ */

    describe('c. xe lan banh duoc chung minh bang MOC, khong bang trang thai chang', () => {
      const record = (
        who: { auth: string; intake: SiteIntakeResult },
        type: RunCheckpointType,
        legId?: string,
      ) =>
        checkpoints.recordAsDriver({
          type,
          runId: who.intake.runId,
          ...(legId === undefined ? {} : { legId }),
          authUserId: who.auth,
          clientEventId: `${type}-${suffix}`,
        });

      it.each([
        ['PICKUP_DEPARTURE tren chang CO HANG', 'PICKUP_ARRIVAL', 'PICKUP_DEPARTURE', true],
        ['DEPARTED muc vong chay', 'ASSIGNED', 'DEPARTED', false],
      ] as const)(
        '%s -> chi huy DON; vong chay, chang, moc giu nguyen tung hang',
        async (_label, before, moving, onLeg) => {
          const who = await anAutoOrder();
          // Chon chang theo LOAI, khong theo chi so.
          const legs = await prisma.transportRunLeg.findMany({
            where: { runId: who.intake.runId },
          });
          const loaded = legs.find((leg) => leg.kind === 'LOADED');
          expect(loaded?.id).toBe(who.intake.legId);
          const legId = onLeg ? loaded?.id : undefined;

          // Moc tai cho (den noi / nhan viec) KHONG phai di chuyen.
          await record(who, before, legId);
          expect(await review.sourceOfOrder(who.orderId)).toMatchObject({
            movementStarted: false,
          });
          await record(who, moving, legId);
          expect(await review.sourceOfOrder(who.orderId)).toMatchObject({
            movementStarted: true,
          });

          const rowsBefore = await operationRows(who.intake.runId, who.intake.legId);
          // Trang thai KHONG noi xe da chay — chi moc noi.
          expect(rowsBefore.run.status).toBe('PLANNED');
          expect(rowsBefore.leg.status).toBe('PLANNED');
          expect(rowsBefore.checkpoints.map((row) => row.type).sort()).toEqual(
            [before, moving].sort(),
          );

          const outcome = await commercial.reportException({
            actor: BOSS,
            intakeId: who.intake.intakeId,
            reason: 'Khach huy khi xe da roi kho',
            idempotencyKey: 'bat-thuong-moc',
          });

          expect(outcome).toMatchObject({
            outcome: 'ORDER_CANCELLED_OPERATION_PRESERVED',
            operationPreserved: true,
            orderId: who.orderId,
          });
          expect(
            (await prisma.transportOrder.findUniqueOrThrow({ where: { id: who.orderId } })).status,
          ).toBe('CANCELLED');
          expect(await operationRows(who.intake.runId, who.intake.legId)).toEqual(rowsBefore);
          expect(await commercialOf(who.intake.intakeId)).toMatchObject({
            status: 'ORDER_BOUND',
            orderId: who.orderId,
            exceptionOutcome: 'ORDER_CANCELLED_OPERATION_PRESERVED',
          });
          const actions = await auditActions([who.intake.runId, who.intake.legId]);
          expect(actions).not.toContain('transport.run.cancel');
          expect(actions).not.toContain('transport.run.leg.cancel');
        },
      );
    });

    /* ================================================================ *
     * d. DAU VET KIEM TOAN CUA MOT LAN TU TAO DON
     * ================================================================ */

    it('d. tu tao don ghi bon dau vet — nguon, lai xe, xe, dia diem, lan nhan viec nam dung cho kho ghi', async () => {
      const who = await anAutoOrder();
      const intake = await prisma.transportRunSiteIntake.findUniqueOrThrow({
        where: { id: who.intake.intakeId },
      });
      const plan = await prisma.transportOrderRunPlan.findFirstOrThrow({
        where: { orderId: who.orderId, cancelledAt: null },
      });
      const row = await commercialOf(who.intake.intakeId);
      const order = await prisma.transportOrder.findUniqueOrThrow({ where: { id: who.orderId } });

      const rows = await prisma.auditLog.findMany({
        where: { entityId: { in: [who.orderId, plan.id, row.id] } },
      });
      const byAction = new Map(rows.map((entry) => [entry.action, entry]));
      expect(rows.map((entry) => entry.action).sort()).toEqual([
        'transport.order.create',
        'transport.planning.adopt',
        'transport.site_intake.destination',
        'transport.site_intake.order_bound',
      ]);
      // Moi dau vet mang ten CHINH lai xe bam — khong mot ten he thong chung chung.
      expect(new Set(rows.map((entry) => entry.actor))).toEqual(new Set([who.auth]));

      // (1) DON: nguon + lan nhan viec + che do; tien CHUA BIET la null, khong phai 0.
      expect(byAction.get('transport.order.create')).toMatchObject({
        entityType: 'TransportOrder',
        entityId: who.orderId,
        before: null,
        after: expect.objectContaining({
          id: who.orderId,
          code: siteIntakeOrderCode(who.intake.businessDate, who.intake.intakeId),
          source: 'DRIVER_SITE_INTAKE',
          intakeId: who.intake.intakeId,
          mode: 'AUTO_CREATED',
          freightAmount: null,
          customerId: null,
        }),
      });

      // (2) KE HOACH: don NHAN chang cu cua xe nay — vong chay + chang + xe.
      expect(byAction.get('transport.planning.adopt')).toMatchObject({
        entityType: 'TransportOrderRunPlan',
        entityId: plan.id,
        before: { leg: expect.objectContaining({ id: who.intake.legId, orderId: null }) },
        after: {
          plan: expect.objectContaining({
            id: plan.id,
            orderId: who.orderId,
            runId: who.intake.runId,
            vehicleId: who.vehicleId,
            loadedLegId: who.intake.legId,
            emptyLegId: null,
            outcome: 'ADOPTED',
            idempotencyKey: siteIntakePlanKey(who.intake.intakeId),
          }),
          leg: expect.objectContaining({ id: who.intake.legId, orderId: who.orderId }),
        },
      });

      // (3) PHAN THUONG MAI: lai xe + xe + dia diem + lan nhan viec + vong chay + chang.
      expect(byAction.get('transport.site_intake.order_bound')).toMatchObject({
        entityType: 'TransportSiteIntakeCommercial',
        entityId: row.id,
        before: expect.objectContaining({ status: 'PENDING', binding: null }),
        after: expect.objectContaining({
          id: row.id,
          intakeId: who.intake.intakeId,
          status: 'ORDER_BOUND',
          binding: expect.objectContaining({
            orderId: who.orderId,
            mode: 'AUTO_CREATED',
            by: who.auth,
          }),
          runId: who.intake.runId,
          legId: who.intake.legId,
          driverId: who.driverId,
          vehicleId: who.vehicleId,
          siteId,
        }),
      });
      expect(intake).toMatchObject({ driverId: who.driverId, siteId, siteMatch: 'UNIQUE_INSIDE' });

      // (4) DIEM GIAO: tu dia diem DA BIET, do chinh lai xe chon.
      expect(byAction.get('transport.site_intake.destination')).toMatchObject({
        entityType: 'TransportSiteIntakeCommercial',
        entityId: row.id,
        after: expect.objectContaining({
          destination: expect.objectContaining({
            source: 'KNOWN_PLACE',
            ref: destinationPlaceId,
            setBy: who.auth,
            setByRole: 'DRIVER',
            point: DESTINATION,
          }),
        }),
      });
      // Toa do cua DON la toa do may chu doc tu hang rao — cung toa do dau vet diem giao ghi.
      expect(order).toMatchObject({
        originLatitude: ORIGIN.latitude,
        originLongitude: ORIGIN.longitude,
        destinationLatitude: DESTINATION.latitude,
        destinationLongitude: DESTINATION.longitude,
      });
    });
  },
);
