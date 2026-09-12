import type { BusinessDate } from '../business-date.js';

export interface CustomerReconciliationIdentity {
  readonly orderId: string;
  readonly batchLineId: string | null;
  readonly proposedAmount: number;
  readonly confirmedAmount: number;
  readonly currencyCode: string;
  readonly businessDate: BusinessDate;
  readonly differenceReason: string | null;
  readonly confirmationReference: string | null;
  readonly evidenceRefs: readonly string[];
}

export const differenceAmount = (proposedAmount: number, confirmedAmount: number): number =>
  Math.abs(proposedAmount - confirmedAmount);

export const customerReconciliationFingerprint = (
  identity: CustomerReconciliationIdentity,
): string =>
  JSON.stringify([
    identity.orderId,
    identity.batchLineId,
    identity.proposedAmount,
    identity.confirmedAmount,
    identity.currencyCode,
    identity.businessDate,
    identity.differenceReason,
    identity.confirmationReference,
    [...identity.evidenceRefs].sort(),
  ]);

export const customerReconciliationBatchFingerprint = (identity: {
  readonly customerId: string;
  readonly orderIds: readonly string[];
  readonly currencyCode: string;
  readonly periodStart: BusinessDate | null;
  readonly periodEnd: BusinessDate | null;
}): string =>
  JSON.stringify([
    identity.customerId,
    [...identity.orderIds].sort(),
    identity.currencyCode,
    identity.periodStart,
    identity.periodEnd,
  ]);

export interface CustomerPaymentIdentity {
  readonly customerId: string;
  readonly amount: number;
  readonly currencyCode: string;
  readonly receivedAt: string;
  readonly businessDate: BusinessDate;
  readonly externalRef: string | null;
}

export const customerPaymentFingerprint = (identity: CustomerPaymentIdentity): string =>
  JSON.stringify([
    identity.customerId,
    identity.amount,
    identity.currencyCode,
    identity.receivedAt,
    identity.businessDate,
    identity.externalRef,
  ]);

export interface CustomerPaymentAllocationIdentity {
  readonly paymentId: string;
  readonly documentId: string;
  readonly kind: 'APPLY' | 'RELEASE';
  readonly amount: number;
  readonly businessDate: BusinessDate;
  readonly reversesId: string | null;
}

export const customerPaymentAllocationFingerprint = (
  identity: CustomerPaymentAllocationIdentity,
): string =>
  JSON.stringify([
    identity.paymentId,
    identity.documentId,
    identity.kind,
    identity.amount,
    identity.businessDate,
    identity.reversesId,
  ]);

export const reconciliationGross = (signedAmounts: readonly number[]): number =>
  signedAmounts.reduce((total, amount) => total + amount, 0);

export const allocationBalance = (
  entries: readonly { readonly kind: 'APPLY' | 'RELEASE'; readonly amount: number }[],
): number =>
  entries.reduce(
    (total, entry) => total + (entry.kind === 'APPLY' ? entry.amount : -entry.amount),
    0,
  );
