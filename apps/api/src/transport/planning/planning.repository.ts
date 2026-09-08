import { randomUUID } from 'node:crypto';
import { storageUniqueViolation } from '../proof/proof-storage-conflict.js';
import type { UniqueIndexRef } from '../storage-conflict.js';
import type { OrderRunPlan, RunGrouping, RunPlanOutcome } from './planning.types.js';

/**
 * BA RANG BUOC DUY NHAT cua bang ke hoach — ten song trong SQL tho, nen chung duoc khai o day
 * MOT lan thay vi noi chuoi vao cho bat loi.
 *
 * Ca ba deu la thu duy nhat dung khi HAI yeu cau den cung luc; mot phep kiem-roi-ghi o tang dich
 * vu chi dung voi mot nguoi ghi.
 */
export const ORDER_RUN_PLAN_ACTIVE_ORDER: UniqueIndexRef = {
  indexName: 'TransportOrderRunPlan_activeOrder_key',
  model: 'TransportOrderRunPlan',
  column: 'orderId',
};

export const ORDER_RUN_PLAN_ONE_PER_RUN: UniqueIndexRef = {
  indexName: 'TransportOrderRunPlan_oneOrderPerRun_key',
  model: 'TransportOrderRunPlan',
  column: 'runId',
};

export const ORDER_RUN_PLAN_IDEMPOTENCY: UniqueIndexRef = {
  indexName: 'TransportOrderRunPlan_idempotencyKey_key',
  model: 'TransportOrderRunPlan',
  column: 'idempotencyKey',
};

export interface CreateOrderRunPlanInput {
  readonly orderId: string;
  readonly runId: string;
  readonly vehicleId: string;
  readonly loadedLegId: string;
  readonly emptyLegId: string | null;
  readonly grouping: RunGrouping;
  readonly outcome: RunPlanOutcome;
  readonly idempotencyKey: string;
  readonly plannedBy: string;
  readonly businessDate: string;
}

export interface CancelOrderRunPlanInput {
  readonly cancelledAt: Date;
  readonly cancellationReason: string;
}

/**
 * CONG LUU TRU cua lich su lap ke hoach.
 *
 * KHONG co `delete`, cung ly le voi `MovementRepository`: `GD-02` chot huy THAY CHO xoa, va mot
 * lan lap ke hoach bi xoa se lam cau hoi "vi sao don nay lai nam tren chiec xe do" khong con tra
 * loi duoc.
 */
export abstract class RunPlanRepository {
  abstract create(input: CreateOrderRunPlanInput): Promise<OrderRunPlan>;
  abstract find(id: string): Promise<OrderRunPlan | null>;
  abstract findByIdempotencyKey(key: string): Promise<OrderRunPlan | null>;
  /** Ke hoach CHUA HUY cua mot don. Toi da mot — unique mot phan cuong che dieu do o DB. */
  abstract findActiveForOrder(orderId: string): Promise<OrderRunPlan | null>;
  abstract listForOrder(orderId: string): Promise<OrderRunPlan[]>;
  /** Moi ke hoach chua huy tren mot vong chay — nguon cho phep dem `openPlanCount` khi dong. */
  abstract listActiveForRun(runId: string): Promise<OrderRunPlan[]>;
  abstract listActiveForRuns(runIds: readonly string[]): Promise<OrderRunPlan[]>;
  abstract cancel(id: string, input: CancelOrderRunPlanInput): Promise<OrderRunPlan | null>;
}

/* ----------------------------------------------------------------------------------------- *
 * BAN TRONG BO NHO — cuong che DUNG NHUNG rang buoc ma ban Prisma cuong che.
 *
 * Che do `PERSISTENCE=memory` la mot duong chay THAT (demo, CI khong co CSDL), khong phai mot ban
 * gia de test. Neu ban nay de lot mot hang ma Postgres se tu choi thi bai chong lap cua `#276` L9
 * se XANH o mot che do va DO o che do kia — kieu hong ma `InMemoryMovementRepository` da chon
 * cach tranh, va o day lam y het.
 * ----------------------------------------------------------------------------------------- */

const iso = (value: Date): string => value.toISOString();

export class InMemoryRunPlanRepository extends RunPlanRepository {
  private readonly plans = new Map<string, OrderRunPlan>();

  async create(input: CreateOrderRunPlanInput): Promise<OrderRunPlan> {
    for (const existing of this.plans.values()) {
      if (existing.idempotencyKey === input.idempotencyKey) {
        throw storageUniqueViolation(ORDER_RUN_PLAN_IDEMPOTENCY);
      }
      if (existing.cancelledAt !== null) continue;
      if (existing.orderId === input.orderId) {
        throw storageUniqueViolation(ORDER_RUN_PLAN_ACTIVE_ORDER);
      }
      // Chi ap voi `ONE_ORDER_PER_RUN` — dung nhu unique mot phan co menh de `grouping =` cua no.
      if (
        input.grouping === 'ONE_ORDER_PER_RUN' &&
        existing.grouping === 'ONE_ORDER_PER_RUN' &&
        existing.runId === input.runId
      ) {
        throw storageUniqueViolation(ORDER_RUN_PLAN_ONE_PER_RUN);
      }
    }

    const plan: OrderRunPlan = {
      id: randomUUID(),
      orderId: input.orderId,
      runId: input.runId,
      vehicleId: input.vehicleId,
      loadedLegId: input.loadedLegId,
      emptyLegId: input.emptyLegId,
      grouping: input.grouping,
      outcome: input.outcome,
      idempotencyKey: input.idempotencyKey,
      plannedBy: input.plannedBy,
      businessDate: input.businessDate,
      createdAt: iso(new Date()),
      cancelledAt: null,
      cancellationReason: null,
    };
    this.plans.set(plan.id, plan);
    return plan;
  }

  async find(id: string): Promise<OrderRunPlan | null> {
    return this.plans.get(id) ?? null;
  }

  async findByIdempotencyKey(key: string): Promise<OrderRunPlan | null> {
    for (const plan of this.plans.values()) if (plan.idempotencyKey === key) return plan;
    return null;
  }

  async findActiveForOrder(orderId: string): Promise<OrderRunPlan | null> {
    for (const plan of this.plans.values()) {
      if (plan.orderId === orderId && plan.cancelledAt === null) return plan;
    }
    return null;
  }

  async listForOrder(orderId: string): Promise<OrderRunPlan[]> {
    return [...this.plans.values()]
      .filter((plan) => plan.orderId === orderId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async listActiveForRun(runId: string): Promise<OrderRunPlan[]> {
    return this.listActiveForRuns([runId]);
  }

  async listActiveForRuns(runIds: readonly string[]): Promise<OrderRunPlan[]> {
    const wanted = new Set(runIds);
    return [...this.plans.values()]
      .filter((plan) => wanted.has(plan.runId) && plan.cancelledAt === null)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async cancel(id: string, input: CancelOrderRunPlanInput): Promise<OrderRunPlan | null> {
    const current = this.plans.get(id);
    if (!current) return null;
    const next: OrderRunPlan = {
      ...current,
      cancelledAt: iso(input.cancelledAt),
      cancellationReason: input.cancellationReason,
    };
    this.plans.set(id, next);
    return next;
  }
}
