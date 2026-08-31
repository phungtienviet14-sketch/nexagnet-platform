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
import { FuelReadService } from './fuel-read.service.js';
import { FuelReconciliationService } from './fuel-reconciliation.service.js';
import { FuelStatementService } from './fuel-statement.service.js';
import {
  importStatementSchema,
  reopenReconciliationSchema,
  resolveDiscrepancySchema,
} from './fuel.schemas.js';

/**
 * BANG KE + DOI SOAT qua HTTP — be mat cua Ke toan.
 *
 * ===========================================================================
 * HAI DUONG NHAP, VA DUONG THU LA MOT ROUTE THAT.
 *
 * `POST .../statements/preview` khong ghi mot hang nao — no tra ve dung ket qua ma
 * `.../statements` se ghi. Co mot route thu that su la khac biet giua "nguoi nhap thay truoc 12
 * dong hong" va "nguoi nhap phat hien 12 dong hong sau khi da tao mot bang ke khong xoa duoc".
 *
 * ===========================================================================
 * `reopen` MANG MOT HANH DONG RIENG, khong dung chung voi `close`.
 *
 * `GD-11`: dong ky la viec cuoi thang cua Ke toan; mo lai mot ky DA BAO CAO RA NGOAI la quyet dinh
 * cua Giam doc. Do la ly do `transport.fuel.reconciliation.reopen` nam trong danh sach tu choi cua
 * vai `ACCOUNTING`, giong het `transport.costing.period.reopen` cua T3.
 */
@Controller('transport/fuel')
@UseGuards(TransportActionGuard)
export class FuelReconciliationController {
  constructor(
    private readonly statements: FuelStatementService,
    private readonly reconciliation: FuelReconciliationService,
    private readonly read: FuelReadService,
  ) {}

  @Post('statements/preview')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.fuel.statement.import')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  preview(@Body() body: unknown) {
    const input = this.parse(importStatementSchema, body);
    return this.guard(() => this.statements.previewImport(input));
  }

  @Post('statements')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.fuel.statement.import')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  commit(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = this.parse(importStatementSchema, body);
    return this.guard(() => this.statements.commitImport(input, transportActorOf(request)));
  }

  @Get('reconciliations')
  @RequiresTransportAction('transport.fuel.reconciliation.read')
  list() {
    return this.guard(() => this.read.listReconciliations());
  }

  @Get('reconciliations/:id')
  @RequiresTransportAction('transport.fuel.reconciliation.read')
  workspace(@Param('id') id: string) {
    return this.guard(() => this.read.reconciliationWorkspace(id));
  }

  @Post('reconciliations/:id/match')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.fuel.reconciliation.match')
  runMatching(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.guard(() => this.reconciliation.runMatching(id, transportActorOf(request)));
  }

  @Post('discrepancies/:id/resolve')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.fuel.reconciliation.resolve')
  resolve(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = this.parse(resolveDiscrepancySchema, body);
    return this.guard(() =>
      this.reconciliation.resolveDiscrepancy(id, input, transportActorOf(request)),
    );
  }

  @Post('reconciliations/:id/close')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.fuel.reconciliation.close')
  close(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.guard(() => this.reconciliation.closeReconciliation(id, transportActorOf(request)));
  }

  /** `GD-11` — quyen RIENG. Ke toan dong duoc ky, nhung khong mo lai duoc mot ky da bao cao. */
  @Post('reconciliations/:id/reopen')
  @Roles('ADMIN')
  @RequiresTransportAction('transport.fuel.reconciliation.reopen')
  reopen(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const { reason } = this.parse(reopenReconciliationSchema, body);
    return this.guard(() =>
      this.reconciliation.reopenReconciliation(id, reason, transportActorOf(request)),
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
