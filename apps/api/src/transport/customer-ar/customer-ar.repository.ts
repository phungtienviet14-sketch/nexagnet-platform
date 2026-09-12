import type { BusinessDate } from '../business-date.js';
import type { RecogniseDocumentCommand } from '../settlement/settlement.repository.js';
import type {
  CustomerPayment,
  CustomerPaymentAllocation,
  CustomerPaymentBalance,
  CustomerReceivablePosition,
  CustomerReconciliation,
  CustomerReconciliationBatch,
  PendingReconciliationOrder,
} from './customer-ar.types.js';

export interface ConfirmOrderReconciliationCommand {
  readonly orderId: string;
  readonly batchLineId: string | null;
  readonly proposedAmount: number;
  readonly confirmedAmount: number;
  readonly currencyCode: string;
  readonly businessDate: BusinessDate;
  readonly dueDate: BusinessDate | null;
  readonly differenceReason: string | null;
  readonly confirmationReference: string | null;
  readonly evidenceRefs: readonly string[];
  readonly sourceContext: string;
  readonly sourceId: string;
  readonly sourceFingerprint: string;
  readonly confirmedBy: string;
  readonly document: RecogniseDocumentCommand;
}

export interface CreateReconciliationBatchCommand {
  readonly customerId: string;
  readonly orderIds: readonly string[];
  readonly currencyCode: string;
  readonly periodStart: BusinessDate | null;
  readonly periodEnd: BusinessDate | null;
  readonly reference: string | null;
  readonly note: string | null;
  readonly sourceContext: string;
  readonly sourceId: string;
  readonly sourceFingerprint: string;
  readonly createdBy: string;
}

export interface DeferBatchLineCommand {
  readonly batchId: string;
  readonly lineId: string;
  readonly reason: string;
  readonly sourceId: string;
  readonly sourceFingerprint: string;
  readonly actor: string;
}

export interface RecordPaymentCommand {
  readonly customerId: string;
  readonly amount: number;
  readonly currencyCode: string;
  readonly receivedAt: Date;
  readonly businessDate: BusinessDate;
  readonly externalRef: string | null;
  readonly note: string | null;
  readonly recordedBy: string;
  readonly sourceContext: string;
  readonly sourceId: string;
  readonly sourceFingerprint: string;
}

export interface AllocatePaymentCommand {
  readonly paymentId: string;
  readonly documentId: string;
  readonly amount: number;
  readonly businessDate: BusinessDate;
  readonly sourceContext: string;
  readonly sourceId: string;
  readonly sourceFingerprint: string;
  readonly note: string | null;
  readonly recordedBy: string;
}

export interface ReleasePaymentAllocationCommand {
  readonly allocationId: string;
  readonly businessDate: BusinessDate;
  readonly sourceContext: string;
  readonly sourceId: string;
  readonly sourceFingerprint: string;
  readonly note: string | null;
  readonly recordedBy: string;
}

export abstract class CustomerArRepository {
  abstract pendingOrders(customerId?: string): Promise<PendingReconciliationOrder[]>;
  abstract confirmOrder(command: ConfirmOrderReconciliationCommand): Promise<{
    readonly reconciliation: CustomerReconciliation;
    readonly replayed: boolean;
  }>;
  abstract createBatch(command: CreateReconciliationBatchCommand): Promise<{
    readonly batch: CustomerReconciliationBatch;
    readonly replayed: boolean;
  }>;
  abstract deferBatchLine(command: DeferBatchLineCommand): Promise<CustomerReconciliationBatch>;
  abstract closeBatch(batchId: string, actor: string): Promise<CustomerReconciliationBatch>;
  abstract findBatch(id: string): Promise<CustomerReconciliationBatch | null>;
  abstract listBatches(customerId?: string): Promise<CustomerReconciliationBatch[]>;
  abstract recordPayment(command: RecordPaymentCommand): Promise<{
    readonly payment: CustomerPayment;
    readonly replayed: boolean;
  }>;
  abstract allocatePayment(command: AllocatePaymentCommand): Promise<{
    readonly allocation: CustomerPaymentAllocation;
    readonly replayed: boolean;
  }>;
  abstract releaseAllocation(command: ReleasePaymentAllocationCommand): Promise<{
    readonly allocation: CustomerPaymentAllocation;
    readonly replayed: boolean;
  }>;
  abstract findReconciliationByOrder(orderId: string): Promise<CustomerReconciliation | null>;
  abstract findPayment(id: string): Promise<CustomerPayment | null>;
  abstract paymentBalance(id: string): Promise<CustomerPaymentBalance | null>;
  abstract listPaymentBalances(customerId?: string): Promise<CustomerPaymentBalance[]>;
  abstract listReceivablePositions(
    asOf: BusinessDate,
    customerId?: string,
  ): Promise<CustomerReceivablePosition[]>;
}
