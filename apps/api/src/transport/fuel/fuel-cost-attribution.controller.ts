import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
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
import { FuelCostAttributionReadService } from './fuel-cost-attribution-read.service.js';
import { FuelCostAttributionService } from './fuel-cost-attribution.service.js';
import type {
  FuelEntryCostAttributionView,
  FuelRunCostAttributionReport,
} from './fuel-cost-attribution.js';
import {
  recordFuelCostAttributionSchema,
  reverseFuelCostAttributionSchema,
} from './fuel.schemas.js';

/**
 * PHAN BO GIA THANH NHIEN LIEU qua HTTP — be mat KE TOAN, `#364`.
 *
 * Hai duong DOC dung lai `transport.fuel.entry.read` (cung du lieu phieu, chi khac cach hoi); hai
 * duong GHI mang mot ma RIENG `transport.fuel.cost_attribution.record`, vi phan bo gia thanh la mot
 * QUYET DINH TIEN khac voi duyet mot chung tu — mot khach co the muon nguoi duyet phieu khong phai
 * nguoi chia gia thanh.
 *
 * KHONG co route `DELETE`/`PATCH`: sua mot phan bo la `POST .../reverse` roi cap phat lai. Mot route
 * khong ton tai la mot route khong ai goi nham. Lai xe (`SALE`) khong co ma nao o day — be mat lai xe
 * khong bao gio thay gia thanh.
 */
@Controller('transport/fuel')
@UseGuards(TransportActionGuard)
export class FuelCostAttributionController {
  constructor(
    private readonly attribution: FuelCostAttributionService,
    private readonly read: FuelCostAttributionReadService,
  ) {}

  @Get('entries/:id/cost-attribution')
  @RequiresTransportAction('transport.fuel.entry.read')
  viewForEntry(@Param('id') id: string): Promise<FuelEntryCostAttributionView> {
    return this.guard(() => this.read.viewForEntry(id));
  }

  @Post('entries/:id/cost-attributions')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.fuel.cost_attribution.record')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  attribute(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<FuelEntryCostAttributionView> {
    const input = this.parse(recordFuelCostAttributionSchema, body);
    return this.guard(() => this.attribution.attribute(id, input, transportActorOf(request)));
  }

  @Post('cost-attributions/:id/reverse')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.fuel.cost_attribution.record')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  reverse(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<FuelEntryCostAttributionView> {
    const { reason } = this.parse(reverseFuelCostAttributionSchema, body);
    return this.guard(() => this.attribution.reverse(id, reason, transportActorOf(request)));
  }

  /** BAO CAO nhien lieu cua MOT vong chay — cac dong phan bo dang hieu luc, theo chang. */
  @Get('runs/:runId/cost-attribution')
  @RequiresTransportAction('transport.fuel.entry.read')
  reportForRun(@Param('runId') runId: string): Promise<FuelRunCostAttributionReport> {
    return this.guard(() => this.read.reportForRun(runId));
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
