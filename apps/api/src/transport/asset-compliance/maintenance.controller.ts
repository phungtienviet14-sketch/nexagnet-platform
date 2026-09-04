import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
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
import { AssetComplianceReadService } from './asset-compliance-read.service.js';
import { AssetComplianceService } from './asset-compliance.service.js';
import {
  cancelWorkOrderSchema,
  completeWorkOrderSchema,
  createMaintenancePlanSchema,
  openWorkOrderSchema,
  updateMaintenancePlanSchema,
} from './asset-compliance.schemas.js';

/**
 * BAO DUONG qua HTTP — be mat VAN HANH (Giam doc / Ke toan).
 *
 * KHONG co route `DELETE` cho lenh sua, cung tinh than `GD-02`: mot lenh da tung khoa xe la mot su
 * kien van hanh. Duong go la `POST .../cancel`, va no de lai ly do cung nguoi huy.
 *
 * KHONG co route nao ghi `TransportVehicle.status`. Trang thai xe la DAN XUAT (T1 §7.2); mo/dong
 * mot lenh sua la tat ca nhung gi can, va phep hop thanh doc ra phan con lai.
 */
@Controller('transport/maintenance')
@UseGuards(TransportActionGuard)
export class MaintenanceController {
  constructor(
    private readonly service: AssetComplianceService,
    private readonly read: AssetComplianceReadService,
  ) {}

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

  @Get('plans')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.maintenance.plan.read')
  async listPlans(@Query('vehicleId') vehicleId?: string) {
    return this.guard(async () => ({ plans: await this.read.listPlans(vehicleId) }));
  }

  @Post('plans')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.maintenance.plan.manage')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async createPlan(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = this.parse(createMaintenancePlanSchema, body);
    return this.guard(async () =>
      this.service.schedulePlan({
        vehicleId: input.vehicleId,
        name: input.name,
        triggerKind: input.triggerKind,
        intervalKm: input.intervalKm ?? null,
        intervalDays: input.intervalDays ?? null,
        baselineOdoKm: input.baselineOdoKm,
        baselineDate: input.baselineDate,
        createdBy: transportActorOf(request),
      }),
    );
  }

  @Patch('plans/:planId')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.maintenance.plan.manage')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async updatePlan(@Param('planId') planId: string, @Body() body: unknown) {
    const patch = this.parse(updateMaintenancePlanSchema, body);
    return this.guard(async () => this.service.updatePlan(planId, patch));
  }

  @Get('due')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.maintenance.plan.read')
  async due(@Query('vehicleId') vehicleId?: string) {
    return this.guard(async () => ({ due: await this.read.maintenanceDue(vehicleId) }));
  }

  @Get('work-orders')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.maintenance.plan.read')
  async listWorkOrders(@Query('vehicleId') vehicleId?: string) {
    return this.guard(async () => ({ workOrders: await this.read.listWorkOrders(vehicleId) }));
  }

  @Post('work-orders')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.maintenance.work_order.open')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async openWorkOrder(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = this.parse(openWorkOrderSchema, body);
    return this.guard(async () =>
      this.service.openWorkOrder({
        vehicleId: input.vehicleId,
        planId: input.planId,
        description: input.description,
        openedDate: input.openedDate,
        openedOdoKm: input.openedOdoKm,
        openedBy: transportActorOf(request),
        note: input.note ?? null,
      }),
    );
  }

  @Post('work-orders/:workOrderId/complete')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.maintenance.work_order.close')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async completeWorkOrder(
    @Param('workOrderId') workOrderId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = this.parse(completeWorkOrderSchema, body);
    return this.guard(async () =>
      this.service.completeWorkOrder(workOrderId, {
        completedDate: input.completedDate,
        completedOdoKm: input.completedOdoKm,
        completedBy: transportActorOf(request),
        completedAt: new Date(),
        costAmount: input.costAmount ?? null,
        costingExpenseRef: input.costingExpenseRef ?? null,
        note: input.note ?? null,
      }),
    );
  }

  @Post('work-orders/:workOrderId/cancel')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.maintenance.work_order.close')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async cancelWorkOrder(
    @Param('workOrderId') workOrderId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = this.parse(cancelWorkOrderSchema, body);
    return this.guard(async () =>
      this.service.cancelWorkOrder(workOrderId, {
        cancelledBy: transportActorOf(request),
        cancelledAt: new Date(),
        reason: input.reason,
      }),
    );
  }
}
