import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { TransportCheckpointCoreFactsAdapter } from '../checkpoint/checkpoint-facts.port.js';
import { InMemoryCheckpointRepository } from '../checkpoint/checkpoint.repository.js';
import { InMemoryOperationalDocumentRepository } from '../document/document.repository.js';
import { InMemoryPhysicalReceiptHandoverRepository } from '../document/handover.repository.js';
import { TransportFieldCoreFactsAdapter } from '../field/field-facts.port.js';
import { DriverFieldReadService } from '../field/field-read.service.js';
import { InMemoryFleetRepository } from '../fleet/fleet.repository.js';
import { InMemoryMovementRepository } from '../movement/movement.repository.js';
import { MovementService } from '../movement/movement.service.js';
import { TransportDomainError } from '../transport.errors.js';
import { InMemoryWaitingSessionRepository } from '../waiting/waiting.repository.js';
import { InMemoryRunPlanRepository } from './planning.repository.js';
import { PlanningService } from './planning.service.js';
import type { TransportPlanningPolicy } from './planning.types.js';

/**
 * GIAO XE THI GIAO CA NGUOI — hoi quy cua UAT BUG-01, do QUA CUA DANG NHAP cua lai xe.
 *
 * ============================================================================================
 * LOI GOC
 * ============================================================================================
 *
 * Giao dien bao "Da giao don ... cho xe ...", vong chay co that, nhung lai xe cua chiec xe do mo
 * man Hien truong thi trong khong. `commit()` mo vong chay ma khong ghi hang `TransportRunAssignment`
 * nao, trong khi truy van cua man Hien truong loc DUNG bang hang do.
 *
 * ============================================================================================
 * VI SAO BO NAY DI QUA `DriverFieldReadService.workFor(authUserId)`
 * ============================================================================================
 *
 * Man Hien truong KHONG tim nguoi bang `driverId`. No di mot chuoi bon mat xich:
 *
 *     phien.authUserId -> findDriverByAuthUserId -> driver.id -> listOpenRunsForDriver
 *
 * Mot bai goi thang `listOpenRunsForDriver(driver.id)` chi do mat xich cuoi, va xanh ca khi lai xe
 * do KHONG co tai khoan — tuc xanh dung trong truong hop lai xe that khong thay gi. Bo nay dung
 * dich vu that cua man Hien truong, tren chinh cac kho ma `commit()` vua ghi vao; chi thieu lop
 * HTTP, va lop do chi doc `authUserId` tu phien roi chuyen nguyen vao day.
 *
 * Moi duong tu choi o day deu phai xay ra TRUOC moi lan ghi: mot vong chay sot lai sau mot lan tu
 * choi chinh la cai loi dang duoc sua, chi doi cho.
 */

const ACTOR = 'dieu-hanh';
const CORE_POLICY = { timeZone: 'Asia/Ho_Chi_Minh' } as const;
const POLICY: TransportPlanningPolicy = {
  grouping: 'ONE_ORDER_PER_RUN',
  depots: [{ code: 'DEPOT-HN', label: 'Bãi xe Hà Nội' }],
  closure: { idleHours: null },
  sweep: { intervalSeconds: 60, batchSize: 50 },
};

/** Tai khoan dang nhap cua hai lai xe mau — cung dang voi ten dang nhap cua bo du lieu mau. */
const BINH_LOGIN = 'lx.binh';
const HUNG_LOGIN = 'lx.hung';

const reasonOf = async (run: () => Promise<unknown>): Promise<string> => {
  try {
    await run();
  } catch (error) {
    if (error instanceof TransportDomainError) return error.reason;
    throw error;
  }
  throw new Error('khong nem loi nao ca');
};

describe('Giao xe thi giao ca nguoi — lai xe THAY vong chay qua chinh phien dang nhap (BUG-01)', () => {
  let now: Date;
  let fleet: InMemoryFleetRepository;
  let movementRepo: InMemoryMovementRepository;
  let plans: InMemoryRunPlanRepository;
  let auditLog: InMemoryAuditLogRepository;
  let movement: MovementService;
  let planning: PlanningService;
  let multi: PlanningService;
  let field: DriverFieldReadService;

  beforeEach(() => {
    now = new Date();
    fleet = new InMemoryFleetRepository();
    movementRepo = new InMemoryMovementRepository();
    plans = new InMemoryRunPlanRepository();
    auditLog = new InMemoryAuditLogRepository();
    const audit = new AuditLogService(auditLog);
    movement = new MovementService(movementRepo, fleet, audit, CORE_POLICY);
    const plannerWith = (policy: TransportPlanningPolicy): PlanningService =>
      new PlanningService(movement, plans, fleet, audit, CORE_POLICY, policy, undefined, () => now);
    planning = plannerWith(POLICY);
    // CUNG kho, CUNG dong ho — chi khac che do gom nhom. Nhanh NOI DON chi ton tai o che do nay.
    multi = plannerWith({ ...POLICY, grouping: 'MULTI_ORDER_RUN' });
    // Dung hai adapter THAT cua man Hien truong, tren CUNG hai kho ma `commit()` ghi vao.
    field = new DriverFieldReadService(
      new TransportFieldCoreFactsAdapter(movementRepo),
      new TransportCheckpointCoreFactsAdapter(movementRepo, fleet),
      new InMemoryCheckpointRepository(),
      new InMemoryWaitingSessionRepository(),
      new InMemoryOperationalDocumentRepository(),
      new InMemoryPhysicalReceiptHandoverRepository(),
      undefined,
      () => now,
    );
  });

  const aDriver = (
    fullName: string,
    phone: string,
    over: { authUserId?: string | null; status?: 'ACTIVE' | 'INACTIVE' } = {},
  ) =>
    fleet.createDriver({
      fullName,
      phone,
      licenceClass: 'FC',
      licenceExpiry: '2030-01-01',
      authUserId: over.authUserId ?? null,
      status: over.status ?? 'ACTIVE',
    });

  const aVehicle = (plate: string) =>
    fleet.createVehicle({ registrationPlate: plate, vehicleClass: 'Tải 5 tấn' });

  const anOrder = (code: string) =>
    movement.createOrder(
      {
        code,
        originLabel: 'Kho Hà Nội',
        destinationLabel: 'Hải Phòng',
        businessDate: '2026-09-20',
      },
      ACTOR,
    );

  const commit = (orderId: string, vehicleId: string, idempotencyKey: string) =>
    planning.commit(orderId, { vehicleId, idempotencyKey }, ACTOR);

  const runIdsSeenBy = async (authUserId: string): Promise<string[]> =>
    (await field.workFor(authUserId)).runs.map((run) => run.runId);

  /**
   * KHONG MOT DONG NAO cua vong chay, chang, phan cong vong chay hay ke hoach duoc ghi.
   *
   * Do bang ba cach doc doc lap nhau: kho vong chay, kho ke hoach, va so kiem toan — vi mot lan
   * ghi di qua `MovementService` luon de lai dau vet o so kiem toan, ke ca khi kho bi doc sai.
   */
  const expectNothingWritten = async (vehicleId: string, orderId: string): Promise<void> => {
    expect(await movement.latestRunForVehicle(vehicleId)).toBeNull();
    expect(await movement.listRuns()).toHaveLength(0);
    expect(await plans.listForOrder(orderId)).toHaveLength(0);
    const writes = (await auditLog.list()).filter(
      (entry) =>
        entry.action.startsWith('transport.run.') || entry.action.startsWith('transport.planning.'),
    );
    expect(writes.map((entry) => entry.action)).toEqual([]);
  };

  /* ---------------------------------------------------------------- *
   * DUONG DUNG — qua cua dang nhap
   * ---------------------------------------------------------------- */

  it('dung tai khoan cua nguoi cam xe THAY vong chay vua giao; tai khoan lai xe khac KHONG thay', async () => {
    const vehicle = await aVehicle('29H-152.44');
    const binh = await aDriver('Nguyễn Văn Bình', '0901120301', { authUserId: BINH_LOGIN });
    await aDriver('Trần Quốc Hùng', '0901120302', { authUserId: HUNG_LOGIN });
    await fleet.assignDriverToVehicle(vehicle.id, binh.id, now);
    const order = await anOrder('DH-BUG01-1');

    const { run } = await commit(order.id, vehicle.id, 'bug01-1');

    const binhWork = await field.workFor(BINH_LOGIN);
    expect(binhWork.runs.map((entry) => entry.runId)).toEqual([run.id]);
    // Va dung la vong chay mang DON NAY — khong phai mot vong chay nao khac cua xe.
    const loaded = binhWork.runs[0]?.legs.find((leg) => leg.kind === 'LOADED');
    expect(loaded?.orderCode).toBe('DH-BUG01-1');

    expect(await runIdsSeenBy(HUNG_LOGIN)).toEqual([]);

    // Cai man hinh vua doc ra nam tren dung MOT ban phan cong hieu luc, cua dung nguoi cam xe.
    const active = (await movement.runAssignmentHistory(run.id)).filter(
      (entry) => entry.effectiveTo === null,
    );
    expect(active.map((entry) => entry.driverId)).toEqual([binh.id]);
  });

  it('gui lai cung khoa chong lap: KHONG sinh ban phan cong thu hai, man hinh van mot vong chay', async () => {
    const vehicle = await aVehicle('29H-152.44');
    const binh = await aDriver('Nguyễn Văn Bình', '0901120301', { authUserId: BINH_LOGIN });
    await fleet.assignDriverToVehicle(vehicle.id, binh.id, now);
    const order = await anOrder('DH-BUG01-2');

    const first = await commit(order.id, vehicle.id, 'bug01-2');
    const second = await commit(order.id, vehicle.id, 'bug01-2');

    expect(second.replayed).toBe(true);
    expect(second.run.id).toBe(first.run.id);
    expect(await movement.runAssignmentHistory(first.run.id)).toHaveLength(1);
    expect(await runIdsSeenBy(BINH_LOGIN)).toEqual([first.run.id]);
  });

  it('khoa chong lap duoc doc TRUOC cac phep kiem lai xe: lai xe bi khoa sau do, gui lai van ra ket qua cu', async () => {
    const vehicle = await aVehicle('29H-152.44');
    const binh = await aDriver('Nguyễn Văn Bình', '0901120301', { authUserId: BINH_LOGIN });
    await fleet.assignDriverToVehicle(vehicle.id, binh.id, now);
    const order = await anOrder('DH-BUG01-3');
    const first = await commit(order.id, vehicle.id, 'bug01-3');

    // Lan bam dau DA thanh cong nhung cau tra loi mat tren duong ve; trong luc do ho so bi khoa.
    await fleet.updateDriver(binh.id, { status: 'INACTIVE', authUserId: null });

    const replay = await commit(order.id, vehicle.id, 'bug01-3');
    expect(replay.replayed).toBe(true);
    expect(replay.plan.id).toBe(first.plan.id);
    expect(replay.run.id).toBe(first.run.id);

    // Con mot lenh MOI thi phai gap phep kiem moi.
    const next = await anOrder('DH-BUG01-3B');
    expect(await reasonOf(() => commit(next.id, vehicle.id, 'bug01-3b'))).toBe(
      'PLAN_VEHICLE_DRIVER_INACTIVE',
    );
    expect(await plans.listForOrder(next.id)).toHaveLength(0);
  });

  /* ---------------------------------------------------------------- *
   * TU CHOI — tat ca TRUOC moi lan ghi
   * ---------------------------------------------------------------- */

  it('xe co ban phan cong nhung lai xe CHUA co tai khoan (authUserId = null): BINDING_MISSING, khong ghi gi', async () => {
    const vehicle = await aVehicle('29H-152.44');
    const binh = await aDriver('Nguyễn Văn Bình', '0901120301', { authUserId: null });
    await fleet.assignDriverToVehicle(vehicle.id, binh.id, now);
    const order = await anOrder('DH-BUG01-4');

    expect(await reasonOf(() => commit(order.id, vehicle.id, 'bug01-4'))).toBe(
      'PLAN_VEHICLE_DRIVER_BINDING_MISSING',
    );
    await expectNothingWritten(vehicle.id, order.id);
  });

  it('authUserId toan khoang trang cung la CHUA co tai khoan — khong phien nao mang ma do', async () => {
    const vehicle = await aVehicle('29H-152.44');
    const binh = await aDriver('Nguyễn Văn Bình', '0901120301', { authUserId: '   ' });
    await fleet.assignDriverToVehicle(vehicle.id, binh.id, now);
    const order = await anOrder('DH-BUG01-5');

    expect(await reasonOf(() => commit(order.id, vehicle.id, 'bug01-5'))).toBe(
      'PLAN_VEHICLE_DRIVER_BINDING_MISSING',
    );
    await expectNothingWritten(vehicle.id, order.id);
  });

  it('lai xe cam xe da NGUNG hoat dong (INACTIVE) du CO tai khoan: INACTIVE, khong ghi gi', async () => {
    const vehicle = await aVehicle('29H-152.44');
    const binh = await aDriver('Nguyễn Văn Bình', '0901120301', {
      authUserId: BINH_LOGIN,
      status: 'INACTIVE',
    });
    await fleet.assignDriverToVehicle(vehicle.id, binh.id, now);
    const order = await anOrder('DH-BUG01-6');

    expect(await reasonOf(() => commit(order.id, vehicle.id, 'bug01-6'))).toBe(
      'PLAN_VEHICLE_DRIVER_INACTIVE',
    );
    await expectNothingWritten(vehicle.id, order.id);
    // Tai khoan do van dang nhap duoc, va man hinh cua no dung la trong — khong co viec nao bi treo.
    expect(await runIdsSeenBy(BINH_LOGIN)).toEqual([]);
  });

  it('ban phan cong tro toi ho so lai xe KHONG ton tai: NOT_FOUND, khong ghi gi', async () => {
    const vehicle = await aVehicle('29H-152.44');
    // Kho trong bo nho khong co khoa ngoai; Postgres thi co. Tang mien van phai tu bao ve, vi neu
    // khong, `assignRun()` se nem `RUN_DRIVER_NOT_FOUND` SAU khi vong chay va chang da duoc ghi.
    await fleet.assignDriverToVehicle(vehicle.id, 'ho-so-da-xoa', now);
    const order = await anOrder('DH-BUG01-7');

    expect(await reasonOf(() => commit(order.id, vehicle.id, 'bug01-7'))).toBe(
      'PLAN_VEHICLE_DRIVER_NOT_FOUND',
    );
    await expectNothingWritten(vehicle.id, order.id);
  });

  it('xe chua co lai xe phu trach: MISSING, khong ghi gi', async () => {
    const vehicle = await aVehicle('29H-152.44');
    const order = await anOrder('DH-BUG01-8');

    expect(await reasonOf(() => commit(order.id, vehicle.id, 'bug01-8'))).toBe(
      'PLAN_VEHICLE_DRIVER_MISSING',
    );
    await expectNothingWritten(vehicle.id, order.id);
  });

  it('xe co hai ban phan cong hieu luc: AMBIGUOUS — mot ma RIENG, khong gop vao "thieu"', async () => {
    const vehicle = await aVehicle('29H-152.44');
    const binh = await aDriver('Nguyễn Văn Bình', '0901120301', { authUserId: BINH_LOGIN });
    const hung = await aDriver('Trần Quốc Hùng', '0901120302', { authUserId: HUNG_LOGIN });
    await fleet.assignDriverToVehicle(vehicle.id, binh.id, now);

    /*
     * Hai ban phan cong CUNG hieu luc khong dung duoc bang API cua kho: `assignDriverToVehicle()`
     * dong ban cu truoc khi mo ban moi, dung nhu Postgres cuong che. Nen o day dung mot ban de len
     * doc — de tra loi: NEU bang du lieu roi vao trang thai ma rang buoc dang ngan, tang mien co tu
     * bao ve khong? Rang buoc co the bi go bang mot migration, va kho trong bo nho khong he co no.
     */
    const readAssignments = fleet.activeDriverAssignmentsForVehicle.bind(fleet);
    fleet.activeDriverAssignmentsForVehicle = async (id: string) => {
      const rows = await readAssignments(id);
      const [only] = rows;
      if (id !== vehicle.id || only === undefined) return rows;
      return [only, { ...only, id: `${only.id}-song-song`, driverId: hung.id }];
    };
    const order = await anOrder('DH-BUG01-9');

    expect(await reasonOf(() => commit(order.id, vehicle.id, 'bug01-9'))).toBe(
      'PLAN_VEHICLE_DRIVER_AMBIGUOUS',
    );
    await expectNothingWritten(vehicle.id, order.id);
  });

  /* ---------------------------------------------------------------- *
   * VONG CHAY DA CO — `MULTI_ORDER_RUN`
   *
   * Hai nguon tra loi hai cau hoi khac nhau: doi xe noi ai dang cam CHIEC XE, phan cong vong chay
   * noi ai dang cam VONG CHAY. Vong chay moi chua co su that rieng nen lay cua doi xe. Vong chay
   * da co nguoi thi nguoi do la su that cua no, va doi xe phai noi CUNG mot nguoi — lech thi tu
   * choi truoc moi lan ghi, khong im lang chon ben nao.
   * ---------------------------------------------------------------- */

  describe('MULTI_ORDER_RUN — nguoi cam Run la su that cua Run do', () => {
    const commitMulti = (orderId: string, vehicleId: string, idempotencyKey: string) =>
      multi.commit(orderId, { vehicleId, idempotencyKey }, ACTOR);

    const activeHolders = async (runId: string): Promise<string[]> =>
      (await movement.runAssignmentHistory(runId))
        .filter((entry) => entry.effectiveTo === null)
        .map((entry) => entry.driverId);

    const loadedOrdersSeenBy = async (authUserId: string): Promise<(string | null)[]> =>
      (await field.workFor(authUserId)).runs.flatMap((run) =>
        run.legs.filter((leg) => leg.kind === 'LOADED').map((leg) => leg.orderCode),
      );

    /** Moi lan ghi vong chay / chang / phan cong / ke hoach deu de dau o so kiem toan. */
    const runAndPlanWrites = async (): Promise<string[]> =>
      (await auditLog.list({ limit: 200 }))
        .filter(
          (entry) =>
            entry.action.startsWith('transport.run.') ||
            entry.action.startsWith('transport.planning.'),
        )
        .map((entry) => `${entry.action}:${entry.entityId}`)
        .sort();

    /** Mot vong chay KHONG ai cam — dung nhu vong chay `commit()` de lai truoc ban va. */
    const aRunWithoutDriver = async (vehicleId: string, orderCode: string) => {
      const order = await anOrder(orderCode);
      const run = await movement.createRun(
        { code: `RUN-CU-${orderCode}`, vehicleId, businessDate: '2026-09-20', note: null },
        ACTOR,
      );
      await movement.addLeg(
        run.id,
        {
          sequence: 1,
          kind: 'LOADED',
          orderId: order.id,
          originLabel: 'Kho Hà Nội',
          destinationLabel: 'Hải Phòng',
          businessDate: '2026-09-20',
        },
        ACTOR,
      );
      return run;
    };

    it('xe chua co Run dang mo: NEW_RUN lay nguoi cam xe lam phan cong DAU TIEN — dung mot ban', async () => {
      const vehicle = await aVehicle('29H-152.44');
      const binh = await aDriver('Nguyễn Văn Bình', '0901120301', { authUserId: BINH_LOGIN });
      await fleet.assignDriverToVehicle(vehicle.id, binh.id, now);
      const order = await anOrder('DH-MULTI-1');

      const { run, plan } = await commitMulti(order.id, vehicle.id, 'multi-1');

      expect(plan.grouping).toBe('MULTI_ORDER_RUN');
      expect(plan.outcome).toBe('NEW_RUN');
      // Ca LICH SU, khong chi ban hieu luc: dung mot lan ghi phan cong.
      expect(await movement.runAssignmentHistory(run.id)).toHaveLength(1);
      expect(await activeHolders(run.id)).toEqual([binh.id]);
      expect(await runIdsSeenBy(BINH_LOGIN)).toEqual([run.id]);
    });

    it('Run cua A, doi xe van la A: noi don vao DUNG Run do, KHONG ghi them ban phan cong nao', async () => {
      const vehicle = await aVehicle('29H-152.44');
      const binh = await aDriver('Nguyễn Văn Bình', '0901120301', { authUserId: BINH_LOGIN });
      await aDriver('Trần Quốc Hùng', '0901120302', { authUserId: HUNG_LOGIN });
      await fleet.assignDriverToVehicle(vehicle.id, binh.id, now);
      const a = await anOrder('DH-MULTI-2A');
      const b = await anOrder('DH-MULTI-2B');
      const first = await commitMulti(a.id, vehicle.id, 'multi-2a');

      const assign = vi.spyOn(movement, 'assignRun');
      const second = await commitMulti(b.id, vehicle.id, 'multi-2b');

      expect(second.plan.outcome).toBe('APPENDED');
      expect(second.run.id).toBe(first.run.id);
      // Khong ca mot lan goi "van la nguoi do": nguoi cam Run da dung, khong co gi de ghi.
      expect(assign).not.toHaveBeenCalled();
      expect(await movement.runAssignmentHistory(first.run.id)).toHaveLength(1);
      expect(await activeHolders(first.run.id)).toEqual([binh.id]);
      expect(await loadedOrdersSeenBy(BINH_LOGIN)).toEqual(['DH-MULTI-2A', 'DH-MULTI-2B']);
      expect(await runIdsSeenBy(HUNG_LOGIN)).toEqual([]);
    });

    it('Run cua A, doi xe da giao xe cho B: PLAN_RUN_DRIVER_CONFLICT — khong noi, khong doi nguoi, khong ghi gi', async () => {
      const vehicle = await aVehicle('29H-152.44');
      const binh = await aDriver('Nguyễn Văn Bình', '0901120301', { authUserId: BINH_LOGIN });
      const hung = await aDriver('Trần Quốc Hùng', '0901120302', { authUserId: HUNG_LOGIN });
      await fleet.assignDriverToVehicle(vehicle.id, binh.id, now);
      const a = await anOrder('DH-MULTI-3A');
      const { run } = await commitMulti(a.id, vehicle.id, 'multi-3a');

      // Doi xe giao chiec xe cho Hung trong luc vong chay cua Binh van dang mo. Hung hop le tron
      // ven (ACTIVE, co tai khoan) — nen moi phep kiem cua doi xe deu qua, va chi con do lech.
      await fleet.assignDriverToVehicle(vehicle.id, hung.id, now);
      const b = await anOrder('DH-MULTI-3B');
      const legsBefore = (await movement.legsOfRun(run.id)).map((leg) => leg.id);
      const writesBefore = await runAndPlanWrites();

      expect(await reasonOf(() => commitMulti(b.id, vehicle.id, 'multi-3b'))).toBe(
        'PLAN_RUN_DRIVER_CONFLICT',
      );
      // Gui lai CUNG khoa: lan truoc khong de lai ket qua nao de phat lai, nen van tu choi.
      expect(await reasonOf(() => commitMulti(b.id, vehicle.id, 'multi-3b'))).toBe(
        'PLAN_RUN_DRIVER_CONFLICT',
      );

      expect((await movement.legsOfRun(run.id)).map((leg) => leg.id)).toEqual(legsBefore);
      expect(await plans.listForOrder(b.id)).toHaveLength(0);
      expect((await plans.listActiveForRun(run.id)).map((plan) => plan.orderId)).toEqual([a.id]);
      expect(await movement.listRuns()).toHaveLength(1);
      expect(await movement.runAssignmentHistory(run.id)).toHaveLength(1);
      expect(await activeHolders(run.id)).toEqual([binh.id]);
      expect(await runAndPlanWrites()).toEqual(writesBefore);

      // Khong ben nao bi chon thay: Binh van cam dung Run cu, Hung khong bi nhet vao Run cua Binh.
      expect(await loadedOrdersSeenBy(BINH_LOGIN)).toEqual(['DH-MULTI-3A']);
      expect(await runIdsSeenBy(HUNG_LOGIN)).toEqual([]);
    });

    it('gui lai cung khoa sau khi noi don — ke ca khi doi xe da doi nguoi: phat lai, KHONG ghi phan cong nao', async () => {
      const vehicle = await aVehicle('29H-152.44');
      const binh = await aDriver('Nguyễn Văn Bình', '0901120301', { authUserId: BINH_LOGIN });
      const hung = await aDriver('Trần Quốc Hùng', '0901120302', { authUserId: HUNG_LOGIN });
      await fleet.assignDriverToVehicle(vehicle.id, binh.id, now);
      const a = await anOrder('DH-MULTI-4A');
      const b = await anOrder('DH-MULTI-4B');
      const first = await commitMulti(a.id, vehicle.id, 'multi-4a');
      const second = await commitMulti(b.id, vehicle.id, 'multi-4b');
      await fleet.assignDriverToVehicle(vehicle.id, hung.id, now);

      const assign = vi.spyOn(movement, 'assignRun');
      const replayFirst = await commitMulti(a.id, vehicle.id, 'multi-4a');
      const replaySecond = await commitMulti(b.id, vehicle.id, 'multi-4b');

      // Lenh DA thanh cong tra dung ket qua cu — khong bi phep kiem do lech cat, va khong "sua" Run.
      expect([replayFirst.replayed, replaySecond.replayed]).toEqual([true, true]);
      expect(replayFirst.plan.id).toBe(first.plan.id);
      expect(replaySecond.plan.id).toBe(second.plan.id);
      expect(assign).not.toHaveBeenCalled();
      expect(await movement.runAssignmentHistory(first.run.id)).toHaveLength(1);
      expect(await activeHolders(first.run.id)).toEqual([binh.id]);
    });

    it('Run CHUA co ai cam: nguoi cam xe duoc ghi lam phan cong dau tien, TRUOC khi noi chang nao', async () => {
      const vehicle = await aVehicle('29H-152.44');
      const binh = await aDriver('Nguyễn Văn Bình', '0901120301', { authUserId: BINH_LOGIN });
      await aDriver('Trần Quốc Hùng', '0901120302', { authUserId: HUNG_LOGIN });
      await fleet.assignDriverToVehicle(vehicle.id, binh.id, now);
      const orphan = await aRunWithoutDriver(vehicle.id, 'DH-MULTI-5A');
      expect(await runIdsSeenBy(BINH_LOGIN)).toEqual([]);

      const assign = vi.spyOn(movement, 'assignRun');
      const addLeg = vi.spyOn(movement, 'addLeg');
      const next = await anOrder('DH-MULTI-5B');
      const { run, plan } = await commitMulti(next.id, vehicle.id, 'multi-5b');

      expect(plan.outcome).toBe('APPENDED');
      expect(run.id).toBe(orphan.id);
      expect(assign.mock.calls.map(([runId, command]) => [runId, command])).toEqual([
        [orphan.id, { driverId: binh.id }],
      ]);
      // Chot nguoi TRUOC, noi chang SAU: hong giua chung thi don chua nam trong Run khong ai mo duoc.
      expect(addLeg).toHaveBeenCalled();
      expect(assign.mock.invocationCallOrder[0]).toBeLessThan(
        Math.min(...addLeg.mock.invocationCallOrder),
      );
      expect(await movement.runAssignmentHistory(orphan.id)).toHaveLength(1);
      expect(await activeHolders(orphan.id)).toEqual([binh.id]);
      expect(await loadedOrdersSeenBy(BINH_LOGIN)).toEqual(['DH-MULTI-5A', 'DH-MULTI-5B']);
      expect(await runIdsSeenBy(HUNG_LOGIN)).toEqual([]);
    });

    it('Run CHUA co ai cam + nguoi cam xe khong mo duoc Hien truong: tu choi, Run van khong ai cam, khong noi gi', async () => {
      const vehicle = await aVehicle('29H-152.44');
      const binh = await aDriver('Nguyễn Văn Bình', '0901120301', { authUserId: null });
      await fleet.assignDriverToVehicle(vehicle.id, binh.id, now);
      const orphan = await aRunWithoutDriver(vehicle.id, 'DH-MULTI-6A');
      const legsBefore = (await movement.legsOfRun(orphan.id)).map((leg) => leg.id);
      const next = await anOrder('DH-MULTI-6B');

      expect(await reasonOf(() => commitMulti(next.id, vehicle.id, 'multi-6b'))).toBe(
        'PLAN_VEHICLE_DRIVER_BINDING_MISSING',
      );
      expect((await movement.legsOfRun(orphan.id)).map((leg) => leg.id)).toEqual(legsBefore);
      expect(await movement.runAssignmentHistory(orphan.id)).toEqual([]);
      expect(await plans.listForOrder(next.id)).toHaveLength(0);
    });
  });
});
