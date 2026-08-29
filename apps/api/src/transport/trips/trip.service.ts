import { Inject, Injectable, Optional } from '@nestjs/common';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { TelemetryService } from '../../observability/telemetry.service.js';
import { BusinessDateError, assertBusinessDate, toBusinessDate } from '../business-date.js';
import { FleetRepository } from '../fleet/fleet.repository.js';
import { MoneyError, nonNegativeMoney } from '../money.js';
import { TRANSPORT_DECISIONS } from '../transport-decisions.js';
import {
  TRANSPORT_CLOCK,
  TRANSPORT_CORE_POLICY,
  type TransportCorePolicy,
} from '../transport-policy.js';
import { TransportDomainError } from '../transport.errors.js';
import type { Driver, PartnerRoleKind, Trip, TripAssignment } from '../transport.types.js';
import { toDriverTripView, type DriverTripView } from './driver-trip.view.js';
import {
  evaluateTripTransition,
  isTerminalTripStatus,
  type TripKind,
  type TripStatus,
} from './trip-lifecycle.js';
import { TripRepository, type UpdateTripInput } from './trip.repository.js';

export interface PlanTripInput {
  readonly code: string;
  readonly kind: TripKind;
  readonly originLabel: string;
  readonly destinationLabel: string;
  readonly businessDate?: string;
  readonly cargoDescription?: string | null;
  readonly customerId?: string | null;
  readonly carrierPartnerId?: string | null;
  readonly referrerPartnerId?: string | null;
  readonly freightAmount?: number | null;
  readonly distanceKm?: number | null;
}

export interface AssignTripResourcesInput {
  readonly vehicleId: string | null;
  readonly driverId: string | null;
}

/**
 * Trang thai ma LAI XE duoc phep dat.
 *
 * `RECONCILED` co y nam ngoai: `GD-01` noi ro do la mot lan chuyen tay cua Ke toan/Giam doc, va no
 * KHOA chuyen khoi ghi chi phi moi. De lai xe bam duoc nut do la de nguoi cuoi cung con dang tren
 * duong chot so sach cua ca thang.
 */
const DRIVER_SETTABLE_STATUSES: readonly TripStatus[] = ['IN_TRANSIT', 'DELIVERED'];

/**
 * `TX-02 Trip Operations`.
 *
 * Service la noi DUY NHAT quyet dinh trang thai chuyen. `TripRepository.setStatus()` chi ghi cai
 * da duoc `evaluateTripTransition()` cho phep — kho khong tu suy luan gi, va khong controller nao
 * duoc goi thang vao no.
 */
@Injectable()
export class TripService {
  constructor(
    private readonly trips: TripRepository,
    private readonly fleet: FleetRepository,
    private readonly audit: AuditLogService,
    @Inject(TRANSPORT_CORE_POLICY) private readonly policy: TransportCorePolicy,
    @Optional() private readonly telemetry?: TelemetryService,
    @Optional() @Inject(TRANSPORT_CLOCK) private readonly clock?: () => Date,
  ) {}

  /* --------------------------- Ghi nhan --------------------------- */

  async planTrip(input: PlanTripInput, actor: string): Promise<Trip> {
    if (await this.trips.findByCode(input.code)) {
      throw TransportDomainError.conflict('TRIP_CODE_TAKEN', `Ma chuyen ${input.code} da ton tai`);
    }

    const freightAmount = this.requireFreightAmount(input.freightAmount);
    const businessDate = this.resolveBusinessDate(input.businessDate);
    await this.requireReferences(input);

    const trip = await this.trips.create({
      code: input.code,
      kind: input.kind,
      businessDate,
      originLabel: input.originLabel,
      destinationLabel: input.destinationLabel,
      cargoDescription: input.cargoDescription ?? null,
      customerId: input.customerId ?? null,
      carrierPartnerId: input.carrierPartnerId ?? null,
      referrerPartnerId: input.referrerPartnerId ?? null,
      freightAmount,
      distanceKm: input.distanceKm ?? null,
    });

    await this.audit.append({
      actor,
      action: 'transport.trip.create',
      entityType: 'TransportTrip',
      entityId: trip.id,
      after: trip,
    });
    this.telemetry?.stateChange({
      entity: 'TransportTrip',
      entityId: trip.id,
      from: null,
      to: trip.status,
    });
    return trip;
  }

  async updateTrip(id: string, patch: UpdateTripInput, actor: string): Promise<Trip> {
    const before = await this.requireTrip(id);
    if (isTerminalTripStatus(before.status)) {
      throw TransportDomainError.denied(
        'TRIP_ALREADY_TERMINAL',
        `Chuyen ${before.code} da o diem cuoi (${before.status}), khong sua duoc nua`,
      );
    }

    const freightAmount = this.requireFreightAmount(patch.freightAmount);
    await this.requireReferences({ ...before, ...patch });

    const after = await this.trips.update(id, {
      ...patch,
      ...(patch.freightAmount === undefined ? {} : { freightAmount }),
    });
    if (!after) throw this.tripNotFound(id);

    await this.audit.append({
      actor,
      action: 'transport.trip.update',
      entityType: 'TransportTrip',
      entityId: id,
      before,
      after,
    });
    return after;
  }

  listTrips(): Promise<Trip[]> {
    return this.trips.list();
  }

  getTrip(id: string): Promise<Trip> {
    return this.requireTrip(id);
  }

  /* -------------------------- Phan cong --------------------------- */

  /**
   * Phan cong xe + lai xe cho mot chuyen — `GD-06`, phan cong la LICH SU.
   *
   * Ban dang hieu luc bi dong lai (`effectiveTo`), ban moi mo ra. Khong ban nao bi ghi de, nen cau
   * hoi "ai lai luc khoan chi do phat sinh" van tra loi duoc o T3.
   */
  async assign(
    tripId: string,
    input: AssignTripResourcesInput,
    actor: string,
  ): Promise<TripAssignment> {
    const trip = await this.requireTrip(tripId);
    if (isTerminalTripStatus(trip.status)) {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_DECISIONS,
        point: 'trip.assignment_change',
        outcome: 'denied',
        reason: 'ASSIGNMENT_TRIP_TERMINAL',
        detail: { tripId, status: trip.status },
      });
      throw TransportDomainError.denied(
        'ASSIGNMENT_TRIP_TERMINAL',
        `Chuyen ${trip.code} da o diem cuoi (${trip.status}), khong phan cong lai duoc`,
      );
    }

    if (input.vehicleId !== null && !(await this.fleet.findVehicle(input.vehicleId))) {
      throw this.vehicleNotFound(input.vehicleId);
    }
    if (input.driverId !== null && !(await this.fleet.findDriver(input.driverId))) {
      throw this.driverNotFound(input.driverId);
    }

    const active = await this.trips.activeAssignment(tripId);
    if (active && active.vehicleId === input.vehicleId && active.driverId === input.driverId) {
      // Bam lai dung cai dang co. Ghi them mot dong chi lam toa lich su ma khong noi them gi.
      this.telemetry?.decision({
        vocabulary: TRANSPORT_DECISIONS,
        point: 'trip.assignment_change',
        outcome: 'allowed',
        reason: 'ASSIGNMENT_UNCHANGED',
        detail: { tripId },
      });
      return active;
    }

    const change = await this.trips.assign(tripId, { ...input, assignedBy: actor, at: this.now() });
    const reason = change.previous ? 'ASSIGNMENT_REPLACED' : 'ASSIGNMENT_CREATED';
    this.telemetry?.decision({
      vocabulary: TRANSPORT_DECISIONS,
      point: 'trip.assignment_change',
      outcome: 'allowed',
      reason,
      detail: { tripId, previousAssignmentId: change.previous?.id ?? null },
    });
    await this.audit.append({
      actor,
      action: 'transport.trip.assign',
      entityType: 'TransportTripAssignment',
      entityId: change.current.id,
      before: change.previous,
      after: change.current,
    });
    return change.current;
  }

  assignmentHistory(tripId: string): Promise<TripAssignment[]> {
    return this.trips.listAssignments(tripId);
  }

  /* --------------------------- Vong doi --------------------------- */

  async transition(tripId: string, to: TripStatus, actor: string): Promise<Trip> {
    const trip = await this.requireTrip(tripId);
    const active = await this.trips.activeAssignment(tripId);

    const decision = evaluateTripTransition(trip.status, to, {
      kind: trip.kind,
      hasVehicle: active?.vehicleId != null,
      hasDriver: active?.driverId != null,
      hasCarrierPartner: trip.carrierPartnerId != null,
    });

    this.telemetry?.decision({
      vocabulary: TRANSPORT_DECISIONS,
      point: 'trip.lifecycle_transition',
      outcome: decision.allowed ? 'allowed' : 'denied',
      reason: decision.reason,
      detail: { tripId, from: trip.status, to, kind: trip.kind },
    });

    if (!decision.allowed) {
      throw TransportDomainError.denied(
        decision.reason,
        `Chuyen ${trip.code}: khong chuyen duoc ${trip.status} -> ${to} (${decision.reason})`,
      );
    }

    const after = await this.trips.setStatus(tripId, to, this.now());
    if (!after) throw this.tripNotFound(tripId);

    await this.audit.append({
      actor,
      action: 'transport.trip.transition',
      entityType: 'TransportTrip',
      entityId: tripId,
      before: { status: trip.status },
      after: { status: after.status },
    });
    this.telemetry?.stateChange({
      entity: 'TransportTrip',
      entityId: tripId,
      from: trip.status,
      to: after.status,
      reason: decision.reason,
    });
    return after;
  }

  /**
   * `GD-02` — HUY thay cho xoa.
   *
   * Khong co duong xoa cung nao o bat cu tang nao. Chuyen bi huy van doc duoc, van nam trong danh
   * sach, va mang ly do — de T3 con dao duoc cac khoan da ghi cho no.
   */
  async cancel(tripId: string, reason: string, actor: string): Promise<Trip> {
    const trip = await this.requireTrip(tripId);

    const denial =
      trip.status === 'CANCELLED'
        ? ('CANCEL_ALREADY_CANCELLED' as const)
        : trip.status === 'RECONCILED'
          ? ('CANCEL_TRIP_RECONCILED' as const)
          : null;

    if (denial) {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_DECISIONS,
        point: 'trip.cancel',
        outcome: 'denied',
        reason: denial,
        detail: { tripId, status: trip.status },
      });
      throw TransportDomainError.denied(
        denial,
        `Chuyen ${trip.code} dang o ${trip.status}, khong huy duoc`,
      );
    }

    const after = await this.trips.cancel(tripId, { reason, at: this.now() });
    if (!after) throw this.tripNotFound(tripId);

    this.telemetry?.decision({
      vocabulary: TRANSPORT_DECISIONS,
      point: 'trip.cancel',
      outcome: 'allowed',
      reason: 'CANCEL_RECORDED',
      detail: { tripId, from: trip.status },
    });
    await this.audit.append({
      actor,
      action: 'transport.trip.cancel',
      entityType: 'TransportTrip',
      entityId: tripId,
      before: { status: trip.status },
      after: { status: after.status, cancellationReason: after.cancellationReason },
    });
    this.telemetry?.stateChange({
      entity: 'TransportTrip',
      entityId: tripId,
      from: trip.status,
      to: after.status,
      reason: 'CANCEL_RECORDED',
    });
    return after;
  }

  /* ------------------------ Be mat lai xe ------------------------ */

  async listDriverTrips(authUserId: string): Promise<DriverTripView[]> {
    const driver = await this.requireDriverBinding(authUserId);
    const tripIds = await this.trips.listTripIdsEverAssignedTo(driver.id);

    const views: DriverTripView[] = [];
    for (const tripId of tripIds) {
      const view = await this.buildDriverView(tripId, driver);
      if (view) views.push(view);
    }
    this.telemetry?.decision({
      vocabulary: TRANSPORT_DECISIONS,
      point: 'driver.self_scope',
      outcome: 'allowed',
      reason: 'SELF_SCOPE_GRANTED',
      detail: { driverId: driver.id, tripCount: views.length },
    });
    return views;
  }

  async getDriverTrip(authUserId: string, tripId: string): Promise<DriverTripView> {
    const driver = await this.requireDriverBinding(authUserId);
    await this.requireEverAssigned(driver, tripId);

    const view = await this.buildDriverView(tripId, driver);
    if (!view) throw this.tripNotFound(tripId);
    return view;
  }

  /**
   * Lai xe doi trang thai chuyen CUA MINH.
   *
   * Hai cong khac nhau, co y tach roi: DOC can tung duoc phan cong (lich su cua chinh minh), con
   * GHI doi phai la nguoi DANG duoc phan cong. Sau khi bi thay the, mot lai xe van xem lai duoc
   * chuyen minh da chay nhung khong con bam duoc nut nao — neu khong tach, hai nguoi se cung doi
   * duoc trang thai mot chuyen va khong ai biet ai dang that su cam vo lang.
   */
  async updateDriverTripStatus(
    authUserId: string,
    tripId: string,
    to: TripStatus,
  ): Promise<DriverTripView> {
    const driver = await this.requireDriverBinding(authUserId);
    const active = await this.trips.activeAssignment(tripId);

    if (!active || active.driverId !== driver.id) {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_DECISIONS,
        point: 'driver.self_scope',
        outcome: 'denied',
        reason: 'SELF_SCOPE_NOT_ASSIGNED',
        detail: { driverId: driver.id, tripId },
      });
      throw TransportDomainError.denied(
        'SELF_SCOPE_NOT_ASSIGNED',
        'Chuyen nay khong phai chuyen dang duoc phan cong cho ban',
      );
    }

    if (!DRIVER_SETTABLE_STATUSES.includes(to)) {
      throw TransportDomainError.denied(
        'TRANSITION_NOT_PERMITTED',
        `Lai xe khong duoc dat trang thai ${to}`,
      );
    }

    await this.transition(tripId, to, `driver:${driver.id}`);
    const view = await this.buildDriverView(tripId, driver);
    if (!view) throw this.tripNotFound(tripId);
    return view;
  }

  /* --------------------------- Noi bo ---------------------------- */

  private now(): Date {
    return this.clock ? this.clock() : new Date();
  }

  private resolveBusinessDate(provided?: string): string {
    if (provided === undefined) return toBusinessDate(this.now(), this.policy.timeZone);
    try {
      return assertBusinessDate(provided);
    } catch (error) {
      if (error instanceof BusinessDateError) {
        throw TransportDomainError.invalid('BUSINESS_DATE_INVALID', error.message);
      }
      throw error;
    }
  }

  private requireFreightAmount(value: number | null | undefined): number | null {
    if (value === null || value === undefined) return null;
    try {
      return nonNegativeMoney(value).amount;
    } catch (error) {
      if (error instanceof MoneyError) {
        throw TransportDomainError.invalid('MONEY_INVALID', error.message);
      }
      throw error;
    }
  }

  /**
   * Khach hang va doi tac duoc tro toi phai CO THAT, va doi tac phai mang DUNG VAI cho vi tri do.
   *
   * Kiem theo VAI chu khong theo "loai doi tac": mot doi tac mang ca hai vai dung duoc o ca hai
   * cho, va do chinh la tinh huong VT-054 mo ta.
   */
  private async requireReferences(input: {
    customerId?: string | null;
    carrierPartnerId?: string | null;
    referrerPartnerId?: string | null;
  }): Promise<void> {
    if (input.customerId && !(await this.fleet.findCustomer(input.customerId))) {
      throw TransportDomainError.notFound(
        'CUSTOMER_NOT_FOUND',
        `Khong tim thay khach hang ${input.customerId}`,
      );
    }
    await this.requirePartnerRole(input.carrierPartnerId, 'CARRIER');
    await this.requirePartnerRole(input.referrerPartnerId, 'ORDER_REFERRER');
  }

  private async requirePartnerRole(
    partnerId: string | null | undefined,
    role: PartnerRoleKind,
  ): Promise<void> {
    if (!partnerId) return;
    const partner = await this.fleet.findPartner(partnerId);
    if (!partner) {
      throw TransportDomainError.notFound(
        'PARTNER_NOT_FOUND',
        `Khong tim thay doi tac ${partnerId}`,
      );
    }
    if (!partner.roles.includes(role)) {
      throw TransportDomainError.invalid(
        'PARTNER_ROLE_MISMATCH',
        `Doi tac ${partner.name} khong mang vai ${role}`,
      );
    }
  }

  private async requireDriverBinding(authUserId: string): Promise<Driver> {
    const driver = await this.fleet.findDriverByAuthUserId(authUserId);
    if (!driver) {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_DECISIONS,
        point: 'driver.self_scope',
        outcome: 'denied',
        reason: 'SELF_SCOPE_NO_DRIVER_BINDING',
        detail: { authUserId },
      });
      throw TransportDomainError.denied(
        'SELF_SCOPE_NO_DRIVER_BINDING',
        'Tai khoan nay chua duoc noi voi ho so lai xe nao',
      );
    }
    return driver;
  }

  private async requireEverAssigned(driver: Driver, tripId: string): Promise<void> {
    const tripIds = await this.trips.listTripIdsEverAssignedTo(driver.id);
    if (tripIds.includes(tripId)) return;

    this.telemetry?.decision({
      vocabulary: TRANSPORT_DECISIONS,
      point: 'driver.self_scope',
      outcome: 'denied',
      reason: 'SELF_SCOPE_NOT_ASSIGNED',
      detail: { driverId: driver.id, tripId },
    });
    throw TransportDomainError.denied(
      'SELF_SCOPE_NOT_ASSIGNED',
      'Chuyen nay khong thuoc pham vi cua ban',
    );
  }

  private async buildDriverView(tripId: string, driver: Driver): Promise<DriverTripView | null> {
    const trip = await this.trips.find(tripId);
    if (!trip) return null;

    const assignments = await this.trips.listAssignments(tripId);
    const active = assignments.find((entry) => entry.effectiveTo === null) ?? null;
    const mine =
      assignments
        .filter((entry) => entry.driverId === driver.id)
        .sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom))[0] ?? null;

    return toDriverTripView({
      trip,
      assignment: mine,
      vehicle: mine?.vehicleId ? await this.fleet.findVehicle(mine.vehicleId) : null,
      customer: trip.customerId ? await this.fleet.findCustomer(trip.customerId) : null,
      isCurrentAssignee: active?.driverId === driver.id,
    });
  }

  private tripNotFound(id: string): TransportDomainError {
    return TransportDomainError.notFound('TRIP_NOT_FOUND', `Khong tim thay chuyen ${id}`);
  }

  private vehicleNotFound(id: string): TransportDomainError {
    return TransportDomainError.notFound('VEHICLE_NOT_FOUND', `Khong tim thay xe ${id}`);
  }

  private driverNotFound(id: string): TransportDomainError {
    return TransportDomainError.notFound('DRIVER_NOT_FOUND', `Khong tim thay lai xe ${id}`);
  }

  private async requireTrip(id: string): Promise<Trip> {
    const trip = await this.trips.find(id);
    if (!trip) throw this.tripNotFound(id);
    return trip;
  }
}
