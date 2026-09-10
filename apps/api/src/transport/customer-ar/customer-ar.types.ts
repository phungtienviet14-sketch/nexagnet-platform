import type { BusinessDate } from '../business-date.js';

export const CUSTOMER_RECONCILIATION_BATCH_STATUSES = ['DRAFT', 'CLOSED', 'CANCELLED'] as const;
export type CustomerReconciliationBatchStatus =
  (typeof CUSTOMER_RECONCILIATION_BATCH_STATUSES)[number];

export const CUSTOMER_RECONCILIATION_LINE_STATES = [
  'PENDING',
  'CONFIRMED',
  'DEFERRED',
] as const;
export type CustomerReconciliationLineState =
  (typeof CUSTOMER_RECONCILIATION_LINE_STATES)[number];

export const CUSTOMER_PAYMENT_ALLOCATION_KINDS = ['APPLY', 'RELEASE'] as const;
export type CustomerPaymentAllocationKind = (typeof CUSTOMER_PAYMENT_ALLOCATION_KINDS)[number];

export interface PendingReconciliationOrder {
  readonly orderId: string;
  readonly orderCode: string;
  readonly customerId: string;
  readonly proposedAmount: number;
  readonly currencyCode: string;
  readonly businessDate: BusinessDate;
}

export interface CustomerReconciliationBatchLine {
  readonly id: string;
  readonly batchId: string;
  readonly orderId: string;
  readonly orderCode: string;
  readonly proposedAmount: number;
  readonly currencyCode: string;
  readonly state: CustomerReconciliationLineState;
  readonly resolutionReason: string | null;
  readonly resolvedBy: string | null;
  readonly resolvedAt: string | null;
  readonly resolutionSourceId: string | null;
  readonly reconciliationId: string | null;
}

export interface CustomerReconciliationBatch {
  readonly id: string;
  readonly customerId: string;
  readonly currencyCode: string;
  readonly status: CustomerReconciliationBatchStatus;
  readonly periodStart: BusinessDate | null;
  readonly periodEnd: BusinessDate | null;
  readonly reference: string | null;
  readonly note: string | null;
  readonly sourceId: string;
  readonly sourceFingerprint: string;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly closedBy: string | null;
  readonly closedAt: string | null;
  readonly lines: readonly CustomerReconciliationBatchLine[];
}

export interface CustomerReconciliation {
  readonly id: string;
  readonly orderId: string;
  readonly customerId: string;
  readonly batchLineId: string | null;
  readonly proposedAmount: number;
  readonly confirmedAmount: number;
  readonly differenceAmount: number;
  readonly currencyCode: string;
  readonly businessDate: BusinessDate;
  readonly dueDate: BusinessDate | null;
  readonly differenceReason: string | null;
  readonly confirmationReference: string | null;
  readonly evidenceRefs: readonly string[];
  readonly sourceId: string;
  readonly sourceFingerprint: string;
  readonly confirmedBy: string;
  readonly confirmedAt: string;
  readonly settlementDocumentId: string;
}

export interface CustomerPayment {
  readonly id: string;
  readonly customerId: string;
  readonly amount: number;
  readonly currencyCode: string;
  readonly receivedAt: string;
  readonly businessDate: BusinessDate;
  readonly externalRef: string | null;
  readonly note: string | null;
  readonly recordedBy: string;
  readonly sourceId: string;
  readonly sourceFingerprint: string;
  readonly createdAt: string;
}

export interface CustomerPaymentAllocation {
  readonly id: string;
  readonly paymentId: string;
  readonly documentId: string;
  readonly kind: CustomerPaymentAllocationKind;
  readonly amount: number;
  readonly businessDate: BusinessDate;
  readonly reversesId: string | null;
  readonly sourceId: string;
  readonly sourceFingerprint: string;
  readonly note: string | null;
  readonly recordedBy: string;
  readonly createdAt: string;
}

export interface CustomerPaymentBalance {
  readonly payment: CustomerPayment;
  readonly allocations: readonly CustomerPaymentAllocation[];
  readonly allocatedAmount: number;
  readonly unallocatedAmount: number;
}

export interface CustomerReceivablePosition {
  readonly reconciliation: CustomerReconciliation | null;
  readonly documentId: string;
  readonly customerId: string;
  readonly currencyCode: string;
  readonly grossAmount: number;
  readonly allocatedAmount: number;
  readonly outstandingAmount: number;
  readonly dueDate: BusinessDate | null;
  readonly status: 'NOT_YET_DUE' | 'DUE' | 'OVERDUE' | 'PAID';
}

export interface CustomerArSummary {
  readonly asOf: BusinessDate;
  readonly customerId: string | null;
  readonly pendingReconciliationAmount: number;
  readonly officialReceivableAmount: number;
  readonly outstandingAmount: number;
  readonly notYetDueAmount: number;
  readonly dueAmount: number;
  readonly overdueAmount: number;
  readonly paidAmount: number;
  readonly unallocatedCreditAmount: number;
  readonly receivables: readonly CustomerReceivablePosition[];
  readonly payments: readonly CustomerPaymentBalance[];
}
