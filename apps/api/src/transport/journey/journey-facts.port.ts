import { Injectable } from '@nestjs/common';
import { CheckpointService } from '../checkpoint/checkpoint.service.js';
import { CheckpointRepository } from '../checkpoint/checkpoint.repository.js';
import { FleetRepository } from '../fleet/fleet.repository.js';
import { FuelRepository } from '../fuel/fuel.repository.js';
import { MovementRepository } from '../movement/movement.repository.js';
import { TrackingRepository } from '../proof/tracking.repository.js';
import type { RunCheckpoint } from '../checkpoint/checkpoint.types.js';
import type { RunTimeline } from '../checkpoint/run-timeline.js';
import type { FuelEntry } from '../fuel/fuel.types.js';
import type {
  Order,
  RunAssignment,
  RunLeg,
  TripRunLegLink,
  VehicleRun,
} from '../movement/movement.types.js';
import type { LocationObservation, TrackingSession } from '../proof/tracking.types.js';
import type { Vehicle } from '../transport.types.js';

/**
 * CAC CUA SO cua bao cao ban do vong chay. TAT CA deu CHI DOC.
 *
 * Cung khuon `control-tower-facts.port.ts`, va cung mot ly do CAU TRUC (T1 §4.1 luat 4): mot bao
 * cao duoc tiem thang `MovementRepository` la mot bao cao ma mot ngay nao do se co nguoi goi mot ham
 * GHI tu trong no. Khong mot cong nao duoi day co ham ghi, nen cau "bao cao ban do khong bao gio
 * ghi" la mot dieu kien BIEN DICH.
 *
 * Cong LOI (`JourneyCoreFacts`) khong `@Optional()`: khong co vong chay thi khong co bao cao. Ba
 * cong con lai thuoc ba capability khac va deu `@Optional()` o `app-composition.ts`.
 */

/* ------------------------------------------------------------------ *
 * transport-core — BAT BUOC
 * ------------------------------------------------------------------ */

export abstract class JourneyCoreFacts {
  abstract findRun(runId: string): Promise<VehicleRun | null>;
  abstract findRunByCode(code: string): Promise<VehicleRun | null>;
  abstract listLegs(runId: string): Promise<readonly RunLeg[]>;
  abstract listRunAssignments(runId: string): Promise<readonly RunAssignment[]>;
  abstract findVehicle(vehicleId: string): Promise<Vehicle | null>;
  abstract listOrders(): Promise<readonly Order[]>;
  /**
   * CAU NOI chang v2 -> chuyen v1.
   *
   * Day la duong DUY NHAT dan tu mot chang toi mot phien bam vi tri va toi mot phieu do dau:
   * `TrackingSession.tripId` va `FuelEntry.tripId` deu khoa vao chuyen, khong vao chang. Khong co
   * cau noi nay thi hai nguon do chi con cach gan theo (xe, ngay) — tuc mot phep DOAN.
   */
  abstract findTripLinksByLegs(legIds: readonly string[]): Promise<readonly TripRunLegLink[]>;
}

@Injectable()
export class JourneyCoreFactsAdapter extends JourneyCoreFacts {
  constructor(
    private readonly movement: MovementRepository,
    private readonly fleet: FleetRepository,
  ) {
    super();
  }

  findRun(runId: string): Promise<VehicleRun | null> {
    return this.movement.findRun(runId);
  }

  findRunByCode(code: string): Promise<VehicleRun | null> {
    return this.movement.findRunByCode(code);
  }

  listLegs(runId: string): Promise<readonly RunLeg[]> {
    return this.movement.listLegs(runId);
  }

  listRunAssignments(runId: string): Promise<readonly RunAssignment[]> {
    return this.movement.listRunAssignments(runId);
  }

  findVehicle(vehicleId: string): Promise<Vehicle | null> {
    return this.fleet.findVehicle(vehicleId);
  }

  listOrders(): Promise<readonly Order[]> {
    return this.movement.listOrders();
  }

  findTripLinksByLegs(legIds: readonly string[]): Promise<readonly TripRunLegLink[]> {
    return this.movement.findTripLinksByLegs(legIds);
  }
}

/* ------------------------------------------------------------------ *
 * transport-checkpoint — TUY CHON
 * ------------------------------------------------------------------ */

export abstract class JourneyCheckpointFacts {
  /** Moc THO — bao cao can `observationId` cua tung moc, ma `RunTimeline` co y khong mang. */
  abstract listForRun(runId: string): Promise<readonly RunCheckpoint[]>;
  /** Dong thoi gian da suy san giai doan tung chang va da dem canh bao. */
  abstract timelineForRun(runId: string): Promise<RunTimeline>;
}

/**
 * Tiem CA `CheckpointRepository` lan `CheckpointService`, va ca hai deu can.
 *
 * `RunTimeline` co y KHONG mang `observationId` (`run-timeline.ts`: *"KHONG kem toa do"*), nen bao
 * cao ban do khong lay toa do tu no duoc. Nguoc lai, kho tho khong biet `CheckpointPolicy` cua
 * khach, nen tu goi `buildRunTimeline()` o day se cho ra canh bao khac voi man hinh moc.
 *
 * Ca hai deu nam trong `exports` cua `TransportCheckpointModule`, nen ca hai deu boot duoc.
 */
@Injectable()
export class JourneyCheckpointFactsAdapter extends JourneyCheckpointFacts {
  constructor(
    private readonly checkpoints: CheckpointRepository,
    private readonly service: CheckpointService,
  ) {
    super();
  }

  listForRun(runId: string): Promise<readonly RunCheckpoint[]> {
    return this.checkpoints.listForRun(runId);
  }

  timelineForRun(runId: string): Promise<RunTimeline> {
    return this.service.timelineForRun(runId);
  }
}

/* ------------------------------------------------------------------ *
 * transport-proof — TUY CHON
 * ------------------------------------------------------------------ */

export abstract class JourneyLocationFacts {
  abstract findObservation(observationId: string): Promise<LocationObservation | null>;
  abstract listSessionsForTrip(tripId: string): Promise<readonly TrackingSession[]>;
  abstract listObservations(sessionId: string): Promise<readonly LocationObservation[]>;
}

@Injectable()
export class JourneyLocationFactsAdapter extends JourneyLocationFacts {
  constructor(private readonly tracking: TrackingRepository) {
    super();
  }

  findObservation(observationId: string): Promise<LocationObservation | null> {
    return this.tracking.findObservationById(observationId);
  }

  listSessionsForTrip(tripId: string): Promise<readonly TrackingSession[]> {
    return this.tracking.listSessionsForTrip(tripId);
  }

  listObservations(sessionId: string): Promise<readonly LocationObservation[]> {
    return this.tracking.listObservations(sessionId);
  }
}

/* ------------------------------------------------------------------ *
 * transport-fuel — TUY CHON
 * ------------------------------------------------------------------ */

export abstract class JourneyFuelFacts {
  abstract listEntriesByTrip(tripId: string): Promise<readonly FuelEntry[]>;
}

@Injectable()
export class JourneyFuelFactsAdapter extends JourneyFuelFacts {
  constructor(private readonly fuel: FuelRepository) {
    super();
  }

  listEntriesByTrip(tripId: string): Promise<readonly FuelEntry[]> {
    return this.fuel.listEntriesByTrip(tripId);
  }
}
