import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import type { TelemetryRecord, TelemetrySink } from '../../observability/telemetry-record.js';
import { TelemetryService } from '../../observability/telemetry.service.js';
import { InMemoryFleetRepository } from '../fleet/fleet.repository.js';
import { InMemoryMovementRepository } from '../movement/movement.repository.js';
import { MovementService } from '../movement/movement.service.js';
import { InMemoryRunPlanRepository } from './planning.repository.js';
import { PlanningService } from './planning.service.js';
import type {
  RunClosureBlocker,
  TransportPlanningPolicy,
} from './planning.types.js';
import { RunClosureBlockerSource } from './run-closure-blocker.source.js';
import { RunClosureService } from './run-closure.service.js';

/**
 * DONG VONG CHAY DO HE THONG QUAN — `#293` Lane R.
 *
 * Hai cau hoi ma lane nay dat ra, va bai kiem o day tra loi dung hai cau do:
 *
 *   · su that doi thi AI PHAN XU, va no co dong dung MOT LAN khong (R1, R2, R6, R7, R8);
 *   · khong co su kien nao danh thuc thi AI PHAN XU, va sau khi tien trinh chet thi sao (R3, R4).
 *
 * ============================================================================================
 * DONG HO: CHAY TU GIO THAT ROI DAY VE PHIA TRUOC
 * ============================================================================================
 *
 * `completedAt` cua mot chang do CHINH repository dat bang `new Date()` — no khong di qua dong ho
 * tiem. Nen dong ho o day bat dau tu gio that roi duoc day toi, cung cach va cung ly do nhu
 * `planning.service.spec.ts`: mot moc co dinh nam xa gio that se lam phep tru "xe nghi bao lau roi"
 * ra hang nghin gio, va bai nguong nghi se xanh vi mot ly do sai.
 */

const ACTOR = 'ke-toan';
const CORE_POLICY = { timeZone: 'Asia/Ho_Chi_Minh' } as const;
const DEPOT_LABEL = 'Bãi xe Hà Nội';
const FAR_LABEL = 'Hải Phòng';
const HOUR_MS = 3_600_000;

const policyWith = (over: Partial<TransportPlanningPolicy> = {}): TransportPlanningPolicy => ({
  grouping: over.grouping ?? 'ONE_ORDER_PER_RUN',
  depots: over.depots ?? [{ code: 'DEPOT-HN', label: DEPOT_LABEL }],
  closure: over.closure ?? { idleHours: null },
  sweep: over.sweep ?? { intervalSeconds: 60, batchSize: 50 },
});

/** Nguon su that GIA — de kiem HOP DONG cua cong, khong phai mot bang gia. */
class FakeBlockerSource extends RunClosureBlockerSource {
  constructor(private readonly behaviour: () => Promise<readonly RunClosureBlocker[]>) {
    super();
  }

  blockersForRun(): Promise<readonly RunClosureBlocker[]> {
    return this.behaviour();
  }
}

const decisionsOf = (records: readonly TelemetryRecord[]) =>
  records.filter((record) => record.type === 'decision') as unknown as { reason: string }[];

describe('dong vong chay do he thong quan (#293 Lane R)', () => {
  let fleet: InMemoryFleetRepository;
  let movementRepo: InMemoryMovementRepository;
  let plans: InMemoryRunPlanRepository;
  let movementAudit: InMemoryAuditLogRepository;
  let movement: MovementService;
  let planning: PlanningService;
  let now: Date;
  let records: TelemetryRecord[];
  let telemetry: TelemetryService;
  let sequence = 0;

  /**
   * DUNG LAI CA HAI LOP voi cung mot chinh sach.
   *
   * Che do gom nhom nam trong chinh sach cua `PlanningService` chu khong phai cua lop phan xu —
   * mot bai kiem dat MULTI o lop phan xu ma de `PlanningService` o ONE se kiem mot he thong khong
   * ton tai. Nen hai lop duoc dung cung luc, tu cung mot gia tri.
   */
  const configure = (
    over: Partial<TransportPlanningPolicy> = {},
    source?: RunClosureBlockerSource,
  ): RunClosureService => {
    const policy = policyWith(over);
    planning = new PlanningService(
      movement,
      plans,
      fleet,
      new AuditLogService(new InMemoryAuditLogRepository()),
      CORE_POLICY,
      policy,
      telemetry,
      () => now,
    );
    return new RunClosureService(planning, movement, policy, source, telemetry, () => now);
  };

  beforeEach(() => {
    now = new Date();
    sequence = 0;
    fleet = new InMemoryFleetRepository();
    movementRepo = new InMemoryMovementRepository();
    plans = new InMemoryRunPlanRepository();
    records = [];

    const sink: TelemetrySink = { record: (record) => records.push(record) };
    telemetry = new TelemetryService();
    telemetry.configure({
      release: { tenant: 'it', environment: 'test', gitSha: 'unknown', source: 'none' },
      privacy: 'full',
      sinks: [sink],
    });

    movementAudit = new InMemoryAuditLogRepository();
    movement = new MovementService(
      movementRepo,
      fleet,
      new AuditLogService(movementAudit),
      CORE_POLICY,
    );
  });

  const next = (prefix: string): string => `${prefix}-${(sequence += 1)}`;

  const aVehicle = () =>
    fleet.createVehicle({ registrationPlate: `29C-${10000 + sequence}`, vehicleClass: 'Đầu kéo' });

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

  /** Chay tron mot chang: lan banh roi ket thuc. Hai buoc, dung nhu may trang thai doi. */
  const runLeg = async (legId: string) => {
    await movement.transitionLeg(legId, 'IN_TRANSIT', ACTOR);
    return movement.transitionLeg(legId, 'COMPLETED', ACTOR);
  };

  /**
   * MOT VONG CHAY DA XONG VIEC.
   *
   * Chay HET cac chang cua ke hoach — ke ca chang rong dau tien. Mot chang `PLANNED` con lai se
   * lam `LEG_STILL_OPEN` chan moi thu, va bai kiem se do vi mot ly do khong lien quan den dieu no
   * dinh kiem.
   *
   * `home: true` them mot chang rong ve bai — su that VAN HANH do nguoi ghi khi no xay ra that,
   * khong phai mot chang ma bo lap ke hoach bia ra (`#276` L2).
   */
  const completedRun = async (
    destination = DEPOT_LABEL,
    options: { readonly home?: boolean } = {},
  ) => {
    const vehicle = await aVehicle();
    const order = await anOrder('Kho Hà Nội', destination);
    const { run, legs } = await planning.commit(
      order.id,
      { vehicleId: vehicle.id, idempotencyKey: next('k') },
      ACTOR,
    );
    for (const leg of legs) await runLeg(leg.id);

    if (options.home) {
      const home = await movement.addLeg(
        run.id,
        { sequence: legs.length + 1, kind: 'EMPTY', originLabel: destination, destinationLabel: DEPOT_LABEL },
        ACTOR,
      );
      await runLeg(home.id);
    }

    return { run: (await movement.getRun(run.id)).run, runId: run.id, order, vehicle };
  };

  const statusOf = async (runId: string) => (await movement.getRun(runId)).run.status;

  /**
   * Cac dong dau vet `transport.run.close.system` — nguon de dem "co may lan dong THAT".
   *
   * Dem tren so dau vet chu khong tren trang thai: mot vong chay da dong thi trang thai luon la
   * `COMPLETED`, du no duoc dong mot lan hay nam lan. So dau vet la thu duy nhat phan biet duoc.
   */
  const closeAuditRows = () => movementAudit.list({ action: 'transport.run.close.system' });

  /* ---------------------------------------------------------------- *
   * R2 — SU THAT DOI THI PHAN XU CHAY
   * ---------------------------------------------------------------- */

  describe('su kien danh thuc phan xu (R2)', () => {
    it('bai 1 — chang cuoi ket thuc TAI BAI: dong ngay, mot lan, voi ly do DEPOT_RETURN', async () => {
      const closures = configure();
      const { runId } = await completedRun();

      const first = await closures.attempt(runId, 'LEG_CHANGED');

      expect(first.closed).toBe(true);
      expect(first.verdict.trigger).toBe('DEPOT_RETURN');
      expect(await statusOf(runId)).toBe('COMPLETED');
      expect(await closeAuditRows()).toHaveLength(1);
    });

    it('bai 2 — goi lai (su kien lap, hai worker cung luot): cung ket qua cuoi, KHONG them dau vet', async () => {
      const closures = configure();
      const { runId } = await completedRun();

      const first = await closures.attempt(runId, 'LEG_CHANGED');
      const auditAfterFirst = await closeAuditRows();
      const second = await closures.attempt(runId, 'LEG_CHANGED');
      const third = await closures.attempt(runId, 'IDLE_SWEEP');

      expect(first.closed).toBe(true);
      expect(second.closed).toBe(false);
      expect(third.closed).toBe(false);
      expect(second.run.status).toBe('COMPLETED');
      expect(auditAfterFirst).toHaveLength(1);
      expect(await closeAuditRows()).toEqual(auditAfterFirst);
      expect(
        decisionsOf(records).filter((entry) => entry.reason === 'RUN_CLOSED_ON_DEPOT_RETURN'),
      ).toHaveLength(1);
    });

    it('bai 4 — con chang tuong lai: KHONG dong, va noi ro ly do', async () => {
      const closures = configure({ grouping: 'MULTI_ORDER_RUN' });
      const vehicle = await aVehicle();
      const orderA = await anOrder('Kho Hà Nội', FAR_LABEL);
      const first = await planning.commit(
        orderA.id,
        { vehicleId: vehicle.id, idempotencyKey: next('a') },
        ACTOR,
      );
      for (const leg of first.legs) await runLeg(leg.id);

      // Don thu hai noi vao CUNG vong chay: sinh them mot chang co hang CHUA chay.
      const orderB = await anOrder(FAR_LABEL, DEPOT_LABEL);
      const second = await planning.commit(
        orderB.id,
        { vehicleId: vehicle.id, idempotencyKey: next('b') },
        ACTOR,
      );

      const outcome = await closures.attempt(first.run.id, 'LEG_CHANGED');

      expect(second.run.id).toBe(first.run.id);
      expect(outcome.closed).toBe(false);
      expect(outcome.verdict.blockers).toContain('LEG_STILL_OPEN');
      expect(await statusOf(first.run.id)).toBe('ACTIVE');

      // Va khi chang cua don B ket thuc tai bai thi vong chay dong duoc — dieu kien chan la mot
      // su that TAM THOI, khong phai mot anh xa vinh vien.
      await runLeg(second.legs.find((leg) => leg.kind === 'LOADED')!.id);
      const afterB = await closures.attempt(first.run.id, 'LEG_CHANGED');
      expect(afterB.closed).toBe(true);
    });

    it('bai 5 — con ke hoach chua chay xong: KHONG dong, va noi ro ly do', async () => {
      const closures = configure({ grouping: 'MULTI_ORDER_RUN' });
      const vehicle = await aVehicle();

      // Don A chay tron ven, ve bai.
      const orderA = await anOrder('Kho Hà Nội', DEPOT_LABEL);
      const first = await planning.commit(
        orderA.id,
        { vehicleId: vehicle.id, idempotencyKey: next('a') },
        ACTOR,
      );
      for (const leg of first.legs) await runLeg(leg.id);

      // Don B da lap ke hoach nhung CHUA chay: chang cua no con `PLANNED`.
      const orderB = await anOrder(DEPOT_LABEL, FAR_LABEL);
      await planning.commit(
        orderB.id,
        { vehicleId: vehicle.id, idempotencyKey: next('b') },
        ACTOR,
      );

      const outcome = await closures.attempt(first.run.id, 'LEG_CHANGED');

      expect(outcome.closed).toBe(false);
      // HAI ma chan, khong phai mot: ke hoach B con mo, VA chang cua no con mo. Mot cong gop
      // chung thanh `false` se bat nguoi truc doc lai source moi biet vi sao.
      expect(outcome.verdict.blockers).toContain('LEG_STILL_OPEN');
      expect(outcome.verdict.blockers).toContain('PLAN_STILL_OPEN');
    });

    it('dong mot vong chay KHONG lam doi trang thai DON (R6)', async () => {
      const closures = configure();
      const { runId, order } = await completedRun();
      expect(order.status).toBe('OPEN');

      await closures.attempt(runId, 'LEG_CHANGED');

      expect((await movement.getOrder(order.id)).status).toBe('OPEN');
    });

    it('bai 17 — dong Run khong hoan thanh, khong nghiem thu, khong sinh cong no', async () => {
      const closures = configure();
      const { runId, order } = await completedRun();

      await closures.attempt(runId, 'LEG_CHANGED');

      /*
       * `MovementService` la toan bo be mat ghi cua truc van hanh. Sau mot lan dong vong chay,
       * khong mot truong nao cua DON duoc doi: khong `FULFILLED`, khong moc hoan thanh, khong mot
       * ban ghi nghiem thu hay doi soat nao — vi lop nay khong biet chung ton tai.
       */
      expect(await movement.getOrder(order.id)).toEqual(order);
    });
  });

  /* ---------------------------------------------------------------- *
   * R7 — HAI CHE DO GOM NHOM
   * ---------------------------------------------------------------- */

  describe('che do gom nhom (R7)', () => {
    it('bai 6 — MULTI: KHONG dong giua don A va don B', async () => {
      const closures = configure({ grouping: 'MULTI_ORDER_RUN' });
      const vehicle = await aVehicle();

      /*
       * CA HAI don duoc lap ke hoach TRUOC khi chiec xe lan banh.
       *
       * Do la cach duy nhat de cau hoi "vong chay co dong giua A va B khong" co nghia: mot he
       * thong chua biet don B ton tai thi dong vong chay sau khi A ve bai la DUNG, khong phai mot
       * loi. Cai phai kiem la khi B DA nam tren ke hoach ma vong chay van khong duoc dong.
       */
      const orderA = await anOrder('Kho Hà Nội', FAR_LABEL);
      const first = await planning.commit(
        orderA.id,
        { vehicleId: vehicle.id, idempotencyKey: next('a') },
        ACTOR,
      );
      const orderB = await anOrder(FAR_LABEL, DEPOT_LABEL);
      const second = await planning.commit(
        orderB.id,
        { vehicleId: vehicle.id, idempotencyKey: next('b') },
        ACTOR,
      );
      expect(second.run.id).toBe(first.run.id);

      // Don A xong. Don B con nguyen: vong chay KHONG duoc dong o giua hai don.
      for (const leg of first.legs) await runLeg(leg.id);
      const between = await closures.attempt(first.run.id, 'LEG_CHANGED');

      expect(between.closed).toBe(false);
      expect(between.verdict.blockers).toContain('LEG_STILL_OPEN');
      expect(await statusOf(first.run.id)).toBe('ACTIVE');

      // Don B chay xong, chang cuoi ve bai: luc nay moi dong.
      await runLeg(second.legs.find((leg) => leg.kind === 'LOADED')!.id);
      const afterB = await closures.attempt(first.run.id, 'LEG_CHANGED');

      expect(afterB.closed).toBe(true);
      expect(afterB.verdict.trigger).toBe('DEPOT_RETURN');
    });

    it('bai 6c — MULTI: het viec ma con xa bai thi CHO, khong phai bi chan', async () => {
      const closures = configure({ grouping: 'MULTI_ORDER_RUN' });
      const { runId } = await completedRun(FAR_LABEL);

      const outcome = await closures.attempt(runId, 'LEG_CHANGED');

      // Khong con gi chan, nhung cung chua den dieu kien dong. Hai trang thai khac nhau, va mot
      // bang dieu hanh gop chung lai se do ruc len moi buoi chieu.
      expect(outcome.closed).toBe(false);
      expect(outcome.verdict.blockers).toEqual([]);
      expect(outcome.verdict.holding).toBe(true);
    });

    it('bai 6b — MULTI: dong duoc khi chang cuoi cung ve bai', async () => {
      const closures = configure({ grouping: 'MULTI_ORDER_RUN' });
      const vehicle = await aVehicle();

      const orderA = await anOrder('Kho Hà Nội', FAR_LABEL);
      const first = await planning.commit(
        orderA.id,
        { vehicleId: vehicle.id, idempotencyKey: next('a') },
        ACTOR,
      );
      for (const leg of first.legs) await runLeg(leg.id);

      const orderB = await anOrder(FAR_LABEL, DEPOT_LABEL);
      const second = await planning.commit(
        orderB.id,
        { vehicleId: vehicle.id, idempotencyKey: next('b') },
        ACTOR,
      );
      expect((await closures.attempt(first.run.id, 'LEG_CHANGED')).closed).toBe(false);

      await runLeg(second.legs.find((leg) => leg.kind === 'LOADED')!.id);
      const afterB = await closures.attempt(first.run.id, 'LEG_CHANGED');

      expect(afterB.closed).toBe(true);
      expect(afterB.verdict.trigger).toBe('DEPOT_RETURN');
    });

    it('ONE — moi don mot vong chay: dong vong chay cua don A khong dung toi don B', async () => {
      const closures = configure({ grouping: 'ONE_ORDER_PER_RUN' });
      const vehicle = await aVehicle();

      const orderA = await anOrder('Kho Hà Nội', DEPOT_LABEL);
      const first = await planning.commit(
        orderA.id,
        { vehicleId: vehicle.id, idempotencyKey: next('a') },
        ACTOR,
      );
      for (const leg of first.legs) await runLeg(leg.id);
      expect((await closures.attempt(first.run.id, 'LEG_CHANGED')).closed).toBe(true);

      const orderB = await anOrder('Kho Hà Nội', FAR_LABEL);
      const second = await planning.commit(
        orderB.id,
        { vehicleId: vehicle.id, idempotencyKey: next('b') },
        ACTOR,
      );

      expect(second.run.id).not.toBe(first.run.id);
      expect(await statusOf(first.run.id)).toBe('COMPLETED');
      expect(await statusOf(second.run.id)).toBe('PLANNED');
    });
  });

  /* ---------------------------------------------------------------- *
   * R3 — LUOT QUET
   * ---------------------------------------------------------------- */

  describe('luot quet dinh ky (R3)', () => {
    it('bai 7 — chua chang nao hoan thanh: khong co ung vien nao de quet', async () => {
      const closures = configure();
      const vehicle = await aVehicle();
      const order = await anOrder('Kho Hà Nội', FAR_LABEL);
      await planning.commit(order.id, { vehicleId: vehicle.id, idempotencyKey: next('k') }, ACTOR);

      now = new Date(now.getTime() + 24 * HOUR_MS);

      expect(await closures.sweep()).toEqual({ scanned: 0, closed: 0 });
    });

    it('bai 9 — xa bai, CHUA qua nguong nghi: van cho, khong dong', async () => {
      const closures = configure({ closure: { idleHours: 12 } });
      const { runId } = await completedRun(FAR_LABEL);

      now = new Date(now.getTime() + 11 * HOUR_MS);

      expect((await closures.sweep()).closed).toBe(0);
      expect(await statusOf(runId)).toBe('ACTIVE');
    });

    it('bai 10 — xa bai, QUA nguong nghi: luot quet dong voi ly do IDLE_TIMEOUT', async () => {
      const closures = configure({ closure: { idleHours: 12 } });
      const { runId } = await completedRun(FAR_LABEL);

      now = new Date(now.getTime() + 13 * HOUR_MS);
      const result = await closures.sweep();

      expect(result.closed).toBe(1);
      expect(await statusOf(runId)).toBe('COMPLETED');
      expect(
        decisionsOf(records).filter((entry) => entry.reason === 'RUN_CLOSED_ON_IDLE_TIMEOUT'),
      ).toHaveLength(1);
    });

    it('bai 11 — KHONG khai nguong nghi: khong bao gio tu bia mot nguong de dong', async () => {
      const closures = configure({ closure: { idleHours: null } });
      const { runId } = await completedRun(FAR_LABEL);

      // Mot nam sau van khong dong: khach chua noi bao lau thi khong ai duoc doan thay.
      now = new Date(now.getTime() + 365 * 24 * HOUR_MS);

      expect((await closures.sweep()).closed).toBe(0);
      expect(await statusOf(runId)).toBe('ACTIVE');
    });

    it('bai 12 — su kien bi mat: luot quet tim lai TU SU THAT NGUON va dong', async () => {
      configure();
      const { runId } = await completedRun();
      expect(await statusOf(runId)).toBe('ACTIVE');

      /*
       * Mo phong dung kich ban ma duong bao hiem ton tai vi no: chang da ghi xong, nhung KHONG co
       * lan phan xu nao chay sau do — tien trinh chet, request bi ngat, su kien that lac. Khong co
       * gi trong bo nho ca; luot quet dung LAI lop phan xu tren su that da ben vung.
       */
      const restarted = configure();
      now = new Date(now.getTime() + 5 * 60_000);
      const result = await restarted.sweep();

      expect(result.closed).toBe(1);
      expect(await statusOf(runId)).toBe('COMPLETED');
      expect(
        decisionsOf(records).filter((entry) => entry.reason === 'RUN_CLOSED_ON_DEPOT_RETURN'),
      ).toHaveLength(1);
    });

    it('bai 10b — luot quet bi chan boi CUNG nhung dieu kien chan nhu duong su kien', async () => {
      const closures = configure({ grouping: 'MULTI_ORDER_RUN', closure: { idleHours: 1 } });
      const vehicle = await aVehicle();
      const orderA = await anOrder('Kho Hà Nội', FAR_LABEL);
      const first = await planning.commit(
        orderA.id,
        { vehicleId: vehicle.id, idempotencyKey: next('a') },
        ACTOR,
      );
      for (const leg of first.legs) await runLeg(leg.id);
      const orderB = await anOrder(FAR_LABEL, DEPOT_LABEL);
      await planning.commit(orderB.id, { vehicleId: vehicle.id, idempotencyKey: next('b') }, ACTOR);

      now = new Date(now.getTime() + 48 * HOUR_MS);

      // Don B con mot chang chua chay: nguong nghi KHONG bo qua duoc dieu kien chan.
      expect((await closures.sweep()).closed).toBe(0);
      expect(await statusOf(first.run.id)).toBe('ACTIVE');
    });

    it('luot quet co TRAN: khong quet qua `batchSize` trong mot luot', async () => {
      const closures = configure({
        closure: { idleHours: 1 },
        sweep: { intervalSeconds: 60, batchSize: 2 },
      });
      for (let index = 0; index < 3; index += 1) await completedRun();

      now = new Date(now.getTime() + 2 * HOUR_MS);
      const result = await closures.sweep();

      expect(result.scanned).toBe(2);
      expect(result.closed).toBe(2);
    });

    it('bai 19 — luot quet cua khach nay khong dung toi vong chay cua khach khac', async () => {
      /*
       * MOT TIEN TRINH = MOT KHACH (`tenantDir()` chot dieu do), nen "khach khac" o day dung nghia
       * nhat kiem duoc: mot vong chay ma CHINH SACH CUA KHACH NAY khong cho dong — no ket thuc o
       * mot bai xe khac, khong phai bai cua ta.
       *
       * Vong chay do VAN NAM trong cung bang, VAN la ung vien cua luot quet (`ACTIVE`, het viec,
       * qua nguong). Cai chan no lai la BAI XE — va do dung la thu phai kiem: luot quet khong duoc
       * dong mot vong chay chi vi no "co ve" da xong.
       */
      const OTHER_DEPOT = 'Bãi xe của khách khác';
      const ours = configure({ closure: { idleHours: null } });
      const mine = await completedRun(DEPOT_LABEL);
      const theirs = await completedRun(OTHER_DEPOT);

      now = new Date(now.getTime() + 13 * HOUR_MS);
      const result = await ours.sweep();

      expect(result.closed).toBe(1);
      expect(await statusOf(mine.runId)).toBe('COMPLETED');
      // Cung mot bang, cung mot luot quet — nhung chiec xe cua khach kia khong ve BAI CUA TA,
      // va chinh sach cua ta khong co nguong nghi nao de vien dan. No dung nguyen o do.
      expect(await statusOf(theirs.runId)).toBe('ACTIVE');

      // Va khi dung chinh sach CUA NO thi no dong duoc — cai chan no la chinh sach, khong phai
      // mot vong chay bi bo quen.
      const theirsClosures = configure({
        depots: [{ code: 'DEPOT-KHAC', label: OTHER_DEPOT }],
        closure: { idleHours: null },
      });
      expect((await theirsClosures.sweep()).closed).toBe(1);
      expect(await statusOf(theirs.runId)).toBe('COMPLETED');
    });
  });

  /* ---------------------------------------------------------------- *
   * R4 — CONG SU THAT BEN NGOAI
   * ---------------------------------------------------------------- */

  describe('cong su that ben ngoai (R4)', () => {
    it('bai 13 — hang con tren thung: chan dong, va noi ro ma chan', async () => {
      const closures = configure({}, new FakeBlockerSource(async () => ['CARGO_STILL_CARRIED']));
      const { runId } = await completedRun();

      const outcome = await closures.attempt(runId, 'LEG_CHANGED');

      expect(outcome.closed).toBe(false);
      expect(outcome.verdict.blockers).toEqual(['CARGO_STILL_CARRIED']);
      expect(await statusOf(runId)).toBe('ACTIVE');
    });

    it('bai 14 — con phien cho nguoi nhan: chan dong qua adapter gia', async () => {
      const closures = configure({}, new FakeBlockerSource(async () => ['OPEN_WAITING_SESSION']));
      const { runId } = await completedRun();

      const outcome = await closures.attempt(runId, 'LEG_CHANGED');

      expect(outcome.closed).toBe(false);
      expect(outcome.verdict.blockers).toEqual(['OPEN_WAITING_SESSION']);
    });

    it('bai 15a — nguon su that HONG: dong cua lai, KHONG dong vong chay', async () => {
      const closures = configure(
        {},
        new FakeBlockerSource(async () => {
          throw new Error('khong doc duoc so ghi hien truong');
        }),
      );
      const { runId } = await completedRun();

      const outcome = await closures.attempt(runId, 'LEG_CHANGED');

      expect(outcome.closed).toBe(false);
      expect(outcome.verdict.blockers).toEqual(['EXTERNAL_BLOCKER_SOURCE_UNAVAILABLE']);
      expect(await statusOf(runId)).toBe('ACTIVE');
    });

    it('bai 15b — nguon tra ve mot thu khong doc duoc: cung dong cua lai, khac ma', async () => {
      const closures = configure(
        {},
        new FakeBlockerSource(async () => ['MOT_MA_KHONG_CO_THAT'] as never),
      );
      const { runId } = await completedRun();

      const outcome = await closures.attempt(runId, 'LEG_CHANGED');

      expect(outcome.closed).toBe(false);
      expect(outcome.verdict.blockers).toEqual(['EXTERNAL_BLOCKER_SOURCE_AMBIGUOUS']);
    });

    it('bai 16 — vat can duoc go: lan phan xu ke tiep dong duoc', async () => {
      let blockers: readonly RunClosureBlocker[] = ['OPEN_WAITING_SESSION'];
      const closures = configure({}, new FakeBlockerSource(async () => blockers));
      const { runId } = await completedRun();

      expect((await closures.attempt(runId, 'LEG_CHANGED')).closed).toBe(false);

      blockers = [];
      const after = await closures.attempt(runId, 'LEG_CHANGED');

      expect(after.closed).toBe(true);
      expect(await statusOf(runId)).toBe('COMPLETED');
    });

    it('bai 16b — vat can con thi luot quet cung khong dong duoc', async () => {
      const closures = configure(
        { closure: { idleHours: 1 } },
        new FakeBlockerSource(async () => ['CARGO_STILL_CARRIED']),
      );
      const { runId } = await completedRun(FAR_LABEL);

      now = new Date(now.getTime() + 48 * HOUR_MS);

      expect((await closures.sweep()).closed).toBe(0);
      expect(await statusOf(runId)).toBe('ACTIVE');
    });

    it('khong cau hinh nguon nao: khong co gi chan, va vong chay van dong duoc', async () => {
      const closures = configure();
      const { runId } = await completedRun();

      expect((await closures.attempt(runId, 'LEG_CHANGED')).closed).toBe(true);
    });

    it('be mat chan doan doc CUNG bang chan voi duong he thong dung', async () => {
      let blockers: readonly RunClosureBlocker[] = ['CARGO_STILL_CARRIED'];
      const closures = configure({}, new FakeBlockerSource(async () => blockers));
      const { runId } = await completedRun();

      expect((await closures.inspect(runId)).blockers).toEqual(['CARGO_STILL_CARRIED']);

      blockers = [];
      expect((await closures.inspect(runId)).closable).toBe(true);
      // Doc KHONG duoc doi mot hang nao.
      expect(await statusOf(runId)).toBe('ACTIVE');
    });
  });

  /* ---------------------------------------------------------------- *
   * R8 — LICH SU DA DONG KHONG MO LAI
   * ---------------------------------------------------------------- */

  describe('toan ven lich su (R8)', () => {
    it('bai 18 — don moi sau mot vong chay da dong: mo vong chay MOI, khong noi vao lich su cu', async () => {
      const closures = configure({ grouping: 'MULTI_ORDER_RUN' });
      const { runId, vehicle } = await completedRun();
      expect((await closures.attempt(runId, 'LEG_CHANGED')).closed).toBe(true);
      const historicalLegs = (await movement.getRun(runId)).legs.map((leg) => leg.id);

      const later = await anOrder(DEPOT_LABEL, FAR_LABEL);
      const commit = await planning.commit(
        later.id,
        { vehicleId: vehicle.id, idempotencyKey: next('sau') },
        ACTOR,
      );

      expect(commit.run.id).not.toBe(runId);
      expect(commit.run.status).toBe('PLANNED');
      // Vong chay cu khong nhan them chang nao: lich su da dong la bat bien.
      expect((await movement.getRun(runId)).run.status).toBe('COMPLETED');
      expect((await movement.getRun(runId)).legs.map((leg) => leg.id)).toEqual(historicalLegs);
    });

    it('chang da dong la lich su KHONG DOI sau khi vong chay dong', async () => {
      const closures = configure();
      const { runId } = await completedRun();
      const before = (await movement.getRun(runId)).legs;

      await closures.attempt(runId, 'LEG_CHANGED');

      expect((await movement.getRun(runId)).legs).toEqual(before);
    });
  });
});

/* ------------------------------------------------------------------ *
 * R1 — KHONG CO DUONG NGUOI DUNG NAO DONG DUOC VONG CHAY
 * ------------------------------------------------------------------ */

describe('dong vong chay la quyen cua HE THONG (#293 R1)', () => {
  const ACTOR = 'ke-toan';
  const CORE_POLICY = { timeZone: 'Asia/Ho_Chi_Minh' } as const;

  const buildMovement = (): { movement: MovementService; fleet: InMemoryFleetRepository } => {
    const fleet = new InMemoryFleetRepository();
    const movement = new MovementService(
      new InMemoryMovementRepository(),
      fleet,
      new AuditLogService(new InMemoryAuditLogRepository()),
      CORE_POLICY,
    );
    return { movement, fleet };
  };

  const aRunWithLeg = async (plate: string) => {
    const { movement, fleet } = buildMovement();
    const vehicle = await fleet.createVehicle({ registrationPlate: plate, vehicleClass: 'Đầu kéo' });
    const order = await movement.createOrder(
      { code: 'ORD-1', originLabel: 'A', destinationLabel: 'B', businessDate: '2026-09-11' },
      ACTOR,
    );
    const run = await movement.createRun(
      { code: 'RUN-1', vehicleId: vehicle.id, businessDate: '2026-09-11', note: null },
      ACTOR,
    );
    await movement.addLeg(
      run.id,
      {
        sequence: 1,
        kind: 'LOADED',
        orderId: order.id,
        originLabel: 'A',
        destinationLabel: 'B',
        businessDate: '2026-09-11',
        distanceKm: null,
        plannedDistanceKm: null,
        note: null,
      },
      ACTOR,
    );
    return { movement, run };
  };

  it('bai 20 — gui dung chuoi `COMPLETED` cung khong ep duoc vong chay dong', async () => {
    const { movement, run } = await aRunWithLeg('29C-99999');

    // Du quyen cao nhat va du gui dung gia tri, cong van tu choi — va noi ro vi sao.
    await expect(movement.transitionRun(run.id, 'COMPLETED', ACTOR)).rejects.toMatchObject({
      reason: 'RUN_COMPLETE_REQUIRES_SYSTEM_PATH',
    });

    /*
     * Duong HE THONG thi di duoc — nhung no khong nhan `to`, no chi nhan mot `trigger`, va quyet
     * dinh "co duoc dong khong" nam o mot ham thuan khac (`evaluateRunClosure`). Do la khac biet
     * giua MOT CACH THUC va MOT Y MUON.
     */
    const legId = (await movement.legsOfRun(run.id))[0]!.id;
    await movement.transitionLeg(legId, 'IN_TRANSIT', ACTOR);
    await movement.transitionLeg(legId, 'COMPLETED', ACTOR);
    const closed = await movement.closeRunAsSystem(run.id, 'DEPOT_RETURN');

    expect(closed.transitioned).toBe(true);
    expect(closed.run.status).toBe('COMPLETED');
  });

  it('vong chay chua lan banh cung khong dong duoc bang duong he thong', async () => {
    const { movement, fleet } = buildMovement();
    const vehicle = await fleet.createVehicle({
      registrationPlate: '29C-88888',
      vehicleClass: 'Đầu kéo',
    });
    const run = await movement.createRun(
      { code: 'RUN-2', vehicleId: vehicle.id, businessDate: '2026-09-11', note: null },
      ACTOR,
    );

    // `PLANNED` chua lan banh: khong co gi de dong, ke ca voi duong he thong.
    await expect(movement.closeRunAsSystem(run.id, 'DEPOT_RETURN')).rejects.toMatchObject({
      reason: 'RUN_TRANSITION_NOT_PERMITTED',
    });
  });

  it('huy vong chay van di duong rieng cua no — hai quyet dinh, hai cong', async () => {
    const { movement, run } = await aRunWithLeg('29C-77777');

    await expect(movement.transitionRun(run.id, 'CANCELLED', ACTOR)).rejects.toMatchObject({
      reason: 'RUN_CANCEL_REQUIRES_DEDICATED_PATH',
    });
    expect((await movement.cancelRun(run.id, 'dieu lai xe khac', ACTOR)).status).toBe('CANCELLED');
  });
});
