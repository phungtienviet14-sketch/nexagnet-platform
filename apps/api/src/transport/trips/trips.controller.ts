import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
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
  assignTripSchema,
  cancelTripSchema,
  firstIssue,
  planTripSchema,
  transitionTripSchema,
  updateTripSchema,
} from '../transport.schemas.js';
import { TripService } from './trip.service.js';

/**
 * `TX-02 Trip Operations` qua HTTP — be mat VAN HANH (Giam doc / Ke toan).
 *
 * KHONG co route `DELETE` nao: `GD-02` bo duong xoa cung, va "xoa" tren giao dien anh xa sang
 * `POST /transport/trips/:id/cancel`. Mot route xoa khong ton tai la mot route khong ai goi nham.
 */
@Controller('transport/trips')
@UseGuards(TransportActionGuard)
export class TripsController {
  constructor(private readonly trips: TripService) {}

  @Get()
  @RequiresTransportAction('transport.trip.read')
  list() {
    return this.trips.listTrips();
  }

  @Get(':id')
  @RequiresTransportAction('transport.trip.read')
  get(@Param('id') id: string) {
    return this.guard(() => this.trips.getTrip(id));
  }

  @Get(':id/assignments')
  @RequiresTransportAction('transport.trip.read')
  assignments(@Param('id') id: string) {
    return this.guard(() => this.trips.assignmentHistory(id));
  }

  @Post()
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.trip.create')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  plan(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers('x-actor') claimedActor?: string,
  ) {
    const input = this.parse(planTripSchema, body);
    return this.guard(() => this.trips.planTrip(input, transportActorOf(request, claimedActor)));
  }

  @Patch(':id')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.trip.update')
  update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers('x-actor') claimedActor?: string,
  ) {
    const patch = this.parse(updateTripSchema, body);
    return this.guard(() =>
      this.trips.updateTrip(id, patch, transportActorOf(request, claimedActor)),
    );
  }

  @Post(':id/assignment')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.trip.assign')
  assign(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers('x-actor') claimedActor?: string,
  ) {
    const input = this.parse(assignTripSchema, body);
    return this.guard(() => this.trips.assign(id, input, transportActorOf(request, claimedActor)));
  }

  @Post(':id/transition')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.trip.transition')
  transition(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers('x-actor') claimedActor?: string,
  ) {
    const { to } = this.parse(transitionTripSchema, body);
    return this.guard(() => this.trips.transition(id, to, transportActorOf(request, claimedActor)));
  }

  /**
   * `@Roles('ADMIN')` chu khong phai `ACCOUNTING`: VT-082 noi Ke toan "khong xoa du lieu", va
   * `transport-actions.ts` cung cat `transport.trip.cancel` khoi vai do. Hai tang phai noi cung
   * mot dieu — lech nhau thi mot trong hai la cong that va cai kia chi la trang tri.
   */
  @Post(':id/cancel')
  @Roles('ADMIN')
  @RequiresTransportAction('transport.trip.cancel')
  cancel(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers('x-actor') claimedActor?: string,
  ) {
    const { reason } = this.parse(cancelTripSchema, body);
    return this.guard(() => this.trips.cancel(id, reason, transportActorOf(request, claimedActor)));
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
