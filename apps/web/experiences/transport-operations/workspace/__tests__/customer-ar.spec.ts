import { describe, expect, it } from 'vitest';
import { toCustomerArWorkspace } from '../customer-ar';

describe('Lane W — accounting owner view', () => {
  it('keeps pending reconciliation outside official AR and exposes due buckets', () => {
    const model = toCustomerArWorkspace({
      asOf: '2026-09-19',
      pending: [
        {
          orderId: 'order-pending',
          orderCode: 'SO-PENDING',
          customerId: 'customer-a',
          proposedAmount: 4_000_000,
          currencyCode: 'VND',
          businessDate: '2026-09-18',
        },
      ],
      batches: [],
      summary: {
        asOf: '2026-09-19',
        customerId: null,
        pendingReconciliationAmount: 4_000_000,
        officialReceivableAmount: 10_000_000,
        outstandingAmount: 7_000_000,
        notYetDueAmount: 2_000_000,
        dueAmount: 1_000_000,
        overdueAmount: 4_000_000,
        paidAmount: 3_000_000,
        unallocatedCreditAmount: 500_000,
        receivables: [
          {
            reconciliation: null,
            documentId: 'ar-vnd',
            customerId: 'customer-a',
            currencyCode: 'VND',
            grossAmount: 10_000_000,
            allocatedAmount: 3_000_000,
            outstandingAmount: 7_000_000,
            dueDate: '2026-09-10',
            status: 'OVERDUE',
          },
        ],
        payments: [
          {
            payment: {
              id: 'pay-vnd',
              customerId: 'customer-a',
              amount: 3_500_000,
              currencyCode: 'VND',
              receivedAt: '2026-09-19T08:00:00+07:00',
              businessDate: '2026-09-19',
              externalRef: 'BANK-1',
              note: null,
              recordedBy: 'ke-toan',
              sourceId: 'payment-key',
              sourceFingerprint: 'fingerprint',
              createdAt: '2026-09-19T01:00:00.000Z',
            },
            allocations: [],
            allocatedAmount: 3_000_000,
            unallocatedAmount: 500_000,
          },
        ],
      },
    });

    expect(model.pendingAmountLabel).toBe('4.000.000 VND');
    expect(model.officialAmountLabel).toBe('10.000.000 VND');
    expect(model.pendingRows[0]?.orderCode).toBe('SO-PENDING');
    expect(model.currencyGroups[0]).toMatchObject({
      currencyCode: 'VND',
      outstandingLabel: '7.000.000 VND',
      overdueLabel: '4.000.000 VND',
      unallocatedCreditLabel: '500.000 VND',
    });
  });

  it('never silently sums different currencies', () => {
    const model = toCustomerArWorkspace({
      asOf: '2026-09-19',
      pending: [],
      batches: [],
      summary: {
        asOf: '2026-09-19',
        customerId: null,
        pendingReconciliationAmount: 0,
        officialReceivableAmount: 0,
        outstandingAmount: 0,
        notYetDueAmount: 0,
        dueAmount: 0,
        overdueAmount: 0,
        paidAmount: 0,
        unallocatedCreditAmount: 0,
        receivables: [
          {
            reconciliation: null,
            documentId: 'vnd',
            customerId: 'a',
            currencyCode: 'VND',
            grossAmount: 1_000_000,
            allocatedAmount: 0,
            outstandingAmount: 1_000_000,
            dueDate: null,
            status: 'DUE',
          },
          {
            reconciliation: null,
            documentId: 'usd',
            customerId: 'b',
            currencyCode: 'USD',
            grossAmount: 20,
            allocatedAmount: 0,
            outstandingAmount: 20,
            dueDate: null,
            status: 'DUE',
          },
        ],
        payments: [],
      },
    });

    expect(model.currencyGroups.map((group) => group.currencyCode)).toEqual(['USD', 'VND']);
    expect(model.combinedTotalsAllowed).toBe(false);
    expect(model.pendingAmountLabel).toBeNull();
    expect(model.officialAmountLabel).toBeNull();
  });
});
