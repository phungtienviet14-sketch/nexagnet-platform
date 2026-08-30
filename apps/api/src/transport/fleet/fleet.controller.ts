import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { z } from 'zod';
import { Roles } from '../../auth/roles.decorator.js';
import type { AuthenticatedRequest } from '../../auth/session.types.js';
import {
  RequiresTransportAction,
  TransportActionGuard,
  transportErrorToHttp,
} from '../transport-action.guard.js';
import { transportActorOf } from '../transport-actor.js';
import {
  assignVehicleDriverSchema,
  createCustomerSchema,
  createDriverSchema,
  createPartnerSchema,
  createVehicleSchema,
  firstIssue,
  updateCustomerSchema,
  updateDriverSchema,
  updatePartnerSchema,
  updateVehicleSchema,
} from '../transport.schemas.js';
import { FleetService } from './fleet.service.js';

/**
 * `TX-01 Fleet` qua HTTP.
 *
 * Moi route mang HAI khai bao quyen: `@Roles` (cong as-built cua nen tang, va la thu ma
 * `roles-coverage.spec.ts` duyet) va `@RequiresTransportAction` (cong cua mien). Xem
 * `transport-action.guard.ts` de biet vi sao ca hai deu can o giai doan cau bridge `GD-22`.
 */
@Controller('transport')
@UseGuards(TransportActionGuard)
export class FleetController {
  constructor(private readonly fleet: FleetService) {}

  /* ----------------------------- Xe ----------------------------- */

  @Get('vehicles')
  @RequiresTransportAction('transport.vehicle.read')
  listVehicles() {
    return this.fleet.listVehicles();
  }

  @Get('vehicles/:id')
  @RequiresTransportAction('transport.vehicle.read')
  getVehicle(@Param('id') id: string) {
    return this.guard(() => this.fleet.getVehicle(id));
  }

  @Post('vehicles')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.vehicle.manage')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  createVehicle(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = this.parse(createVehicleSchema, body);
    return this.guard(() => this.fleet.registerVehicle(input, transportActorOf(request)));
  }

  @Patch('vehicles/:id')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.vehicle.manage')
  updateVehicle(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const patch = this.parse(updateVehicleSchema, body);
    return this.guard(() => this.fleet.updateVehicle(id, patch, transportActorOf(request)));
  }

  @Post('vehicles/:id/driver')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.vehicle.manage')
  assignDriver(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const { driverId } = this.parse(assignVehicleDriverSchema, body);
    return this.guard(() =>
      this.fleet.assignDriverToVehicle(id, driverId, transportActorOf(request)),
    );
  }

  @Get('vehicles/:id/driver-history')
  @RequiresTransportAction('transport.vehicle.read')
  vehicleAssignmentHistory(@Param('id') id: string) {
    return this.guard(() => this.fleet.vehicleAssignmentHistory(id));
  }

  /* --------------------------- Lai xe --------------------------- */

  @Get('drivers')
  @RequiresTransportAction('transport.driver.read')
  listDrivers() {
    return this.fleet.listDrivers();
  }

  @Get('drivers/:id')
  @RequiresTransportAction('transport.driver.read')
  getDriver(@Param('id') id: string) {
    return this.guard(() => this.fleet.getDriver(id));
  }

  @Post('drivers')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.driver.manage')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  createDriver(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = this.parse(createDriverSchema, body);
    return this.guard(() => this.fleet.registerDriver(input, transportActorOf(request)));
  }

  @Patch('drivers/:id')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.driver.manage')
  updateDriver(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const patch = this.parse(updateDriverSchema, body);
    return this.guard(() => this.fleet.updateDriver(id, patch, transportActorOf(request)));
  }

  /* ------------------------ Khach hang -------------------------- */

  @Get('customers')
  @RequiresTransportAction('transport.customer.read')
  listCustomers() {
    return this.fleet.listCustomers();
  }

  @Get('customers/:id')
  @RequiresTransportAction('transport.customer.read')
  getCustomer(@Param('id') id: string) {
    return this.guard(() => this.fleet.getCustomer(id));
  }

  @Post('customers')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.customer.manage')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  createCustomer(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = this.parse(createCustomerSchema, body);
    return this.guard(() => this.fleet.createCustomer(input, transportActorOf(request)));
  }

  @Patch('customers/:id')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.customer.manage')
  updateCustomer(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const patch = this.parse(updateCustomerSchema, body);
    return this.guard(() => this.fleet.updateCustomer(id, patch, transportActorOf(request)));
  }

  /* -------------------------- Doi tac --------------------------- */

  @Get('partners')
  @RequiresTransportAction('transport.partner.read')
  listPartners() {
    return this.fleet.listPartners();
  }

  @Get('partners/:id')
  @RequiresTransportAction('transport.partner.read')
  getPartner(@Param('id') id: string) {
    return this.guard(() => this.fleet.getPartner(id));
  }

  @Post('partners')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.partner.manage')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  createPartner(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = this.parse(createPartnerSchema, body);
    return this.guard(() => this.fleet.createPartner(input, transportActorOf(request)));
  }

  @Patch('partners/:id')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.partner.manage')
  updatePartner(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const patch = this.parse(updatePartnerSchema, body);
    return this.guard(() => this.fleet.updatePartner(id, patch, transportActorOf(request)));
  }

  /* --------------------------- Noi bo --------------------------- */

  private parse<S extends z.ZodType>(schema: S, body: unknown): z.infer<S> {
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(firstIssue(parsed.error));
    return parsed.data as z.infer<S>;
  }

  private async guard<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      return transportErrorToHttp(error);
    }
  }
}
