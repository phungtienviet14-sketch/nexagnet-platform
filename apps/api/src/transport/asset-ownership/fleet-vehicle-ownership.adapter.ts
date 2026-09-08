import type { FleetRepository } from '../fleet/fleet.repository.js';
import type { Vehicle } from '../transport.types.js';
import { VehicleOwnershipPort, type VehicleOwnershipFacts } from './vehicle-ownership.port.js';
import type { VehicleOperationalControl } from './asset-ownership.types.js';

const toFacts = (vehicle: Vehicle): VehicleOwnershipFacts => ({
  id: vehicle.id,
  registrationPlate: vehicle.registrationPlate,
  vehicleClass: vehicle.vehicleClass,
  status: vehicle.status,
  currentOdoKm: vehicle.currentOdoKm,
  operationalControl: vehicle.operationalControl,
  ownershipRegisterComplete: vehicle.ownershipRegisterComplete,
});

/**
 * Noi `VehicleOwnershipPort` voi kho doi xe — tang LAP RAP, khong phai tang nghiep vu.
 *
 * Cung khuon `FleetCounterpartySubjectAdapter` cua R1-A. Dich vu so huu chi thay nam phuong thuc
 * cua cong; no khong biet `FleetRepository` ton tai, nen khong co duong nao de no ghi vao bang lai
 * xe hay bang khach hang.
 *
 * `toFacts` co y CAT BOT: `allowedPayloadKg`, `createdAt`, `updatedAt` khong di qua cong. Mot cong
 * hep tra ve nguyen ban ghi thi khong con la cong hep — no chi la mot lop chuyen tiep, va lan sau
 * co nguoi them truong nhay cam vao `Vehicle` thi truong do se tu dong chay ra be mat ben huu quan.
 */
export class FleetVehicleOwnershipAdapter extends VehicleOwnershipPort {
  constructor(private readonly fleet: FleetRepository) {
    super();
  }

  async findVehicle(vehicleId: string): Promise<VehicleOwnershipFacts | null> {
    const vehicle = await this.fleet.findVehicle(vehicleId);
    return vehicle ? toFacts(vehicle) : null;
  }

  async listVehicles(): Promise<VehicleOwnershipFacts[]> {
    return (await this.fleet.listVehicles()).map(toFacts);
  }

  async setOperationalControl(
    vehicleId: string,
    control: VehicleOperationalControl,
  ): Promise<VehicleOwnershipFacts | null> {
    const updated = await this.fleet.updateVehicle(vehicleId, { operationalControl: control });
    return updated ? toFacts(updated) : null;
  }

  async setRegisterComplete(
    vehicleId: string,
    complete: boolean,
  ): Promise<VehicleOwnershipFacts | null> {
    const updated = await this.fleet.updateVehicle(vehicleId, {
      ownershipRegisterComplete: complete,
    });
    return updated ? toFacts(updated) : null;
  }

  async activeDriverName(vehicleId: string): Promise<string | null> {
    const assignments = await this.fleet.listVehicleDriverAssignments(vehicleId);
    const active = assignments.find((row) => row.effectiveTo === null);
    if (!active) return null;
    const driver = await this.fleet.findDriver(active.driverId);
    return driver?.fullName ?? null;
  }
}
