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
import { firstIssue } from '../transport.schemas.js';
import { FuelReadService } from './fuel-read.service.js';
import { FuelService } from './fuel.service.js';
import {
  amendFuelEntrySchema,
  attachFuelEvidenceSchema,
  rejectFuelEntrySchema,
  submitFuelEntrySchema,
} from './fuel.schemas.js';

/**
 * PHIEU DO DAU qua HTTP — be mat VAN HANH (Giam doc / Ke toan).
 *
 * KHONG co route `DELETE`, va do la `GD-10` duoc viet thanh hinh dang duong dan: sua mot phieu da
 * duoc tin la viet lai lich su, nen duong duy nhat la `PATCH` khi con `DECLARED`, hoac dao khoan
 * chi ben `TX-03`. Mot route khong ton tai la mot route khong ai goi nham.
 *
 * `POST .../verify` chay lai duoc bao nhieu lan cung duoc — xem `FuelService.verifyFuelEntry()`:
 * no la duong SUA cho truong hop phieu da duyet ma chi phi chua kip vao gia thanh chuyen.
 */
@Controller('transport/fuel')
@UseGuards(TransportActionGuard)
export class FuelEntriesController {
  constructor(
    private readonly fuel: FuelService,
    private readonly read: FuelReadService,
  ) {}

  @Get('suppliers')
  @RequiresTransportAction('transport.fuel.entry.read')
  listSuppliers() {
    return this.guard(() => this.read.listSuppliers());
  }

  @Get('trips/:tripId/entries')
  @RequiresTransportAction('transport.fuel.entry.read')
  listByTrip(@Param('tripId') tripId: string) {
    return this.guard(() => this.read.listTripFuelEntries(tripId));
  }

  @Get('entries/:id')
  @RequiresTransportAction('transport.fuel.entry.read')
  detail(@Param('id') id: string) {
    return this.guard(() => this.read.fuelEntryDetail(id));
  }

  /**
   * Nop HO mot phieu — duong cua Ke toan khi lai xe dua phieu giay.
   *
   * Khac han duong cua lai xe (`DriverFuelController`): o day `driverId` la mot truong cua than yeu
   * cau, va do la hop le vi nguoi goi CO quyen van hanh. Cong chan mot lan go nham van la
   * `FUEL_ENTRY_DRIVER_NOT_ASSIGNED` o service.
   */
  @Post('entries')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.fuel.entry.submit_for_driver')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  submit(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = this.parse(submitFuelEntrySchema, body);
    return this.guard(() => this.fuel.submitFuelEntry(input, transportActorOf(request)));
  }

  @Patch('entries/:id')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.fuel.entry.submit_for_driver')
  amend(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = this.parse(amendFuelEntrySchema, body);
    return this.guard(() => this.fuel.amendFuelEntry(id, input, transportActorOf(request)));
  }

  @Post('entries/:id/evidence')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.fuel.entry.submit_for_driver')
  attachEvidence(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = this.parse(attachFuelEvidenceSchema, body);
    return this.guard(() => this.fuel.attachEvidence(id, input, transportActorOf(request)));
  }

  @Post('entries/:id/verify')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.fuel.entry.verify')
  verify(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.guard(() => this.fuel.verifyFuelEntry(id, transportActorOf(request)));
  }

  @Post('entries/:id/reject')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.fuel.entry.verify')
  reject(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const { reason } = this.parse(rejectFuelEntrySchema, body);
    return this.guard(() => this.fuel.rejectFuelEntry(id, reason, transportActorOf(request)));
  }

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
