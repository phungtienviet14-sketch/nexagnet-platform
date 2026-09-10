import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../business-date.js';
import { money } from '../money.js';
import { settlementDocumentFingerprint } from '../settlement/settlement-documents.js';
import { SettlementOrderCompletionGate } from '../settlement/settlement-order-completion.port.js';
import { SettlementRepository } from '../settlement/settlement.repository.js';
import { dueDateFrom } from '../settlement/settlement-terms.js';
import { TransportDomainError } from '../transport.errors.js';
import {
  customerPaymentAllocationFingerprint,
  customerPaymentFingerprint,
  customerReconciliationBatchFingerprint,
  customerReconciliationFingerprint,
  differenceAmount,
} from './customer-ar-documents.js';
import { CustomerArRepository } from './customer-ar.repository.js';
import type {
  CustomerPayment,
  CustomerPaymentAllocation,
  CustomerPaymentBalance,
  CustomerReconciliation,
  CustomerReconciliationBatch,
  PendingReconciliationOrder,
} from './customer-ar.types.js';

export interface ConfirmCustomerOrderInput {
  readonly orderId: string;
  readonly batchLineId?: string | null;
  readonly confirmedAmount: number;
  readonly currencyCode?: string;
  readonly businessDate: BusinessDate;
  readonly differenceReason?: string | null;
  readonly confirmationReference?: string | null;
  readonly evidenceRefs?: readonly string[];
  readonly sourceId: string;
  readonly actor: string;
}

@Injectable()
export class CustomerArService {
  constructor(
    private readonly repository: CustomerArRepository,
    private readonly settlement: SettlementRepository,
    private readonly completion: SettlementOrderCompletionGate,
  ) {}

  pendingReconciliation(customerId?: string): Promise<PendingReconciliationOrder[]> {
    return this.repository.pendingOrders(customerId);
  }

  async confirmOrder(input: ConfirmCustomerOrderInput): Promise<{ readonly reconciliation: CustomerReconciliation; readonly replayed: boolean }> {
    const confirmedAmount = money(input.confirmedAmount).amount;
    if (confirmedAmount <= 0) throw TransportDomainError.invalid('MONEY_INVALID', 'So tien A xac nhan phai duong');

    const eligibility = await this.completion.eligibilityForOrder(input.orderId);
    if (eligibility.kind === 'NO_ORDER') throw TransportDomainError.notFound('CUSTOMER_AR_ORDER_NOT_FOUND', `Khong thay don ${input.orderId}`);
    if (eligibility.kind !== 'ELIGIBLE') throw TransportDomainError.denied('CUSTOMER_AR_ORDER_NOT_ELIGIBLE', 'Don chua FULFILLED va duoc phe duyet nghiem thu');
    const pending = (await this.repository.pendingOrders()).find((entry) => entry.orderId === input.orderId);
    const replay = await this.repository.findReconciliationByOrder(input.orderId);
    if (!pending && !replay) throw TransportDomainError.denied('CUSTOMER_AR_ORDER_NOT_ELIGIBLE', 'Don khong nam trong hang doi doi soat');
    const proposedAmount = pending?.proposedAmount ?? replay!.proposedAmount;
    const basis = [input.differenceReason, input.confirmationReference, ...(input.evidenceRefs ?? [])].some((value) => Boolean(value?.trim()));
    if (differenceAmount(proposedAmount, confirmedAmount) !== 0 && !basis) throw TransportDomainError.invalid('CUSTOMER_AR_DIFFERENCE_BASIS_REQUIRED', 'Chenh lech doi soat phai co ly do, tham chieu hoac bang chung');
    const customerId = pending?.customerId ?? replay!.customerId;
    const currencyCode = input.currencyCode ?? pending?.currencyCode ?? replay!.currencyCode;
    const terms = await this.settlement.findCustomerTerms(customerId);
    const dueDate = terms ? dueDateFrom(input.businessDate, terms.paymentTermDays) : null;
    const evidenceRefs = [...(input.evidenceRefs ?? [])];
    const sourceFingerprint = customerReconciliationFingerprint({
      orderId: input.orderId, batchLineId: input.batchLineId ?? null, proposedAmount, confirmedAmount,
      currencyCode, businessDate: input.businessDate, differenceReason: input.differenceReason ?? null,
      confirmationReference: input.confirmationReference ?? null, evidenceRefs,
    });
    const documentFingerprint = settlementDocumentFingerprint({
      direction: 'RECEIVABLE', flow: 'CUSTOMER_FREIGHT', counterpartyKind: 'CUSTOMER', counterpartyId: customerId,
      kind: 'ORIGINAL', signedAmount: confirmedAmount, currencyCode, businessDate: input.businessDate,
      dueDate, tripId: null, adjustsId: null,
    });
    return this.repository.confirmOrder({
      orderId: input.orderId, batchLineId: input.batchLineId ?? null, proposedAmount, confirmedAmount,
      currencyCode, businessDate: input.businessDate, dueDate, differenceReason: input.differenceReason ?? null,
      confirmationReference: input.confirmationReference ?? null, evidenceRefs,
      sourceContext: 'CUSTOMER_RECONCILIATION', sourceId: input.sourceId, sourceFingerprint,
      confirmedBy: input.actor,
      document: {
        direction: 'RECEIVABLE', flow: 'CUSTOMER_FREIGHT', counterpartyKind: 'CUSTOMER', counterpartyId: customerId,
        signedAmount: confirmedAmount, currencyCode, businessDate: input.businessDate, dueDate, tripId: null,
        sourceContext: 'CUSTOMER_RECONCILIATION', sourceId: input.orderId, sourceFingerprint: documentFingerprint,
        invoiceRef: input.confirmationReference ?? null, note: input.differenceReason ?? null, recordedBy: input.actor,
      },
    });
  }

  createBatch(input: {
    readonly customerId: string; readonly orderIds: readonly string[]; readonly currencyCode?: string;
    readonly periodStart?: BusinessDate | null; readonly periodEnd?: BusinessDate | null;
    readonly reference?: string | null; readonly note?: string | null; readonly sourceId: string; readonly actor: string;
  }): Promise<{ readonly batch: CustomerReconciliationBatch; readonly replayed: boolean }> {
    const currencyCode = input.currencyCode ?? 'VND';
    const sourceFingerprint = customerReconciliationBatchFingerprint({ customerId: input.customerId, orderIds: input.orderIds, currencyCode, periodStart: input.periodStart ?? null, periodEnd: input.periodEnd ?? null });
    return this.repository.createBatch({ ...input, currencyCode, periodStart: input.periodStart ?? null, periodEnd: input.periodEnd ?? null,
      reference: input.reference ?? null, note: input.note ?? null, sourceContext: 'CUSTOMER_RECONCILIATION_BATCH', sourceFingerprint, createdBy: input.actor });
  }

  async resolveBatch(input: {
    readonly batchId: string;
    readonly decisions: readonly ({ readonly lineId: string; readonly action: 'CONFIRM'; readonly confirmedAmount: number; readonly businessDate: BusinessDate; readonly differenceReason?: string | null; readonly confirmationReference?: string | null; readonly evidenceRefs?: readonly string[] } | { readonly lineId: string; readonly action: 'DEFER'; readonly reason: string })[];
    readonly sourceId: string; readonly actor: string;
  }): Promise<CustomerReconciliationBatch> {
    const batch = await this.repository.findBatch(input.batchId);
    if (!batch) throw TransportDomainError.notFound('CUSTOMER_AR_BATCH_NOT_FOUND', 'Khong thay batch');
    for (const decision of input.decisions) {
      const line = batch.lines.find((entry) => entry.id === decision.lineId);
      if (!line) throw TransportDomainError.notFound('CUSTOMER_AR_BATCH_LINE_NOT_FOUND', 'Khong thay dong batch');
      const sourceId = `${input.sourceId}:${line.id}`;
      if (decision.action === 'CONFIRM') await this.confirmOrder({ orderId: line.orderId, batchLineId: line.id, confirmedAmount: decision.confirmedAmount, currencyCode: line.currencyCode, businessDate: decision.businessDate, differenceReason: decision.differenceReason, confirmationReference: decision.confirmationReference, evidenceRefs: decision.evidenceRefs, sourceId, actor: input.actor });
      else await this.repository.deferBatchLine({ batchId: input.batchId, lineId: line.id, reason: decision.reason, sourceId, sourceFingerprint: JSON.stringify([input.batchId, line.id, 'DEFER', decision.reason]), actor: input.actor });
    }
    const updated = await this.repository.findBatch(input.batchId);
    if (!updated) throw TransportDomainError.notFound('CUSTOMER_AR_BATCH_NOT_FOUND', 'Khong thay batch');
    if (updated.lines.some((line) => line.state === 'PENDING')) return updated;
    return this.repository.closeBatch(input.batchId, input.actor);
  }

  listBatches(customerId?: string): Promise<CustomerReconciliationBatch[]> { return this.repository.listBatches(customerId); }

  recordPayment(input: { readonly customerId: string; readonly amount: number; readonly currencyCode?: string; readonly receivedAt: Date; readonly businessDate: BusinessDate; readonly externalRef?: string | null; readonly note?: string | null; readonly sourceId: string; readonly actor: string }): Promise<{ readonly payment: CustomerPayment; readonly replayed: boolean }> {
    const amount = money(input.amount).amount;
    if (amount <= 0) throw TransportDomainError.invalid('MONEY_INVALID', 'So tien thu phai duong');
    const currencyCode = input.currencyCode ?? 'VND';
    const receivedAt = input.receivedAt.toISOString();
    return this.repository.recordPayment({ ...input, amount, currencyCode, externalRef: input.externalRef ?? null, note: input.note ?? null, recordedBy: input.actor, sourceContext: 'CUSTOMER_PAYMENT', sourceFingerprint: customerPaymentFingerprint({ customerId: input.customerId, amount, currencyCode, receivedAt, businessDate: input.businessDate, externalRef: input.externalRef ?? null }) });
  }

  allocatePayment(input: { readonly paymentId: string; readonly documentId: string; readonly amount: number; readonly businessDate: BusinessDate; readonly sourceId: string; readonly note?: string | null; readonly actor: string }): Promise<{ readonly allocation: CustomerPaymentAllocation; readonly replayed: boolean }> {
    const amount = money(input.amount).amount;
    if (amount <= 0) throw TransportDomainError.invalid('MONEY_INVALID', 'So tien phan bo phai duong');
    return this.repository.allocatePayment({ ...input, amount, sourceContext: 'CUSTOMER_PAYMENT_ALLOCATION', sourceFingerprint: customerPaymentAllocationFingerprint({ paymentId: input.paymentId, documentId: input.documentId, kind: 'APPLY', amount, businessDate: input.businessDate, reversesId: null }), note: input.note ?? null, recordedBy: input.actor });
  }

  releaseAllocation(input: { readonly allocationId: string; readonly businessDate: BusinessDate; readonly sourceId: string; readonly note?: string | null; readonly actor: string }): Promise<{ readonly allocation: CustomerPaymentAllocation; readonly replayed: boolean }> {
    return this.repository.releaseAllocation({ ...input, sourceContext: 'CUSTOMER_PAYMENT_ALLOCATION_RELEASE', sourceFingerprint: JSON.stringify([input.allocationId, input.businessDate]), note: input.note ?? null, recordedBy: input.actor });
  }

  paymentBalance(id: string): Promise<CustomerPaymentBalance | null> { return this.repository.paymentBalance(id); }
}
