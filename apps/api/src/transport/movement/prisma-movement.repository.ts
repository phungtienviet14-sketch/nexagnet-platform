import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service.js';
import { fromStoredAmount, toStoredAmount } from '../money.js';
import { isUniqueViolationOn, type UniqueIndexRef } from '../storage-conflict.js';
import { TransportDomainError } from '../transport.errors.js';
import {
  MovementRepository,
  type AssignRunInput,
  type CancelOrderInput,
  type CancelRunInput,
  type CreateLegInput,
  type CreateOrderInput,
  type CreateRunInput,
  type ProjectTripInput,
  type RunAssignmentChange,
  type TripProjection,
  type UpdateOrderInput,
} from './movement.repository.js';
import type {
  Order,
  OrderStatus,
  RunAssignment,
  RunLeg,
  RunLegStatus,
  TripRunLegLink,
  VehicleRun,
  VehicleRunStatus,
} from './movement.types.js';

/**
 * MOT ban phan cong DANG hieu luc cho moi vong chay. Ten index song trong SQL tho, nen no phai
 * duoc khai o day mot lan -- khong noi thang chuoi vao cho bat loi.
 */
export const ACTIVE_RUN_ASSIGNMENT: UniqueIndexRef = {
  indexName: 'TransportRunAssignment_activeRun_key',
  model: 'TransportRunAssignment',
  column: 'runId',
};

/**
 * Prisma khong loi ra kieu cho delegate truoc khi `prisma generate` chay, nen tang nay dung mot
 * loi ra khong kieu -- giong het `prisma-counterparty.repository.ts`. Ranh gioi kieu THAT la cac
 * ham `to*()` ben duoi.
 */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const model = (prisma: PrismaService, name: string): any =>
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  (prisma as unknown as Record<string, any>)[name];

interface OrderRow {
  id: string;
  code: string;
  status: OrderStatus;
  businessDate: string;
  customerId: string | null;
  originLabel: string;
  destinationLabel: string;
  cargoDescription: string | null;
  freightAmount: bigint | null;
  currencyCode: string;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  cancelledAt: Date | null;
  cancellationReason: string | null;
}

interface RunRow {
  id: string;
  code: string;
  vehicleId: string;
  status: VehicleRunStatus;
  businessDate: string;
  startedAt: Date | null;
  completedAt: Date | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  cancelledAt: Date | null;
  cancellationReason: string | null;
}

interface LegRow {
  id: string;
  runId: string;
  sequence: number;
  kind: RunLeg['kind'];
  status: RunLegStatus;
  orderId: string | null;
  originLabel: string;
  destinationLabel: string;
  businessDate: string;
  distanceKm: number | null;
  startedAt: Date | null;
  completedAt: Date | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface AssignmentRow {
  id: string;
  runId: string;
  driverId: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  assignedBy: string;
  createdAt: Date;
}

interface LinkRow {
  tripId: string;
  legId: string;
  projectedBy: string;
  createdAt: Date;
}

const iso = (value: Date): string => value.toISOString();
const isoOrNull = (value: Date | null): string | null => (value === null ? null : iso(value));

const toOrder = (row: OrderRow): Order => ({
  id: row.id,
  code: row.code,
  status: row.status,
  businessDate: row.businessDate,
  customerId: row.customerId,
  originLabel: row.originLabel,
  destinationLabel: row.destinationLabel,
  cargoDescription: row.cargoDescription,
  freightAmount: fromStoredAmount(row.freightAmount),
  currencyCode: row.currencyCode,
  note: row.note,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
  cancelledAt: isoOrNull(row.cancelledAt),
  cancellationReason: row.cancellationReason,
});

const toRun = (row: RunRow): VehicleRun => ({
  id: row.id,
  code: row.code,
  vehicleId: row.vehicleId,
  status: row.status,
  businessDate: row.businessDate,
  startedAt: isoOrNull(row.startedAt),
  completedAt: isoOrNull(row.completedAt),
  note: row.note,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
  cancelledAt: isoOrNull(row.cancelledAt),
  cancellationReason: row.cancellationReason,
});

const toLeg = (row: LegRow): RunLeg => ({
  id: row.id,
  runId: row.runId,
  sequence: row.sequence,
  kind: row.kind,
  status: row.status,
  orderId: row.orderId,
  originLabel: row.originLabel,
  destinationLabel: row.destinationLabel,
  businessDate: row.businessDate,
  distanceKm: row.distanceKm,
  startedAt: isoOrNull(row.startedAt),
  completedAt: isoOrNull(row.completedAt),
  note: row.note,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
});

const toAssignment = (row: AssignmentRow): RunAssignment => ({
  id: row.id,
  runId: row.runId,
  driverId: row.driverId,
  effectiveFrom: iso(row.effectiveFrom),
  effectiveTo: isoOrNull(row.effectiveTo),
  assignedBy: row.assignedBy,
  createdAt: iso(row.createdAt),
});

const toLink = (row: LinkRow): TripRunLegLink => ({
  tripId: row.tripId,
  legId: row.legId,
  projectedBy: row.projectedBy,
  createdAt: iso(row.createdAt),
});

const prune = <T extends object>(patch: T): Partial<T> =>
  Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) as Partial<T>;

/**
 * `businessDate` giam dan roi `code` tang dan. Thu tu la MOT PHAN hop dong doc, khong phai so
 * thich: hai lan goi lien tiep phai cho ra cung mot day, neu khong thi phan trang va anh chup man
 * hinh lam bang chung deu vo nghia.
 */
const LIST_ORDER = [{ businessDate: 'desc' }, { code: 'asc' }] as const;

@Injectable()
export class PrismaMovementRepository extends MovementRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async createOrder(input: CreateOrderInput): Promise<Order> {
    return toOrder(
      await model(this.prisma, 'transportOrder').create({
        data: {
          code: input.code,
          businessDate: input.businessDate,
          originLabel: input.originLabel,
          destinationLabel: input.destinationLabel,
          customerId: input.customerId ?? null,
          cargoDescription: input.cargoDescription ?? null,
          freightAmount: toStoredAmount(input.freightAmount ?? null),
          note: input.note ?? null,
        },
      }),
    );
  }

  async updateOrder(id: string, patch: UpdateOrderInput): Promise<Order | null> {
    const row = await model(this.prisma, 'transportOrder').update({
      where: { id },
      data: prune({
        originLabel: patch.originLabel,
        destinationLabel: patch.destinationLabel,
        customerId: patch.customerId,
        cargoDescription: patch.cargoDescription,
        freightAmount:
          patch.freightAmount === undefined ? undefined : toStoredAmount(patch.freightAmount),
        note: patch.note,
      }),
    });
    return row ? toOrder(row) : null;
  }

  async findOrder(id: string): Promise<Order | null> {
    const row = await model(this.prisma, 'transportOrder').findUnique({ where: { id } });
    return row ? toOrder(row) : null;
  }

  async findOrderByCode(code: string): Promise<Order | null> {
    const row = await model(this.prisma, 'transportOrder').findUnique({ where: { code } });
    return row ? toOrder(row) : null;
  }

  async listOrders(): Promise<Order[]> {
    const rows: OrderRow[] = await model(this.prisma, 'transportOrder').findMany({
      orderBy: LIST_ORDER,
    });
    return rows.map(toOrder);
  }

  async setOrderStatus(id: string, status: OrderStatus, at: Date): Promise<Order | null> {
    const row = await model(this.prisma, 'transportOrder').update({
      where: { id },
      data: { status, updatedAt: at },
    });
    return row ? toOrder(row) : null;
  }

  async cancelOrder(id: string, input: CancelOrderInput): Promise<Order | null> {
    const row = await model(this.prisma, 'transportOrder').update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledAt: input.cancelledAt,
        cancellationReason: input.cancellationReason,
        updatedAt: input.cancelledAt,
      },
    });
    return row ? toOrder(row) : null;
  }

  async createRun(input: CreateRunInput): Promise<VehicleRun> {
    return toRun(
      await model(this.prisma, 'transportVehicleRun').create({
        data: {
          code: input.code,
          vehicleId: input.vehicleId,
          businessDate: input.businessDate,
          note: input.note ?? null,
        },
      }),
    );
  }

  async findRun(id: string): Promise<VehicleRun | null> {
    const row = await model(this.prisma, 'transportVehicleRun').findUnique({ where: { id } });
    return row ? toRun(row) : null;
  }

  async findRunByCode(code: string): Promise<VehicleRun | null> {
    const row = await model(this.prisma, 'transportVehicleRun').findUnique({ where: { code } });
    return row ? toRun(row) : null;
  }

  async listRuns(): Promise<VehicleRun[]> {
    const rows: RunRow[] = await model(this.prisma, 'transportVehicleRun').findMany({
      orderBy: LIST_ORDER,
    });
    return rows.map(toRun);
  }

  async setRunStatus(id: string, status: VehicleRunStatus, at: Date): Promise<VehicleRun | null> {
    const row = await model(this.prisma, 'transportVehicleRun').update({
      where: { id },
      data: {
        status,
        updatedAt: at,
        ...(status === 'ACTIVE' ? { startedAt: at } : {}),
        ...(status === 'COMPLETED' ? { completedAt: at } : {}),
      },
    });
    return row ? toRun(row) : null;
  }

  async cancelRun(id: string, input: CancelRunInput): Promise<VehicleRun | null> {
    const row = await model(this.prisma, 'transportVehicleRun').update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledAt: input.cancelledAt,
        cancellationReason: input.cancellationReason,
        updatedAt: input.cancelledAt,
      },
    });
    return row ? toRun(row) : null;
  }

  async createLeg(input: CreateLegInput): Promise<RunLeg> {
    return toLeg(
      await model(this.prisma, 'transportRunLeg').create({
        data: {
          runId: input.runId,
          sequence: input.sequence,
          kind: input.kind,
          // Bat bien lap lai o day KHONG phai vi thua: `CHECK` cua DB la luoi cuoi cung, con dong
          // nay la thu giu cho thong bao loi noi ve NGHIEP VU thay vi ve rang buoc SQL.
          orderId: input.kind === 'EMPTY' ? null : input.orderId,
          originLabel: input.originLabel,
          destinationLabel: input.destinationLabel,
          businessDate: input.businessDate,
          distanceKm: input.distanceKm ?? null,
          note: input.note ?? null,
        },
      }),
    );
  }

  async findLeg(id: string): Promise<RunLeg | null> {
    const row = await model(this.prisma, 'transportRunLeg').findUnique({ where: { id } });
    return row ? toLeg(row) : null;
  }

  async listLegs(runId: string): Promise<RunLeg[]> {
    const rows: LegRow[] = await model(this.prisma, 'transportRunLeg').findMany({
      where: { runId },
      orderBy: [{ sequence: 'asc' }],
    });
    return rows.map(toLeg);
  }

  async listLegsByOrder(orderId: string): Promise<RunLeg[]> {
    const rows: LegRow[] = await model(this.prisma, 'transportRunLeg').findMany({
      where: { orderId },
      orderBy: [{ businessDate: 'asc' }, { sequence: 'asc' }],
    });
    return rows.map(toLeg);
  }

  async setLegStatus(id: string, status: RunLegStatus, at: Date): Promise<RunLeg | null> {
    const row = await model(this.prisma, 'transportRunLeg').update({
      where: { id },
      data: {
        status,
        updatedAt: at,
        ...(status === 'IN_TRANSIT' ? { startedAt: at } : {}),
        ...(status === 'COMPLETED' ? { completedAt: at } : {}),
      },
    });
    return row ? toLeg(row) : null;
  }

  /**
   * Dong ban cu roi mo ban moi TRONG MOT giao dich -- dung mau cua `PrismaTripRepository.assign()`.
   * Giao dich dung voi MOT nguoi ghi; unique mot phan `TransportRunAssignment_activeRun_key` la
   * thu duy nhat dung voi HAI nguoi ghi cung luc.
   */
  async assignRun(runId: string, input: AssignRunInput): Promise<RunAssignmentChange> {
    try {
      return await this.prisma.$transaction(async (tx: unknown) => {
        const delegate = model(tx as PrismaService, 'transportRunAssignment');
        const active: AssignmentRow | null = await delegate.findFirst({
          where: { runId, effectiveTo: null },
        });
        if (active) {
          await delegate.updateMany({
            where: { runId, effectiveTo: null },
            data: { effectiveTo: input.effectiveFrom },
          });
        }
        const current: AssignmentRow = await delegate.create({
          data: {
            runId,
            driverId: input.driverId,
            effectiveFrom: input.effectiveFrom,
            assignedBy: input.assignedBy,
          },
        });
        return {
          previous: active ? toAssignment({ ...active, effectiveTo: input.effectiveFrom }) : null,
          current: toAssignment(current),
        };
      });
    } catch (error) {
      if (isUniqueViolationOn(error, ACTIVE_RUN_ASSIGNMENT)) {
        throw TransportDomainError.conflict(
          'RUN_ACTIVE_ASSIGNMENT_CONFLICT',
          'Mot nguoi khac vua doi lai xe cua vong chay nay. Tai lai roi thu lai.',
        );
      }
      throw error;
    }
  }

  async listRunAssignments(runId: string): Promise<RunAssignment[]> {
    const rows: AssignmentRow[] = await model(this.prisma, 'transportRunAssignment').findMany({
      where: { runId },
      orderBy: [{ effectiveFrom: 'asc' }],
    });
    return rows.map(toAssignment);
  }

  async activeRunAssignment(runId: string): Promise<RunAssignment | null> {
    const row = await model(this.prisma, 'transportRunAssignment').findFirst({
      where: { runId, effectiveTo: null },
    });
    return row ? toAssignment(row) : null;
  }

  async findTripLink(tripId: string): Promise<TripRunLegLink | null> {
    const row = await model(this.prisma, 'transportTripRunLegLink').findUnique({
      where: { tripId },
    });
    return row ? toLink(row) : null;
  }

  async findProjection(tripId: string): Promise<TripProjection | null> {
    const row = await model(this.prisma, 'transportTripRunLegLink').findUnique({
      where: { tripId },
      include: { leg: { include: { run: true, order: true } } },
    });
    if (!row) return null;
    return {
      link: toLink(row),
      run: toRun(row.leg.run),
      leg: toLeg(row.leg),
      order: row.leg.order ? toOrder(row.leg.order) : null,
    };
  }

  /**
   * Bon hang trong MOT giao dich. Neu chang ghi duoc ma lien ket khong, phep chieu se sinh mot
   * vong chay mo coi o lan chay sau -- va con so km cua doi xe bi dem hai lan.
   */
  async projectTrip(input: ProjectTripInput): Promise<TripProjection> {
    return this.prisma.$transaction(async (tx: unknown) => {
      const client = tx as PrismaService;

      const orderRow: OrderRow | null = input.order
        ? await model(client, 'transportOrder').create({
            data: {
              code: input.order.code,
              businessDate: input.order.businessDate,
              originLabel: input.order.originLabel,
              destinationLabel: input.order.destinationLabel,
              customerId: input.order.customerId ?? null,
              cargoDescription: input.order.cargoDescription ?? null,
              freightAmount: toStoredAmount(input.order.freightAmount ?? null),
              note: input.order.note ?? null,
            },
          })
        : null;

      const runRow: RunRow = await model(client, 'transportVehicleRun').create({
        data: {
          code: input.run.code,
          vehicleId: input.run.vehicleId,
          businessDate: input.run.businessDate,
          note: input.run.note ?? null,
        },
      });

      const legRow: LegRow = await model(client, 'transportRunLeg').create({
        data: {
          runId: runRow.id,
          sequence: input.leg.sequence,
          kind: input.leg.kind,
          orderId: input.leg.kind === 'EMPTY' ? null : (orderRow?.id ?? null),
          originLabel: input.leg.originLabel,
          destinationLabel: input.leg.destinationLabel,
          businessDate: input.leg.businessDate,
          distanceKm: input.leg.distanceKm ?? null,
          note: input.leg.note ?? null,
        },
      });

      const linkRow: LinkRow = await model(client, 'transportTripRunLegLink').create({
        data: { tripId: input.tripId, legId: legRow.id, projectedBy: input.projectedBy },
      });

      return {
        link: toLink(linkRow),
        run: toRun(runRow),
        leg: toLeg(legRow),
        order: orderRow ? toOrder(orderRow) : null,
      };
    });
  }
}
