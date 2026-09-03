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
import { WorkforceReadService } from './workforce-read.service.js';
import { WorkforceService, type ManualComponentsByDriver } from './workforce.service.js';
import {
  issueCorrectionSchema,
  openPayrollPeriodSchema,
  runPayrollSchema,
} from './workforce.schemas.js';

/**
 * LUONG LAI XE qua HTTP — VT-060, VT-061.
 *
 * KHONG co route `PATCH`/`PUT` nao tren mot phieu, va khong co `DELETE`. Do la `INV-20` viet thanh
 * hinh dang duong dan: mot phieu `DRAFT` duoc thay bang mot lan chay moi, va mot phieu DA CHOT chi
 * sua duoc bang `POST .../corrections`. Mot route khong ton tai la mot route khong ai goi nham.
 *
 * `recordedBy` cua moi khoan thu cong den tu PHIEN dang nhap (`transportActorOf`), khong tu than
 * yeu cau — xem ghi chu o `workforce.schemas.ts`.
 */
@Controller('transport/payroll')
@UseGuards(TransportActionGuard)
export class PayrollController {
  constructor(
    private readonly service: WorkforceService,
    private readonly read: WorkforceReadService,
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

  @Get('periods')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.payroll.period.read')
  async listPeriods() {
    return this.guard(async () => ({ periods: await this.read.listPeriods() }));
  }

  @Post('periods')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.payroll.period.manage')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async openPeriod(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = this.parse(openPayrollPeriodSchema, body);
    return this.guard(async () =>
      this.service.openPeriod({ ...input, createdBy: transportActorOf(request) }),
    );
  }

  @Post('periods/:periodId/close')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.payroll.period.manage')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async closePeriod(@Param('periodId') periodId: string, @Req() request: AuthenticatedRequest) {
    return this.guard(async () => this.service.closePeriod(periodId, transportActorOf(request)));
  }

  @Get('periods/:periodId/runs')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.payroll.period.read')
  async listRuns(@Param('periodId') periodId: string) {
    return this.guard(async () => ({ runs: await this.read.listRuns(periodId) }));
  }

  @Post('runs')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.payroll.run')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async runPayroll(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = this.parse(runPayrollSchema, body);
    const actor = transportActorOf(request);
    const manualComponents: ManualComponentsByDriver = Object.fromEntries(
      Object.entries(input.manualComponents ?? {}).map(([driverId, components]) => [
        driverId,
        components.map((component) => ({
          kind: component.kind,
          label: component.label,
          amount: component.amount,
          recordedBy: actor,
          note: component.note ?? null,
        })),
      ]),
    );
    return this.guard(async () =>
      this.service.runPayroll({ periodId: input.periodId, runBy: actor, manualComponents }),
    );
  }

  @Get('runs/:runId/payslips')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.payroll.period.read')
  async listPayslips(@Param('runId') runId: string) {
    return this.guard(async () => ({ payslips: await this.read.listPayslips(runId) }));
  }

  @Get('payslips/:payslipId')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.payroll.period.read')
  async payslipDetail(@Param('payslipId') payslipId: string) {
    return this.guard(async () => this.read.payslipDetail(payslipId));
  }

  @Post('payslips/:payslipId/approve')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.payslip.approve')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async approve(@Param('payslipId') payslipId: string, @Req() request: AuthenticatedRequest) {
    return this.guard(async () =>
      this.service.approvePayslip(payslipId, transportActorOf(request)),
    );
  }

  @Post('payslips/:payslipId/pay')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.payslip.pay')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async pay(@Param('payslipId') payslipId: string, @Req() request: AuthenticatedRequest) {
    return this.guard(async () => this.service.payPayslip(payslipId, transportActorOf(request)));
  }

  @Post('payslips/:payslipId/corrections')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.payslip.correct')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async correct(
    @Param('payslipId') payslipId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = this.parse(issueCorrectionSchema, body);
    const actor = transportActorOf(request);
    return this.guard(async () =>
      this.service.issueCorrection({
        payslipId,
        kind: input.kind,
        reason: input.reason,
        actor,
        components: input.components?.map((component) => ({
          kind: component.kind,
          label: component.label,
          amount: component.amount,
          recordedBy: actor,
          note: component.note ?? null,
        })),
      }),
    );
  }
}
