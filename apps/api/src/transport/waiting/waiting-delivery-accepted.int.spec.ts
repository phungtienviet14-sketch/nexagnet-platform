import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { PrismaService } from '../../config/prisma.service.js';
import { CheckpointLegFieldTruthSource } from '../checkpoint/checkpoint-leg-field-truth.source.js';
import {
  TransportCheckpointCoreFactsAdapter,
  TransportCheckpointLocationFacts,
} from '../checkpoint/checkpoint-facts.port.js';
import type {
  CheckpointRepository,
  CreateCheckpointInput,
} from '../checkpoint/checkpoint.repository.js';
import { CheckpointService } from '../checkpoint/checkpoint.service.js';
import type { RunCheckpoint, RunCheckpointType } from '../checkpoint/checkpoint.types.js';
import { PrismaCheckpointRepository } from '../checkpoint/prisma-checkpoint.repository.js';
import { PrismaFleetRepository } from '../fleet/prisma-fleet.repository.js';
import { isTerminalRunStatus } from '../movement/movement-lifecycle.js';
import { MovementService } from '../movement/movement.service.js';
import type { RunLegStatus } from '../movement/movement.types.js';
import { PrismaMovementRepository } from '../movement/prisma-movement.repository.js';
import {
  MovementRunWriteGuard,
  RunWriteGuard,
  type RunWriteScope,
  type RunWriteTransaction,
} from '../movement/run-write-guard.port.js';
import { PlanningService } from '../planning/planning.service.js';
import type { TransportPlanningPolicy } from '../planning/planning.types.js';
import { PrismaRunPlanRepository } from '../planning/prisma-planning.repository.js';
import { TransportDomainError } from '../transport.errors.js';
import { PrismaWaitingSessionRepository } from './prisma-waiting.repository.js';
import { DeliveryWaitingCloser } from './waiting-close.port.js';
import { WaitingRunClosureBlockerSource } from './waiting-run-closure-blocker.source.js';
import type { CreateWaitingSessionInput, WaitingSessionRepository } from './waiting.repository.js';
import { WaitingSessionService } from './waiting.service.js';
import type { DeliveryWaitingSession } from './waiting.types.js';

/**
 * KHACH DA NHAN HANG THI KHONG MO PHIEN CHO MOI — `#363`, tren POSTGRES THAT.
 *
 * ============================================================================================
 * BAT BIEN
 * ============================================================================================
 *
 *   chua co `DELIVERY_ACCEPTED` tren chang  ->  lenh mo phien cho theo dung luat cu;
 *   `DELIVERY_ACCEPTED` DA commit            ->  KHONG mot phien cho MOI nao duoc mo
 *                                                (`WAITING_DELIVERY_ALREADY_ACCEPTED`).
 *
 * Ngoai le duy nhat la GUI LAI: cung `legId + clientEventId` da thanh cong TRUOC lan nhan hang thi
 * van nhan lai dung phien cu — ke ca khi ban gui lai xep hang o khoa SAU lan nhan hang.
 *
 * Hinh dang bi cam: moc nhan hang commit TRUOC, roi mot phien `OPEN` commit SAU. Lich su doc len
 * thanh "khach da nhan hang" roi moi "bat dau cho", va phien do giu vong chay o
 * `OPEN_WAITING_SESSION` — cau noi dong phien (`closeByAcceptance`) da chay xong tu truoc va khong
 * thay phien nao de dong.
 *
 * ============================================================================================
 * VI SAO PHAI LA POSTGRES, VA VI SAO PHAI EP THU TU
 * ============================================================================================
 *
 * Truoc `#363`, `WAITING_DELIVERY_ALREADY_ACCEPTED` chi la phep kiem SOM: lenh mo doc chuoi moc,
 * roi lay khoa hang `TransportVehicleRun`, va DUOI khoa chi doc lai vong chay + chang. Lan ghi moc
 * nhan hang gianh CHINH khoa do (`CheckpointService`, `#293` R2), nen cua so khong nam o khoa — no
 * nam o ban doc CU cua lenh mo. Cua so do chi ton tai giua HAI giao dich that.
 *
 * Tep nay khong them khoa thu hai. No do hai thu tu ma khoa cho phep, moi thu tu bang hai cach ep:
 *
 *   · A — lenh mo thang khoa: moc nhan hang xep hang sau, commit, roi cau noi dong DUNG phien do
 *     (WD-IT-04); ke ca khi lan nhan hang DEN truoc va dong dau gio truoc lenh mo (WD-IT-05);
 *   · B — lan nhan hang thang: commit trong khe giua phep kiem som va khoa cua lenh mo (WD-IT-06),
 *     hoac GIU khoa trong khi lenh mo xep hang sau no (WD-IT-07) — lenh mo doc lai moc DUOI khoa va
 *     bi tu choi, khong phien nao.
 *
 * Roi chay THAT nhieu vong khong xep thu tu (WD-IT-08), voi `xid` lam nhan chung thu tu commit.
 *
 * Chay bang `RUN_PRISMA_IT=1`; khong co bien do thi ca khoi khong chay.
 */

const CODE_PREFIX = 'IT-A363';
const PLATE_PREFIX = 'IT-A363-XE';
const PHONE_PREFIX = '0988A363';
const ACTOR = 'it-a363';

/** Cung con so voi moi tep IT cham trigger cua moc/phien cho — xem `transport-waiting.int.spec.ts`. */
const WAITING_TRIGGER_LOCK = 279_005;
const PROTECTED_TABLES = [
  ['TransportDeliveryWaitingSession', 'transport_waiting_session_immutable'],
  ['TransportRunCheckpoint', 'transport_run_checkpoint_append_only'],
] as const;

const CORE_POLICY = { timeZone: 'Asia/Ho_Chi_Minh' } as const;
const DEPOT_LABEL = 'IT-A363 Bãi xe';
const PICKUP_LABEL = 'IT-A363 Kho lấy hàng';
const FAR_LABEL = 'IT-A363 Điểm giao xa';
const ACCEPTED_MESSAGE = 'Nguoi nhan da nhan hang — khong con gi de cho';

/** So vong cua bai dua THAT. Moi vong la mot vong chay moi — chang chi nhan hang duoc mot lan. */
const STRESS_ROUNDS = 12;
/** Tran cho mot nguoi ghi xuat hien trong hang doi cua khoa — du rong cho may CI dang tai. */
const LOCK_QUEUE_TIMEOUT_MS = 15_000;
/**
 * Khoang dong ho toi thieu giua lan nhan hang DEN cua khoa va lenh mo bat dau (WD-IT-05). Lon hon
 * nhieu mot mili giay — do phan giai cua `Date` — nen hai gio dong dau khong the trung nhau.
 */
const CLOCK_GAP_MS = 25;
const TEST_TIMEOUT_MS = 60_000;
const STRESS_TIMEOUT_MS = 240_000;
/**
 * Giao dich don dep: cho lay mot ket noi, roi cho khoa tu van cua tep khac (ke ca mot khoa bi ro,
 * xem `cleanup()`). Cong lai van duoi tran 60 s cua hook.
 */
const CLEANUP_CONNECTION_WAIT_MS = 10_000;
const CLEANUP_TX_TIMEOUT_MS = 45_000;

const POLICY: TransportPlanningPolicy = {
  grouping: 'ONE_ORDER_PER_RUN',
  depots: [{ code: 'IT-A363-DEPOT', label: DEPOT_LABEL }],
  closure: { idleHours: null },
  sweep: { intervalSeconds: 60, batchSize: 50 },
};

type Outcome<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string };

const reasonOfError = (error: unknown): string =>
  error instanceof TransportDomainError ? error.reason : `UNEXPECTED:${String(error)}`;

/**
 * Ket cuc cua mot lenh, KHONG nem — gan NGAY khi lenh duoc goi, de mot lenh bi tu choi som khong
 * thanh mot `Unhandled Rejection` trong luc bai kiem con dang doi mot tin hieu khac.
 */
const settle = <T>(work: Promise<T>): Promise<Outcome<T>> =>
  work.then(
    (value) => ({ ok: true, value }) as const,
    (error: unknown) => ({ ok: false, reason: reasonOfError(error) }) as const,
  );

/** Nguyen loi — de khang dinh ca LOAI loi va CAU CHU len man hinh, khong chi ma may loc. */
const errorOf = async (work: Promise<unknown>): Promise<TransportDomainError> => {
  try {
    await work;
  } catch (error) {
    if (error instanceof TransportDomainError) return error;
    throw error;
  }
  throw new Error('khong nem loi nao ca');
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Mot tin hieu doi duoc bang `await` — de biet CHAC mot nguoi ghi da toi dung cho. */
const aSignal = <T>() => {
  let fire!: (value: T) => void;
  const fired = new Promise<T>((resolve) => {
    fire = resolve;
  });
  return { fire, fired };
};

/** `xid` cua giao dich dang mo — dang so ma `pg_locks.transactionid` dung (32 bit). */
const currentXid = async (tx: RunWriteTransaction): Promise<string> => {
  const rows = await (tx as PrismaService).$queryRaw<{ xid: string }[]>`
    SELECT (txid_current() % 4294967296)::text AS "xid"`;
  return rows[0]!.xid;
};

describe.runIf(process.env.RUN_PRISMA_IT === '1')(
  '#363 — khach da nhan hang thi khong mo phien cho moi, va lenh mo khong dua duoc voi lan nhan hang',
  () => {
    const prisma = new PrismaService();
    const movementRepo = new PrismaMovementRepository(prisma);
    const fleet = new PrismaFleetRepository(prisma);
    const checkpointRepo = new PrismaCheckpointRepository(prisma);
    const sessionRepo = new PrismaWaitingSessionRepository(prisma);
    const audit = new AuditLogService(new InMemoryAuditLogRepository());
    const movement = new MovementService(movementRepo, fleet, audit, CORE_POLICY);
    const planning = new PlanningService(
      movement,
      new PrismaRunPlanRepository(prisma),
      fleet,
      audit,
      CORE_POLICY,
      POLICY,
    );
    /** Nguon hien truong THAT — dung thu `RunsController` chuyen vao `transitionLeg()`. */
    const fieldTruth = new CheckpointLegFieldTruthSource(checkpointRepo);
    const guard = new MovementRunWriteGuard(movementRepo);
    const core = new TransportCheckpointCoreFactsAdapter(movementRepo, fleet);
    /** Nguon chan dong vong chay THAT cua phien cho — `OPEN_WAITING_SESSION`. */
    const waitingBlockers = new WaitingRunClosureBlockerSource(sessionRepo);

    const noLocation = new (class extends TransportCheckpointLocationFacts {
      async findObservation(): Promise<null> {
        return null;
      }
    })();

    /**
     * `WaitingSessionService` DAY DU nhu luc chay. Cac bai ep thu tu thay DUNG MOT thu: cong khoa
     * (dung truoc khoa) hoac kho phien cho (dung/ghi nhan ben trong khoa) — con lai la hang that.
     */
    const waitingWith = (
      over: { readonly sessions?: WaitingSessionRepository; readonly guard?: RunWriteGuard } = {},
    ) =>
      new WaitingSessionService(
        over.sessions ?? sessionRepo,
        checkpointRepo,
        core,
        over.guard ?? guard,
        CORE_POLICY,
      );
    const waiting = waitingWith();

    /**
     * Ghi moc hien truong THAT, VOI cau noi dong phien (`DeliveryWaitingCloser`) — cai ma `#279` O4
     * noi vao `CheckpointService` o luc chay. Khong co no thi bai dua A khong do duoc gi: phien se
     * khong bao gio dong bang lan nhan hang.
     */
    const checkpointsWith = (
      over: {
        readonly repo?: CheckpointRepository;
        readonly guard?: RunWriteGuard;
        readonly closer?: DeliveryWaitingCloser;
      } = {},
    ) =>
      new CheckpointService(
        over.repo ?? checkpointRepo,
        core,
        noLocation,
        over.guard ?? guard,
        CORE_POLICY,
        // Chinh sach vi tri RONG: tep nay hoi ve MOC va KHOA, khong hoi ban dinh vi.
        { locationRequiredTypes: [] },
        undefined,
        undefined,
        over.closer ?? waiting,
      );
    const checkpoints = checkpointsWith();

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

      /*
       * TAT TRIGGER TRONG MOT GIAO DICH, voi khoa tu van MUC GIAO DICH.
       *
       * Cac tep anh em lay `pg_advisory_lock` MUC PHIEN qua client Prisma CO POOL, roi nha bang
       * `pg_advisory_unlock` o mot lenh KHAC. Hai lenh do co the roi vao hai ket noi khac nhau: lan
       * nha tra `false` (log Postgres: *"you don't own a lock of type ExclusiveLock"*) va khoa o lai
       * tren ket noi kia toi luc `$disconnect()`, chan buoc don cua moi tep khac — ke ca buoc don sau
       * cua chinh tep do. Do tren CI run 35811743513: bon lan trong mot job, mot lan lam `afterAll`
       * cua `run-closure-concurrency.int.spec.ts` qua 10 s.
       *
       * O day moi lenh di qua CUNG mot giao dich: khoa nha luc commit/rollback, khong con cho nao ro.
       * Van loai tru duoc nhau voi cac tep kia (cung con so, cung khong gian khoa tu van), va tep
       * khac khong bao gio thay trigger dang tat — lan tat va lan bat commit cung nhau.
       */
      await prisma.$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${WAITING_TRIGGER_LOCK})`);
          for (const [table, trigger] of PROTECTED_TABLES) {
            await tx.$executeRawUnsafe(`ALTER TABLE "${table}" DISABLE TRIGGER "${trigger}"`);
          }
          await tx.transportDeliveryWaitingSession.deleteMany({
            where: { runId: { in: runIds } },
          });
          await tx.transportRunCheckpoint.deleteMany({ where: { runId: { in: runIds } } });
          for (const [table, trigger] of PROTECTED_TABLES) {
            await tx.$executeRawUnsafe(`ALTER TABLE "${table}" ENABLE TRIGGER "${trigger}"`);
          }
        },
        { maxWait: CLEANUP_CONNECTION_WAIT_MS, timeout: CLEANUP_TX_TIMEOUT_MS },
      );

      await prisma.transportOrderRunPlan.deleteMany({ where: { runId: { in: runIds } } });
      await prisma.transportRunLeg.deleteMany({ where: { runId: { in: runIds } } });
      await prisma.transportRunAssignment.deleteMany({ where: { runId: { in: runIds } } });
      await prisma.transportVehicleRun.deleteMany({ where: { id: { in: runIds } } });
      await prisma.transportOrder.deleteMany({ where: { code: { startsWith: CODE_PREFIX } } });
      await prisma.transportVehicleAssignment.deleteMany({
        where: { vehicleId: { in: vehicleIds } },
      });
      await prisma.transportVehicle.deleteMany({ where: { id: { in: vehicleIds } } });
      await prisma.transportDriver.deleteMany({ where: { phone: { startsWith: PHONE_PREFIX } } });
      await prisma.auditLog.deleteMany({ where: { entityId: { in: runIds } } });
    }

    /* Tran 60 giay cho hai hook — cung ly do voi `waiting-terminal-leg.int.spec.ts`. */
    beforeAll(cleanup, TEST_TIMEOUT_MS);
    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    }, TEST_TIMEOUT_MS);

    let suffix = 0;
    const next = (label: string): string => `${CODE_PREFIX}:${label}:${++suffix}`;

    /** Doi trang thai chang qua DUNG duong `RunsController` goi — kem nguon hien truong that. */
    const move = (legId: string, to: RunLegStatus) =>
      movement.transitionLeg(legId, to, ACTOR, { fieldTruth });

    /**
     * Mot vong chay DANG CHAY, chang CO HANG da toi noi giao va CHUA co nguoi nhan nhan hang: chot
     * ke hoach qua duong runtime (`commit()` gan nguoi cam xe), chang RONG (bai -> kho) da chay xong.
     */
    const arrivedRun = async () => {
      suffix += 1;
      const login = `${CODE_PREFIX}-auth-${suffix}`;
      const vehicle = await fleet.createVehicle({
        registrationPlate: `${PLATE_PREFIX}-${suffix}`,
        vehicleClass: 'Dau keo',
      });
      const driver = await fleet.createDriver({
        fullName: `${CODE_PREFIX} Lai xe ${suffix}`,
        phone: `${PHONE_PREFIX}${suffix}`,
        licenceClass: 'FC',
        licenceExpiry: '2030-01-01',
        authUserId: login,
      });
      await fleet.assignDriverToVehicle(vehicle.id, driver.id, new Date());
      const order = await movement.createOrder(
        {
          code: `${CODE_PREFIX}-ORD-${suffix}`,
          originLabel: PICKUP_LABEL,
          destinationLabel: FAR_LABEL,
          businessDate: '2026-09-23',
        },
        ACTOR,
      );
      const { run, legs } = await planning.commit(
        order.id,
        { vehicleId: vehicle.id, idempotencyKey: `${CODE_PREFIX}-KEY-${suffix}` },
        ACTOR,
      );
      // Chon chang theo LOAI, khong theo chi so — `legs[0]` la chang RONG.
      const empty = legs.find((leg) => leg.kind === 'EMPTY');
      const loaded = legs.find((leg) => leg.kind === 'LOADED');
      if (!empty || !loaded) throw new Error('commit() khong sinh du hai chang EMPTY + LOADED');
      await move(empty.id, 'IN_TRANSIT');
      await move(empty.id, 'COMPLETED');
      await move(loaded.id, 'IN_TRANSIT');

      for (const type of ['PICKUP_ARRIVAL', 'PICKUP_DEPARTURE'] as const) {
        await record(login, run.id, loaded.id, type);
      }
      const arrival = await record(login, run.id, loaded.id, 'DELIVERY_ARRIVAL');
      return { run, loaded, login, driverId: driver.id, arrivalId: arrival.id };
    };

    const record = (
      login: string,
      runId: string,
      legId: string,
      type: RunCheckpointType,
      service: CheckpointService = checkpoints,
    ): Promise<RunCheckpoint> =>
      service.recordAsDriver({
        type,
        runId,
        legId,
        authUserId: login,
        clientEventId: next(type),
      });

    /** `Khach da nhan hang` — mot cham, dong ca phien cho dang mo qua cau noi. */
    const accept = (
      login: string,
      runId: string,
      legId: string,
      service: CheckpointService = checkpoints,
    ): Promise<RunCheckpoint> => record(login, runId, legId, 'DELIVERY_ACCEPTED', service);

    const startWaiting = (
      login: string,
      runId: string,
      legId: string,
      arrivalCheckpointId: string,
      clientEventId: string = next('wait'),
      service: WaitingSessionService = waiting,
    ): Promise<DeliveryWaitingSession> =>
      service.start({
        runId,
        legId,
        arrivalCheckpointId,
        reason: 'RECEIVER_NOT_READY',
        clientEventId,
        authUserId: login,
      });

    /* ---------------------------- doc THANG bang ---------------------------- */

    /** Hinh dang cuoi cua phien cho tren chang — du de doc ra ai dong no, bang moc nao. */
    const sessionsOnLeg = (legId: string) =>
      prisma.transportDeliveryWaitingSession.findMany({
        where: { legId },
        orderBy: { startedAt: 'asc' },
        select: { id: true, status: true, closeReason: true, closingCheckpointId: true },
      });

    const acceptancesOnLeg = (legId: string) =>
      prisma.transportRunCheckpoint.findMany({
        where: { legId, type: 'DELIVERY_ACCEPTED' },
        select: { id: true },
      });

    const closedByAcceptance = (sessionId: string, checkpointId: string) => ({
      id: sessionId,
      status: 'CLOSED',
      closeReason: 'RECEIVER_ACCEPTED',
      closingCheckpointId: checkpointId,
    });

    /**
     * NHAN CHUNG THU TU COMMIT giua lan MO phien va moc nhan hang.
     *
     * Khac `waiting-terminal-leg.int.spec.ts`: o day phien bi DONG boi chinh moc nhan hang, nen `xmin`
     * cua dong phien la giao dich DONG, khong con la giao dich MO. Nhan chung vi the la `xid` cua giao
     * dich mo phien — doc tren CHINH `tx` dang giu khoa, luc chen — so voi `xmin` cua dong moc (bang
     * chi ghi them, `xmin` khong bao gio doi). Cau `FOR UPDATE` la lenh dau tien can `xid` cua ca hai
     * duong ghi, nen giao dich nao LAY khoa truoc thi nhan `xid` truoc. Tuoi LON hon = CU hon.
     */
    const commitAgesOf = async (sessionXid: string, checkpointId: string) => {
      const rows = await prisma.$queryRaw<{ sessionAge: number; checkpointAge: number }[]>`
        SELECT
          age(${sessionXid}::text::xid)::int AS "sessionAge",
          (SELECT age("xmin") FROM "TransportRunCheckpoint" WHERE "id" = ${checkpointId})::int
            AS "checkpointAge"`;
      return rows[0]!;
    };

    /**
     * Cho toi khi CO NGUOI xep hang sau giao dich `xid` — tuc dang doi chinh khoa hang vong chay ma
     * giao dich do giu. Doc `pg_locks`, khong doan bang mot nhip ngu.
     */
    const waitForQueueBehind = async (xid: string): Promise<void> => {
      const deadline = Date.now() + LOCK_QUEUE_TIMEOUT_MS;
      for (;;) {
        const rows = await prisma.$queryRaw<{ waiting: number }[]>`
          SELECT count(*)::int AS "waiting" FROM pg_locks
          WHERE "locktype" = 'transactionid' AND "transactionid"::text = ${xid} AND NOT "granted"`;
        if ((rows[0]?.waiting ?? 0) > 0) return;
        if (Date.now() > deadline) {
          throw new Error(
            `Khong co lenh nao xep hang sau khoa cua giao dich ${xid} — hai duong ghi KHONG gianh cung khoa vong chay`,
          );
        }
        await sleep(25);
      }
    };

    /* ---------------------- cac cach ep thu tu hai nguoi ghi ---------------------- */

    /** Nguoi ghi DUNG o cua khoa: da qua moi phep kiem som, chua lay khoa. Dung cho CA HAI dich vu. */
    class PausedBeforeLock extends RunWriteGuard {
      constructor(
        private readonly arrived: () => void,
        private readonly gate: Promise<void>,
      ) {
        super();
      }

      async underRunLock<T>(
        runId: string,
        write: (scope: RunWriteScope) => Promise<T>,
      ): Promise<T> {
        this.arrived();
        await this.gate;
        return guard.underRunLock(runId, write);
      }
    }

    /** Lenh mo phien DANG GIU khoa, da qua cong duoi khoa, chua chen dong nao. */
    class PausedSessionCreate extends PrismaWaitingSessionRepository {
      constructor(
        private readonly holding: (xid: string) => void,
        private readonly gate: Promise<void>,
      ) {
        super(prisma);
      }

      override async create(
        input: CreateWaitingSessionInput,
        tx?: RunWriteTransaction,
      ): Promise<DeliveryWaitingSession> {
        this.holding(await currentXid(tx));
        await this.gate;
        return super.create(input, tx);
      }
    }

    /** Lan nhan hang DANG GIU khoa, da qua cong duoi khoa, chua chen moc. */
    class PausedCheckpointCreate extends PrismaCheckpointRepository {
      constructor(
        private readonly holding: (xid: string) => void,
        private readonly gate: Promise<void>,
      ) {
        super(prisma);
      }

      override async create(
        input: CreateCheckpointInput,
        tx?: RunWriteTransaction,
      ): Promise<RunCheckpoint> {
        this.holding(await currentXid(tx));
        await this.gate;
        return super.create(input, tx);
      }
    }

    /** Khong dung ai — chi ghi lai `xid` cua giao dich da MO moi phien, cho bai dua that. */
    class XidRecordingSessions extends PrismaWaitingSessionRepository {
      readonly creators = new Map<string, string>();

      constructor() {
        super(prisma);
      }

      override async create(
        input: CreateWaitingSessionInput,
        tx?: RunWriteTransaction,
      ): Promise<DeliveryWaitingSession> {
        const xid = await currentXid(tx);
        const session = await super.create(input, tx);
        this.creators.set(session.id, xid);
        return session;
      }
    }

    /** Cau noi DUNG sau khi moc nhan hang da commit — de nhin thay cai khe truoc khi phien dong. */
    class PausedCloser extends DeliveryWaitingCloser {
      constructor(
        private readonly reached: () => void,
        private readonly gate: Promise<void>,
      ) {
        super();
      }

      async closeByAcceptance(checkpoint: RunCheckpoint): Promise<DeliveryWaitingSession | null> {
        this.reached();
        await this.gate;
        return waiting.closeByAcceptance(checkpoint);
      }
    }

    /* ======================================================================================
     * TUAN TU
     * ====================================================================================== */

    it(
      'WD-IT-01 — khach DA nhan hang: lenh mo moi bi tu choi, khong phien nao, khong gi giu vong chay',
      async () => {
        const { run, loaded, login, driverId, arrivalId } = await arrivedRun();
        const accepted = await accept(login, run.id, loaded.id);

        const error = await errorOf(startWaiting(login, run.id, loaded.id, arrivalId));
        expect(error).toMatchObject({
          reason: 'WAITING_DELIVERY_ALREADY_ACCEPTED',
          kind: 'CONFLICT',
          message: ACCEPTED_MESSAGE,
        });
        expect(await sessionsOnLeg(loaded.id)).toEqual([]);
        expect(await waitingBlockers.blockersForRun(run.id)).toEqual([]);

        /*
         * DOI CHUNG AM — lenh ghi cua `main` truoc `#363`, NGUYEN VAN: duoi khoa vong chay, chi doc lai
         * vong chay + chang, roi chen. Tren CHINH trang thai nay Postgres nhan no — khong rang buoc,
         * khong trigger nao cua kho chan mot phien cho tren chang da co moc nhan hang. Nen cong o
         * `WaitingSessionService` la lop chan DUY NHAT, va khang dinh o tren moi co nghia.
         *
         * Dat SAU khang dinh chinh vi no lam ban chinh fixture nay (va chi fixture nay).
         */
        const legacy = await guard.underRunLock(run.id, async (scope) => {
          expect(isTerminalRunStatus(scope.run.status)).toBe(false);
          expect(scope.legs.find((leg) => leg.id === loaded.id)?.status).toBe('IN_TRANSIT');
          return sessionRepo.create(
            {
              runId: run.id,
              legId: loaded.id,
              driverId,
              arrivalCheckpointId: arrivalId,
              reason: 'RECEIVER_NOT_READY',
              startedAt: new Date(),
              startedBy: login,
              startClientEventId: next('legacy'),
              note: 'IT-A363 doi chung am',
              businessDate: '2026-09-23',
            },
            scope.tx,
          );
        });
        expect(await acceptancesOnLeg(loaded.id)).toEqual([{ id: accepted.id }]);
        expect(await sessionsOnLeg(loaded.id)).toEqual([
          { id: legacy.id, status: 'OPEN', closeReason: null, closingCheckpointId: null },
        ]);
        // ...va dung phien do la cai giu vong chay lai: hau qua ma `#363` chan tu goc.
        expect(await waitingBlockers.blockersForRun(run.id)).toEqual(['OPEN_WAITING_SESSION']);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'WD-IT-02 — gui lai DUNG lenh da mo truoc lan nhan hang: tra dung phien cu (da dong); lenh MOI bi chan',
      async () => {
        const { run, loaded, login, arrivalId } = await arrivedRun();
        const eventId = next('wait-once');
        const first = await startWaiting(login, run.id, loaded.id, arrivalId, eventId);
        const accepted = await accept(login, run.id, loaded.id);
        expect(await sessionsOnLeg(loaded.id)).toEqual([closedByAcceptance(first.id, accepted.id)]);

        const replayed = await startWaiting(login, run.id, loaded.id, arrivalId, eventId);
        expect(replayed.id).toBe(first.id);
        expect(replayed.status).toBe('CLOSED');
        // Gui lai khong phai cua sau: mot lenh MOI sau lan nhan hang thi van bi chan.
        const fresh = await settle(startWaiting(login, run.id, loaded.id, arrivalId));
        expect(fresh).toEqual({ ok: false, reason: 'WAITING_DELIVERY_ALREADY_ACCEPTED' });
        expect(await sessionsOnLeg(loaded.id)).toEqual([closedByAcceptance(first.id, accepted.id)]);
        expect(await waitingBlockers.blockersForRun(run.id)).toEqual([]);
      },
      TEST_TIMEOUT_MS,
    );

    /**
     * GUI LAI xep hang o khoa SAU lan nhan hang.
     *
     * Hai ban cua CUNG mot lan bam cung qua phep kiem som truoc khi ban nao ghi. Ban thu nhat mo
     * phien, lan nhan hang dong no, roi ban thu hai moi lay khoa. Duoi khoa, ban thu hai thay moc
     * nhan hang — nhung no la mot lan GUI LAI cua mot lenh da thanh cong, nen cau tra loi dung la
     * phien cu, khong phai `WAITING_DELIVERY_ALREADY_ACCEPTED`: gui lai dung truoc moi phep kiem,
     * ca duoi khoa.
     */
    it(
      'WD-IT-03 — ban gui lai cua lenh mo lay khoa SAU lan nhan hang: van nhan dung phien cu, khong 409',
      async () => {
        const { run, loaded, login, arrivalId } = await arrivedRun();
        const eventId = next('wait-dup');
        const firstAt = aSignal<void>();
        const firstGate = aSignal<void>();
        const againAt = aSignal<void>();
        const againGate = aSignal<void>();

        const first = settle(
          startWaiting(
            login,
            run.id,
            loaded.id,
            arrivalId,
            eventId,
            waitingWith({ guard: new PausedBeforeLock(() => firstAt.fire(), firstGate.fired) }),
          ),
        );
        const again = settle(
          startWaiting(
            login,
            run.id,
            loaded.id,
            arrivalId,
            eventId,
            waitingWith({ guard: new PausedBeforeLock(() => againAt.fire(), againGate.fired) }),
          ),
        );
        await Promise.all([firstAt.fired, againAt.fired]);
        expect(await sessionsOnLeg(loaded.id)).toEqual([]);

        firstGate.fire();
        const opened = await first;
        if (!opened.ok) throw new Error(`ban thu nhat phai mo duoc phien: ${opened.reason}`);
        const accepted = await accept(login, run.id, loaded.id);
        expect(await sessionsOnLeg(loaded.id)).toEqual([
          closedByAcceptance(opened.value.id, accepted.id),
        ]);

        againGate.fire();
        const replayed = await again;
        expect(replayed).toMatchObject({ ok: true, value: { id: opened.value.id } });
        expect(await sessionsOnLeg(loaded.id)).toEqual([
          closedByAcceptance(opened.value.id, accepted.id),
        ]);
        expect(await waitingBlockers.blockersForRun(run.id)).toEqual([]);
      },
      TEST_TIMEOUT_MS,
    );

    /* ======================================================================================
     * CUOC DUA A — lenh mo THANG khoa, lan nhan hang xep hang sau
     * ====================================================================================== */

    it(
      'WD-IT-04 — dua A: lenh mo GIU khoa -> lan nhan hang XEP HANG sau, commit, roi cau noi dong DUNG phien do',
      async () => {
        const { run, loaded, login, arrivalId } = await arrivedRun();
        const holding = aSignal<string>();
        const gate = aSignal<void>();
        const racing = waitingWith({
          sessions: new PausedSessionCreate((xid) => holding.fire(xid), gate.fired),
        });

        const opening = settle(
          startWaiting(login, run.id, loaded.id, arrivalId, next('wait-race'), racing),
        );
        const xid = await holding.fired;
        const accepting = settle(accept(login, run.id, loaded.id));

        // Lan nhan hang dang DOI chinh khoa ma lenh mo giu — cung mot ranh gioi serialize.
        await waitForQueueBehind(xid);
        expect(await acceptancesOnLeg(loaded.id)).toEqual([]);
        gate.fire();

        const opened = await opening;
        const accepted = await accepting;
        if (!opened.ok || !accepted.ok) {
          throw new Error(`ca hai phai thanh cong: ${JSON.stringify({ opened, accepted })}`);
        }
        const ages = await commitAgesOf(xid, accepted.value.id);
        expect(ages.sessionAge).toBeGreaterThan(ages.checkpointAge);

        // Ket cuc cuoi: moc CO, phien DONG bang chinh moc do, khong gi giu vong chay.
        expect(await sessionsOnLeg(loaded.id)).toEqual([
          closedByAcceptance(opened.value.id, accepted.value.id),
        ]);
        const closed = await sessionRepo.find(opened.value.id);
        expect(closed?.endedAt).toEqual(accepted.value.receivedAt);
        expect(await waitingBlockers.blockersForRun(run.id)).toEqual([]);
      },
      TEST_TIMEOUT_MS,
    );

    /**
     * DUA A, DONG HO NGUOC — lan nhan hang DEN va qua moi phep kiem som truoc, nhung lenh mo LAY
     * khoa truoc.
     *
     * Khoa quyet dinh thu tu COMMIT, khong quyet dinh thu tu DONG DAU GIO. Neu moc nhan hang lay gio
     * cua no TRUOC khoa thi gio do nam truoc `startedAt` cua mot phien ma no dong — va
     * `evaluateWaitingClose` tu choi dung nhu voi mot dong ho bi keo lui (`WAITING_END_BEFORE_START`):
     * phien o lai `OPEN`, giu vong chay o `OPEN_WAITING_SESSION`, du thu tu commit hoan toan hop le.
     */
    it(
      'WD-IT-05 — dua A: lan nhan hang toi cua khoa TRUOC lenh mo nhung lenh mo lay khoa truoc -> phien van dong bang lan nhan hang',
      async () => {
        const { run, loaded, login, arrivalId } = await arrivedRun();
        const acceptAtLock = aSignal<void>();
        const acceptGate = aSignal<void>();
        const racingAccept = checkpointsWith({
          guard: new PausedBeforeLock(() => acceptAtLock.fire(), acceptGate.fired),
        });
        const accepting = settle(accept(login, run.id, loaded.id, racingAccept));
        await acceptAtLock.fired;
        // Lan nhan hang da qua moi phep kiem som va dung o cua khoa. Dong ho troi di mot nhip truoc
        // khi lenh mo bat dau — moi gio lenh mo dong dau deu MUON hon luc lan nhan hang toi cua khoa.
        await sleep(CLOCK_GAP_MS);

        const holding = aSignal<string>();
        const openGate = aSignal<void>();
        const racingWait = waitingWith({
          sessions: new PausedSessionCreate((xid) => holding.fire(xid), openGate.fired),
        });
        const opening = settle(
          startWaiting(login, run.id, loaded.id, arrivalId, next('wait-race'), racingWait),
        );
        const xid = await holding.fired;

        // Lenh mo GIU khoa; lan nhan hang buoc qua cua va XEP HANG sau no.
        acceptGate.fire();
        await waitForQueueBehind(xid);
        expect(await acceptancesOnLeg(loaded.id)).toEqual([]);
        openGate.fire();

        const opened = await opening;
        const accepted = await accepting;
        if (!opened.ok || !accepted.ok) {
          throw new Error(`ca hai phai thanh cong: ${JSON.stringify({ opened, accepted })}`);
        }
        const ages = await commitAgesOf(xid, accepted.value.id);
        expect(ages.sessionAge).toBeGreaterThan(ages.checkpointAge);

        // Gio cua moc DONG khong duoc nam truoc gio MO cua phien ma no dong.
        expect(accepted.value.receivedAt.getTime()).toBeGreaterThanOrEqual(
          opened.value.startedAt.getTime(),
        );
        expect(await sessionsOnLeg(loaded.id)).toEqual([
          closedByAcceptance(opened.value.id, accepted.value.id),
        ]);
        expect(await waitingBlockers.blockersForRun(run.id)).toEqual([]);
      },
      TEST_TIMEOUT_MS,
    );

    /* ======================================================================================
     * CUOC DUA B — lan nhan hang THANG, lenh mo lay khoa sau
     * ====================================================================================== */

    it(
      'WD-IT-06 — dua B: lan nhan hang commit TRONG khe giua phep kiem som va khoa cua lenh mo -> lenh mo bi tu choi',
      async () => {
        const { run, loaded, login, arrivalId } = await arrivedRun();
        const atLock = aSignal<void>();
        const gate = aSignal<void>();
        const racing = waitingWith({
          guard: new PausedBeforeLock(() => atLock.fire(), gate.fired),
        });

        const opening = settle(
          startWaiting(login, run.id, loaded.id, arrivalId, next('wait-race'), racing),
        );
        await atLock.fired;
        // Phep kiem som cua lenh mo DA qua: luc do chua co moc nhan hang nao.
        const accepted = await accept(login, run.id, loaded.id);
        // Cau noi da chay xong — va khong co phien nao de dong. Day la cho phien bi cam se "mo coi".
        expect(await acceptancesOnLeg(loaded.id)).toEqual([{ id: accepted.id }]);
        expect(await sessionsOnLeg(loaded.id)).toEqual([]);
        gate.fire();

        expect(await opening).toEqual({ ok: false, reason: 'WAITING_DELIVERY_ALREADY_ACCEPTED' });
        expect(await sessionsOnLeg(loaded.id)).toEqual([]);
        expect(await waitingBlockers.blockersForRun(run.id)).toEqual([]);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'WD-IT-07 — dua B: lan nhan hang dang GIU khoa -> lenh mo XEP HANG sau no, doc lai moc duoi khoa, bi tu choi',
      async () => {
        const { run, loaded, login, arrivalId } = await arrivedRun();
        const holding = aSignal<string>();
        const gate = aSignal<void>();
        const racingAccept = checkpointsWith({
          repo: new PausedCheckpointCreate((xid) => holding.fire(xid), gate.fired),
        });

        const accepting = settle(accept(login, run.id, loaded.id, racingAccept));
        const xid = await holding.fired;
        // Lenh mo bat dau KHI lan nhan hang con chua commit: phep kiem som cua no khong thay moc nao.
        const opening = settle(startWaiting(login, run.id, loaded.id, arrivalId));

        await waitForQueueBehind(xid);
        expect(await acceptancesOnLeg(loaded.id)).toEqual([]);
        gate.fire();

        const accepted = await accepting;
        if (!accepted.ok) throw new Error(`lan nhan hang phai thanh cong: ${accepted.reason}`);
        expect(await opening).toEqual({ ok: false, reason: 'WAITING_DELIVERY_ALREADY_ACCEPTED' });
        expect(await acceptancesOnLeg(loaded.id)).toEqual([{ id: accepted.value.id }]);
        expect(await sessionsOnLeg(loaded.id)).toEqual([]);
        expect(await waitingBlockers.blockersForRun(run.id)).toEqual([]);
      },
      TEST_TIMEOUT_MS,
    );

    /* ======================================================================================
     * DUA THAT — nhieu vong, khong xep thu tu
     * ====================================================================================== */

    it(
      'WD-IT-08 — dua THAT nhieu vong khong xep thu tu: 0 phien mo SAU lan nhan hang, 0 phien con mo',
      async () => {
        for (let round = 0; round < STRESS_ROUNDS; round += 1) {
          const { run, loaded, login, arrivalId } = await arrivedRun();
          const recording = new XidRecordingSessions();
          const racing = waitingWith({ sessions: recording });
          // Doi ben xuat phat truoc qua tung vong de ca hai thu tu deu co co hoi xay ra.
          const waitingFirst = round % 2 === 0;
          const offset = Math.floor(round / 2);

          const [opened, accepted] = await Promise.all([
            settle(
              sleep(waitingFirst ? 0 : offset).then(() =>
                startWaiting(login, run.id, loaded.id, arrivalId, next('wait-race'), racing),
              ),
            ),
            settle(sleep(waitingFirst ? offset : 0).then(() => accept(login, run.id, loaded.id))),
          ]);

          if (!accepted.ok) {
            throw new Error(`vong ${round}: lan nhan hang that bai ${accepted.reason}`);
          }
          expect(await acceptancesOnLeg(loaded.id)).toEqual([{ id: accepted.value.id }]);

          if (opened.ok) {
            // Phien thang: no PHAI lay khoa (va commit) TRUOC moc nhan hang, va bi chinh moc do dong.
            const creator = recording.creators.get(opened.value.id);
            if (creator === undefined) {
              throw new Error(`vong ${round}: khong ghi duoc xid mo phien`);
            }
            const ages = await commitAgesOf(creator, accepted.value.id);
            expect(ages.sessionAge).toBeGreaterThan(ages.checkpointAge);
            expect(await sessionsOnLeg(loaded.id)).toEqual([
              closedByAcceptance(opened.value.id, accepted.value.id),
            ]);
          } else {
            expect(opened.reason).toBe('WAITING_DELIVERY_ALREADY_ACCEPTED');
            expect(await sessionsOnLeg(loaded.id)).toEqual([]);
          }
          expect(await waitingBlockers.blockersForRun(run.id)).toEqual([]);
        }
      },
      STRESS_TIMEOUT_MS,
    );

    /* ======================================================================================
     * THU TU MA TU CHOI DUOI KHOA
     * ====================================================================================== */

    /**
     * WD-IT-09 — duoi khoa, `WAITING_DELIVERY_ALREADY_ACCEPTED` dung TRUOC `WAITING_ALREADY_OPEN`.
     *
     * Cung thu tu voi phep kiem som (`evaluateWaitingStart`): neu khach da nhan hang thi cau tra loi
     * dung la *"khong con gi de cho"*, khong phai *"dang co mot phien mo"*. Khe do co that: moc nhan
     * hang commit, nhung cau noi CHUA dong phien dang mo, va mot lenh mo khac (da qua phep kiem som
     * tu truoc) lay khoa dung luc do.
     */
    it(
      'WD-IT-09 — moc nhan hang da commit, phien cu CHUA kip dong: lenh mo khac duoi khoa nhan WAITING_DELIVERY_ALREADY_ACCEPTED',
      async () => {
        const { run, loaded, login, arrivalId } = await arrivedRun();
        const firstAt = aSignal<void>();
        const firstGate = aSignal<void>();
        const secondAt = aSignal<void>();
        const secondGate = aSignal<void>();

        const first = settle(
          startWaiting(
            login,
            run.id,
            loaded.id,
            arrivalId,
            next('wait-a'),
            waitingWith({ guard: new PausedBeforeLock(() => firstAt.fire(), firstGate.fired) }),
          ),
        );
        const second = settle(
          startWaiting(
            login,
            run.id,
            loaded.id,
            arrivalId,
            next('wait-b'),
            waitingWith({ guard: new PausedBeforeLock(() => secondAt.fire(), secondGate.fired) }),
          ),
        );
        await Promise.all([firstAt.fired, secondAt.fired]);
        firstGate.fire();
        const opened = await first;
        if (!opened.ok) throw new Error(`lenh mo thu nhat phai thanh cong: ${opened.reason}`);

        const bridgeReached = aSignal<void>();
        const bridgeGate = aSignal<void>();
        const accepting = settle(
          accept(
            login,
            run.id,
            loaded.id,
            checkpointsWith({
              closer: new PausedCloser(() => bridgeReached.fire(), bridgeGate.fired),
            }),
          ),
        );
        await bridgeReached.fired;
        // Moc nhan hang DA commit; phien cu VAN mo vi cau noi chua chay.
        expect(await acceptancesOnLeg(loaded.id)).toHaveLength(1);
        expect(await sessionsOnLeg(loaded.id)).toEqual([
          { id: opened.value.id, status: 'OPEN', closeReason: null, closingCheckpointId: null },
        ]);

        secondGate.fire();
        expect(await second).toEqual({ ok: false, reason: 'WAITING_DELIVERY_ALREADY_ACCEPTED' });

        bridgeGate.fire();
        const accepted = await accepting;
        if (!accepted.ok) throw new Error(`lan nhan hang phai thanh cong: ${accepted.reason}`);
        expect(await sessionsOnLeg(loaded.id)).toEqual([
          closedByAcceptance(opened.value.id, accepted.value.id),
        ]);
        expect(await waitingBlockers.blockersForRun(run.id)).toEqual([]);
      },
      TEST_TIMEOUT_MS,
    );
  },
);
