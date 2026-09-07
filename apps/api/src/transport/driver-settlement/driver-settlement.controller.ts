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
import { DriverSettlementReadService } from './driver-settlement-read.service.js';
import { recordCashoutSchema, reverseCashoutSchema } from './driver-settlement.schemas.js';
import { DriverSettlementService } from './driver-settlement.service.js';

/**
 * QUYET TOAN LAI XE qua HTTP — be mat KE TOAN (`TX-07b`, Issue #237).
 *
 * KHONG co route `PATCH`/`PUT`/`DELETE` nao tren mot lan chi. Do la `INV-20` viet thanh hinh dang
 * duong dan, cung khuon `PayrollController`: sua mot lan chi da ghi chi co mot duong, va duong do
 * la `POST :id/reversal`. Mot route khong ton tai la mot route khong ai goi nham.
 *
 * `POST` chi tien di qua `transport.driver_settlement.cashout` — mot quyen RIENG. Doc bang quyet
 * toan di qua `transport.driver_settlement.read`. Gop hai ma se lam moi nguoi xem duoc bang cung
 * chuyen duoc tien.
 */
@Controller('transport/driver-settlement')
@UseGuards(TransportActionGuard)
export class DriverSettlementController {
  constructor(
    private readonly service: DriverSettlementService,
    private readonly read: DriverSettlementReadService,
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

  /** BANG DOI XE — mot dong so du cho moi lai xe dang lam viec. */
  @Get('balances')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.driver_settlement.read')
  async balances() {
    return this.guard(async () => ({ balances: await this.read.fleetBalances() }));
  }

  /** BANG CUA MOT LAI XE — bon con so, cac thang, cac lan chi kem phan bo, va canh bao cua so. */
  @Get('drivers/:driverId')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.driver_settlement.read')
  async statement(@Param('driverId') driverId: string) {
    return this.guard(() => this.read.statement(driverId));
  }

  @Post('cashouts')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.driver_settlement.cashout')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async recordCashout(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = this.parse(recordCashoutSchema, body);
    return this.guard(async () => ({
      cashout: await this.service.recordCashout(
        {
          driverId: input.driverId,
          businessDate: input.businessDate,
          method: input.method,
          reference: input.reference ?? null,
          note: input.note ?? null,
          correlationKey: input.correlationKey,
          lines: input.lines.map((line) => ({
            source: line.source,
            amount: line.amount,
            payslipId: line.payslipId ?? null,
            note: line.note ?? null,
          })),
        },
        transportActorOf(request),
      ),
    }));
  }

  /**
   * DAO — `@Roles('ADMIN')`, KHONG cap cho Ke toan.
   *
   * Cung khuon `transport.costing.period.reopen` va `transport.fuel.reconciliation.reopen`
   * (`GD-11`): ghi mot lan chi la viec hang ngay cua Ke toan, con dao mot lan chi DA VAO so quy va
   * DA hien tren bang cua lai xe la mot quyet dinh khac han ve muc do.
   */
  @Post('cashouts/:cashoutId/reversal')
  @Roles('ADMIN')
  @RequiresTransportAction('transport.driver_settlement.reverse')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async reverseCashout(
    @Param('cashoutId') cashoutId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = this.parse(reverseCashoutSchema, body);
    return this.guard(async () => ({
      cashout: await this.service.reverseCashout(
        cashoutId,
        input.reason,
        transportActorOf(request),
      ),
    }));
  }
}
