import { Inject, Injectable, Optional } from '@nestjs/common';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { TelemetryService } from '../../observability/telemetry.service.js';
import { assertBusinessDate, toBusinessDate } from '../business-date.js';
import { FleetRepository } from '../fleet/fleet.repository.js';
import { MoneyError, nonNegativeMoney } from '../money.js';
import { TRANSPORT_CORE_POLICY, type TransportCorePolicy } from '../transport-policy.js';
import { TransportDomainError } from '../transport.errors.js';
import { TripRepository } from '../trips/trip.repository.js';
import {
  TRANSPORT_MOVEMENT_DECISIONS,
  type TransportMovementDecisionReason,
} from './movement-decisions.js';
import {
  evaluateOrderCancel,
  evaluateOrderTransition,
  evaluateRunCancel,
  evaluateRunTransition,
} from './movement-lifecycle.js';
import { isUniqueViolationOn } from '../storage-conflict.js';
import {
  MovementRepository,
  RUN_CODE,
  type CreateOrderInput,
  type CreateRunInput,
  type TripProjection,
  type UpdateOrderInput,
} from './movement.repository.js';
import type {
  Order,
  OrderStatus,
  RunAssignment,
  RunLeg,
  RunLegKind,
  VehicleRun,
  VehicleRunDetail,
  VehicleRunStatus,
} from './movement.types.js';
import { planTripProjection } from './trip-run-projection.js';

/**
 * LENH cua tang tren. Khac DTO ghi cua repository o dung mot cho: `businessDate` la TUY CHON.
 *
 * Co y tach lam hai kieu. Ngay nghiep vu duoc CHOT MOT LAN, boi service, theo mui gio tenant
 * (`INV-25`) -- neu DTO ghi cung cho no vang mat thi mot repository nao do se co co suy no lai
 * tu `createdAt`, va hai cach tinh se lech nhau dung vao ngay ai do doi cau hinh.
 */
export type CreateOrderCommand = Omit<CreateOrderInput, 'businessDate'> & {
  readonly businessDate?: string;
};

export type CreateRunCommand = Omit<CreateRunInput, 'businessDate'> & {
  readonly businessDate?: string;
};

/** Them mot chang -- `orderId` chi co nghia khi `kind === 'LOADED'`. */
export interface AddLegCommand {
  readonly sequence: number;
  readonly kind: RunLegKind;
  readonly orderId?: string | null;
  readonly originLabel: string;
  readonly destinationLabel: string;
  readonly businessDate?: string;
  readonly distanceKm?: number | null;
  readonly note?: string | null;
}

export interface AssignRunCommand {
  readonly driverId: string;
}

type DecisionPoint = (typeof TRANSPORT_MOVEMENT_DECISIONS)['points'][number];

/**
 * MIEN VAN CHUYEN v2 -- hai truc doc lap (#232 `D-01`, #234 A1).
 *
 * Service nay so huu DUNG hai thu: nghia vu thuong mai (`Order`) va vong chay vat ly
 * (`VehicleRun` + `RunLeg`). No KHONG so huu chuyen v1: `TripRepository` chi duoc doc, va chi
 * boi mot duong duy nhat -- `projectTrip()`.
 *
 * Moi duong tu choi mang mot MA RIENG. Mot cong nghiep vu co N duong tu choi ma tra ve `false`
 * thi nguoi doc trace phai mo source doc lai N dieu kien roi doan xem cai nao da dong.
 */
@Injectable()
export class MovementService {
  constructor(
    private readonly repository: MovementRepository,
    private readonly fleet: FleetRepository,
    private readonly audit: AuditLogService,
    @Inject(TRANSPORT_CORE_POLICY) private readonly policy: TransportCorePolicy,
    @Optional() private readonly trips?: TripRepository,
    @Optional() private readonly telemetry?: TelemetryService,
  ) {}

  /* ------------------------------------------------------------------ *
   * NGHIA VU THUONG MAI
   * ------------------------------------------------------------------ */

  async createOrder(input: CreateOrderCommand, actor: string): Promise<Order> {
    if (await this.repository.findOrderByCode(input.code)) {
      throw TransportDomainError.conflict(
        'ORDER_CODE_TAKEN',
        `Ma nghia vu "${input.code}" da duoc dung.`,
      );
    }
    await this.requireCustomer(input.customerId ?? null);

    const order = await this.repository.createOrder({
      ...input,
      businessDate: this.resolveBusinessDate(input.businessDate),
      freightAmount: this.checkMoney(input.freightAmount ?? null),
    });

    await this.audit.append({
      actor,
      action: 'transport.order.create',
      entityType: 'TransportOrder',
      entityId: order.id,
      before: null,
      after: order,
    });
    return order;
  }

  async updateOrder(id: string, patch: UpdateOrderInput, actor: string): Promise<Order> {
    const before = await this.requireOrder(id);
    if (patch.customerId !== undefined) await this.requireCustomer(patch.customerId);

    const after = await this.repository.updateOrder(id, {
      ...patch,
      ...(patch.freightAmount === undefined
        ? {}
        : { freightAmount: this.checkMoney(patch.freightAmount) }),
    });
    if (!after) throw TransportDomainError.notFound('ORDER_NOT_FOUND', 'Khong tim thay nghia vu.');

    await this.audit.append({
      actor,
      action: 'transport.order.update',
      entityType: 'TransportOrder',
      entityId: id,
      before,
      after,
    });
    return after;
  }

  listOrders(): Promise<Order[]> {
    return this.repository.listOrders();
  }

  getOrder(id: string): Promise<Order> {
    return this.requireOrder(id);
  }

  /** Chang dang phuc vu mot nghia vu -- cach doc "don nay dang di den dau". */
  legsOfOrder(orderId: string): Promise<RunLeg[]> {
    return this.repository.listLegsByOrder(orderId);
  }

  async transitionOrder(id: string, to: OrderStatus, actor: string): Promise<Order> {
    const before = await this.requireOrder(id);
    const decision = evaluateOrderTransition(before.status, to);
    if (!decision.allowed) {
      throw this.deny('order.lifecycle_transition', decision.reason, { orderId: id, to });
    }

    const after = await this.repository.setOrderStatus(id, to, new Date());
    if (!after) throw TransportDomainError.notFound('ORDER_NOT_FOUND', 'Khong tim thay nghia vu.');

    this.allow('order.lifecycle_transition', decision.reason, {
      orderId: id,
      from: before.status,
      to,
    });
    await this.audit.append({
      actor,
      action: 'transport.order.transition',
      entityType: 'TransportOrder',
      entityId: id,
      before,
      after,
    });
    return after;
  }

  async cancelOrder(id: string, reason: string, actor: string): Promise<Order> {
    const before = await this.requireOrder(id);
    const decision = evaluateOrderCancel(before.status);
    if (!decision.allowed) {
      throw this.deny('order.cancel', decision.reason, { orderId: id });
    }

    const after = await this.repository.cancelOrder(id, {
      cancelledAt: new Date(),
      cancellationReason: reason,
    });
    if (!after) throw TransportDomainError.notFound('ORDER_NOT_FOUND', 'Khong tim thay nghia vu.');

    this.allow('order.cancel', decision.reason, { orderId: id });
    await this.audit.append({
      actor,
      action: 'transport.order.cancel',
      entityType: 'TransportOrder',
      entityId: id,
      before,
      after,
    });
    return after;
  }

  /* ------------------------------------------------------------------ *
   * VONG CHAY VAT LY
   * ------------------------------------------------------------------ */

  async createRun(input: CreateRunCommand, actor: string): Promise<VehicleRun> {
    if (await this.repository.findRunByCode(input.code)) {
      throw TransportDomainError.conflict(
        'RUN_CODE_TAKEN',
        `Ma vong chay "${input.code}" da duoc dung.`,
      );
    }
    if (!(await this.fleet.findVehicle(input.vehicleId))) {
      throw TransportDomainError.notFound('RUN_VEHICLE_NOT_FOUND', 'Khong tim thay xe.');
    }

    const run = await this.repository
      .createRun({
        ...input,
        businessDate: this.resolveBusinessDate(input.businessDate),
      })
      .catch((error: unknown) => {
        // HAI YEU CAU DEN CUNG LUC. Phep doc `findRunByCode` o tren khong thay ban kia vi no chua
        // commit; unique cua kho thi thay. Dich ra DUNG ma ma duong tuan tu da tra ve, thay vi de mot
        // `P2002` tho di len thanh `500` — nguoi goi khong phan biet duoc hai tinh huong, va ca hai
        // deu co cung mot cau tra loi dung: "ma nay da co roi".
        if (isUniqueViolationOn(error, RUN_CODE)) {
          throw TransportDomainError.conflict(
            'RUN_CODE_TAKEN',
            `Ma vong chay "${input.code}" da duoc dung.`,
          );
        }
        throw error;
      });

    await this.audit.append({
      actor,
      action: 'transport.run.create',
      entityType: 'TransportVehicleRun',
      entityId: run.id,
      before: null,
      after: run,
    });
    return run;
  }

  listRuns(): Promise<VehicleRun[]> {
    return this.repository.listRuns();
  }

  async getRun(id: string): Promise<VehicleRunDetail> {
    const run = await this.requireRun(id);
    return {
      run,
      legs: await this.repository.listLegs(id),
      activeAssignment: await this.repository.activeRunAssignment(id),
    };
  }

  async transitionRun(id: string, to: VehicleRunStatus, actor: string): Promise<VehicleRun> {
    const before = await this.requireRun(id);
    const legs = await this.repository.listLegs(id);
    const decision = evaluateRunTransition(before.status, to, { legCount: legs.length });
    if (!decision.allowed) {
      throw this.deny('run.lifecycle_transition', decision.reason, { runId: id, to });
    }

    const after = await this.repository.setRunStatus(id, to, new Date());
    if (!after) throw TransportDomainError.notFound('RUN_NOT_FOUND', 'Khong tim thay vong chay.');

    this.allow('run.lifecycle_transition', decision.reason, { runId: id, from: before.status, to });
    await this.audit.append({
      actor,
      action: 'transport.run.transition',
      entityType: 'TransportVehicleRun',
      entityId: id,
      before,
      after,
    });
    return after;
  }

  async cancelRun(id: string, reason: string, actor: string): Promise<VehicleRun> {
    const before = await this.requireRun(id);
    const decision = evaluateRunCancel(before.status);
    if (!decision.allowed) throw this.deny('run.cancel', decision.reason, { runId: id });

    const after = await this.repository.cancelRun(id, {
      cancelledAt: new Date(),
      cancellationReason: reason,
    });
    if (!after) throw TransportDomainError.notFound('RUN_NOT_FOUND', 'Khong tim thay vong chay.');

    this.allow('run.cancel', decision.reason, { runId: id });
    await this.audit.append({
      actor,
      action: 'transport.run.cancel',
      entityType: 'TransportVehicleRun',
      entityId: id,
      before,
      after,
    });
    return after;
  }

  /* ------------------------------------------------------------------ *
   * CHANG
   * ------------------------------------------------------------------ */

  async addLeg(runId: string, command: AddLegCommand, actor: string): Promise<RunLeg> {
    const run = await this.requireRun(runId);
    if (run.status === 'COMPLETED' || run.status === 'CANCELLED') {
      throw this.deny('run.leg_change', 'LEG_RUN_TERMINAL', { runId, status: run.status });
    }

    const orderId = await this.resolveLegOrder(runId, command);

    const leg = await this.repository
      .createLeg({
        runId,
        sequence: command.sequence,
        kind: command.kind,
        orderId,
        originLabel: command.originLabel,
        destinationLabel: command.destinationLabel,
        businessDate: this.resolveBusinessDate(command.businessDate ?? run.businessDate),
        distanceKm: command.distanceKm ?? null,
        note: command.note ?? null,
      })
      .catch((error: unknown) => {
        throw this.legSequenceConflict(error, runId, command.sequence);
      });

    this.allow('run.leg_change', 'LEG_ADDED', { runId, sequence: leg.sequence, kind: leg.kind });
    await this.audit.append({
      actor,
      action: 'transport.run.leg.add',
      entityType: 'TransportRunLeg',
      entityId: leg.id,
      before: null,
      after: leg,
    });
    return leg;
  }

  /**
   * Duong DUY NHAT quyet dinh `orderId` cua mot chang.
   *
   * THU TU KIEM la mot phan hop dong: bat bien "chang rong khong mang don" duoc kiem TRUOC khi hoi
   * kho ve don. Neu doi thu tu, mot chang `EMPTY` gan mot `orderId` khong ton tai se bao
   * `LEG_ORDER_NOT_FOUND` -- dung ve ket qua, sai ve nguyen nhan, va nguoi doc di sua nham cho.
   */
  private async resolveLegOrder(runId: string, command: AddLegCommand): Promise<string | null> {
    const requested = command.orderId ?? null;

    if (command.kind === 'EMPTY') {
      if (requested !== null) {
        throw this.deny('run.leg_change', 'LEG_EMPTY_CANNOT_CARRY_ORDER', { runId });
      }
      return null;
    }

    if (requested === null) return null;

    const order = await this.repository.findOrder(requested);
    if (!order) {
      throw this.deny('run.leg_change', 'LEG_ORDER_NOT_FOUND', { runId, orderId: requested });
    }
    if (order.status === 'CANCELLED') {
      throw this.deny('run.leg_change', 'LEG_ORDER_CANCELLED', { runId, orderId: requested });
    }
    return order.id;
  }

  /* ------------------------------------------------------------------ *
   * PHAN CONG LAI XE -- LICH SU
   * ------------------------------------------------------------------ */

  async assignRun(runId: string, command: AssignRunCommand, actor: string): Promise<RunAssignment> {
    const run = await this.requireRun(runId);
    if (run.status === 'COMPLETED' || run.status === 'CANCELLED') {
      throw this.deny('run.assignment_change', 'RUN_ASSIGNMENT_RUN_TERMINAL', {
        runId,
        status: run.status,
      });
    }
    if (!(await this.fleet.findDriver(command.driverId))) {
      throw TransportDomainError.notFound('RUN_DRIVER_NOT_FOUND', 'Khong tim thay lai xe.');
    }

    const active = await this.repository.activeRunAssignment(runId);
    if (active && active.driverId === command.driverId) {
      this.allow('run.assignment_change', 'RUN_ASSIGNMENT_UNCHANGED', { runId });
      return active;
    }

    const change = await this.repository.assignRun(runId, {
      driverId: command.driverId,
      effectiveFrom: new Date(),
      assignedBy: actor,
    });

    this.allow(
      'run.assignment_change',
      change.previous ? 'RUN_ASSIGNMENT_REPLACED' : 'RUN_ASSIGNMENT_CREATED',
      { runId, driverId: command.driverId },
    );
    await this.audit.append({
      actor,
      action: 'transport.run.assign',
      entityType: 'TransportRunAssignment',
      entityId: change.current.id,
      before: change.previous,
      after: change.current,
    });
    return change.current;
  }

  runAssignmentHistory(runId: string): Promise<RunAssignment[]> {
    return this.repository.listRunAssignments(runId);
  }

  /* ------------------------------------------------------------------ *
   * TUONG THICH v1 -- PHEP CHIEU
   * ------------------------------------------------------------------ */

  /**
   * Chieu mot chuyen v1 sang mo hinh v2. TAT DINH va LAP LAI DUOC.
   *
   * Goi lai tren cung mot chuyen KHONG sinh ban thu hai: lien ket `(tripId)` la khoa chinh, nen
   * lan thu hai doc ra ban da co va tra `PROJECTION_UNCHANGED`.
   */
  async projectTrip(tripId: string, actor: string): Promise<TripProjection> {
    const existing = await this.repository.findProjection(tripId);
    if (existing) {
      this.allow('run.trip_projection', 'PROJECTION_UNCHANGED', { tripId });
      return existing;
    }

    if (!this.trips) {
      throw TransportDomainError.notFound(
        'PROJECTION_TRIP_NOT_FOUND',
        'Kho chuyen v1 khong duoc bat, khong chieu duoc.',
      );
    }
    const trip = await this.trips.find(tripId);
    if (!trip) {
      throw TransportDomainError.notFound('PROJECTION_TRIP_NOT_FOUND', 'Khong tim thay chuyen.');
    }

    const outcome = planTripProjection(trip, await this.trips.listAssignments(tripId));
    if (!outcome.ok) throw this.deny('run.trip_projection', outcome.reason, { tripId });

    const projection = await this.repository.projectTrip({
      tripId,
      projectedBy: actor,
      ...outcome.plan,
    });

    this.allow('run.trip_projection', 'PROJECTION_CREATED', {
      tripId,
      runId: projection.run.id,
      legId: projection.leg.id,
    });
    await this.audit.append({
      actor,
      action: 'transport.run.project_trip',
      entityType: 'TransportTripRunLegLink',
      entityId: tripId,
      before: null,
      after: projection.link,
    });
    return projection;
  }

  findProjection(tripId: string): Promise<TripProjection | null> {
    return this.repository.findProjection(tripId);
  }

  /* ------------------------------------------------------------------ *
   * Ho tro
   * ------------------------------------------------------------------ */

  private async requireOrder(id: string): Promise<Order> {
    const order = await this.repository.findOrder(id);
    if (!order) throw TransportDomainError.notFound('ORDER_NOT_FOUND', 'Khong tim thay nghia vu.');
    return order;
  }

  private async requireRun(id: string): Promise<VehicleRun> {
    const run = await this.repository.findRun(id);
    if (!run) throw TransportDomainError.notFound('RUN_NOT_FOUND', 'Khong tim thay vong chay.');
    return run;
  }

  private async requireCustomer(customerId: string | null): Promise<void> {
    if (customerId === null) return;
    if (!(await this.fleet.findCustomer(customerId))) {
      throw TransportDomainError.notFound('ORDER_CUSTOMER_NOT_FOUND', 'Khong tim thay khach hang.');
    }
  }

  private checkMoney(amount: number | null): number | null {
    if (amount === null) return null;
    try {
      return nonNegativeMoney(amount).amount;
    } catch (error) {
      if (error instanceof MoneyError) {
        throw TransportDomainError.invalid('MOVEMENT_MONEY_INVALID', error.message);
      }
      throw error;
    }
  }

  private resolveBusinessDate(value: string | undefined): string {
    if (value === undefined) return toBusinessDate(new Date(), this.policy.timeZone);
    try {
      return assertBusinessDate(value);
    } catch (error) {
      throw TransportDomainError.invalid(
        'MOVEMENT_BUSINESS_DATE_INVALID',
        error instanceof Error ? error.message : 'Ngay nghiep vu khong hop le.',
      );
    }
  }

  /**
   * `@@unique([runId, sequence])` la thu duy nhat dung khi HAI nguoi cung them chang mot luc.
   * Doc no thanh mot ma xung dot co ten thay vi de loi Prisma tho lot len HTTP.
   */
  private legSequenceConflict(error: unknown, runId: string, sequence: number): unknown {
    if (error instanceof TransportDomainError) return error;
    const code = (error as { code?: string } | null)?.code;
    if (code === 'P2002') {
      return TransportDomainError.conflict(
        'RUN_LEG_SEQUENCE_TAKEN',
        `Vong chay ${runId} da co chang so ${sequence}.`,
      );
    }
    return error;
  }

  private allow(
    point: DecisionPoint,
    reason: TransportMovementDecisionReason,
    detail: Record<string, unknown>,
  ): void {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_MOVEMENT_DECISIONS,
      point,
      outcome: 'allowed',
      reason,
      detail,
    });
  }

  private deny(
    point: DecisionPoint,
    reason: TransportMovementDecisionReason,
    detail: Record<string, unknown>,
  ): TransportDomainError {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_MOVEMENT_DECISIONS,
      point,
      outcome: 'denied',
      reason,
      detail,
    });
    return TransportDomainError.denied(reason, TRANSPORT_MOVEMENT_DECISIONS.labels[reason]);
  }
}
