import { Injectable } from '@nestjs/common';
import { FleetRepository } from '../fleet/fleet.repository.js';
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
}

@Injectable()
export class TransportProofCoreFactsAdapter extends TransportProofCoreFacts {
  constructor(
    private readonly trips: TripRepository,
    private readonly fleet: FleetRepository,
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
}
