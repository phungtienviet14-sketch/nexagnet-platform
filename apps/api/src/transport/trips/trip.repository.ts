import { randomUUID } from 'node:crypto';
import type { BusinessDate } from '../business-date.js';
import { TRANSPORT_CURRENCY } from '../money.js';
import type { Trip, TripAssignment } from '../transport.types.js';
import { INITIAL_TRIP_STATUS, type TripKind, type TripStatus } from './trip-lifecycle.js';

export interface CreateTripInput {
  readonly code: string;
  readonly kind: TripKind;
  readonly businessDate: BusinessDate;
  readonly originLabel: string;
  readonly destinationLabel: string;
  readonly cargoDescription?: string | null;
  readonly customerId?: string | null;
  readonly carrierPartnerId?: string | null;
  readonly referrerPartnerId?: string | null;
  readonly freightAmount?: number | null;
  readonly distanceKm?: number | null;
}

export interface UpdateTripInput {
  readonly originLabel?: string;
  readonly destinationLabel?: string;
  readonly cargoDescription?: string | null;
  readonly customerId?: string | null;
  readonly carrierPartnerId?: string | null;
  readonly referrerPartnerId?: string | null;
  readonly freightAmount?: number | null;
  readonly distanceKm?: number | null;
}

export interface CancelTripInput {
  readonly reason: string;
  readonly at: Date;
}

export interface AssignTripInput {
  readonly vehicleId: string | null;
  readonly driverId: string | null;
  readonly assignedBy: string;
  readonly at: Date;
}

/** Ket qua mot lan doi phan cong — giu lai CA hai ban de nguoi goi ghi telemetry/audit dung. */
export interface TripAssignmentChange {
  readonly previous: TripAssignment | null;
  readonly current: TripAssignment;
}

/**
 * Kho cua `TX-02 Trip Operations`.
 *
 * KHONG co ham `delete`. Do khong phai thieu sot: `GD-02` bo duong xoa cung cho mot chuyen, va
 * cach chac chan nhat de khong ai xoa nham la khong cung cap cai nut do o tang kho. "Xoa" tren
 * giao dien anh xa sang `cancel()`.
 */
export abstract class TripRepository {
  abstract create(input: CreateTripInput): Promise<Trip>;
  abstract find(id: string): Promise<Trip | null>;
  abstract findByCode(code: string): Promise<Trip | null>;
  abstract list(): Promise<Trip[]>;
  abstract update(id: string, patch: UpdateTripInput): Promise<Trip | null>;
  /** Chuyen trang thai. Nguoi goi da qua `evaluateTripTransition()` — kho khong tu quyet dinh gi. */
  abstract setStatus(id: string, status: TripStatus, at: Date): Promise<Trip | null>;
  abstract cancel(id: string, input: CancelTripInput): Promise<Trip | null>;

  abstract assign(tripId: string, input: AssignTripInput): Promise<TripAssignmentChange>;
  abstract listAssignments(tripId: string): Promise<TripAssignment[]>;
  abstract activeAssignment(tripId: string): Promise<TripAssignment | null>;
  /** Moi chuyen ma lai xe nay TUNG duoc phan cong — ke ca cac ban da dong lai. */
  abstract listTripIdsEverAssignedTo(driverId: string): Promise<string[]>;
}

const iso = (at: Date): string => at.toISOString();

function prune<T extends object>(patch: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

export class InMemoryTripRepository extends TripRepository {
  private readonly trips = new Map<string, Trip>();
  private readonly assignments: TripAssignment[] = [];

  constructor(private readonly now: () => Date = () => new Date()) {
    super();
  }

  async create(input: CreateTripInput): Promise<Trip> {
    const at = iso(this.now());
    const trip: Trip = {
      id: randomUUID(),
      code: input.code,
      kind: input.kind,
      status: INITIAL_TRIP_STATUS,
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
      createdAt: at,
      updatedAt: at,
      cancelledAt: null,
      cancellationReason: null,
    };
    this.trips.set(trip.id, trip);
    return trip;
  }

  async find(id: string): Promise<Trip | null> {
    return this.trips.get(id) ?? null;
  }

  async findByCode(code: string): Promise<Trip | null> {
    return [...this.trips.values()].find((entry) => entry.code === code) ?? null;
  }

  async list(): Promise<Trip[]> {
    return [...this.trips.values()];
  }

  async update(id: string, patch: UpdateTripInput): Promise<Trip | null> {
    const current = this.trips.get(id);
    if (!current) return null;
    const next: Trip = { ...current, ...prune(patch), updatedAt: iso(this.now()) };
    this.trips.set(id, next);
    return next;
  }

  async setStatus(id: string, status: TripStatus, at: Date): Promise<Trip | null> {
    const current = this.trips.get(id);
    if (!current) return null;
    const next: Trip = { ...current, status, updatedAt: iso(at) };
    this.trips.set(id, next);
    return next;
  }

  async cancel(id: string, input: CancelTripInput): Promise<Trip | null> {
    const current = this.trips.get(id);
    if (!current) return null;
    const stamp = iso(input.at);
    const next: Trip = {
      ...current,
      status: 'CANCELLED',
      cancelledAt: stamp,
      cancellationReason: input.reason,
      updatedAt: stamp,
    };
    this.trips.set(id, next);
    return next;
  }

  async assign(tripId: string, input: AssignTripInput): Promise<TripAssignmentChange> {
    const stamp = iso(input.at);
    let previous: TripAssignment | null = null;
    for (const [index, entry] of this.assignments.entries()) {
      if (entry.tripId === tripId && entry.effectiveTo === null) {
        previous = entry;
        // DONG LAI ban cu, khong ghi de: `GD-06`. Sau lan nay van doc duoc ai lai tu luc nao.
        this.assignments[index] = { ...entry, effectiveTo: stamp };
      }
    }
    const current: TripAssignment = {
      id: randomUUID(),
      tripId,
      vehicleId: input.vehicleId,
      driverId: input.driverId,
      effectiveFrom: stamp,
      effectiveTo: null,
      assignedBy: input.assignedBy,
      createdAt: stamp,
    };
    this.assignments.push(current);
    return { previous, current };
  }

  async listAssignments(tripId: string): Promise<TripAssignment[]> {
    return this.assignments.filter((entry) => entry.tripId === tripId);
  }

  async activeAssignment(tripId: string): Promise<TripAssignment | null> {
    return (
      this.assignments.find((entry) => entry.tripId === tripId && entry.effectiveTo === null) ?? null
    );
  }

  async listTripIdsEverAssignedTo(driverId: string): Promise<string[]> {
    return [
      ...new Set(
        this.assignments.filter((entry) => entry.driverId === driverId).map((entry) => entry.tripId),
      ),
    ];
  }
}
