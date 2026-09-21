import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { PrismaAuditLogRepository } from '../../audit/prisma-audit-log.repository.js';
import { PrismaService } from '../../config/prisma.service.js';
import { CheckpointRunClosureBlockerSource } from '../checkpoint/checkpoint-run-closure-blocker.source.js';
import {
  TransportCheckpointCoreFactsAdapter,
  TransportCheckpointLocationFacts,
} from '../checkpoint/checkpoint-facts.port.js';
import { CheckpointService } from '../checkpoint/checkpoint.service.js';
import type { RunCheckpointType } from '../checkpoint/checkpoint.types.js';
import { PrismaCheckpointRepository } from '../checkpoint/prisma-checkpoint.repository.js';
import { TransportCheckpointRunClosureBlockerSource } from '../checkpoint/transport-checkpoint-blocker.source.js';
import { PrismaFleetRepository } from '../fleet/prisma-fleet.repository.js';
import { MovementService } from '../movement/movement.service.js';
import { PrismaMovementRepository } from '../movement/prisma-movement.repository.js';
import { MovementRunWriteGuard } from '../movement/run-write-guard.port.js';
import { PrismaWaitingSessionRepository } from '../waiting/prisma-waiting.repository.js';
import { WaitingRunClosureBlockerSource } from '../waiting/waiting-run-closure-blocker.source.js';
import { PlanningService } from './planning.service.js';
import type { TransportPlanningPolicy } from './planning.types.js';
import { PrismaRunPlanRepository } from './prisma-planning.repository.js';
import { RunClosureService } from './run-closure.service.js';

/**
 * UAT BUG-02 (#332) tren POSTGRES THAT — cung duong ung dung ma runtime dung.
 *
 * ============================================================================================
 * VI SAO CO TEP NAY SAU BAN TRONG BO NHO
 * ============================================================================================
 *
 * Ban trong bo nho da chung minh ham phan xu giu vong chay `ACTIVE` khi con chang `LOADED`. Cau
 * hoi con lai la TANG LUU TRU: cau `WHERE` cua ung vien luot quet, lan doc chang duoi `FOR UPDATE`,
 * va nguon chan that cua `transport-checkpoint` — ba thu chi ton tai tren Postgres.
 *
 * Moi vong chay o day di dung duong runtime: `PlanningService.commit()` sinh chang va (tu #338)
 * gan nguoi cam xe, `MovementService.transitionLeg()` doi trang thai chang (duong cua
 * `RunsController`), va `RunClosureService.attempt()` phan xu voi nguon chan GOP (hang tren thung +
 * phien cho) — dung cach `app-composition.ts` noi chung luc chay.
 *
 * ============================================================================================
 * U-IT-04 LA BAN GHI LAI RUNTIME, KHONG PHAI MOT GIA DINH
 * ============================================================================================
 *
 * Log quyet dinh cua `api-321` tren transport-preview (19–20/09/2026) cho thay hai vong chay 3 chang
 * cua ngay 19/09 duoc dong boi LUOT QUET (`IDLE_SWEEP`, `DEPOT_RETURN`) luc 16:37Z va 16:40Z ngay
 * 20/09 — ca ba chang cua moi vong chay deu da `COMPLETED` qua API dieu hanh tu 19/09 12:27Z, va
 * vong chay chi con bi giu boi `CARGO_STILL_CARRIED` tu cac moc hien truong ghi tren CHANG 1 RONG.
 * Bai do dung lai dung chuoi su kien ay de chung minh rang trang thai UAT nhin thay — vong chay
 * `COMPLETED`, cot "Hien truong" cua chang 2/3 la "—" — sinh ra tu chinh cac su that do, KHONG phai
 * tu mot lan dong bo qua chang `LOADED` con mo.
 *
 * Chay bang `RUN_PRISMA_IT=1`; khong co bien do thi ca khoi khong chay.
 */

const CODE_PREFIX = 'IT-U332';
const PLATE_PREFIX = 'IT-U332-XE';
const PHONE_PREFIX = '0966U332';
const ACTOR = 'it-uat-332';
const AUTH = 'it-u332-lai-xe';

/** Cung con so voi moi tep IT cham trigger cua moc/phien cho — xem `transport-waiting.int.spec.ts`. */
const WAITING_TRIGGER_LOCK = 279_005;
const PROTECTED_TABLES = [
  ['TransportDeliveryWaitingSession', 'transport_waiting_session_immutable'],
  ['TransportRunCheckpoint', 'transport_run_checkpoint_append_only'],
] as const;

const CORE_POLICY = { timeZone: 'Asia/Ho_Chi_Minh' } as const;
const DEPOT_LABEL = 'IT-U332 Bãi xe';
const PICKUP_LABEL = 'IT-U332 Kho lấy hàng';
const FAR_LABEL = 'IT-U332 Điểm giao xa';
const HOUR_MS = 3_600_000;

/** Hinh dang chinh sach cua transport-preview: mot don mot vong chay, mot bai, nguong nghi 12 gio. */
const policyWith = (over: Partial<TransportPlanningPolicy> = {}): TransportPlanningPolicy => ({
  grouping: over.grouping ?? 'ONE_ORDER_PER_RUN',
  depots: over.depots ?? [{ code: 'IT-U332-DEPOT', label: DEPOT_LABEL }],
  closure: over.closure ?? { idleHours: 12 },
  sweep: over.sweep ?? { intervalSeconds: 60, batchSize: 50 },
});

describe.runIf(process.env.RUN_PRISMA_IT === '1')(
  'UAT BUG-02 — chang RONG xong khong duoc dong vong chay, tren Postgres that (#332)',
  () => {
    const prisma = new PrismaService();
    const movementRepo = new PrismaMovementRepository(prisma);
    const planRepo = new PrismaRunPlanRepository(prisma);
    const fleet = new PrismaFleetRepository(prisma);
    const audit = new AuditLogService(new PrismaAuditLogRepository(prisma));
    const movement = new MovementService(movementRepo, fleet, audit, CORE_POLICY);

    const noLocationFacts = new (class extends TransportCheckpointLocationFacts {
      async findObservation(): Promise<null> {
        return null;
      }
    })();

    /*
     * Chinh sach vi tri RONG: cac bai nay hoi ve VONG CHAY, khong ve bang chung dinh vi. Moi thu
     * khac — kho, khoa hang, thu tu moc — la ban that.
     */
    const checkpointService = new CheckpointService(
      new PrismaCheckpointRepository(prisma),
      new TransportCheckpointCoreFactsAdapter(movementRepo, fleet),
      noLocationFacts,
      new MovementRunWriteGuard(movementRepo),
      CORE_POLICY,
      { locationRequiredTypes: [] },
    );
    const runtimeBlockers = new TransportCheckpointRunClosureBlockerSource(
      new CheckpointRunClosureBlockerSource(checkpointService),
      new WaitingRunClosureBlockerSource(new PrismaWaitingSessionRepository(prisma)),
    );

    const closuresWith = (policy: TransportPlanningPolicy, now?: () => Date) =>
      new RunClosureService(
        new PlanningService(movement, planRepo, fleet, audit, CORE_POLICY, policy, undefined, now),
        movement,
        policy,
        runtimeBlockers,
        undefined,
        now,
      );
    const closures = closuresWith(policyWith());

    async function cleanup(): Promise<void> {
      const vehicles = await prisma.transportVehicle.findMany({
        where: { registrationPlate: { startsWith: PLATE_PREFIX } },
        select: { id: true },
      });
      const vehicleIds = vehicles.map((vehicle) => vehicle.id);
      const runIds = (
        await prisma.transportVehicleRun.findMany({
          where: { vehicleId: { in: vehicleIds } },
          select: { id: true },
        })
      ).map((run) => run.id);

      await prisma.$executeRawUnsafe(`SELECT pg_advisory_lock(${WAITING_TRIGGER_LOCK})`);
      for (const [table, trigger] of PROTECTED_TABLES) {
        await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" DISABLE TRIGGER "${trigger}"`);
      }
      try {
        await prisma.transportDeliveryWaitingSession.deleteMany({
          where: { runId: { in: runIds } },
        });
        await prisma.transportRunCheckpoint.deleteMany({ where: { runId: { in: runIds } } });
      } finally {
        for (const [table, trigger] of PROTECTED_TABLES) {
          await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ENABLE TRIGGER "${trigger}"`);
        }
        await prisma.$executeRawUnsafe(`SELECT pg_advisory_unlock(${WAITING_TRIGGER_LOCK})`);
      }

      await prisma.transportOrderRunPlan.deleteMany({ where: { runId: { in: runIds } } });
      await prisma.transportRunLeg.deleteMany({ where: { runId: { in: runIds } } });
      await prisma.transportRunAssignment.deleteMany({ where: { runId: { in: runIds } } });
      await prisma.transportVehicleRun.deleteMany({ where: { id: { in: runIds } } });
      await prisma.transportOrder.deleteMany({ where: { code: { startsWith: CODE_PREFIX } } });
      // TRUOC xe va lai xe: khoa ngoai cua ban phan cong doi xe tro vao ca hai.
      await prisma.transportVehicleAssignment.deleteMany({
        where: {
          OR: [
            { vehicleId: { in: vehicleIds } },
            { driver: { phone: { startsWith: PHONE_PREFIX } } },
          ],
        },
      });
      await prisma.transportVehicle.deleteMany({ where: { id: { in: vehicleIds } } });
      await prisma.transportDriver.deleteMany({ where: { phone: { startsWith: PHONE_PREFIX } } });
      // Dau vet dong do HE THONG ghi (`actor` khong mang tien to) — xoa theo chinh vong chay.
      await prisma.auditLog.deleteMany({
        where: { OR: [{ actor: { startsWith: ACTOR } }, { entityId: { in: runIds } }] },
      });
    }

    beforeAll(cleanup);
    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    let suffix = 0;
    const next = (label: string): string => `${CODE_PREFIX}-${label}-${++suffix}`;

    /**
     * Mot chiec xe DIEU DUOC theo hop dong cua #338: `commit()` doi xe co DUNG MOT lai xe dang phu
     * trach, lai xe do `ACTIVE` va CO `authUserId`, truoc khi mo vong chay. Moi xe mot lai xe rieng
     * (`authUserId` la unique) — giong mot doi xe that, khong phai mot nguoi cam bon xe cung luc.
     */
    const dispatchableVehicle = async () => {
      const n = ++suffix;
      const authUserId = `${AUTH}-${n}`;
      const vehicle = await fleet.createVehicle({
        registrationPlate: `${PLATE_PREFIX}-${n}`,
        vehicleClass: 'Dau keo',
      });
      const driver = await fleet.createDriver({
        fullName: `IT-U332 Lai xe ${n}`,
        phone: `${PHONE_PREFIX}${n}`,
        licenceClass: 'FC',
        licenceExpiry: '2030-01-01',
        authUserId,
      });
      await fleet.assignDriverToVehicle(vehicle.id, driver.id, new Date());
      return { vehicle, driverId: driver.id, authUserId };
    };

    /** Duong cua lai xe (`/transport/me/checkpoints`) — danh tinh tu PHIEN cua nguoi cam xe. */
    const recordAs =
      (authUserId: string) => (runId: string, legId: string, type: RunCheckpointType) =>
        checkpointService.recordAsDriver({
          type,
          runId,
          legId,
          authUserId,
          clientEventId: next(type),
        });

    /**
     * Chot ke hoach qua DUNG duong runtime. Tu #338, chinh `commit()` gan nguoi cam xe vao vong
     * chay — buoc gan tay rieng (lach BUG-01) khong con, va fixture KHANG DINH dieu do thay vi gia
     * dinh: lai xe ghi moc o U-IT-02/04 la nguoi `commit()` da gan, khong phai nguoi test tu chen.
     */
    const plannedRun = async () => {
      const { vehicle, driverId, authUserId } = await dispatchableVehicle();
      const order = await movement.createOrder(
        {
          code: next('ORD'),
          originLabel: PICKUP_LABEL,
          destinationLabel: FAR_LABEL,
          businessDate: '2026-09-19',
        },
        ACTOR,
      );
      const { run, legs } = await new PlanningService(
        movement,
        planRepo,
        fleet,
        audit,
        CORE_POLICY,
        policyWith(),
      ).commit(order.id, { vehicleId: vehicle.id, idempotencyKey: next('KEY') }, ACTOR);
      expect((await movement.getRun(run.id)).activeAssignment?.driverId).toBe(driverId);
      return { run, empty: legs[0]!, loaded: legs[1]!, record: recordAs(authUserId) };
    };

    /** Duong cua `RunsController.transitionLeg`: doi trang thai chang, roi HOI LAI lan dong. */
    const transitionThenAttempt = async (
      runId: string,
      legId: string,
      to: 'IN_TRANSIT' | 'COMPLETED',
    ) => {
      await movement.transitionLeg(legId, to, ACTOR);
      return closures.attempt(runId, 'LEG_CHANGED');
    };
    const runLeg = async (runId: string, legId: string) => {
      await transitionThenAttempt(runId, legId, 'IN_TRANSIT');
      return transitionThenAttempt(runId, legId, 'COMPLETED');
    };

    const returnLeg = (runId: string) =>
      movement.addLeg(
        runId,
        { sequence: 3, kind: 'EMPTY', originLabel: FAR_LABEL, destinationLabel: DEPOT_LABEL },
        ACTOR,
      );

    /** ANH CHUP ngay truoc/sau: dung bon thu issue #332 doi do. */
    const snapshot = async (runId: string) => {
      const detail = await movement.getRun(runId);
      return {
        runStatus: detail.run.status,
        legs: detail.legs.map((leg) => ({
          sequence: leg.sequence,
          kind: leg.kind,
          status: leg.status,
          completed: leg.completedAt !== null,
        })),
        activePlans: (await planRepo.listActiveForRun(runId)).length,
        verdict: await closures.inspect(runId),
      };
    };

    /** Tap ung vien that cua luot quet — cau `WHERE` SQL, CHI DOC. Khang dinh theo id, khong theo so. */
    const isSweepCandidate = async (runId: string): Promise<boolean> => {
      const candidates = await movement.listRunClosureCandidates({
        completedBefore: new Date(Date.now() + HOUR_MS),
        idleHours: 0,
        depotLabel: DEPOT_LABEL,
        limit: 100_000,
      });
      return candidates.some((candidate) => candidate.id === runId);
    };

    const closeAudits = (runId: string) =>
      prisma.auditLog.findMany({
        where: { action: 'transport.run.close.system', entityId: runId },
      });

    it('U-IT-01 — EMPTY xong, LOADED PLANNED: vong chay VAN ACTIVE, bi chan dung hai ly do', async () => {
      const { run, empty, loaded } = await plannedRun();
      expect([empty.kind, loaded.kind]).toEqual(['EMPTY', 'LOADED']);

      await transitionThenAttempt(run.id, empty.id, 'IN_TRANSIT');
      const before = await snapshot(run.id);
      expect(before.runStatus).toBe('ACTIVE');
      expect(before.legs.map((leg) => leg.status)).toEqual(['IN_TRANSIT', 'PLANNED']);
      expect(before.activePlans).toBe(1);

      const outcome = await transitionThenAttempt(run.id, empty.id, 'COMPLETED');
      const after = await snapshot(run.id);

      expect(outcome.closed).toBe(false);
      expect(outcome.verdict.blockers).toEqual(
        expect.arrayContaining(['LEG_STILL_OPEN', 'PLAN_STILL_OPEN']),
      );
      expect(after.runStatus).toBe('ACTIVE');
      expect(after.legs).toEqual([
        { sequence: 1, kind: 'EMPTY', status: 'COMPLETED', completed: true },
        { sequence: 2, kind: 'LOADED', status: 'PLANNED', completed: false },
      ]);
      expect(after.activePlans).toBe(1);
      // Be mat chan doan va duong thi hanh nhin CUNG mot bang chan.
      expect(after.verdict.blockers).toEqual(outcome.verdict.blockers);

      // Luot quet cung khong lay duoc no: cau `every` cua SQL loai ngay tu CSDL.
      expect(await isSweepCandidate(run.id)).toBe(false);
      const sweepAttempt = await closuresWith(
        policyWith({ closure: { idleHours: 1 } }),
        () => new Date(Date.now() + 48 * HOUR_MS),
      ).attempt(run.id, 'IDLE_SWEEP');
      expect(sweepAttempt.closed).toBe(false);
      expect(sweepAttempt.verdict.blockers).toContain('LEG_STILL_OPEN');
      expect(await closeAudits(run.id)).toHaveLength(0);
    });

    it('U-IT-02 — LOADED dang chay: van khong dong, va lai xe van ghi duoc tren chang do', async () => {
      const { run, empty, loaded, record } = await plannedRun();
      await runLeg(run.id, empty.id);
      const outcome = await transitionThenAttempt(run.id, loaded.id, 'IN_TRANSIT');

      expect(outcome.closed).toBe(false);
      expect(outcome.verdict.blockers).toEqual(
        expect.arrayContaining(['LEG_STILL_OPEN', 'PLAN_STILL_OPEN']),
      );
      expect((await snapshot(run.id)).runStatus).toBe('ACTIVE');

      // Chang CO HANG con nhin thay va con ghi duoc boi dung lai xe cua no.
      const arrived = await record(run.id, loaded.id, 'PICKUP_ARRIVAL');
      expect(arrived.legId).toBe(loaded.id);
      const done = await transitionThenAttempt(run.id, loaded.id, 'COMPLETED');
      // Xong chang co hang o xa bai: het viec nhung chua ve bai — GIU, khong dong.
      expect(done.closed).toBe(false);
      expect(done.verdict.holding).toBe(true);
      expect((await snapshot(run.id)).runStatus).toBe('ACTIVE');
    });

    it('U-IT-03 — chang VE BAI xong TRUOC chang LOADED: dieu kien ve bai dung, van khong dong', async () => {
      const { run, empty } = await plannedRun();
      await runLeg(run.id, empty.id);
      const home = await returnLeg(run.id);

      /*
       * Hinh dang nguy hiem nhat cho `lastCompleted()`: chang hoan thanh MUON NHAT ket thuc tai bai,
       * nen nhanh `DEPOT_RETURN` se bat ngay neu khong co cong `LEG_STILL_OPEN` dung truoc no.
       */
      const outcome = await runLeg(run.id, home.id);
      const after = await snapshot(run.id);

      expect(after.legs.map((leg) => [leg.kind, leg.status])).toEqual([
        ['EMPTY', 'COMPLETED'],
        ['LOADED', 'PLANNED'],
        ['EMPTY', 'COMPLETED'],
      ]);
      expect(outcome.closed).toBe(false);
      expect(outcome.verdict.trigger).toBeNull();
      expect(outcome.verdict.blockers).toEqual(
        expect.arrayContaining(['LEG_STILL_OPEN', 'PLAN_STILL_OPEN']),
      );
      expect(after.runStatus).toBe('ACTIVE');
      expect(await isSweepCandidate(run.id)).toBe(false);
      expect(await closeAudits(run.id)).toHaveLength(0);
    });

    it('U-IT-04 — REPLAY runtime 19–20/09: vong chay dong vi MOI chang da COMPLETED, khong vi chang RONG', async () => {
      const { run, empty, loaded, record } = await plannedRun();

      // 19/09 ~12:26Z — moc hien truong ghi tren CHANG 1 RONG, dung thu tu log runtime.
      for (const type of ['PICKUP_ARRIVAL', 'GATE_ENTRY', 'LOADING', 'PICKUP_DEPARTURE'] as const) {
        await record(run.id, empty.id, type);
      }

      // 19/09 ~12:27Z — API dieu hanh chuyen CA BA chang sang `COMPLETED`, them chang ve bai.
      await runLeg(run.id, empty.id);
      await runLeg(run.id, loaded.id);
      const home = await returnLeg(run.id);
      const lastLegChange = await runLeg(run.id, home.id);

      const held = await snapshot(run.id);
      expect(held.legs.map((leg) => leg.status)).toEqual(['COMPLETED', 'COMPLETED', 'COMPLETED']);
      expect(held.runStatus).toBe('ACTIVE');
      // Dung ma chan log runtime ghi ~100 lan moi vong chay: chi con hang tren thung.
      expect(lastLegChange.verdict.blockers).toEqual(['CARGO_STILL_CARRIED']);
      expect(await isSweepCandidate(run.id)).toBe(true);

      // 20/09 16:35–16:40Z — lai xe hoan tat chuoi moc cua CHANG 1, roi luot quet chay.
      await record(run.id, empty.id, 'DELIVERY_ARRIVAL');
      await record(run.id, empty.id, 'DELIVERY_ACCEPTED');
      const swept = await closures.attempt(run.id, 'IDLE_SWEEP');

      expect(swept.closed).toBe(true);
      expect(swept.verdict.trigger).toBe('DEPOT_RETURN');
      const closed = await movement.getRun(run.id);
      expect(closed.run.status).toBe('COMPLETED');

      /*
       * DUNG dieu UAT nhin thay: cot "Hien truong" chi co chang 1; chang 2/3 KHONG co giai doan
       * nao (giao dien in "—") — trong khi trang thai cua chung la `COMPLETED` tu truoc lan dong.
       * Hai truc khac nhau, va lan dong doc truc trang thai chang.
       */
      const phases = (await checkpointService.timelineForRun(run.id)).legPhases;
      expect(phases[empty.id]).toBe('DELIVERED');
      expect(phases[loaded.id]).toBeUndefined();
      expect(phases[home.id]).toBeUndefined();
      expect(closed.legs.map((leg) => leg.status)).toEqual(['COMPLETED', 'COMPLETED', 'COMPLETED']);

      const audits = await closeAudits(run.id);
      expect(audits).toHaveLength(1);
      expect(audits[0]!.actor).toBe('system:transport-planning');
      expect((audits[0]!.before as { status: string }).status).toBe('ACTIVE');
      expect((audits[0]!.after as { status: string }).status).toBe('COMPLETED');
    });
  },
);
