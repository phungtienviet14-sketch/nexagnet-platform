import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../business-date.js';
import { CustomerArRepository } from './customer-ar.repository.js';
import type { CustomerArSummary } from './customer-ar.types.js';

@Injectable()
export class CustomerArReadService {
  constructor(private readonly repository: CustomerArRepository) {}

  async summary(asOf: BusinessDate, customerId?: string): Promise<CustomerArSummary> {
    const [pending, receivables, payments] = await Promise.all([
      this.repository.pendingOrders(customerId),
      this.repository.listReceivablePositions(asOf, customerId),
      this.repository.listPaymentBalances(customerId),
    ]);
    const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);
    return {
      asOf,
      customerId: customerId ?? null,
      pendingReconciliationAmount: sum(pending.map((entry) => entry.proposedAmount)),
      officialReceivableAmount: sum(receivables.map((entry) => entry.grossAmount)),
      outstandingAmount: sum(receivables.map((entry) => entry.outstandingAmount)),
      notYetDueAmount: sum(receivables.filter((entry) => entry.status === 'NOT_YET_DUE').map((entry) => entry.outstandingAmount)),
      dueAmount: sum(receivables.filter((entry) => entry.status === 'DUE').map((entry) => entry.outstandingAmount)),
      overdueAmount: sum(receivables.filter((entry) => entry.status === 'OVERDUE').map((entry) => entry.outstandingAmount)),
      paidAmount: sum(receivables.map((entry) => entry.allocatedAmount)),
      unallocatedCreditAmount: sum(payments.map((entry) => entry.unallocatedAmount)),
      receivables,
      payments,
    };
  }
}
