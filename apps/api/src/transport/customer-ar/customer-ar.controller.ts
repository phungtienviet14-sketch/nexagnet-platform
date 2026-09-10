import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
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
  requireAuthUserId,
  transportErrorToHttp,
} from '../transport-action.guard.js';
import { firstIssue } from '../transport.schemas.js';
import { CustomerArReadService } from './customer-ar-read.service.js';
import {
  allocateCustomerPaymentSchema,
  confirmCustomerOrderSchema,
  createCustomerReconciliationBatchSchema,
  customerArListQuerySchema,
  customerArSummaryQuerySchema,
  recordCustomerPaymentSchema,
  releaseCustomerPaymentAllocationSchema,
  resolveCustomerReconciliationBatchSchema,
} from './customer-ar.schemas.js';
import { CustomerArService } from './customer-ar.service.js';

/**
 * Bien HTTP cua Lane Q. Tat ca lenh ghi deu lay danh tinh tu PHIEN va bat khoa idempotency.
 * Khong route nao nhan `customerId` cho xac nhan Order: dich vu suy ra khach tu chinh Order.
 */
@Controller('transport/customer-ar')
@UseGuards(TransportActionGuard)
export class CustomerArController {
  constructor(
    private readonly service: CustomerArService,
    private readonly read: CustomerArReadService,
  ) {}

  @Get('pending')
  @Roles('ADMIN', 'ACCOUNTING')
  @RequiresTransportAction('transport.customer_reconciliation.read')
  async pending(@Query() query: unknown) {
    const input = this.parse(customerArListQuerySchema, query ?? {});
    return this.guard(async () => ({
      orders: await this.service.pendingReconciliation(input.customerId),
    }));
  }

  @Get('batches')
  @Roles('ADMIN', 'ACCOUNTING')
  @RequiresTransportAction('transport.customer_reconciliation.read')
  async batches(@Query() query: unknown) {
    const input = this.parse(customerArListQuerySchema, query ?? {});
    return this.guard(async () => ({ batches: await this.service.listBatches(input.customerId) }));
  }

  @Get('summary')
  @Roles('ADMIN', 'ACCOUNTING')
  @RequiresTransportAction('transport.customer_reconciliation.read')
  summary(@Query() query: unknown) {
    const input = this.parse(customerArSummaryQuerySchema, query ?? {});
    return this.guard(() => this.read.summary(input.asOf, input.customerId));
  }

  @Get('payments/:paymentId')
  @Roles('ADMIN', 'ACCOUNTING')
  @RequiresTransportAction('transport.customer_payment.read')
  async payment(@Param('paymentId') paymentId: string) {
    const balance = await this.guard(() => this.service.paymentBalance(paymentId));
    if (!balance) throw new NotFoundException(`Khong tim thay thanh toan ${paymentId}`);
    return balance;
  }

  @Post('orders/:orderId/confirmations')
  @Roles('ADMIN', 'ACCOUNTING')
  @RequiresTransportAction('transport.customer_reconciliation.confirm')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  confirmOrder(
    @Param('orderId') orderId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = this.parse(confirmCustomerOrderSchema, body ?? {});
    return this.guard(() =>
      this.service.confirmOrder({
        orderId,
        batchLineId: input.batchLineId ?? null,
        confirmedAmount: input.confirmedAmount,
        currencyCode: input.currencyCode,
        businessDate: input.businessDate,
        differenceReason: input.differenceReason ?? null,
        confirmationReference: input.confirmationReference ?? null,
        evidenceRefs: input.evidenceRefs,
        sourceId: input.idempotencyKey,
        actor: requireAuthUserId(request),
      }),
    );
  }

  @Post('batches')
  @Roles('ADMIN', 'ACCOUNTING')
  @RequiresTransportAction('transport.customer_reconciliation.confirm')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  createBatch(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = this.parse(createCustomerReconciliationBatchSchema, body ?? {});
    return this.guard(() =>
      this.service.createBatch({
        customerId: input.customerId,
        orderIds: input.orderIds,
        currencyCode: input.currencyCode,
        periodStart: input.periodStart ?? null,
        periodEnd: input.periodEnd ?? null,
        reference: input.reference ?? null,
        note: input.note ?? null,
        sourceId: input.idempotencyKey,
        actor: requireAuthUserId(request),
      }),
    );
  }

  @Post('batches/:batchId/resolutions')
  @Roles('ADMIN', 'ACCOUNTING')
  @RequiresTransportAction('transport.customer_reconciliation.confirm')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  resolveBatch(
    @Param('batchId') batchId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = this.parse(resolveCustomerReconciliationBatchSchema, body ?? {});
    return this.guard(() =>
      this.service.resolveBatch({
        batchId,
        decisions: input.decisions.map((decision) =>
          decision.action === 'CONFIRM'
            ? {
                lineId: decision.lineId,
                action: 'CONFIRM' as const,
                confirmedAmount: decision.confirmedAmount,
                businessDate: decision.businessDate,
                differenceReason: decision.differenceReason ?? null,
                confirmationReference: decision.confirmationReference ?? null,
                evidenceRefs: decision.evidenceRefs,
              }
            : {
                lineId: decision.lineId,
                action: 'DEFER' as const,
                reason: decision.reason,
              },
        ),
        sourceId: input.idempotencyKey,
        actor: requireAuthUserId(request),
      }),
    );
  }

  @Post('payments')
  @Roles('ADMIN', 'ACCOUNTING')
  @RequiresTransportAction('transport.customer_payment.record')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  recordPayment(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = this.parse(recordCustomerPaymentSchema, body ?? {});
    return this.guard(() =>
      this.service.recordPayment({
        customerId: input.customerId,
        amount: input.amount,
        currencyCode: input.currencyCode,
        receivedAt: input.receivedAt,
        businessDate: input.businessDate,
        externalRef: input.externalRef ?? null,
        note: input.note ?? null,
        sourceId: input.idempotencyKey,
        actor: requireAuthUserId(request),
      }),
    );
  }

  @Post('payments/:paymentId/allocations')
  @Roles('ADMIN', 'ACCOUNTING')
  @RequiresTransportAction('transport.customer_payment.allocate')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  allocatePayment(
    @Param('paymentId') paymentId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = this.parse(allocateCustomerPaymentSchema, body ?? {});
    return this.guard(() =>
      this.service.allocatePayment({
        paymentId,
        documentId: input.documentId,
        amount: input.amount,
        businessDate: input.businessDate,
        sourceId: input.idempotencyKey,
        note: input.note ?? null,
        actor: requireAuthUserId(request),
      }),
    );
  }

  @Post('allocations/:allocationId/releases')
  @Roles('ADMIN', 'ACCOUNTING')
  @RequiresTransportAction('transport.customer_payment.correct')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  releaseAllocation(
    @Param('allocationId') allocationId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = this.parse(releaseCustomerPaymentAllocationSchema, body ?? {});
    return this.guard(() =>
      this.service.releaseAllocation({
        allocationId,
        businessDate: input.businessDate,
        sourceId: input.idempotencyKey,
        note: input.note ?? null,
        actor: requireAuthUserId(request),
      }),
    );
  }

  private parse<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
    const parsed = schema.safeParse(value);
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
