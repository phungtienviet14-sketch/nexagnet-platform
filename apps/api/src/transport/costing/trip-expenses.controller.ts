import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
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
import { CostingReadService } from './costing-read.service.js';
import { CostingService } from './costing.service.js';
import { recordTripExpenseSchema, reversalSchema } from './costing.schemas.js';

/**
 * GIA THANH CHUYEN qua HTTP — be mat VAN HANH (Giam doc / Ke toan).
 *
 * KHONG co route `DELETE` va KHONG co route `PATCH`: `INV-20` bo ca hai duong sua lich su tai
 * chinh. "Xoa khoan chi" tren giao dien anh xa sang `POST .../reversal`. Mot route khong ton tai la
 * mot route khong ai goi nham — cung ly le da dung cho `CancelTrip` o T2.
 */
@Controller('transport/costing')
@UseGuards(TransportActionGuard)
export class TripExpensesController {
  constructor(
    private readonly costing: CostingService,
    private readonly read: CostingReadService,
  ) {}

  @Get('trips/:tripId/expenses')
  @RequiresTransportAction('transport.costing.expense.read')
  breakdown(@Param('tripId') tripId: string) {
    return this.guard(() => this.read.tripCostBreakdown(tripId));
  }

  @Post('expenses')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.costing.expense.record')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  record(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers('x-actor') claimedActor?: string,
  ) {
    const input = this.parse(recordTripExpenseSchema, body);
    return this.guard(() =>
      this.costing.recordTripExpense(input, transportActorOf(request, claimedActor)),
    );
  }

  /**
   * DAO mot khoan chi — va cung dao dong quy sinh doi cua no, neu co.
   *
   * Route nam tren khoan chi vi do la thu nguoi dung nhin thay; nhung `CostingService` dao theo
   * KHOA CUA SU KIEN, nen ca hai lop cung bien mat trong mot giao dich (`INV-03`).
   */
  @Post('expenses/:id/reversal')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.costing.reversal.post')
  reverse(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers('x-actor') claimedActor?: string,
  ) {
    const { reason } = this.parse(reversalSchema, body);
    return this.guard(() =>
      this.costing.reverseExpense(id, reason, transportActorOf(request, claimedActor)),
    );
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
