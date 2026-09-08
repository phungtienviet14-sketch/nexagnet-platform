import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service.js';
import {
  RunPlanRepository,
  type CancelOrderRunPlanInput,
  type CreateOrderRunPlanInput,
} from './planning.repository.js';
import type { OrderRunPlan, RunGrouping, RunPlanOutcome } from './planning.types.js';

/**
 * Prisma khong loi ra kieu cho delegate truoc khi `prisma generate` chay, nen tang nay dung mot
 * loi ra khong kieu — giong het `prisma-movement.repository.ts`. Ranh gioi kieu THAT la `toPlan()`.
 */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const model = (prisma: PrismaService, name: string): any =>
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  (prisma as unknown as Record<string, any>)[name];

interface PlanRow {
  id: string;
  orderId: string;
  runId: string;
  vehicleId: string;
  loadedLegId: string;
  emptyLegId: string | null;
  grouping: RunGrouping;
  outcome: RunPlanOutcome;
  idempotencyKey: string;
  plannedBy: string;
  businessDate: string;
  createdAt: Date;
  cancelledAt: Date | null;
  cancellationReason: string | null;
}

const iso = (value: Date): string => value.toISOString();
const isoOrNull = (value: Date | null): string | null => (value === null ? null : iso(value));

const toPlan = (row: PlanRow): OrderRunPlan => ({
  id: row.id,
  orderId: row.orderId,
  runId: row.runId,
  vehicleId: row.vehicleId,
  loadedLegId: row.loadedLegId,
  emptyLegId: row.emptyLegId,
  grouping: row.grouping,
  outcome: row.outcome,
  idempotencyKey: row.idempotencyKey,
  plannedBy: row.plannedBy,
  businessDate: row.businessDate,
  createdAt: iso(row.createdAt),
  cancelledAt: isoOrNull(row.cancelledAt),
  cancellationReason: row.cancellationReason,
});

/**
 * Thu tu doc: `createdAt` tang dan roi `id` tang dan. Hai lan goi lien tiep phai cho ra cung mot
 * day — cung ly le voi `LIST_ORDER` cua `prisma-movement.repository.ts`.
 */
const PLAN_ORDER = [{ createdAt: 'asc' }, { id: 'asc' }] as const;

@Injectable()
export class PrismaRunPlanRepository extends RunPlanRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(input: CreateOrderRunPlanInput): Promise<OrderRunPlan> {
    return toPlan(
      await model(this.prisma, 'transportOrderRunPlan').create({
        data: {
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
        },
      }),
    );
  }

  async find(id: string): Promise<OrderRunPlan | null> {
    const row = await model(this.prisma, 'transportOrderRunPlan').findUnique({ where: { id } });
    return row ? toPlan(row) : null;
  }

  async findByIdempotencyKey(key: string): Promise<OrderRunPlan | null> {
    const row = await model(this.prisma, 'transportOrderRunPlan').findUnique({
      where: { idempotencyKey: key },
    });
    return row ? toPlan(row) : null;
  }

  async findActiveForOrder(orderId: string): Promise<OrderRunPlan | null> {
    const row: PlanRow | null = await model(this.prisma, 'transportOrderRunPlan').findFirst({
      where: { orderId, cancelledAt: null },
    });
    return row ? toPlan(row) : null;
  }

  async listForOrder(orderId: string): Promise<OrderRunPlan[]> {
    const rows: PlanRow[] = await model(this.prisma, 'transportOrderRunPlan').findMany({
      where: { orderId },
      orderBy: PLAN_ORDER,
    });
    return rows.map(toPlan);
  }

  async listActiveForRun(runId: string): Promise<OrderRunPlan[]> {
    return this.listActiveForRuns([runId]);
  }

  async listActiveForRuns(runIds: readonly string[]): Promise<OrderRunPlan[]> {
    if (runIds.length === 0) return [];
    const rows: PlanRow[] = await model(this.prisma, 'transportOrderRunPlan').findMany({
      where: { runId: { in: [...runIds] }, cancelledAt: null },
      orderBy: PLAN_ORDER,
    });
    return rows.map(toPlan);
  }

  async cancel(id: string, input: CancelOrderRunPlanInput): Promise<OrderRunPlan | null> {
    const row = await model(this.prisma, 'transportOrderRunPlan').update({
      where: { id },
      data: { cancelledAt: input.cancelledAt, cancellationReason: input.cancellationReason },
    });
    return row ? toPlan(row) : null;
  }
}
