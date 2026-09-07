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
import {
  addLegSchema,
  assignRunSchema,
  cancelSchema,
  createRunSchema,
  runTransitionSchema,
} from './movement.schemas.js';
import { MovementService } from './movement.service.js';
import { summariseRunDistance } from './run-distance.js';

/**
 * VONG CHAY VAT LY qua HTTP.
 *
 * `GET :id/distance` la be mat ma R8 analytics se doc. No tra ca con so LAN dau day du hay khong
 * (`complete`) -- vi mot ty le rong tinh tren du lieu khuyet trong y het mot ty le that.
 */
@Controller('transport/runs')
@UseGuards(TransportActionGuard)
export class RunsController {
  constructor(private readonly movement: MovementService) {}

  @Get()
  @RequiresTransportAction('transport.run.read')
  list() {
    return this.movement.listRuns();
  }

  /** Doc phep chieu cua mot chuyen v1 -- `null` khi chua chieu. */
  @Get('projections/trip/:tripId')
  @RequiresTransportAction('transport.run.read')
  projection(@Param('tripId') tripId: string) {
    return this.guard(() => this.movement.findProjection(tripId));
  }

  /** TAT DINH va LAP LAI DUOC: goi hai lan tren cung mot chuyen tra ve cung mot ket qua. */
  @Post('projections/trip/:tripId')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.run.manage')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  project(@Param('tripId') tripId: string, @Req() request: AuthenticatedRequest) {
    return this.guard(() => this.movement.projectTrip(tripId, transportActorOf(request)));
  }

  @Get(':id')
  @RequiresTransportAction('transport.run.read')
  get(@Param('id') id: string) {
    return this.guard(() => this.movement.getRun(id));
  }

  @Get(':id/distance')
  @RequiresTransportAction('transport.run.read')
  distance(@Param('id') id: string) {
    return this.guard(async () => summariseRunDistance((await this.movement.getRun(id)).legs));
  }

  @Get(':id/assignments')
  @RequiresTransportAction('transport.run.read')
  assignments(@Param('id') id: string) {
    return this.guard(async () => {
      await this.movement.getRun(id);
      return this.movement.runAssignmentHistory(id);
    });
  }

  @Post()
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.run.manage')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  create(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = this.parse(createRunSchema, body);
    return this.guard(() => this.movement.createRun(input, transportActorOf(request)));
  }

  @Post(':id/legs')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.run.manage')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  addLeg(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = this.parse(addLegSchema, body);
    return this.guard(() => this.movement.addLeg(id, input, transportActorOf(request)));
  }

  @Post(':id/assignment')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.run.manage')
  assign(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = this.parse(assignRunSchema, body);
    return this.guard(() => this.movement.assignRun(id, input, transportActorOf(request)));
  }

  @Post(':id/transition')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.run.manage')
  transition(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const { to } = this.parse(runTransitionSchema, body);
    return this.guard(() => this.movement.transitionRun(id, to, transportActorOf(request)));
  }

  @Post(':id/cancel')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.run.manage')
  cancel(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const { reason } = this.parse(cancelSchema, body);
    return this.guard(() => this.movement.cancelRun(id, reason, transportActorOf(request)));
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
