import { Inject, Injectable, Optional } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { TelemetryService } from '../../observability/telemetry.service.js';
import { toBusinessDate } from '../business-date.js';
import { FleetRepository } from '../fleet/fleet.repository.js';
import { isTerminalRunStatus } from '../movement/movement-lifecycle.js';
import { MovementService } from '../movement/movement.service.js';
import type { Order, RunLeg, VehicleRun } from '../movement/movement.types.js';
import { isUniqueViolationOn } from '../storage-conflict.js';
import {
  TRANSPORT_CLOCK,
  TRANSPORT_CORE_POLICY,
  type TransportCorePolicy,
} from '../transport-policy.js';
import { TransportDomainError } from '../transport.errors.js';
import {
  TRANSPORT_PLANNING_DECISIONS,
  type TransportPlanningDecisionReason,
} from './planning-decisions.js';
import { TRANSPORT_PLANNING_POLICY, resolveDepot, usableDepot } from './planning-policy.js';
import {
  ORDER_RUN_PLAN_ACTIVE_ORDER,
  ORDER_RUN_PLAN_IDEMPOTENCY,
  ORDER_RUN_PLAN_ONE_PER_RUN,
  RunPlanRepository,
} from './planning.repository.js';
import type {
  OrderRunPlan,
  RunClosureVerdict,
  RunPlanProposal,
  TransportPlanningPolicy,
  VehicleRunProjection,
} from './planning.types.js';
import { evaluateRunClosure, type ClosureLegFacts } from './run-closure.js';
import {
  planOrderAssignment,
  planRunCode,
  type PlannedDistanceHint,
  type PlannerRunFacts,
} from './run-plan.js';

type DecisionPoint = (typeof TRANSPORT_PLANNING_DECISIONS)['points'][number];

export interface PlanOrderCommand {
  readonly vehicleId: string;
  readonly distanceHint?: PlannedDistanceHint;
}

export interface CommitPlanCommand extends PlanOrderCommand {
  /** Khoa chong lap do nguoi goi dat. Cung khoa = cung mot hieu qua nghiep vu. */
  readonly idempotencyKey: string;
}

export interface RunPlanCommitResult {
  readonly plan: OrderRunPlan;
  readonly run: VehicleRun;
  readonly legs: readonly RunLeg[];
  /** `true` khi lan goi nay chi doc lai ket qua cua mot lan truoc cung khoa. */
  readonly replayed: boolean;
}

export interface RunClosureOutcome {
  readonly runId: string;
  readonly verdict: RunClosureVerdict;
  /** `true` khi CHINH lan goi nay dong vong chay. Goi lai lan hai tra `false`. */
  readonly closed: boolean;
  readonly run: VehicleRun;
}

/**
 * LAP KE HOACH VONG CHAY DO HE THONG QUAN — #276 (Lane L).
 *
 * ============================================================================================
 * DICH VU NAY GHI QUA `MovementService`, KHONG QUA `MovementRepository`
 * ============================================================================================
 *
 * Cung ly le da ghi o `SiteIntakeService`: di qua dich vu thi duoc may trang thai, dau vet kiem
 * toan va quy uoc ngay nghiep vu; ghi thang vao kho thi bo qua ca ba. `RunPlanRepository` la kho
 * DUY NHAT ma lop nay so huu, va no chi giu lich su lap ke hoach.
 *
 * ============================================================================================
 * BON DUONG, VA CHI MOT DUONG DOC
 * ============================================================================================
 *
 *   `preview()`          DOC. Khong mot hang nao duoc ghi — `#276` L7 doi *"The preview must be
 *                        side-effect free."* Lane M goi duong nay bao nhieu lan cung duoc.
 *   `commit()`           GHI. Chi chay khi co mot khoa chong lap va mot chiec xe do NGUOI chon.
 *   `cancelPlan()`       GHI. Go mot ke hoach chua chay, giai phong don cho lan lap moi.
 *   `settleRunClosure()` GHI, nhung khong nhan mot y muon nao — no thi hanh mot phan xu tat dinh.
 *
 * ============================================================================================
 * KHONG MOT DONG NAO O DAY DUNG TOI `TransportOrder.status`
 * ============================================================================================
 *
 * Dong mot vong chay khong hoan thanh mot nghia vu thuong mai, va nguoc lai. `#274` chot do la
 * quyet dinh CUA NGUOI, thuoc Lane K. Neu mot ngay lop nay goi `transitionOrder()`, hai truc da
 * bi tron lai va cong ke toan da bi di vong.
 */
@Injectable()
export class PlanningService {
  constructor(
    private readonly movement: MovementService,
    private readonly plans: RunPlanRepository,
    private readonly fleet: FleetRepository,
    private readonly audit: AuditLogService,
    @Inject(TRANSPORT_CORE_POLICY) private readonly corePolicy: TransportCorePolicy,
    @Inject(TRANSPORT_PLANNING_POLICY) private readonly policy: TransportPlanningPolicy,
    @Optional() private readonly telemetry?: TelemetryService,
    @Optional() @Inject(TRANSPORT_CLOCK) private readonly clock?: () => Date,
  ) {}

  /* ------------------------------------------------------------------ *
   * DOC — khong ghi mot hang nao
   * ------------------------------------------------------------------ */

  /** Chinh sach dang ap dung. Be mat CHAN DOAN — `#276` L1: khong phai mot nut cho lai xe. */
  describePolicy(): {
    readonly grouping: TransportPlanningPolicy['grouping'];
    readonly depot: ReturnType<typeof resolveDepot>;
    readonly closure: TransportPlanningPolicy['closure'];
  } {
    return {
      grouping: this.policy.grouping,
      depot: resolveDepot(this.policy),
      closure: this.policy.closure,
    };
  }

  async preview(orderId: string, command: PlanOrderCommand): Promise<RunPlanProposal> {
    const order = await this.requirePlannableOrder(orderId);
    await this.requireVehicle(command.vehicleId);

    const decision = await this.buildProposal(order, command);
    this.decide(
      'planning.preview',
      'allowed',
      decision.proposal.outcome === 'NEW_RUN' ? 'PLAN_PREVIEW_NEW_RUN' : 'PLAN_PREVIEW_APPEND',
      {
        orderId,
        vehicleId: command.vehicleId,
        grouping: decision.proposal.grouping,
        emptyLegRequired: decision.proposal.emptyLegRequired,
        startSource: decision.proposal.startSource,
      },
    );
    return decision.proposal;
  }

  plansOfOrder(orderId: string): Promise<OrderRunPlan[]> {
    return this.plans.listForOrder(orderId);
  }

  activePlanOfOrder(orderId: string): Promise<OrderRunPlan | null> {
    return this.plans.findActiveForOrder(orderId);
  }

  /**
   * XE NAY SE KET THUC O DAU — nguon cho Lane M (`#276` L7).
   *
   * Doc, khong ghi, va khong xep hang ung vien: xep hang la viec cua Lane M. Lop nay chi tra ve
   * mot su that cua ke hoach hien tai.
   */
  async projectVehicle(vehicleId: string): Promise<VehicleRunProjection> {
    await this.requireVehicle(vehicleId);
    const run = await this.movement.latestRunForVehicle(vehicleId);
    const depot = usableDepot(resolveDepot(this.policy));

    if (run === null || isTerminalRunStatus(run.status)) {
      return {
        vehicleId,
        runId: run?.id ?? null,
        runCode: run?.code ?? null,
        runStatus: run?.status ?? null,
        endpointLabel: depot?.label ?? null,
        endpointSource: depot === null ? 'UNKNOWN' : 'DEPOT',
        // Vong chay da dong: xe ranh tu luc do. Chua co vong chay nao: ranh tu bao gio thi khong
        // ai biet, va `null` noi dung dieu do.
        freeFrom: run?.completedAt ?? null,
        openLegCount: 0,
      };
    }

    const legs = await this.movement.legsOfRun(run.id);
    const open = legs.filter((leg) => leg.status === 'PLANNED' || leg.status === 'IN_TRANSIT');

    if (open.length > 0) {
      const last = open.reduce((best, leg) => (leg.sequence > best.sequence ? leg : best));
      return {
        vehicleId,
        runId: run.id,
        runCode: run.code,
        runStatus: run.status,
        endpointLabel: last.destinationLabel,
        endpointSource: 'PLANNED_LEG_DESTINATION',
        // Con viec dang chay: gio ranh doi mot phep tinh duong di ma lane nay khong co nguon.
        freeFrom: null,
        openLegCount: open.length,
      };
    }

    const completed = legs.filter((leg) => leg.status === 'COMPLETED');
    if (completed.length === 0) {
      return {
        vehicleId,
        runId: run.id,
        runCode: run.code,
        runStatus: run.status,
        endpointLabel: depot?.label ?? null,
        endpointSource: depot === null ? 'UNKNOWN' : 'DEPOT',
        freeFrom: null,
        openLegCount: 0,
      };
    }

    // `completedAt` truoc, roi `sequence` de PHA HOA — cung quy tac voi `lastCompleted()` cua
    // `run-closure.ts`, va cung ly do: hai chang dong trong cung mot mili giay khong duoc de thu
    // tu doc cua kho quyet dinh xe dang o dau.
    const last = completed.reduce((best, leg) => {
      const at = leg.completedAt ?? '';
      const bestAt = best.completedAt ?? '';
      return at > bestAt || (at === bestAt && leg.sequence > best.sequence) ? leg : best;
    });
    return {
      vehicleId,
      runId: run.id,
      runCode: run.code,
      runStatus: run.status,
      endpointLabel: last.destinationLabel,
      endpointSource: 'COMPLETED_LEG_DESTINATION',
      freeFrom: last.completedAt,
      openLegCount: 0,
    };
  }

  /** Phan xu dong vong chay, KHONG thi hanh. Be mat chan doan cua bang dieu hanh. */
  async inspectClosure(runId: string): Promise<RunClosureVerdict> {
    const detail = await this.movement.getRun(runId);
    return evaluateRunClosure(await this.closureFacts(detail.run, detail.legs));
  }

  /* ------------------------------------------------------------------ *
   * GHI
   * ------------------------------------------------------------------ */

  async commit(
    orderId: string,
    command: CommitPlanCommand,
    actor: string,
  ): Promise<RunPlanCommitResult> {
    // GUI LAI TRUOC MOI PHEP KIEM KHAC — cung ly le voi `SiteIntakeService.confirm()`. Mot lenh
    // da thanh cong roi mat song tren duong ve phai tra dung ket qua cu, ke ca khi chinh no da
    // lam moi phep kiem ben duoi thanh "khong con dung nua" (don BAY GIO da co ke hoach).
    const replayed = await this.plans.findByIdempotencyKey(command.idempotencyKey);
    if (replayed) return await this.replay(replayed);

    const order = await this.requirePlannableOrder(orderId);
    await this.requireVehicle(command.vehicleId);

    const active = await this.plans.findActiveForOrder(orderId);
    if (active) throw this.conflict('planning.commit', 'PLAN_ORDER_ALREADY_PLANNED', { orderId });

    const { proposal } = await this.buildProposal(order, command);
    const businessDate = toBusinessDate(this.now(), this.corePolicy.timeZone);

    const run = await this.resolveTargetRun(proposal, command, businessDate, actor);
    if (run === null) {
      // Ban kia da chiem ma vong chay nhung chua ghi xong ke hoach. Doan la sai, nen noi that.
      throw this.conflict('planning.commit', 'PLAN_COMMIT_IN_FLIGHT', {
        orderId,
        idempotencyKey: command.idempotencyKey,
      });
    }

    const created: RunLeg[] = [];
    for (const planned of proposal.legs) {
      created.push(
        await this.movement.addLeg(
          run.id,
          {
            sequence: planned.sequence,
            kind: planned.kind,
            orderId: planned.orderId,
            originLabel: planned.originLabel,
            destinationLabel: planned.destinationLabel,
            businessDate,
            distanceKm: null,
            plannedDistanceKm: planned.plannedDistanceKm,
            note: null,
          },
          actor,
        ),
      );
    }

    const loadedLeg = created.find((leg) => leg.kind === 'LOADED');
    const emptyLeg = created.find((leg) => leg.kind === 'EMPTY') ?? null;
    if (!loadedLeg) {
      // Khong the xay ra: `planOrderAssignment()` luon sinh dung mot chang co hang. Neu no xay ra
      // thi mot thay doi o bo lap ke hoach da pha hop dong, va im lang o day se de lai mot vong
      // chay khong mang don nao.
      throw TransportDomainError.invalid(
        'PLAN_LOADED_LEG_MISSING',
        'Ke hoach khong sinh ra chang co hang nao.',
      );
    }

    const plan = await this.plans
      .create({
        orderId,
        runId: run.id,
        vehicleId: command.vehicleId,
        loadedLegId: loadedLeg.id,
        emptyLegId: emptyLeg?.id ?? null,
        grouping: proposal.grouping,
        outcome: proposal.outcome,
        idempotencyKey: command.idempotencyKey,
        plannedBy: actor,
        businessDate,
      })
      .catch(async (error: unknown) => {
        // HAI YEU CAU SONG SONG. Phep doc o tren khong thay ban kia vi no chua commit; unique cua
        // kho thi thay. Dich tung ten index ra dung mot ma nghiep vu thay vi de `P2002` tho di len.
        if (isUniqueViolationOn(error, ORDER_RUN_PLAN_IDEMPOTENCY)) {
          const already = await this.plans.findByIdempotencyKey(command.idempotencyKey);
          if (already) return already;
        }
        if (isUniqueViolationOn(error, ORDER_RUN_PLAN_ACTIVE_ORDER)) {
          throw this.conflict('planning.commit', 'PLAN_ORDER_ALREADY_PLANNED', { orderId });
        }
        if (isUniqueViolationOn(error, ORDER_RUN_PLAN_ONE_PER_RUN)) {
          throw this.conflict('planning.commit', 'PLAN_COMMIT_IN_FLIGHT', { orderId });
        }
        throw error;
      });

    this.decide(
      'planning.commit',
      'allowed',
      proposal.outcome === 'NEW_RUN' ? 'PLAN_COMMITTED_NEW_RUN' : 'PLAN_COMMITTED_APPENDED',
      {
        orderId,
        runId: run.id,
        vehicleId: command.vehicleId,
        grouping: proposal.grouping,
        emptyLegId: emptyLeg?.id ?? null,
        loadedLegId: loadedLeg.id,
      },
    );
    await this.audit.append({
      actor,
      action: 'transport.planning.commit',
      entityType: 'TransportOrderRunPlan',
      entityId: plan.id,
      before: null,
      after: plan,
    });

    return { plan, run, legs: created, replayed: false };
  }

  /**
   * GO MOT KE HOACH CHUA CHAY — `#276` L9 bai 5 (*"future planned leg can be replanned with
   * audit where allowed"*).
   *
   * Huy ke hoach keo theo huy CAC CHANG CHUA CHAY cua chinh no, va chi the: chang da lan banh
   * hoac da xong o lai nguyen ven. Do la ranh gioi giua "doi ke hoach" va "viet lai lich su".
   */
  async cancelPlan(planId: string, reason: string, actor: string): Promise<OrderRunPlan> {
    const before = await this.plans.find(planId);
    if (!before) {
      throw TransportDomainError.notFound('PLAN_NOT_FOUND', 'Khong tim thay ke hoach.');
    }
    if (before.cancelledAt !== null) {
      throw this.deny('planning.cancel', 'PLAN_CANCEL_ALREADY_CANCELLED', { planId });
    }

    const loaded = await this.movement.getLeg(before.loadedLegId);
    if (loaded.status === 'COMPLETED') {
      throw this.deny('planning.cancel', 'PLAN_CANCEL_LEG_COMPLETED', {
        planId,
        legId: loaded.id,
      });
    }

    for (const legId of [before.emptyLegId, before.loadedLegId]) {
      if (legId === null) continue;
      const leg = await this.movement.getLeg(legId);
      if (leg.status !== 'PLANNED') continue;
      await this.movement.cancelLeg(legId, reason, actor);
    }

    const after = await this.plans.cancel(planId, {
      cancelledAt: this.now(),
      cancellationReason: reason,
    });
    if (!after) throw TransportDomainError.notFound('PLAN_NOT_FOUND', 'Khong tim thay ke hoach.');

    this.decide('planning.cancel', 'allowed', 'PLAN_CANCELLED', { planId, runId: before.runId });
    await this.audit.append({
      actor,
      action: 'transport.planning.cancel',
      entityType: 'TransportOrderRunPlan',
      entityId: planId,
      before,
      after,
    });
    return after;
  }

  /**
   * DONG VONG CHAY NEU DU DIEU KIEN — TAT DINH, va khong nhan mot y muon nao.
   *
   * Goi duoc bao nhieu lan cung duoc: lan thu hai thay vong chay da o diem cuoi va tra
   * `closed: false` kem ly do, khong nem.
   */
  async settleRunClosure(runId: string): Promise<RunClosureOutcome> {
    const detail = await this.movement.getRun(runId);
    const verdict = evaluateRunClosure(await this.closureFacts(detail.run, detail.legs));

    if (isTerminalRunStatus(detail.run.status)) {
      this.decide('planning.run_closure', 'allowed', 'RUN_CLOSURE_ALREADY_TERMINAL', {
        runId,
        status: detail.run.status,
      });
      return { runId, verdict, closed: false, run: detail.run };
    }

    if (!verdict.closable) {
      this.decide(
        'planning.run_closure',
        verdict.holding ? 'allowed' : 'denied',
        verdict.holding ? 'RUN_CLOSURE_HOLDING' : 'RUN_CLOSURE_BLOCKED',
        { runId, blockers: verdict.blockers },
      );
      return { runId, verdict, closed: false, run: detail.run };
    }

    const trigger = verdict.trigger ?? 'DEPOT_RETURN';
    const run = await this.movement.closeRunAsSystem(runId, trigger);
    this.decide(
      'planning.run_closure',
      'allowed',
      trigger === 'DEPOT_RETURN' ? 'RUN_CLOSED_ON_DEPOT_RETURN' : 'RUN_CLOSED_ON_IDLE_TIMEOUT',
      { runId, trigger },
    );
    return { runId, verdict, closed: true, run };
  }

  /* ------------------------------------------------------------------ *
   * Noi bo
   * ------------------------------------------------------------------ */

  private async buildProposal(order: Order, command: PlanOrderCommand) {
    const depotResolution = resolveDepot(this.policy);
    this.decide(
      'planning.depot',
      depotResolution.kind === 'AMBIGUOUS' ? 'denied' : 'allowed',
      depotResolution.kind === 'RESOLVED'
        ? 'DEPOT_RESOLVED'
        : depotResolution.kind === 'NOT_CONFIGURED'
          ? 'DEPOT_NOT_CONFIGURED'
          : 'DEPOT_AMBIGUOUS',
      depotResolution.kind === 'AMBIGUOUS' ? { codes: depotResolution.codes } : {},
    );

    const latest = await this.latestRunFacts(command.vehicleId);
    const decision = planOrderAssignment({
      order: {
        id: order.id,
        code: order.code,
        originLabel: order.originLabel,
        destinationLabel: order.destinationLabel,
      },
      vehicleId: command.vehicleId,
      grouping: this.policy.grouping,
      depot: usableDepot(depotResolution),
      latestRun: latest,
      ...(command.distanceHint === undefined ? {} : { distanceHint: command.distanceHint }),
    });

    this.decide('planning.grouping', 'allowed', decision.groupingReason, {
      orderId: order.id,
      vehicleId: command.vehicleId,
      grouping: this.policy.grouping,
      latestRunId: latest?.id ?? null,
    });
    return decision;
  }

  private async latestRunFacts(vehicleId: string): Promise<PlannerRunFacts | null> {
    const run = await this.movement.latestRunForVehicle(vehicleId);
    if (run === null) return null;
    const legs = await this.movement.legsOfRun(run.id);
    return {
      id: run.id,
      code: run.code,
      status: run.status,
      legs: legs.map((leg) => ({
        sequence: leg.sequence,
        kind: leg.kind,
        status: leg.status,
        destinationLabel: leg.destinationLabel,
      })),
    };
  }

  /**
   * Vong chay dich cua lan chot nay — tao moi, hoac dung lai cai dang chay.
   *
   * `null` nghia la MOT BAN SONG SONG da chiem ma vong chay tat dinh nhung chua ghi xong ke hoach.
   * Xem khoi chu thich cua `planRunCode()`.
   */
  private async resolveTargetRun(
    proposal: RunPlanProposal,
    command: CommitPlanCommand,
    businessDate: string,
    actor: string,
  ): Promise<VehicleRun | null> {
    if (proposal.runId !== null) {
      const detail = await this.movement.getRun(proposal.runId);
      return detail.run;
    }

    const code = planRunCode(businessDate, this.planDigest(command));
    try {
      return await this.movement.createRun(
        { code, vehicleId: command.vehicleId, businessDate, note: null },
        actor,
      );
    } catch (error) {
      if (!(error instanceof TransportDomainError) || error.reason !== 'RUN_CODE_TAKEN')
        throw error;
      return null;
    }
  }

  /** Bam TAT DINH tu `(vehicleId, idempotencyKey)` — cung mau voi `runCodeFor()` cua site-intake. */
  private planDigest(command: CommitPlanCommand): string {
    return (
      createHash('sha256')
        // DAI TRUOC, ROI NOI DUNG: noi hai chuoi bang mot dau phan cach bat ky van nhap nhang khi
        // chinh chuoi chua dau do; tien to do dai thi khong.
        .update(`${command.vehicleId.length}:${command.vehicleId}:${command.idempotencyKey}`)
        .digest('hex')
    );
  }

  private async replay(plan: OrderRunPlan): Promise<RunPlanCommitResult> {
    const detail = await this.movement.getRun(plan.runId);
    const legs = detail.legs.filter(
      (leg) => leg.id === plan.loadedLegId || leg.id === plan.emptyLegId,
    );
    this.decide('planning.commit', 'allowed', 'PLAN_COMMIT_REPLAYED', {
      planId: plan.id,
      runId: plan.runId,
      orderId: plan.orderId,
    });
    return { plan, run: detail.run, legs, replayed: true };
  }

  private async closureFacts(run: VehicleRun, legs: readonly RunLeg[]) {
    const open = await this.plans.listActiveForRun(run.id);
    const openPlanCount = open.filter((plan) => {
      const leg = legs.find((entry) => entry.id === plan.loadedLegId);
      // Chang khong nam trong vong chay nay (khong the xay ra) hoac chua ket thuc: con mo.
      return leg === undefined || (leg.status !== 'COMPLETED' && leg.status !== 'CANCELLED');
    }).length;

    const closureLegs: ClosureLegFacts[] = legs.map((leg) => ({
      id: leg.id,
      sequence: leg.sequence,
      status: leg.status,
      destinationLabel: leg.destinationLabel,
      completedAt: leg.completedAt,
    }));

    return {
      runStatus: run.status,
      legs: closureLegs,
      openPlanCount,
      depot: usableDepot(resolveDepot(this.policy)),
      policy: this.policy.closure,
      now: this.now(),
    };
  }

  private async requirePlannableOrder(orderId: string): Promise<Order> {
    const order = await this.movement.getOrder(orderId);
    if (order.status === 'CANCELLED') {
      throw this.deny('planning.commit', 'PLAN_ORDER_CANCELLED', { orderId });
    }
    if (order.status === 'FULFILLED') {
      throw this.deny('planning.commit', 'PLAN_ORDER_FULFILLED', { orderId });
    }
    return order;
  }

  private async requireVehicle(vehicleId: string): Promise<void> {
    if (!(await this.fleet.findVehicle(vehicleId))) {
      throw TransportDomainError.notFound('RUN_VEHICLE_NOT_FOUND', 'Khong tim thay xe.');
    }
  }

  private now(): Date {
    return this.clock ? this.clock() : new Date();
  }

  private decide(
    point: DecisionPoint,
    outcome: 'allowed' | 'denied',
    reason: TransportPlanningDecisionReason,
    detail: Record<string, unknown>,
  ): void {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_PLANNING_DECISIONS,
      point,
      outcome,
      reason,
      detail,
    });
  }

  private deny(
    point: DecisionPoint,
    reason: TransportPlanningDecisionReason,
    detail: Record<string, unknown>,
  ): TransportDomainError {
    this.decide(point, 'denied', reason, detail);
    return TransportDomainError.denied(reason, TRANSPORT_PLANNING_DECISIONS.labels[reason]);
  }

  /**
   * `409` chu khong `403`: don da co ke hoach khong phai mot lan thieu quyen, no la mot va cham
   * trang thai — va nguoi goi xu ly hai thu do khac han nhau.
   */
  private conflict(
    point: DecisionPoint,
    reason: TransportPlanningDecisionReason,
    detail: Record<string, unknown>,
  ): TransportDomainError {
    this.decide(point, 'denied', reason, detail);
    return TransportDomainError.conflict(reason, TRANSPORT_PLANNING_DECISIONS.labels[reason]);
  }
}
