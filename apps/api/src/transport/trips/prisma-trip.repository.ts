import { Injectable } from '@nestjs/common';
import type { PrismaService } from '../../config/prisma.service.js';
import { TRANSPORT_CURRENCY } from '../money.js';
import type { Trip, TripAssignment } from '../transport.types.js';
import type { TripStatus } from './trip-lifecycle.js';
import {
  TripRepository,
  type AssignTripInput,
  type CancelTripInput,
  type CreateTripInput,
  type TripAssignmentChange,
  type UpdateTripInput,
} from './trip.repository.js';

interface TripRow {
  id: string;
  code: string;
  kind: string;
  status: string;
  businessDate: string;
  originLabel: string;
  destinationLabel: string;
  cargoDescription: string | null;
  customerId: string | null;
  carrierPartnerId: string | null;
  referrerPartnerId: string | null;
  freightAmount: number | null;
  currencyCode: string;
  distanceKm: number | null;
  createdAt: Date;
  updatedAt: Date;
  cancelledAt: Date | null;
  cancellationReason: string | null;
}

interface TripAssignmentRow {
  id: string;
  tripId: string;
  vehicleId: string | null;
  driverId: string | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  assignedBy: string;
  createdAt: Date;
}

const iso = (value: Date): string => value.toISOString();

const toTrip = (row: TripRow): Trip => ({
  id: row.id,
  code: row.code,
  kind: row.kind as Trip['kind'],
  status: row.status as Trip['status'],
  businessDate: row.businessDate,
  originLabel: row.originLabel,
  destinationLabel: row.destinationLabel,
  cargoDescription: row.cargoDescription,
  customerId: row.customerId,
  carrierPartnerId: row.carrierPartnerId,
  referrerPartnerId: row.referrerPartnerId,
  freightAmount: row.freightAmount,
  currencyCode: row.currencyCode,
  distanceKm: row.distanceKm,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
  cancelledAt: row.cancelledAt ? iso(row.cancelledAt) : null,
  cancellationReason: row.cancellationReason,
});

const toAssignment = (row: TripAssignmentRow): TripAssignment => ({
  id: row.id,
  tripId: row.tripId,
  vehicleId: row.vehicleId,
  driverId: row.driverId,
  effectiveFrom: iso(row.effectiveFrom),
  effectiveTo: row.effectiveTo ? iso(row.effectiveTo) : null,
  assignedBy: row.assignedBy,
  createdAt: iso(row.createdAt),
});

function prune<T extends object>(patch: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

/*
 * Xem chu thich cung ten trong `prisma-fleet.repository.ts`: ranh gioi kieu that su nam o cac ham
 * `to*` co kieu ben tren, khong o delegate cua Prisma.
 */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const model = (prisma: PrismaService, name: string): any =>
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  (prisma as unknown as Record<string, any>)[name];

@Injectable()
export class PrismaTripRepository extends TripRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(input: CreateTripInput): Promise<Trip> {
    return toTrip(
      await model(this.prisma, 'transportTrip').create({
        data: {
          code: input.code,
          kind: input.kind,
          businessDate: input.businessDate,
          originLabel: input.originLabel,
          destinationLabel: input.destinationLabel,
          cargoDescription: input.cargoDescription ?? null,
          customerId: input.customerId ?? null,
          carrierPartnerId: input.carrierPartnerId ?? null,
          referrerPartnerId: input.referrerPartnerId ?? null,
          freightAmount: input.freightAmount ?? null,
          currencyCode: TRANSPORT_CURRENCY,
          distanceKm: input.distanceKm ?? null,
        },
      }),
    );
  }

  async find(id: string): Promise<Trip | null> {
    const row = await model(this.prisma, 'transportTrip').findUnique({ where: { id } });
    return row ? toTrip(row) : null;
  }

  async findByCode(code: string): Promise<Trip | null> {
    const row = await model(this.prisma, 'transportTrip').findUnique({ where: { code } });
    return row ? toTrip(row) : null;
  }

  async list(): Promise<Trip[]> {
    const rows: TripRow[] = await model(this.prisma, 'transportTrip').findMany({
      // Khoa phu `code` la TIE-BREAK TAT DINH: hai chuyen cung ngay nghiep vu la chuyen thuong
      // ngay, va thu tu doi giua hai lan chay se lam bai test thu tu do tren may nhanh va xanh tren
      // may cham — mot loai do rat ton thoi gian de truy.
      orderBy: [{ businessDate: 'desc' }, { code: 'asc' }],
    });
    return rows.map(toTrip);
  }

  async update(id: string, patch: UpdateTripInput): Promise<Trip | null> {
    const row = await model(this.prisma, 'transportTrip').update({
      where: { id },
      data: prune(patch),
    });
    return row ? toTrip(row) : null;
  }

  async setStatus(id: string, status: TripStatus, at: Date): Promise<Trip | null> {
    const row = await model(this.prisma, 'transportTrip').update({
      where: { id },
      data: { status, updatedAt: at },
    });
    return row ? toTrip(row) : null;
  }

  async cancel(id: string, input: CancelTripInput): Promise<Trip | null> {
    const row = await model(this.prisma, 'transportTrip').update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledAt: input.at,
        cancellationReason: input.reason,
        updatedAt: input.at,
      },
    });
    return row ? toTrip(row) : null;
  }

  /**
   * DONG ban dang hieu luc va MO ban moi trong MOT giao dich — `GD-06`.
   *
   * Tach lam hai lan ghi thi mot lan hong o giua se de lai hai ban cung `effectiveTo = NULL`, va
   * ke tu do "ai dang lai chuyen nay" co hai cau tra loi. Khong bao loi nao, khong test nao do —
   * chi la mot chuyen co hai lai xe trong bao cao cuoi thang.
   */
  async assign(tripId: string, input: AssignTripInput): Promise<TripAssignmentChange> {
    return this.prisma.$transaction(async (tx) => {
      const scoped = tx as unknown as PrismaService;
      const previousRow = await model(scoped, 'transportTripAssignment').findFirst({
        where: { tripId, effectiveTo: null },
      });
      if (previousRow) {
        await model(scoped, 'transportTripAssignment').updateMany({
          where: { tripId, effectiveTo: null },
          data: { effectiveTo: input.at },
        });
      }
      const currentRow = await model(scoped, 'transportTripAssignment').create({
        data: {
          tripId,
          vehicleId: input.vehicleId,
          driverId: input.driverId,
          effectiveFrom: input.at,
          effectiveTo: null,
          assignedBy: input.assignedBy,
        },
      });
      return {
        previous: previousRow ? toAssignment(previousRow) : null,
        current: toAssignment(currentRow),
      };
    });
  }

  async listAssignments(tripId: string): Promise<TripAssignment[]> {
    const rows: TripAssignmentRow[] = await model(this.prisma, 'transportTripAssignment').findMany({
      where: { tripId },
      orderBy: [{ effectiveFrom: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toAssignment);
  }

  async activeAssignment(tripId: string): Promise<TripAssignment | null> {
    const row = await model(this.prisma, 'transportTripAssignment').findFirst({
      where: { tripId, effectiveTo: null },
      orderBy: [{ effectiveFrom: 'desc' }, { id: 'desc' }],
    });
    return row ? toAssignment(row) : null;
  }

  async listTripIdsEverAssignedTo(driverId: string): Promise<string[]> {
    const rows: { tripId: string }[] = await model(this.prisma, 'transportTripAssignment').findMany({
      where: { driverId },
      select: { tripId: true },
      distinct: ['tripId'],
      orderBy: { tripId: 'asc' },
    });
    return rows.map((row) => row.tripId);
  }
}
