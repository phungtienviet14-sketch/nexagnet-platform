import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
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
import {
  approveClaimSchema,
  claimListQuerySchema,
  rejectClaimSchema,
  submitClaimSchema,
} from './claim.schemas.js';
import { ExpenseClaimService } from './claim.service.js';

/**
 * DE NGHI CHI qua HTTP -- BE MAT VAN HANH.
 *
 * Duyet va tu choi la HAI duong rieng, khong phai mot `PATCH { status }`. Mot lan duyet mang so
 * tien va mot ma ly do; mot lan tu choi thi khong -- ep ca hai qua mot than yeu cau se lam moi
 * kiem tra o tang mien phai doan xem nguoi goi dinh lam gi.
 */
@Controller('transport/expense-claims')
@UseGuards(TransportActionGuard)
export class ExpenseClaimsController {
  constructor(private readonly claims: ExpenseClaimService) {}

  @Get()
  @RequiresTransportAction('transport.expense.claim.read')
  list(@Query() query: unknown) {
    const filter = this.parse(claimListQuerySchema, query ?? {});
    return this.claims.list(filter);
  }

  @Get(':id')
  @RequiresTransportAction('transport.expense.claim.read')
  get(@Param('id') id: string) {
    return this.guard(() => this.claims.get(id));
  }

  /** Ke toan nhap ho la mot viec co that -- nen be mat van hanh co `driverId` trong than. */
  @Post()
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.expense.claim.submit')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  submit(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = this.parse(submitClaimSchema, body);
    return this.guard(() => this.claims.submit(input, transportActorOf(request)));
  }

  @Post(':id/approve')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.expense.claim.review')
  approve(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = this.parse(approveClaimSchema, body);
    return this.guard(() => this.claims.approve(id, input, transportActorOf(request)));
  }

  @Post(':id/reject')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.expense.claim.review')
  reject(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = this.parse(rejectClaimSchema, body);
    return this.guard(() => this.claims.reject(id, input, transportActorOf(request)));
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
