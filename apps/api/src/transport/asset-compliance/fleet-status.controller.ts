import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { Roles } from '../../auth/roles.decorator.js';
import {
  RequiresTransportAction,
  TransportActionGuard,
  transportErrorToHttp,
} from '../transport-action.guard.js';
import { AssetComplianceReadService } from './asset-compliance-read.service.js';
import { operationalConflictsOnly } from './effective-vehicle-state.js';

/**
 * TRANG THAI HIEU LUC cua doi xe — VT-070 ("bang dieu khien"), T1 §7.2 + §18.2.
 *
 * CHI DOC, va do la ca thiet ke. Khong co route nao dat trang thai xe: `ON_TRIP` la DAN XUAT tu
 * chuyen dang chay, va mo mot lenh sua la duong duy nhat dat `UNDER_MAINTENANCE`. Mot route
 * `PUT /vehicles/:id/status` se lam dung cai troi ma phep hop thanh nay sinh ra de chua.
 */
@Controller('transport/fleet-status')
@UseGuards(TransportActionGuard)
export class FleetStatusController {
  constructor(private readonly read: AssetComplianceReadService) {}

  private async guard<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      return transportErrorToHttp(error);
    }
  }

  @Get()
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.fleet_status.read')
  async fleetStatus() {
    return this.guard(async () => {
      const vehicles = await this.read.effectiveFleetStatus();
      return { vehicles, conflicts: operationalConflictsOnly(vehicles) };
    });
  }

  @Get(':vehicleId')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.fleet_status.read')
  async vehicleStatus(@Param('vehicleId') vehicleId: string) {
    return this.guard(async () => {
      const state = await this.read.effectiveVehicleState(vehicleId);
      if (!state) throw new NotFoundException(`Khong tim thay xe ${vehicleId}`);
      return state;
    });
  }
}
