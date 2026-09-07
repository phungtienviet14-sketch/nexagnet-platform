import { randomUUID } from 'node:crypto';
import type {
  Order,
  OrderStatus,
  RunAssignment,
  RunLeg,
  RunLegKind,
  RunLegStatus,
  TripRunLegLink,
  VehicleRun,
  VehicleRunStatus,
} from './movement.types.js';

/* ----------------------------------------------------------------------------------------- *
 * DTO GHI. Quy uoc da co: `*.types.ts` giu mo hinh DOC, tep nay giu DTO GHI + cong + ban
 * trong-bo-nho.
 * ----------------------------------------------------------------------------------------- */

export interface CreateOrderInput {
  readonly code: string;
  readonly businessDate: string;
  readonly originLabel: string;
  readonly destinationLabel: string;
  readonly customerId?: string | null;
  readonly cargoDescription?: string | null;
  readonly freightAmount?: number | null;
  readonly note?: string | null;
}

export interface UpdateOrderInput {
  readonly originLabel?: string;
  readonly destinationLabel?: string;
  readonly customerId?: string | null;
  readonly cargoDescription?: string | null;
  readonly freightAmount?: number | null;
  readonly note?: string | null;
}

export interface CancelOrderInput {
  readonly cancelledAt: Date;
  readonly cancellationReason: string;
}

export interface CreateRunInput {
  readonly code: string;
  readonly vehicleId: string;
  readonly businessDate: string;
  readonly note?: string | null;
}

export interface CancelRunInput {
  readonly cancelledAt: Date;
  readonly cancellationReason: string;
}

export interface CreateLegInput {
  readonly runId: string;
  readonly sequence: number;
  readonly kind: RunLegKind;
  readonly orderId: string | null;
  readonly originLabel: string;
  readonly destinationLabel: string;
  readonly businessDate: string;
  readonly distanceKm?: number | null;
  readonly note?: string | null;
}

export interface AssignRunInput {
  readonly driverId: string;
  readonly effectiveFrom: Date;
  readonly assignedBy: string;
}

/** Ket qua mot lan doi lai xe: ban vua dong lai (neu co) va ban dang hieu luc. */
export interface RunAssignmentChange {
  readonly previous: RunAssignment | null;
  readonly current: RunAssignment;
}

/** Mot lan chieu chuyen v1 -> v2, ghi TRON VEN trong mot giao dich. */
export interface ProjectTripInput {
  readonly tripId: string;
  readonly projectedBy: string;
  readonly order: CreateOrderInput | null;
  readonly run: CreateRunInput;
  /** Chang duoc chieu ra; `orderId` duoc dien sau khi don o tren duoc tao. */
  readonly leg: Omit<CreateLegInput, 'runId' | 'orderId'>;
}

export interface TripProjection {
  readonly link: TripRunLegLink;
  readonly run: VehicleRun;
  readonly leg: RunLeg;
  readonly order: Order | null;
}

/**
 * CONG LUU TRU cua mien van chuyen v2.
 *
 * KHONG co `delete` cho bat ky thuc the nao -- `GD-02` da chot huy THAY CHO xoa, va mot vong chay
 * bi xoa se lam moi con so km cua ky do khong tai lap duoc.
 */
export abstract class MovementRepository {
  abstract createOrder(input: CreateOrderInput): Promise<Order>;
  abstract updateOrder(id: string, patch: UpdateOrderInput): Promise<Order | null>;
  abstract findOrder(id: string): Promise<Order | null>;
  abstract findOrderByCode(code: string): Promise<Order | null>;
  abstract listOrders(): Promise<Order[]>;
  abstract setOrderStatus(id: string, status: OrderStatus, at: Date): Promise<Order | null>;
  abstract cancelOrder(id: string, input: CancelOrderInput): Promise<Order | null>;

  abstract createRun(input: CreateRunInput): Promise<VehicleRun>;
  abstract findRun(id: string): Promise<VehicleRun | null>;
  abstract findRunByCode(code: string): Promise<VehicleRun | null>;
  abstract listRuns(): Promise<VehicleRun[]>;
  abstract setRunStatus(id: string, status: VehicleRunStatus, at: Date): Promise<VehicleRun | null>;
  abstract cancelRun(id: string, input: CancelRunInput): Promise<VehicleRun | null>;

  abstract createLeg(input: CreateLegInput): Promise<RunLeg>;
  abstract findLeg(id: string): Promise<RunLeg | null>;
  abstract listLegs(runId: string): Promise<RunLeg[]>;
  abstract listLegsByOrder(orderId: string): Promise<RunLeg[]>;
  abstract setLegStatus(id: string, status: RunLegStatus, at: Date): Promise<RunLeg | null>;

  abstract assignRun(runId: string, input: AssignRunInput): Promise<RunAssignmentChange>;
  abstract listRunAssignments(runId: string): Promise<RunAssignment[]>;
  abstract activeRunAssignment(runId: string): Promise<RunAssignment | null>;

  abstract findTripLink(tripId: string): Promise<TripRunLegLink | null>;
  abstract findProjection(tripId: string): Promise<TripProjection | null>;
  /** Ghi ca bon hang (don tuy chon, vong chay, chang, lien ket) trong MOT giao dich. */
  abstract projectTrip(input: ProjectTripInput): Promise<TripProjection>;
}

/* ----------------------------------------------------------------------------------------- *
 * BAN TRONG BO NHO -- cuong che DUNG NHUNG bat bien ma ban Prisma cuong che, de che do
 * `PERSISTENCE=memory` khong bao gio de lot mot hang ma Postgres se tu choi.
 * ----------------------------------------------------------------------------------------- */

const iso = (value: Date): string => value.toISOString();

export class InMemoryMovementRepository extends MovementRepository {
  private readonly orders = new Map<string, Order>();
  private readonly runs = new Map<string, VehicleRun>();
  private readonly legs = new Map<string, RunLeg>();
  private readonly assignments = new Map<string, RunAssignment>();
  private readonly links = new Map<string, TripRunLegLink>();

  async createOrder(input: CreateOrderInput): Promise<Order> {
    const now = iso(new Date());
    const order: Order = {
      id: randomUUID(),
      code: input.code,
      status: 'OPEN',
      businessDate: input.businessDate,
      customerId: input.customerId ?? null,
      originLabel: input.originLabel,
      destinationLabel: input.destinationLabel,
      cargoDescription: input.cargoDescription ?? null,
      freightAmount: input.freightAmount ?? null,
      currencyCode: 'VND',
      note: input.note ?? null,
      createdAt: now,
      updatedAt: now,
      cancelledAt: null,
      cancellationReason: null,
    };
    this.orders.set(order.id, order);
    return order;
  }

  async updateOrder(id: string, patch: UpdateOrderInput): Promise<Order | null> {
    const current = this.orders.get(id);
    if (!current) return null;
    const next: Order = {
      ...current,
      originLabel: patch.originLabel ?? current.originLabel,
      destinationLabel: patch.destinationLabel ?? current.destinationLabel,
      customerId: patch.customerId === undefined ? current.customerId : patch.customerId,
      cargoDescription:
        patch.cargoDescription === undefined ? current.cargoDescription : patch.cargoDescription,
      freightAmount: patch.freightAmount === undefined ? current.freightAmount : patch.freightAmount,
      note: patch.note === undefined ? current.note : patch.note,
      updatedAt: iso(new Date()),
    };
    this.orders.set(id, next);
    return next;
  }

  async findOrder(id: string): Promise<Order | null> {
    return this.orders.get(id) ?? null;
  }

  async findOrderByCode(code: string): Promise<Order | null> {
    for (const order of this.orders.values()) if (order.code === code) return order;
    return null;
  }

  async listOrders(): Promise<Order[]> {
    return [...this.orders.values()].sort(
      (left, right) =>
        right.businessDate.localeCompare(left.businessDate) || left.code.localeCompare(right.code),
    );
  }

  async setOrderStatus(id: string, status: OrderStatus, at: Date): Promise<Order | null> {
    const current = this.orders.get(id);
    if (!current) return null;
    const next: Order = { ...current, status, updatedAt: iso(at) };
    this.orders.set(id, next);
    return next;
  }

  async cancelOrder(id: string, input: CancelOrderInput): Promise<Order | null> {
    const current = this.orders.get(id);
    if (!current) return null;
    const next: Order = {
      ...current,
      status: 'CANCELLED',
      cancelledAt: iso(input.cancelledAt),
      cancellationReason: input.cancellationReason,
      updatedAt: iso(input.cancelledAt),
    };
    this.orders.set(id, next);
    return next;
  }

  async createRun(input: CreateRunInput): Promise<VehicleRun> {
    const now = iso(new Date());
    const run: VehicleRun = {
      id: randomUUID(),
      code: input.code,
      vehicleId: input.vehicleId,
      status: 'PLANNED',
      businessDate: input.businessDate,
      startedAt: null,
      completedAt: null,
      note: input.note ?? null,
      createdAt: now,
      updatedAt: now,
      cancelledAt: null,
      cancellationReason: null,
    };
    this.runs.set(run.id, run);
    return run;
  }

  async findRun(id: string): Promise<VehicleRun | null> {
    return this.runs.get(id) ?? null;
  }

  async findRunByCode(code: string): Promise<VehicleRun | null> {
    for (const run of this.runs.values()) if (run.code === code) return run;
    return null;
  }

  async listRuns(): Promise<VehicleRun[]> {
    return [...this.runs.values()].sort(
      (left, right) =>
        right.businessDate.localeCompare(left.businessDate) || left.code.localeCompare(right.code),
    );
  }

  async setRunStatus(id: string, status: VehicleRunStatus, at: Date): Promise<VehicleRun | null> {
    const current = this.runs.get(id);
    if (!current) return null;
    const next: VehicleRun = {
      ...current,
      status,
      startedAt: status === 'ACTIVE' ? iso(at) : current.startedAt,
      completedAt: status === 'COMPLETED' ? iso(at) : current.completedAt,
      updatedAt: iso(at),
    };
    this.runs.set(id, next);
    return next;
  }

  async cancelRun(id: string, input: CancelRunInput): Promise<VehicleRun | null> {
    const current = this.runs.get(id);
    if (!current) return null;
    const next: VehicleRun = {
      ...current,
      status: 'CANCELLED',
      cancelledAt: iso(input.cancelledAt),
      cancellationReason: input.cancellationReason,
      updatedAt: iso(input.cancelledAt),
    };
    this.runs.set(id, next);
    return next;
  }

  async createLeg(input: CreateLegInput): Promise<RunLeg> {
    const now = iso(new Date());
    const leg: RunLeg = {
      id: randomUUID(),
      runId: input.runId,
      sequence: input.sequence,
      kind: input.kind,
      status: 'PLANNED',
      // Cuong che cung bat bien voi `TransportRunLeg_empty_carries_no_order`: ban trong bo nho
      // KHONG duoc de lot mot hang ma Postgres se tu choi.
      orderId: input.kind === 'EMPTY' ? null : input.orderId,
      originLabel: input.originLabel,
      destinationLabel: input.destinationLabel,
      businessDate: input.businessDate,
      distanceKm: input.distanceKm ?? null,
      startedAt: null,
      completedAt: null,
      note: input.note ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.legs.set(leg.id, leg);
    return leg;
  }

  async findLeg(id: string): Promise<RunLeg | null> {
    return this.legs.get(id) ?? null;
  }

  async listLegs(runId: string): Promise<RunLeg[]> {
    return [...this.legs.values()]
      .filter((leg) => leg.runId === runId)
      .sort((left, right) => left.sequence - right.sequence);
  }

  async listLegsByOrder(orderId: string): Promise<RunLeg[]> {
    return [...this.legs.values()]
      .filter((leg) => leg.orderId === orderId)
      .sort((left, right) => left.sequence - right.sequence);
  }

  async setLegStatus(id: string, status: RunLegStatus, at: Date): Promise<RunLeg | null> {
    const current = this.legs.get(id);
    if (!current) return null;
    const next: RunLeg = {
      ...current,
      status,
      startedAt: status === 'IN_TRANSIT' ? iso(at) : current.startedAt,
      completedAt: status === 'COMPLETED' ? iso(at) : current.completedAt,
      updatedAt: iso(at),
    };
    this.legs.set(id, next);
    return next;
  }

  async assignRun(runId: string, input: AssignRunInput): Promise<RunAssignmentChange> {
    const active = await this.activeRunAssignment(runId);
    if (active) {
      const closed: RunAssignment = { ...active, effectiveTo: iso(input.effectiveFrom) };
      this.assignments.set(closed.id, closed);
    }
    const current: RunAssignment = {
      id: randomUUID(),
      runId,
      driverId: input.driverId,
      effectiveFrom: iso(input.effectiveFrom),
      effectiveTo: null,
      assignedBy: input.assignedBy,
      createdAt: iso(new Date()),
    };
    this.assignments.set(current.id, current);
    return { previous: active, current };
  }

  async listRunAssignments(runId: string): Promise<RunAssignment[]> {
    return [...this.assignments.values()]
      .filter((entry) => entry.runId === runId)
      .sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom));
  }

  async activeRunAssignment(runId: string): Promise<RunAssignment | null> {
    for (const entry of this.assignments.values()) {
      if (entry.runId === runId && entry.effectiveTo === null) return entry;
    }
    return null;
  }

  async findTripLink(tripId: string): Promise<TripRunLegLink | null> {
    return this.links.get(tripId) ?? null;
  }

  async findProjection(tripId: string): Promise<TripProjection | null> {
    const link = this.links.get(tripId);
    if (!link) return null;
    const leg = this.legs.get(link.legId);
    if (!leg) return null;
    const run = this.runs.get(leg.runId);
    if (!run) return null;
    return { link, run, leg, order: leg.orderId ? (this.orders.get(leg.orderId) ?? null) : null };
  }

  async projectTrip(input: ProjectTripInput): Promise<TripProjection> {
    const order = input.order ? await this.createOrder(input.order) : null;
    const run = await this.createRun(input.run);
    const leg = await this.createLeg({ ...input.leg, runId: run.id, orderId: order?.id ?? null });
    const link: TripRunLegLink = {
      tripId: input.tripId,
      legId: leg.id,
      projectedBy: input.projectedBy,
      createdAt: iso(new Date()),
    };
    this.links.set(link.tripId, link);
    return { link, run, leg, order };
  }
}
