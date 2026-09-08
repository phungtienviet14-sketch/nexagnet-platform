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
import {
  cancelSchema,
  createOrderSchema,
  orderTransitionSchema,
  updateOrderSchema,
} from './movement.schemas.js';
import { MovementService } from './movement.service.js';

/**
 * NGHIA VU THUONG MAI qua HTTP.
 *
 * Truc nay doc lap voi `/transport/runs`: mot don ton tai truoc khi biet xe nao chay no. Cung
 * khuon hai lop quyen nhu cac controller khac cua mien.
 */
@Controller('transport/orders')
@UseGuards(TransportActionGuard)
export class TransportOrdersController {
  constructor(private readonly movement: MovementService) {}

  @Get()
  @RequiresTransportAction('transport.order.read')
  list() {
    return this.movement.listOrders();
  }

  /**
   * NGHIA VU THUONG MAI cua mot chuyen v1 -- `null` khi chua chieu.
   *
   * Dat TRUOC `@Get(':id')`: Nest so khop theo thu tu khai bao, nen mot duong tinh phai dung truoc
   * duong co tham so, neu khong `projections` se bi doc thanh mot ma don.
   */
  @Get('projections/trip/:tripId')
  @RequiresTransportAction('transport.order.read')
  projection(@Param('tripId') tripId: string) {
    return this.guard(() => this.movement.findOrderProjection(tripId));
  }

  /**
   * CHIEU THUONG MAI mot chuyen v1 sang mot nghia vu -- TAT DINH va LAP LAI DUOC.
   *
   * Duong nay ton tai vi `#275` K5 dat cong doi soat len DON: mot chuyen chua co nghia vu thuong
   * mai thi khong co chu the de ke toan ket thuc, va cong se dong. Khac voi
   * `POST /transport/runs/projections/trip/:tripId`, duong nay KHONG doi chuyen phai chay bang xe
   * cua minh -- xem `planOrderProjection`.
   */
  @Post('projections/trip/:tripId')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.order.manage')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  project(@Param('tripId') tripId: string, @Req() request: AuthenticatedRequest) {
    return this.guard(() => this.movement.projectTripOrder(tripId, transportActorOf(request)));
  }

  @Get(':id')
  @RequiresTransportAction('transport.order.read')
  get(@Param('id') id: string) {
    return this.guard(() => this.movement.getOrder(id));
  }

  /** Chang dang phuc vu don nay -- cach doc "don nay dang di den dau". */
  @Get(':id/legs')
  @RequiresTransportAction('transport.order.read')
  legs(@Param('id') id: string) {
    return this.guard(async () => {
      await this.movement.getOrder(id);
      return this.movement.legsOfOrder(id);
    });
  }

  @Post()
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.order.manage')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  create(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = this.parse(createOrderSchema, body);
    return this.guard(() => this.movement.createOrder(input, transportActorOf(request)));
  }

  @Patch(':id')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.order.manage')
  update(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const patch = this.parse(updateOrderSchema, body);
    return this.guard(() => this.movement.updateOrder(id, patch, transportActorOf(request)));
  }

  @Post(':id/transition')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.order.manage')
  transition(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const { to } = this.parse(orderTransitionSchema, body);
    return this.guard(() => this.movement.transitionOrder(id, to, transportActorOf(request)));
  }

  /** Huy di duong RIENG: no doi mot ly do bang chu, va `GD-02` cam xoa. */
  @Post(':id/cancel')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.order.manage')
  cancel(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const { reason } = this.parse(cancelSchema, body);
    return this.guard(() => this.movement.cancelOrder(id, reason, transportActorOf(request)));
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
