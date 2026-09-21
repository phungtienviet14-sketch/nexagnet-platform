import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import type { AuthenticatedRequest } from '../../auth/session.types.js';
import { CheckpointLegFieldTruthSource } from '../checkpoint/checkpoint-leg-field-truth.source.js';
import { CheckpointRunClosureBlockerSource } from '../checkpoint/checkpoint-run-closure-blocker.source.js';
import {
  TransportCheckpointCoreFactsAdapter,
  TransportCheckpointLocationFacts,
} from '../checkpoint/checkpoint-facts.port.js';
import { InMemoryCheckpointRepository } from '../checkpoint/checkpoint.repository.js';
import { CheckpointService } from '../checkpoint/checkpoint.service.js';
import type { RunCheckpointType } from '../checkpoint/checkpoint.types.js';
import { TransportCheckpointRunClosureBlockerSource } from '../checkpoint/transport-checkpoint-blocker.source.js';
import { InMemoryOperationalDocumentRepository } from '../document/document.repository.js';
import { InMemoryPhysicalReceiptHandoverRepository } from '../document/handover.repository.js';
import { TransportFieldCoreFactsAdapter } from '../field/field-facts.port.js';
import { DriverFieldReadService } from '../field/field-read.service.js';
import { InMemoryFleetRepository } from '../fleet/fleet.repository.js';
import { InMemoryMovementRepository } from '../movement/movement.repository.js';
import { MovementService } from '../movement/movement.service.js';
import { MovementRunWriteGuard } from '../movement/run-write-guard.port.js';
import { RunsController } from '../movement/runs.controller.js';
import { TransportDomainError } from '../transport.errors.js';
import { WaitingRunClosureBlockerSource } from '../waiting/waiting-run-closure-blocker.source.js';
import { InMemoryWaitingSessionRepository } from '../waiting/waiting.repository.js';
import { InMemoryRunPlanRepository } from './planning.repository.js';
import { PlanningService } from './planning.service.js';
import type { TransportPlanningPolicy } from './planning.types.js';
import { RunClosureService } from './run-closure.service.js';

/**
 * SU THAT HIEN TRUONG vs TRANG THAI CHANG — `#332`, tren DUNG duong ma harness UAT da di.
 *
 * ============================================================================================
 * CHUOI SU KIEN RUNTIME (transport-preview, 19/09/2026, log `gateway` + `api-321`)
 * ============================================================================================
 *
 * Mot tien trinh `node` (UA `node`) dong vai lai xe roi dong vai ke toan, tren vong chay
 * `EMPTY #1 -> LOADED #2`:
 *
 *   12:26:39  GET  /transport/me/field-work  ->  POST /transport/me/checkpoints   (PICKUP_ARRIVAL)
 *   12:26:40  ...                                                              (GATE_ENTRY)
 *   12:26:42  ...                                                              (LOADING, roi 20 lan
 *                                                                               gui lai LOADING)
 *   12:26:58  POST /transport/runs/:run/legs/<chang 1>/transition  x2  (IN_TRANSIT, COMPLETED)
 *   12:26:59  POST /transport/runs/:run/legs/<chang 2>/transition  x2  (IN_TRANSIT, COMPLETED)
 *
 * Harness lam DUNG dieu man hinh bao: lay nut cua chang DAU TIEN con viec. Chang do la chang 1
 * RONG, vi `fieldActionsFor()` moi chuoi lay hang tren MOI chang — nen ca chuoi hang hoa nam tren
 * chang khong cho hang. Roi ke toan dong chang 2 CO HANG khi no chua co mot moc nao, vi
 * `transitionLeg()` khong hoi hien truong. Hai lo hong, hai truc su that tach nhau.
 *
 * Bo nay di qua CHINH cac lop ma ba duong HTTP do goi: `DriverFieldReadService.workFor`,
 * `CheckpointService.recordAsDriver`, `RunsController.transitionLeg` — voi nguon hien truong THAT
 * (`CheckpointLegFieldTruthSource`) tren cung kho moc ma lai xe ghi vao.
 */

const ACTOR = 'ke-toan';
const DRIVER_LOGIN = 'lx.u332';
const CORE_POLICY = { timeZone: 'Asia/Ho_Chi_Minh' } as const;
const DEPOT_LABEL = 'Bãi xe Hà Nội';
const PICKUP_LABEL = 'Kho lấy hàng Bắc Ninh';
const FAR_LABEL = 'Điểm giao Hải Phòng';
const OVERRIDE_REASON = 'Lái xe mất sóng ở điểm giao, đã gọi xác nhận với người nhận';

const POLICY: TransportPlanningPolicy = {
  grouping: 'ONE_ORDER_PER_RUN',
  depots: [{ code: 'DEPOT-HN', label: DEPOT_LABEL }],
  closure: { idleHours: null },
  sweep: { intervalSeconds: 60, batchSize: 50 },
};

/** Phien cua ke toan — `transportActorOf` doc `authUser.username`. */
const ACCOUNTANT = { authUser: { id: 'u-ke-toan', username: ACTOR } } as AuthenticatedRequest;

const noLocation = new (class extends TransportCheckpointLocationFacts {
  async findObservation(): Promise<null> {
    return null;
  }
})();

/** Ly do CO KIEU cua mot lan tu choi qua be mat HTTP — cai ma giao dien doc. */
const httpReasonOf = async (run: () => Promise<unknown>): Promise<string> => {
  try {
    await run();
  } catch (error) {
    if (error instanceof ForbiddenException || error instanceof BadRequestException) {
      const body = error.getResponse();
      return typeof body === 'object' && body !== null && 'reason' in body
        ? String((body as { reason: unknown }).reason)
        : `HTTP_${error.getStatus()}`;
    }
    throw error;
  }
  throw new Error('khong nem loi nao ca');
};

const domainReasonOf = async (run: () => Promise<unknown>): Promise<string> => {
  try {
    await run();
  } catch (error) {
    if (error instanceof TransportDomainError) return error.reason;
    throw error;
  }
  throw new Error('khong nem loi nao ca');
};

describe('UAT #332 — hien truong va trang thai chang hoi tu tren duong harness 19/09', () => {
  let now: Date;
  let fleet: InMemoryFleetRepository;
  let movementRepo: InMemoryMovementRepository;
  let auditLog: InMemoryAuditLogRepository;
  let checkpointRepo: InMemoryCheckpointRepository;
  let movement: MovementService;
  let planning: PlanningService;
  let checkpoints: CheckpointService;
  let field: DriverFieldReadService;
  let runs: RunsController;

  beforeEach(() => {
    now = new Date();
    fleet = new InMemoryFleetRepository();
    movementRepo = new InMemoryMovementRepository();
    auditLog = new InMemoryAuditLogRepository();
    checkpointRepo = new InMemoryCheckpointRepository();
    const audit = new AuditLogService(auditLog);
    const waiting = new InMemoryWaitingSessionRepository();

    movement = new MovementService(movementRepo, fleet, audit, CORE_POLICY);
    planning = new PlanningService(
      movement,
      new InMemoryRunPlanRepository(),
      fleet,
      audit,
      CORE_POLICY,
      POLICY,
      undefined,
      () => now,
    );
    /*
     * Chinh sach vi tri RONG: bo nay hoi ve CHANG NAO nhan moc, khong ve ban dinh vi. Moi thu khac
     * — thu tu moc, pham vi chang, khoa hang vong chay — la ban that.
     */
    checkpoints = new CheckpointService(
      checkpointRepo,
      new TransportCheckpointCoreFactsAdapter(movementRepo, fleet),
      noLocation,
      new MovementRunWriteGuard(movementRepo),
      CORE_POLICY,
      { locationRequiredTypes: [] },
      undefined,
      () => now,
    );
    field = new DriverFieldReadService(
      new TransportFieldCoreFactsAdapter(movementRepo),
      new TransportCheckpointCoreFactsAdapter(movementRepo, fleet),
      checkpointRepo,
      waiting,
      new InMemoryOperationalDocumentRepository(),
      new InMemoryPhysicalReceiptHandoverRepository(),
      undefined,
      () => now,
    );
    // Nguon chan GOP, dung cach `app-composition.ts` noi luc chay.
    const closures = new RunClosureService(
      planning,
      movement,
      POLICY,
      new TransportCheckpointRunClosureBlockerSource(
        new CheckpointRunClosureBlockerSource(checkpoints),
        new WaitingRunClosureBlockerSource(waiting),
      ),
      undefined,
      () => now,
    );
    runs = new RunsController(
      movement,
      closures,
      new CheckpointLegFieldTruthSource(checkpointRepo),
    );
  });

  /** Chot ke hoach qua DUNG duong runtime — `commit()` sinh `EMPTY #1 -> LOADED #2` va gan lai xe. */
  const uatRun = async (suffix: string) => {
    const vehicle = await fleet.createVehicle({
      registrationPlate: `29H-332.${suffix}`,
      vehicleClass: 'Tải 5 tấn',
    });
    const driver = await fleet.createDriver({
      fullName: `Lái xe U332 ${suffix}`,
      phone: `090332${suffix.padStart(4, '0')}`,
      licenceClass: 'FC',
      licenceExpiry: '2030-01-01',
      authUserId: `${DRIVER_LOGIN}.${suffix}`,
    });
    await fleet.assignDriverToVehicle(vehicle.id, driver.id, now);
    const order = await movement.createOrder(
      {
        code: `DH-U332-${suffix}`,
        originLabel: PICKUP_LABEL,
        destinationLabel: FAR_LABEL,
        businessDate: '2026-09-19',
      },
      ACTOR,
    );
    const { run, legs } = await planning.commit(
      order.id,
      { vehicleId: vehicle.id, idempotencyKey: `u332-${suffix}` },
      ACTOR,
    );
    expect(legs.map((leg) => leg.kind)).toEqual(['EMPTY', 'LOADED']);
    return { run, empty: legs[0]!, loaded: legs[1]!, login: `${DRIVER_LOGIN}.${suffix}` };
  };

  /** Duong `/transport/me/checkpoints`. */
  const record = (login: string, runId: string, legId: string, type: RunCheckpointType) =>
    checkpoints.recordAsDriver({
      type,
      runId,
      legId,
      authUserId: login,
      clientEventId: `${legId}:${type}`,
    });

  /** Duong `POST /transport/runs/:runId/legs/:legId/transition`. */
  const transition = (runId: string, legId: string, body: Record<string, unknown>) =>
    runs.transitionLeg(runId, legId, body, ACCOUNTANT);

  /**
   * DUNG thu harness da lam: doc man hinh, lay chang DAU TIEN con nut, bam nut MOC dau tien cua no.
   * Tra ve chang da nhan lan bam — hoac `null` khi man hinh khong con nut moc nao.
   */
  const tapFirstCheckpoint = async (login: string, runId: string): Promise<string | null> => {
    const work = await field.workFor(login);
    const legs = work.runs.find((entry) => entry.runId === runId)?.legs ?? [];
    const current = legs.find((leg) => leg.nextActions.length > 0);
    const action = current?.nextActions.find((entry) => entry.kind === 'CHECKPOINT');
    if (!current || !action?.checkpointType) return null;
    await record(login, runId, current.legId, action.checkpointType);
    return current.legId;
  };

  it('man hinh lai xe dua chang CO HANG len truoc; chang RONG khong moi mot moc nao', async () => {
    const { run, empty, loaded, login } = await uatRun('1');

    const legs = (await field.workFor(login)).runs.find((entry) => entry.runId === run.id)?.legs;
    const byId = new Map((legs ?? []).map((leg) => [leg.legId, leg]));

    expect(byId.get(empty.id)?.nextActions).toEqual([]);
    expect(byId.get(loaded.id)?.nextActions[0]?.checkpointType).toBe('PICKUP_ARRIVAL');
    // Chang "dang lam" = chang dau tien con nut — dung quy tac cua `toFieldScreen()`.
    expect((legs ?? []).find((leg) => leg.nextActions.length > 0)?.legId).toBe(loaded.id);
  });

  it('lap lai vong bam cua harness: ca chuoi lay hang roi vao chang CO HANG, chang RONG trang', async () => {
    const { run, empty, loaded, login } = await uatRun('2');

    const tapped: (string | null)[] = [];
    for (let step = 0; step < 3; step += 1) tapped.push(await tapFirstCheckpoint(login, run.id));

    expect(tapped).toEqual([loaded.id, loaded.id, loaded.id]);
    expect(await checkpointRepo.listForLeg(empty.id)).toEqual([]);
    expect((await checkpointRepo.listForLeg(loaded.id)).map((row) => row.type)).toEqual([
      'PICKUP_ARRIVAL',
      'GATE_ENTRY',
      'LOADING',
    ]);
  });

  it('ghi thang moc hang hoa vao chang RONG bi chan — duong ma runtime 19/09 da lot qua', async () => {
    const { run, empty, login } = await uatRun('3');

    expect(await domainReasonOf(() => record(login, run.id, empty.id, 'PICKUP_ARRIVAL'))).toBe(
      'CHECKPOINT_CARGO_ON_EMPTY_LEG',
    );
    expect(await checkpointRepo.listForLeg(empty.id)).toEqual([]);
  });

  it('ke toan KHONG dong duoc chang CO HANG khi hien truong chua giao — ke ca da toi noi', async () => {
    const { run, empty, loaded, login } = await uatRun('4');

    // Chang RONG van dong duoc nhu truoc: khong co hang thi khong co gi de chung minh.
    await transition(run.id, empty.id, { to: 'IN_TRANSIT' });
    const emptyDone = await transition(run.id, empty.id, { to: 'COMPLETED' });
    expect(emptyDone.leg.status).toBe('COMPLETED');
    // Ngu nghia dong vong chay KHONG doi: con chang co hang thi van chan dung hai ly do cu.
    expect(emptyDone.closure.closed).toBe(false);
    expect(emptyDone.closure.verdict.blockers).toEqual(
      expect.arrayContaining(['LEG_STILL_OPEN', 'PLAN_STILL_OPEN']),
    );

    await transition(run.id, loaded.id, { to: 'IN_TRANSIT' });

    // Dung hinh dang 19/09 12:26:59Z: chang co hang chua co MOT moc nao.
    expect(await httpReasonOf(() => transition(run.id, loaded.id, { to: 'COMPLETED' }))).toBe(
      'LEG_FIELD_DELIVERY_NOT_RECORDED',
    );

    // Da boc hang, da roi kho, da TOI noi giao — van chua phai "da giao".
    for (const type of [
      'PICKUP_ARRIVAL',
      'LOADING',
      'PICKUP_DEPARTURE',
      'DELIVERY_ARRIVAL',
    ] as const) {
      await record(login, run.id, loaded.id, type);
      expect(await httpReasonOf(() => transition(run.id, loaded.id, { to: 'COMPLETED' }))).toBe(
        'LEG_FIELD_DELIVERY_NOT_RECORDED',
      );
    }

    expect((await movement.getLeg(loaded.id)).status).toBe('IN_TRANSIT');
    expect((await movement.getRun(run.id)).run.status).toBe('ACTIVE');
  });

  it('nguoi nhan da nhan hang: dong chang CO HANG binh thuong, roi vong chay dong khi ve bai', async () => {
    const { run, empty, loaded, login } = await uatRun('5');
    await transition(run.id, empty.id, { to: 'IN_TRANSIT' });
    await transition(run.id, empty.id, { to: 'COMPLETED' });
    await transition(run.id, loaded.id, { to: 'IN_TRANSIT' });
    for (const type of [
      'PICKUP_ARRIVAL',
      'PICKUP_DEPARTURE',
      'DELIVERY_ARRIVAL',
      'DELIVERY_ACCEPTED',
    ] as const) {
      await record(login, run.id, loaded.id, type);
    }

    const done = await transition(run.id, loaded.id, { to: 'COMPLETED' });
    expect(done.leg.status).toBe('COMPLETED');
    expect(
      (await auditLog.list({ entityId: loaded.id })).map((entry) => entry.action),
    ).not.toContain('transport.run.leg.complete.override');

    // Chang ve bai la chang RONG — khong doi bang chung. Vong chay dong dung ngu nghia cu.
    const home = await movement.addLeg(
      run.id,
      { sequence: 3, kind: 'EMPTY', originLabel: FAR_LABEL, destinationLabel: DEPOT_LABEL },
      ACTOR,
    );
    await transition(run.id, home.id, { to: 'IN_TRANSIT' });
    const closed = await transition(run.id, home.id, { to: 'COMPLETED' });
    expect(closed.closure.closed).toBe(true);
    expect(closed.closure.verdict.trigger).toBe('DEPOT_RETURN');
  });

  it('ghi de TUONG MINH qua HTTP: dong duoc, kem dau vet rieng co ly do va giai doan hien truong', async () => {
    const { run, loaded } = await uatRun('6');
    await transition(run.id, loaded.id, { to: 'IN_TRANSIT' });

    const done = await transition(run.id, loaded.id, {
      to: 'COMPLETED',
      overrideReason: OVERRIDE_REASON,
    });

    expect(done.leg.status).toBe('COMPLETED');
    const overrides = await auditLog.list({
      action: 'transport.run.leg.complete.override',
      entityId: loaded.id,
    });
    expect(overrides).toHaveLength(1);
    expect(overrides[0]).toMatchObject({
      actor: ACTOR,
      after: {
        status: 'COMPLETED',
        fieldOverride: { reason: OVERRIDE_REASON, fieldPhase: 'PLANNED' },
      },
    });
  });

  it('ly do ghi de rong bi tu choi o bien — ghi de khong co ly do la khong co dau vet', async () => {
    const { run, loaded } = await uatRun('7');
    await transition(run.id, loaded.id, { to: 'IN_TRANSIT' });

    // `parse()` chay TRUOC `guard()` nen loi o bien la loi dong bo, khong phai mot promise bi tu choi.
    expect(() => transition(run.id, loaded.id, { to: 'COMPLETED', overrideReason: '   ' })).toThrow(
      BadRequestException,
    );
    expect((await movement.getLeg(loaded.id)).status).toBe('IN_TRANSIT');
  });
});
