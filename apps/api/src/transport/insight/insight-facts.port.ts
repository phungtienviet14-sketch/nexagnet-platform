import { Injectable } from '@nestjs/common';
import { FleetRepository } from '../fleet/fleet.repository.js';
import { MovementRepository } from '../movement/movement.repository.js';
import type { Order, RunLeg, VehicleRun } from '../movement/movement.types.js';
import type { Vehicle } from '../transport.types.js';

/**
 * CUA SO cua bang doi xe + bao cao tuyen. CHI DOC.
 *
 * Cung khuon `control-tower-facts.port.ts` va `journey-facts.port.ts`, va cung mot ly le CAU TRUC
 * (T1 §4.1 luat 4): khong mot ham ghi nao ton tai o day, nen cau "bao cao khong bao gio ghi" la
 * mot dieu kien BIEN DICH chu khong phai mot loi khuyen.
 *
 * MOT cong duy nhat, va no di cung `transport-core`: ca hai bao cao chi doc vong chay, chang, xe va
 * don — bon thu deu thuoc `transport-core`. Khong co cong tuy chon nao, nen cung khong co
 * `unavailableSources`: khong co gi de vang mat.
 */
export abstract class InsightCoreFacts {
  abstract listRuns(): Promise<readonly VehicleRun[]>;
  abstract listLegs(runId: string): Promise<readonly RunLeg[]>;
  abstract listVehicles(): Promise<readonly Vehicle[]>;
  abstract listOrders(): Promise<readonly Order[]>;
}

@Injectable()
export class InsightCoreFactsAdapter extends InsightCoreFacts {
  constructor(
    private readonly movement: MovementRepository,
    private readonly fleet: FleetRepository,
  ) {
    super();
  }

  listRuns(): Promise<readonly VehicleRun[]> {
    return this.movement.listRuns();
  }

  listLegs(runId: string): Promise<readonly RunLeg[]> {
    return this.movement.listLegs(runId);
  }

  listVehicles(): Promise<readonly Vehicle[]> {
    return this.fleet.listVehicles();
  }

  listOrders(): Promise<readonly Order[]> {
    return this.movement.listOrders();
  }
}
