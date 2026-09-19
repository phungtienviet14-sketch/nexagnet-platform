export interface PendingArOrder {
  readonly orderId: string;
  readonly orderCode: string;
  readonly customerId: string;
  readonly proposedAmount: number;
  readonly currencyCode: string;
  readonly businessDate: string;
}

export interface CustomerArSummaryView {
  readonly asOf: string;
  readonly customerId: string | null;
  readonly pendingReconciliationAmount: number;
  readonly officialReceivableAmount: number;
  readonly outstandingAmount: number;
  readonly notYetDueAmount: number;
  readonly dueAmount: number;
  readonly overdueAmount: number;
  readonly paidAmount: number;
  readonly unallocatedCreditAmount: number;
  readonly receivables: readonly {
    readonly reconciliation: unknown;
    readonly documentId: string;
    readonly customerId: string;
    readonly currencyCode: string;
    readonly grossAmount: number;
    readonly allocatedAmount: number;
    readonly outstandingAmount: number;
    readonly dueDate: string | null;
    readonly status: 'NOT_YET_DUE' | 'DUE' | 'OVERDUE' | 'PAID';
  }[];
  readonly payments: readonly {
    readonly payment: {
      readonly id: string;
      readonly customerId: string;
      readonly amount: number;
      readonly currencyCode: string;
      readonly receivedAt: string;
      readonly businessDate: string;
      readonly externalRef: string | null;
      readonly note: string | null;
      readonly recordedBy: string;
      readonly sourceId: string;
      readonly sourceFingerprint: string;
      readonly createdAt: string;
    };
    readonly allocations: readonly unknown[];
    readonly allocatedAmount: number;
    readonly unallocatedAmount: number;
  }[];
}

export interface CustomerReconciliationBatchView {
  readonly id: string;
  readonly customerId: string;
  readonly currencyCode: string;
  readonly status: string;
  readonly lines: readonly {
    readonly id: string;
    readonly orderId: string;
    readonly orderCode: string;
    readonly proposedAmount: number;
    readonly currencyCode: string;
    readonly state: 'PENDING' | 'CONFIRMED' | 'DEFERRED';
    readonly resolutionReason: string | null;
    readonly reconciliationId: string | null;
  }[];
}

const money = (amount: number, currencyCode: string): string =>
  `${new Intl.NumberFormat('vi-VN').format(amount)} ${currencyCode}`;

export function toCustomerArWorkspace(input: {
  readonly asOf: string;
  readonly pending: readonly PendingArOrder[];
  readonly batches: readonly CustomerReconciliationBatchView[];
  readonly summary: CustomerArSummaryView;
}) {
  const currencies = new Map<
    string,
    {
      outstanding: number;
      notYetDue: number;
      due: number;
      overdue: number;
      paid: number;
      credit: number;
    }
  >();
  const ensure = (code: string) => {
    const found = currencies.get(code);
    if (found !== undefined) return found;
    const created = { outstanding: 0, notYetDue: 0, due: 0, overdue: 0, paid: 0, credit: 0 };
    currencies.set(code, created);
    return created;
  };

  for (const receivable of input.summary.receivables) {
    const group = ensure(receivable.currencyCode);
    group.outstanding += receivable.outstandingAmount;
    group.paid += receivable.allocatedAmount;
    if (receivable.status === 'NOT_YET_DUE') group.notYetDue += receivable.outstandingAmount;
    if (receivable.status === 'DUE') group.due += receivable.outstandingAmount;
    if (receivable.status === 'OVERDUE') group.overdue += receivable.outstandingAmount;
  }
  for (const payment of input.summary.payments) {
    ensure(payment.payment.currencyCode).credit += payment.unallocatedAmount;
  }
  for (const pending of input.pending) ensure(pending.currencyCode);

  if (currencies.size === 1) {
    const only = [...currencies.values()][0];
    if (only !== undefined) {
      only.outstanding = input.summary.outstandingAmount;
      only.notYetDue = input.summary.notYetDueAmount;
      only.due = input.summary.dueAmount;
      only.overdue = input.summary.overdueAmount;
      only.paid = input.summary.paidAmount;
      only.credit = input.summary.unallocatedCreditAmount;
    }
  }

  const currencyGroups = [...currencies.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currencyCode, group]) => ({
      currencyCode,
      outstandingLabel: money(group.outstanding, currencyCode),
      notYetDueLabel: money(group.notYetDue, currencyCode),
      dueLabel: money(group.due, currencyCode),
      overdueLabel: money(group.overdue, currencyCode),
      paidLabel: money(group.paid, currencyCode),
      unallocatedCreditLabel: money(group.credit, currencyCode),
    }));

  const primaryCurrency =
    currencyGroups[0]?.currencyCode ?? input.pending[0]?.currencyCode ?? 'VND';
  return {
    pendingRows: input.pending,
    batches: input.batches,
    currencyGroups,
    combinedTotalsAllowed: currencyGroups.length <= 1,
    pendingAmountLabel:
      currencyGroups.length <= 1
        ? money(input.summary.pendingReconciliationAmount, primaryCurrency)
        : null,
    officialAmountLabel:
      currencyGroups.length <= 1
        ? money(input.summary.officialReceivableAmount, primaryCurrency)
        : null,
  };
}
