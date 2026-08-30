import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { z } from 'zod';
import { Roles } from '../../auth/roles.decorator.js';
import {
  RequiresTransportAction,
  TransportActionGuard,
  transportErrorToHttp,
} from '../transport-action.guard.js';
import { firstIssue } from '../transport.schemas.js';
import { CostingReadService } from './costing-read.service.js';
import { CostingService } from './costing.service.js';
import {
  adjustFundSchema,
  openFundPeriodSchema,
  postFundMovementSchema,
  reopenFundPeriodSchema,
  reversalSchema,
} from './costing.schemas.js';
import { FundPeriodService } from './fund-period.service.js';

const actorName = (actor: string): string => actor.trim() || 'operator';

/**
 * SO QUY LAI XE + KY QUYET TOAN qua HTTP — be mat VAN HANH.
 *
 * BA DUONG GHI TIEN tach thanh BA ROUTE (`advances` / `returns` / `adjustments`) thay vi mot route
 * nhan mot truong `kind`. Ly do khong phai tham my: moi route mang mot HANH DONG rieng, nen bang
 * phan quyen noi duoc "ai duoc ung tien" tach khoi "ai duoc dieu chinh kiem ke". Voi mot route
 * chung thi hai cau hoi do co chung mot cau tra loi mai mai.
 *
 * KHONG co `PATCH`/`DELETE` cho but toan — `INV-20`.
 */
@Controller('transport/costing/driver-fund')
@UseGuards(TransportActionGuard)
export class DriverFundController {
  constructor(
    private readonly costing: CostingService,
    private readonly read: CostingReadService,
    private readonly periods: FundPeriodService,
  ) {}

  @Get('accounts/:driverId')
  @RequiresTransportAction('transport.costing.driver_fund.read')
  statement(@Param('driverId') driverId: string) {
    return this.guard(() => this.read.driverFundStatement(driverId));
  }

  @Get('accounts/:driverId/periods')
  @RequiresTransportAction('transport.costing.period.read')
  listPeriods(@Param('driverId') driverId: string) {
    return this.guard(() => this.periods.listPeriods(driverId));
  }

  @Post('advances')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.costing.driver_fund.advance')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  advance(@Body() body: unknown, @Headers('x-actor') actor = 'operator') {
    const input = this.parse(postFundMovementSchema, body);
    return this.guard(() => this.costing.postAdvance(input, actorName(actor)));
  }

  @Post('returns')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.costing.driver_fund.return')
  returnCash(@Body() body: unknown, @Headers('x-actor') actor = 'operator') {
    const input = this.parse(postFundMovementSchema, body);
    return this.guard(() => this.costing.postReturn(input, actorName(actor)));
  }

  @Post('adjustments')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.costing.driver_fund.adjust')
  adjust(@Body() body: unknown, @Headers('x-actor') actor = 'operator') {
    const input = this.parse(adjustFundSchema, body);
    return this.guard(() => this.costing.postAdjustment(input, actorName(actor)));
  }

  @Post('entries/:id/reversal')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.costing.reversal.post')
  reverseEntry(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('x-actor') actor = 'operator',
  ) {
    const { reason } = this.parse(reversalSchema, body);
    return this.guard(() => this.costing.reverseFundEntry(id, reason, actorName(actor)));
  }

  @Post('periods')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.costing.period.manage')
  openPeriod(@Body() body: unknown, @Headers('x-actor') actor = 'operator') {
    const input = this.parse(openFundPeriodSchema, body);
    return this.guard(() => this.periods.openPeriod(input, actorName(actor)));
  }

  @Post('periods/:id/close')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.costing.period.manage')
  closePeriod(@Param('id') id: string, @Headers('x-actor') actor = 'operator') {
    return this.guard(() => this.periods.closePeriod(id, actorName(actor)));
  }

  /**
   * `@Roles('ADMIN')` chu khong phai `ACCOUNTING`, va hanh dong cung la mot ma RIENG.
   *
   * Hai tang phai noi cung mot dieu (`GD-11`: mo lai can quyen rieng) — lech nhau thi mot trong hai
   * la cong that va cai kia chi la trang tri. Cung ly le da dung cho `POST trips/:id/cancel` o T2.
   */
  @Post('periods/:id/reopen')
  @Roles('ADMIN')
  @RequiresTransportAction('transport.costing.period.reopen')
  reopenPeriod(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('x-actor') actor = 'operator',
  ) {
    const { reason } = this.parse(reopenFundPeriodSchema, body);
    return this.guard(() => this.periods.reopenPeriod(id, reason, actorName(actor)));
  }

  @Get('periods/:id/snapshots')
  @RequiresTransportAction('transport.costing.period.read')
  snapshots(@Param('id') id: string) {
    return this.guard(() => this.periods.listSnapshots(id));
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
