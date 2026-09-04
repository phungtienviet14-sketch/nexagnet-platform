import { Injectable } from '@nestjs/common';
import { FleetRepository } from '../fleet/fleet.repository.js';
import type { VehicleStatus } from '../transport.types.js';
import { TripRepository } from '../trips/trip.repository.js';

/**
 * CUA SO DUY NHAT tu `transport-asset-compliance` nhin sang `transport-core`.
 *
 * Cung khuon `TransportCoreFacts` cua T3 va `SettlementCoreFacts` cua T5, va cung mot ly do: T1
 * §4.1 luat 4 (`NO_CROSS_CONTEXT_REPOSITORY_WRITE`) duoc dat bang CAU TRUC chu khong bang ky luat.
 * Service cua T6 khong duoc tiem `TripRepository`; no duoc tiem cong nay, va cong nay KHONG CO mot
 * ham ghi nao. Mot lan lo tay goi `trips.setStatus(...)` tu day se khong bien dich duoc.
 *
 * Dieu do QUAN TRONG HON O T6 so voi cac capability truoc: T6 tinh ra `effectiveStatus` cua xe, va
 * cai cam do la cam T6 GHI ket qua do nguoc vao cot `TransportVehicle.status`. §7.2 noi `ON_TRIP`
 * la DAN XUAT; neu T6 ghi de cot do thi no bien mot phep hop thanh doc duoc thanh mot ban sao du
 * lieu co the lech — dung cai benh ma phep hop thanh sinh ra de chua.
 *
 * `VehicleFacts` co y NGHEO: bon truong ma T6 that su can. Tra ve ca `Vehicle` se mang
 * `allowedPayloadKg` va cac truong doi xe khac vao pham vi cua mot capability chi lo bao duong.
 */
export interface VehicleFacts {
  readonly id: string;
  readonly registrationPlate: string;
  readonly vehicleClass: string;
  readonly currentOdoKm: number;
  /** Cot dang luu. Duoc doi chieu voi trang thai hieu luc, KHONG duoc tin. */
  readonly status: VehicleStatus;
}

/** Mot xe dang gan vao mot chuyen `IN_TRANSIT`. */
export interface InTransitVehicleAssignment {
  readonly vehicleId: string;
  readonly tripId: string;
}

export abstract class AssetComplianceCoreFacts {
  abstract findVehicle(vehicleId: string): Promise<VehicleFacts | null>;
  abstract listVehicles(): Promise<VehicleFacts[]>;
  /** Chu the `DRIVER` cua mot giay to co ton tai khong — khoa da dich nen DB khong giu ho. */
  abstract driverExists(driverId: string): Promise<boolean>;
  /**
   * MOI cap (xe, chuyen) dang chay.
   *
   * "Dang chay" = ban phan cong CON HIEU LUC tren mot chuyen `IN_TRANSIT`. Ban phan cong DA DONG
   * khong tinh, khac han `wasDriverEverAssignedToTrip` cua T3: o do cau hoi la trach nhiem lich su
   * ("ai da cam vo lang luc khoan chi phat sinh"), o day la tinh trang HOM NAY ("xe nao dang tren
   * duong"). Doc "tung" o day se lam moi xe tung chay mot chuyen deu ket vinh vien o `ON_TRIP`.
   */
  abstract listInTransitAssignments(): Promise<InTransitVehicleAssignment[]>;
}

/**
 * Hien thuc DUY NHAT cua cong tren.
 *
 * Dat trong thu muc `asset-compliance/` chu khong o `trips/`: day la nhu cau CUA T6, va
 * `transport-core` khong duoc phai biet ai dang doc no de con dung duoc mot minh (T1 §10.1).
 */
@Injectable()
export class AssetComplianceCoreFactsAdapter extends AssetComplianceCoreFacts {
  constructor(
    private readonly fleet: FleetRepository,
    private readonly trips: TripRepository,
  ) {
    super();
  }

  async findVehicle(vehicleId: string): Promise<VehicleFacts | null> {
    const vehicle = await this.fleet.findVehicle(vehicleId);
    return vehicle ? toVehicleFacts(vehicle) : null;
  }

  async listVehicles(): Promise<VehicleFacts[]> {
    const vehicles = await this.fleet.listVehicles();
    return vehicles.map(toVehicleFacts);
  }

  async driverExists(driverId: string): Promise<boolean> {
    return (await this.fleet.findDriver(driverId)) !== null;
  }

  async listInTransitAssignments(): Promise<InTransitVehicleAssignment[]> {
    const [assignments, trips] = await Promise.all([
      this.trips.listActiveAssignments(),
      this.trips.list(),
    ]);
    const inTransit = new Set(
      trips.filter((trip) => trip.status === 'IN_TRANSIT').map((trip) => trip.id),
    );
    const rows: InTransitVehicleAssignment[] = [];
    for (const assignment of assignments) {
      if (assignment.vehicleId === null) continue;
      if (!inTransit.has(assignment.tripId)) continue;
      rows.push({ vehicleId: assignment.vehicleId, tripId: assignment.tripId });
    }
    return rows;
  }
}

const toVehicleFacts = (vehicle: {
  id: string;
  registrationPlate: string;
  vehicleClass: string;
  currentOdoKm: number;
  status: VehicleStatus;
}): VehicleFacts => ({
  id: vehicle.id,
  registrationPlate: vehicle.registrationPlate,
  vehicleClass: vehicle.vehicleClass,
  currentOdoKm: vehicle.currentOdoKm,
  status: vehicle.status,
});
