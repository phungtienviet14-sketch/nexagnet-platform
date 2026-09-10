import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { PrismaAuditLogRepository } from '../../audit/prisma-audit-log.repository.js';
import { PrismaService } from '../../config/prisma.service.js';
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
 *     sau khi chet" chi co nghia khi co mot cai gi do song sot qua cai chet;
 *   · cau truy van UNG VIEN cua luot quet la SQL that, khong phai mot vong `filter` trong bo nho.
 *
 * ============================================================================================
 * KHONG BAI NAO O DAY GOI `sweep()`
 * ============================================================================================
 *
 * Va do la mot quyet dinh, khong phai mot thieu sot. `sweep()` quet MOI vong chay duoc phan xu
 * trong CSDL — dung nhu thiet ke, vi mot tien trinh phuc vu mot khach. Nhung CI chay cac tep
 * `*.int.spec.ts` SONG SONG tren CUNG mot Postgres, nen mot luot quet o day se dong ca nhung vong
 * chay ma tep khac dang dung, va lam do nhung bai kiem khong lien quan gi den lane nay.
 *
 * Nen o day:
 *   · duong GHI duoc kiem qua `attempt()` — cung mot lop phan xu, cung mot cau `UPDATE`;
 *   · cau truy van UNG VIEN duoc kiem TRUC TIEP, va no CHI DOC: khong dong gi, khong dung ai.
 *
 * Phan "luot quet chon dung trang nao, co tran ra sao" thuoc `run-closure.service.spec.ts` — o do
 * moi thu chay trong bo nho va khong co ai khac dung chung.
 *
 * Chay bang `RUN_PRISMA_IT=1`; khong co bien do thi ca khoi khong chay.
 */

const CODE_PREFIX = 'IT-R293';
const PLATE_PREFIX = 'IT-R293-XE';
const ACTOR = 'it-lane-r';
const CORE_POLICY = { timeZone: 'Asia/Ho_Chi_Minh' } as const;
const DEPOT_LABEL = 'IT-R293 Bãi xe';
const FAR_LABEL = 'IT-R293 Cảng xa';
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

    /**
     * MOT TIEN TRINH MOI, dung nghia nhat kiem duoc: moi doi tuong bi bo di va dung lai tu dau —
     * kho, bo lap ke hoach, lop phan xu, dong ho. Khong con tro, khong `Map`, khong bien dem nao
     * song qua ranh gioi nay; thu duy nhat con lai la nhung hang da ghi.
     */
    const freshProcess = (over: Partial<TransportPlanningPolicy> = {}, now?: () => Date) => {
      const policy = policyWith(over);
      const repo = new PrismaMovementRepository(prisma);
      const service = new MovementService(repo, fleet, audit, CORE_POLICY);
      return {
        movement: service,
        policy,
        closures: new RunClosureService(
          /*
           * DONG HO PHAI DI VAO CA HAI LOP. `evaluateRunClosure()` la ham thuan, nhung dong ho cua
           * no den tu `PlanningService` — mot tien trinh duoc dung lai o day ma chi `RunClosureService`
           * biet gio gia se phan xu bang gio THAT, va bai kiem nguong nghi se do vi mot ly do
           * khong lien quan gi den dieu no dinh kiem.
           */
          new PlanningService(
            service,
            new PrismaRunPlanRepository(prisma),
            fleet,
            audit,
            CORE_POLICY,
            policy,
            undefined,
            now,
          ),
          service,
          policy,
          undefined,
          undefined,
          now,
        ),
      };
    };

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

    /** Mot vong chay da xong viec. `home: true` them mot chang rong ve bai. */
    const finishedRun = async (
      destination: string,
      options: { readonly home?: boolean } = {},
    ) => {
      const vehicle = await aVehicle();
      const order = await anOrder('IT-R293 Kho A', destination);
      const { run, legs } = await new PlanningService(
        movement,
        planRepo,
        fleet,
        audit,
        CORE_POLICY,
        policyWith(),
      ).commit(order.id, { vehicleId: vehicle.id, idempotencyKey: next('KEY') }, ACTOR);
      for (const leg of legs) await runLeg(leg.id);

      if (options.home) {
        const home = await movement.addLeg(
          run.id,
          {
            sequence: legs.length + 1,
            kind: 'EMPTY',
            originLabel: destination,
            destinationLabel: DEPOT_LABEL,
          },
          ACTOR,
        );
        await runLeg(home.id);
      }
      return { run, order, vehicle };
    };

    const statusOf = async (runId: string) =>
      (await movement.getRun(runId)).run.status;
    const closeAuditCount = (runId: string) =>
      prisma.auditLog.count({
        where: { action: 'transport.run.close.system', entityId: runId },
      });

    it('R-IT-01 — hai worker DONG THOI: dung mot lan dong, mot dong dau vet', async () => {
      const first = freshProcess();
      const second = freshProcess();
      const { run } = await finishedRun(DEPOT_LABEL);

      /*
       * HAI TIEN TRINH doc lap tren cung mot bang — dung hinh dang cua hai worker trong hai tien
       * trinh khac nhau. Ca hai deu doc thay `ACTIVE`, ca hai deu ket luan "dong duoc", va ca hai
       * deu goi `closeRunAsSystem`. Thu phan xu chung khong phai tang ung dung (no khong the nhin
       * thay ban kia) ma la cau `UPDATE ... WHERE status = 'ACTIVE'`.
       */
      const [a, b] = await Promise.all([
        first.closures.attempt(run.id, 'LEG_CHANGED'),
        second.closures.attempt(run.id, 'LEG_CHANGED'),
      ]);

      expect([a, b].filter((outcome) => outcome.closed)).toHaveLength(1);
      expect(await statusOf(run.id)).toBe('COMPLETED');
      expect(await closeAuditCount(run.id)).toBe(1);

      const persisted = await movement.getRun(run.id);
      expect(persisted.run.completedAt).not.toBeNull();
    });

    it('R-IT-02 — nam worker cung mot luot: van dung mot lan dong', async () => {
      const { run } = await finishedRun(DEPOT_LABEL);

      const outcomes = await Promise.all(
        Array.from({ length: 5 }, () => freshProcess().closures.attempt(run.id, 'IDLE_SWEEP')),
      );

      expect(outcomes.filter((outcome) => outcome.closed)).toHaveLength(1);
      expect(await statusOf(run.id)).toBe('COMPLETED');
      expect(await closeAuditCount(run.id)).toBe(1);
    });

    it('R-IT-03 — TIEN TRINH MOI van doc lai duoc su that va dong duoc', async () => {
      const { run } = await finishedRun(FAR_LABEL);
      expect(await statusOf(run.id)).toBe('ACTIVE');

      /*
       * Khong co "su kien" nao trong bo nho ca. Mot tien trinh dung lai tu dau, voi dong ho cua no
       * dat vao hai gio sau, doc lai dung nhung hang do tu Postgres va di den cung ket luan.
       */
      const restarted = freshProcess({ closure: { idleHours: 1 } }, () => new Date(Date.now() + 2 * HOUR_MS));
      const outcome = await restarted.closures.attempt(run.id, 'IDLE_SWEEP');

      expect(outcome.closed).toBe(true);
      expect(outcome.verdict.trigger).toBe('IDLE_TIMEOUT');
      expect(await statusOf(run.id)).toBe('COMPLETED');
      expect(await closeAuditCount(run.id)).toBe(1);
    });

    it('R-IT-04 — cau truy van UNG VIEN tren SQL that: dung tap, va CHI DOC', async () => {
      /*
       * Bai nay kiem chinh cau `WHERE` ma ban trong bo nho khong the kiem thay: `some` + `every`
       * tren quan he chang. No khong goi `sweep()` — mot luot quet se dong ca nhung vong chay ma
       * tep kiem khac dang dung tren cung mot CSDL, va lam do nhung bai khong lien quan.
       */
      const due = await finishedRun(FAR_LABEL);
      const tooFresh = await finishedRun(FAR_LABEL);

      // Mot vong chay con chang CHUA chay: khong bao gio la ung vien.
      const vehicle = await aVehicle();
      const order = await anOrder('IT-R293 Kho A', FAR_LABEL);
      const pending = await movement.createRun(
        { code: next('RUN'), vehicleId: vehicle.id, businessDate: '2026-09-11', note: null },
        ACTOR,
      );
      await movement.addLeg(
        pending.id,
        {
          sequence: 1,
          kind: 'LOADED',
          orderId: order.id,
          originLabel: 'IT-R293 Kho A',
          destinationLabel: FAR_LABEL,
          businessDate: '2026-09-11',
          distanceKm: null,
          plannedDistanceKm: null,
          note: null,
        },
        ACTOR,
      );

      // Moc nam SAU khi hai vong chay kia xong: ca hai deu da "cu hon moc".
      const after = await movement.listRunClosureCandidates({
        completedBefore: new Date(Date.now() + 60_000),
        idleHours: 12,
        depotLabel: DEPOT_LABEL,
        limit: 200,
      });
      const dueIds = after.map((candidate) => candidate.id);

      // Vong chay con chang CHUA chay khong bao gio la ung vien.
      expect(dueIds).not.toContain(pending.id);
      // Hai vong chay da xong thi co.
      expect(dueIds).toEqual(expect.arrayContaining([due.run.id, tooFresh.run.id]));

      // VA BAI NAY CHI DOC: khong mot vong chay nao bi doi trang thai. (`pending` chua lan banh —
      // no o `PLANNED`, va do cung la mot ly do nua de no khong the la ung vien.)
      expect(await statusOf(due.run.id)).toBe('ACTIVE');
      expect(await statusOf(tooFresh.run.id)).toBe('ACTIVE');
      expect(await statusOf(pending.id)).toBe('PLANNED');

      // Chieu nguoc lai: mot moc nam TRUOC khi chung xong thi loai chung ra — day la dieu kien
      // "lan hoan thanh muon nhat da cu hon moc", va no phai that su loc duoc.
      const before = await movement.listRunClosureCandidates({
        completedBefore: new Date(Date.now() - 60 * 60_000),
        idleHours: 12,
        depotLabel: DEPOT_LABEL,
        limit: 200,
      });
      expect(before.map((candidate) => candidate.id)).not.toContain(due.run.id);
    });

    it('R-IT-04b — khach chua khai nguong nghi: ung vien chi la vong chay CO THE dong duoc', async () => {
      const home = await finishedRun(FAR_LABEL, { home: true });
      const away = await finishedRun(FAR_LABEL);

      const candidates = await movement.listRunClosureCandidates({
        completedBefore: new Date(Date.now() + 60_000),
        idleHours: null,
        depotLabel: DEPOT_LABEL,
        limit: 200,
      });
      const ids = candidates.map((candidate) => candidate.id);

      // Ve bai: co the dong duoc bang su kien, nen phai co mat.
      expect(ids).toContain(home.run.id);
      // Xa bai + khong co nguong: KHONG BAO GIO dong duoc bang thoi gian, nen khong duoc chiem
      // mot cho trong trang — do la loi da sua sau khi mot vong soat doc lap do duoc no.
      expect(ids).not.toContain(away.run.id);
    });

    it('R-IT-05 — dong vong chay KHONG dung toi nghia vu thuong mai cua don', async () => {
      const { run, order } = await finishedRun(DEPOT_LABEL);
      const before = await prisma.transportOrder.findUniqueOrThrow({ where: { id: order.id } });

      await freshProcess().closures.attempt(run.id, 'LEG_CHANGED');

      const after = await prisma.transportOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(after).toEqual(before);
      expect(after.status).toBe('OPEN');
    });

    it('R-IT-06 — vong chay da dong khong nhan them chang: lich su la bat bien', async () => {
      const { run } = await finishedRun(DEPOT_LABEL);
      await freshProcess().closures.attempt(run.id, 'LEG_CHANGED');

      await expect(
        movement.addLeg(
          run.id,
          { sequence: 9, kind: 'EMPTY', originLabel: 'A', destinationLabel: 'B' },
          ACTOR,
        ),
      ).rejects.toMatchObject({ reason: 'LEG_RUN_TERMINAL' });

      const persisted = await movement.getRun(run.id);
      expect(persisted.legs).toHaveLength(2);
    });
  },
);
