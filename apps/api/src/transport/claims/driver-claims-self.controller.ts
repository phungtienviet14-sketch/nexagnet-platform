import { BadRequestException, Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { z } from 'zod';
import { Roles } from '../../auth/roles.decorator.js';
import type { AuthenticatedRequest } from '../../auth/session.types.js';
import {
  RequiresTransportAction,
  TransportActionGuard,
  requireAuthUserId,
  transportErrorToHttp,
} from '../transport-action.guard.js';
import { transportActorOf } from '../transport-actor.js';
import { firstIssue } from '../transport.schemas.js';
import { submitSelfClaimSchema } from './claim.schemas.js';
import { ExpenseClaimService } from './claim.service.js';

/**
 * DE NGHI CHI CUA CHINH MINH -- be mat lai xe.
 *
 * KHONG co `driverId` trong than yeu cau, va do la ca diem: danh tinh den tu PHIEN
 * (`requireAuthUserId`). Neu lai xe gui duoc mot `driverId`, ho de duoc mot khoan chi vao so quy
 * cua dong nghiep.
 *
 * Va KHONG co duong duyet nao o day. Mot nguoi tu duyet de nghi cua chinh minh la dung cai ma kiem
 * soat noi bo sinh ra de chan -- cong that nam o `ExpenseClaimService.requireDecidable()`
 * (`CLAIM_REVIEWER_IS_SUBMITTER`), ma nay chi bao dam be mat lai xe khong bao gio cham toi no.
 */
@Controller('transport/me/expense-claims')
@UseGuards(TransportActionGuard)
export class DriverExpenseClaimsController {
  constructor(private readonly claims: ExpenseClaimService) {}

  @Get()
  @Roles('SALE', 'ADMIN')
  @RequiresTransportAction('transport.driver.self.expense.claim.submit')
  mine(@Req() request: AuthenticatedRequest) {
    return this.guard(() => this.claims.listForAuthUser(requireAuthUserId(request)));
  }

  @Post()
  @Roles('SALE', 'ADMIN')
  @RequiresTransportAction('transport.driver.self.expense.claim.submit')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  submit(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = this.parse(submitSelfClaimSchema, body);
    return this.guard(() =>
      this.claims.submitForAuthUser(requireAuthUserId(request), input, transportActorOf(request)),
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
