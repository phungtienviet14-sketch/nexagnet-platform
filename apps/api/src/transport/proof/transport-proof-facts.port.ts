import { Injectable } from '@nestjs/common';
import { FleetRepository } from '../fleet/fleet.repository.js';
import { MovementRepository } from '../movement/movement.repository.js';
import type { VehicleRunStatus } from '../movement/movement.types.js';
import type { TripStatus } from '../trips/trip-lifecycle.js';
import { TripRepository } from '../trips/trip.repository.js';

/**
 * CUA SO DUY NHAT tu `transport-proof` nhin sang `transport-core`.
 *
 * Cung khuon voi `TransportCoreFacts` cua `transport-costing`, va cung mot ly do: T1 §4.1 luat 4
 * (`NO_CROSS_CONTEXT_REPOSITORY_WRITE`) duoc dat bang CAU TRUC chu khong bang ky luat. Bam vi tri
 * khong duoc tiem `TripRepository`; no duoc tiem cong nay, va cong nay KHONG CO mot ham ghi nao.
 *
 * `activeVehicleForTrip` la ham QUAN TRONG NHAT o day, va no ton tai vi mot ly do an ninh cu the:
 * **may khach khong bao gio duoc noi minh dang lai xe nao.** Neu `vehicleId` den tu than yeu cau
 * thi mot lai xe gan mot chuoi toa do bat ky vao mot chiec xe bat ky. Nen no den tu ban phan cong,
 * do may chu doc, va duong kia don gian la khong ton tai.
 */

export interface ProofTripFacts {
  readonly id: string;
  readonly code: string;
  readonly status: TripStatus;
}

export interface ProofDriverFacts {
  readonly id: string;
  readonly fullName: string;
}

/**
 * VONG CHAY, nhin tu `transport-proof` — `#327`.
 *
 * `vehicleId` nam NGAY TRONG kieu nay chu khong o mot ham `activeVehicleForRun()` rieng, va do la
 * mot khac biet co ban voi duong chuyen: `TransportVehicleRun.vehicleId` la MOT COT BAT BUOC cua
 * chinh vong chay (mot vong chay LA vong chay cua mot chiec xe cu the), trong khi xe cua mot
 * chuyen song o bang phan cong va doi theo thoi gian. Tach ra thanh mot lan doc thu hai se mo mot
 * khe giua hai lan doc — va mot phien co the duoc ghi voi chiec xe cua mot vong chay khac.
 */
export interface ProofRunFacts {
  readonly id: string;
  readonly code: string;
  readonly status: VehicleRunStatus;
  /** Do MAY CHU doc tu chinh vong chay. Duong "may khach tu khai xe" khong ton tai. */
  readonly vehicleId: string;
}

/**
 * DANH TINH cua mot chiec xe, va khong hon.
 *
 * Khong tai trong, khong so odo, khong ho so dang kiem: den hom nay khong duong nao trong
 * `transport-proof` can nhung thu do, va mot cong doc rong hon can thiet la mot cong se bi dung vao
 * viec khac.
 */
export interface ProofVehicleFacts {
  readonly id: string;
  readonly registrationPlate: string;
}

export abstract class TransportProofCoreFacts {
  /** Cau noi phien dang nhap -> ho so lai xe. Danh tinh KHONG bao gio den tu than yeu cau. */
  abstract findDriverByAuthUserId(authUserId: string): Promise<ProofDriverFacts | null>;
  abstract findTrip(tripId: string): Promise<ProofTripFacts | null>;
  /**
   * Lai xe nay CO TUNG duoc phan cong vao chuyen do khong — ke ca ban phan cong da dong lai.
   *
   * "Tung", khong phai "dang": `GD-06` giu lich su phan cong dung de mot nguoi bi thay ca van doc
   * duoc phan chuyen ho da chay. Doc "dang" se lam moi ban dinh vi cua nguoi lai dau tien bien
   * thanh khong ghi duoc ngay khi nguoi thu hai nhan xe.
   */
  abstract wasDriverEverAssignedToTrip(tripId: string, driverId: string): Promise<boolean>;
  /** Xe DANG duoc phan cong cho chuyen. `null` khi chua phan cong xe nao. */
  abstract activeVehicleForTrip(tripId: string): Promise<string | null>;
  abstract findRun(runId: string): Promise<ProofRunFacts | null>;
  /**
   * Lai xe nay CO TUNG cam vong chay do khong — ke ca ban phan cong da dong lai.
   *
   * "Tung", khong phai "dang", dung ly le da ghi cho `wasDriverEverAssignedToTrip`: mot nguoi bi
   * thay ca van phai ghi duoc moc cua doan ho da chay. Doc "dang" se lam moi ban dinh vi cua
   * nguoi lai dau tien thanh khong ghi duoc ngay khi nguoi thu hai nhan xe.
   *
   * Day la cung mot su that ma `TransportCheckpointCoreFacts.wasDriverEverAssignedToRun` doc —
   * CO Y: neu hai mien doc hai bang khac nhau thi mot lai xe co the mo duoc phien ma khong ghi
   * duoc moc, hoac nguoc lai, va khong cai nao tu lo ra.
   */
  abstract wasDriverEverAssignedToRun(runId: string, driverId: string): Promise<boolean>;
  /**
   * Chiec xe nay CO TON TAI trong doi xe cua khach khong — `#297` T4.
   *
   * Ton tai vi cua nhap telematics nhan `vehicleId` tu mot DAU NOI chu khong tu mot ban phan cong.
   * `activeVehicleForTrip` khong tra loi duoc cau nay: mot hop GSHT bao vi tri ca nhung luc chiec
   * xe khong chay chuyen nao, va doi phai co mot chuyen dang mo se vut di dung nhung ban ghi chung
   * minh chiec xe dang nam o bai. Khong kiem gi ca thi nguoc lai — mot ma xe go nham se sinh ra mot
   * chuoi vi tri cho mot chiec xe khong ton tai, va no chi lo ra khi co nguoi mo bang len tim.
   */
  abstract findVehicle(vehicleId: string): Promise<ProofVehicleFacts | null>;
}

@Injectable()
export class TransportProofCoreFactsAdapter extends TransportProofCoreFacts {
  constructor(
    private readonly trips: TripRepository,
    private readonly fleet: FleetRepository,
    private readonly movement: MovementRepository,
  ) {
    super();
  }

  async findDriverByAuthUserId(authUserId: string): Promise<ProofDriverFacts | null> {
    const driver = await this.fleet.findDriverByAuthUserId(authUserId);
    return driver ? { id: driver.id, fullName: driver.fullName } : null;
  }

  async findTrip(tripId: string): Promise<ProofTripFacts | null> {
    const trip = await this.trips.find(tripId);
    return trip ? { id: trip.id, code: trip.code, status: trip.status } : null;
  }

  async wasDriverEverAssignedToTrip(tripId: string, driverId: string): Promise<boolean> {
    const history = await this.trips.listAssignments(tripId);
    return history.some((assignment) => assignment.driverId === driverId);
  }

  async activeVehicleForTrip(tripId: string): Promise<string | null> {
    const history = await this.trips.listAssignments(tripId);
    const active = history.find((assignment) => assignment.effectiveTo === null);
    return active?.vehicleId ?? null;
  }

  async findRun(runId: string): Promise<ProofRunFacts | null> {
    const run = await this.movement.findRun(runId);
    return run
      ? { id: run.id, code: run.code, status: run.status, vehicleId: run.vehicleId }
      : null;
  }

  async wasDriverEverAssignedToRun(runId: string, driverId: string): Promise<boolean> {
    const history = await this.movement.listRunAssignments(runId);
    return history.some((assignment) => assignment.driverId === driverId);
  }

  async findVehicle(vehicleId: string): Promise<ProofVehicleFacts | null> {
    const vehicle = await this.fleet.findVehicle(vehicleId);
    return vehicle ? { id: vehicle.id, registrationPlate: vehicle.registrationPlate } : null;
  }
}
