import { Injectable } from '@nestjs/common';
import { FleetRepository } from '../fleet/fleet.repository.js';
import { MovementRepository } from '../movement/movement.repository.js';
import type { VehicleRunStatus } from '../movement/movement.types.js';
import { TrackingRepository } from '../proof/tracking.repository.js';

/**
 * HAI CUA SO tu `transport-checkpoint` nhin sang hai capability khac.
 *
 * Cung khuon voi `TransportProofCoreFacts` cua Lane B, va cung mot ly do: T1 §4.1 luat 4
 * (`NO_CROSS_CONTEXT_REPOSITORY_WRITE`) duoc dat bang CAU TRUC chu khong bang ky luat. Moc van
 * hanh KHONG duoc tiem `MovementRepository` hay `TrackingRepository` truc tiep; no duoc tiem hai
 * cong duoi day, va **khong cong nao co mot ham ghi**.
 *
 * Nho vay `#243` *"Use accepted models of Lane A/B/D, do not create a shadow model"* duoc giu bang
 * dieu kien bien dich: khong co duong nao de tu day tao ra mot vong chay thu hai.
 */

export interface CheckpointDriverFacts {
  readonly id: string;
  readonly fullName: string;
}

export interface CheckpointRunFacts {
  readonly id: string;
  readonly code: string;
  readonly status: VehicleRunStatus;
}

export interface CheckpointLegFacts {
  readonly id: string;
  /** Vong chay so huu chang. Dung de chan mot chang cua vong chay khac di lac vao day. */
  readonly runId: string;
}

export abstract class TransportCheckpointCoreFacts {
  /** Cau noi phien dang nhap -> ho so lai xe. Danh tinh KHONG bao gio den tu than yeu cau. */
  abstract findDriverByAuthUserId(authUserId: string): Promise<CheckpointDriverFacts | null>;
  abstract findRun(runId: string): Promise<CheckpointRunFacts | null>;
  abstract findLeg(legId: string): Promise<CheckpointLegFacts | null>;
  /**
   * Lai xe nay CO TUNG cam vong chay do khong — ke ca ban phan cong da dong lai.
   *
   * "Tung", khong phai "dang", cung ly le da ghi o `TransportProofCoreFacts`: mot nguoi bi thay ca
   * van phai doc va ghi duoc moc cua phan chuyen ho da chay. Doc "dang" se lam moi moc cua nguoi
   * lai dau tien bien thanh khong ghi duoc ngay khi nguoi thu hai nhan xe.
   */
  abstract wasDriverEverAssignedToRun(runId: string, driverId: string): Promise<boolean>;
}

/**
 * Ban dinh vi, NHIN TU BEN NGOAI `transport-proof`.
 *
 * Cong nay tra ve `driverId` da duoc giai qua phien — nguoi goi khong tu noi hai bang lai voi nhau,
 * va vi vay khong co cho nao de quen mat phep kiem so huu. KHONG mot toa do nao di qua day.
 */
export interface CheckpointObservationFacts {
  readonly id: string;
  readonly capturedAt: Date;
  /** Lai xe so huu phien chua ban dinh vi nay. */
  readonly driverId: string;
}

export abstract class TransportCheckpointLocationFacts {
  abstract findObservation(observationId: string): Promise<CheckpointObservationFacts | null>;
}

@Injectable()
export class TransportCheckpointCoreFactsAdapter extends TransportCheckpointCoreFacts {
  constructor(
    private readonly movement: MovementRepository,
    private readonly fleet: FleetRepository,
  ) {
    super();
  }

  async findDriverByAuthUserId(authUserId: string): Promise<CheckpointDriverFacts | null> {
    const driver = await this.fleet.findDriverByAuthUserId(authUserId);
    return driver ? { id: driver.id, fullName: driver.fullName } : null;
  }

  async findRun(runId: string): Promise<CheckpointRunFacts | null> {
    const run = await this.movement.findRun(runId);
    return run ? { id: run.id, code: run.code, status: run.status } : null;
  }

  async findLeg(legId: string): Promise<CheckpointLegFacts | null> {
    const leg = await this.movement.findLeg(legId);
    return leg ? { id: leg.id, runId: leg.runId } : null;
  }

  async wasDriverEverAssignedToRun(runId: string, driverId: string): Promise<boolean> {
    const history = await this.movement.listRunAssignments(runId);
    return history.some((assignment) => assignment.driverId === driverId);
  }
}

@Injectable()
export class TransportCheckpointLocationFactsAdapter extends TransportCheckpointLocationFacts {
  constructor(private readonly tracking: TrackingRepository) {
    super();
  }

  async findObservation(observationId: string): Promise<CheckpointObservationFacts | null> {
    const observation = await this.tracking.findObservationById(observationId);
    if (!observation) return null;
    const session = await this.tracking.findSession(observation.sessionId);
    if (!session) return null;
    return {
      id: observation.id,
      capturedAt: observation.capturedAt,
      driverId: session.driverId,
    };
  }
}
