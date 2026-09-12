import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../business-date.js';
import { TransportDomainError } from '../transport.errors.js';
import { allocationBalance, differenceAmount } from './customer-ar-documents.js';
import { CustomerArRepository } from './customer-ar.repository.js';
import type {
  AllocatePaymentCommand,
  ConfirmOrderReconciliationCommand,
  CreateReconciliationBatchCommand,
  DeferBatchLineCommand,
  RecordPaymentCommand,
  ReleasePaymentAllocationCommand,
} from './customer-ar.repository.js';
import type {
  CustomerPayment,
  CustomerPaymentAllocation,
  CustomerPaymentBalance,
  CustomerReceivablePosition,
  CustomerReconciliation,
  CustomerReconciliationBatch,
  PendingReconciliationOrder,
} from './customer-ar.types.js';

const now = (): string => new Date().toISOString();

@Injectable()
export class InMemoryCustomerArRepository extends CustomerArRepository {
  private readonly pending = new Map<string, PendingReconciliationOrder>();
  private readonly reconciliations = new Map<string, CustomerReconciliation>();
  private readonly batches = new Map<string, CustomerReconciliationBatch>();
  private readonly payments = new Map<string, CustomerPayment>();
  private readonly allocations = new Map<string, CustomerPaymentAllocation>();
  private readonly documents = new Map<string, { customerId: string; currencyCode: string; grossAmount: number; dueDate: BusinessDate | null }>();

  seedPending(order: PendingReconciliationOrder): void { this.pending.set(order.orderId, order); }
  async pendingOrders(customerId?: string) { return [...this.pending.values()].filter((entry) => (!customerId || entry.customerId === customerId) && ![...this.reconciliations.values()].some((value) => value.orderId === entry.orderId)); }

  async confirmOrder(command: ConfirmOrderReconciliationCommand) {
    const replay = [...this.reconciliations.values()].find((value) => value.sourceId === command.sourceId);
    if (replay) { this.assertReplay(replay.sourceFingerprint, command.sourceFingerprint, 'CUSTOMER_AR_SOURCE_FINGERPRINT_CONFLICT'); return { reconciliation: replay, replayed: true }; }
    if ([...this.reconciliations.values()].some((value) => value.orderId === command.orderId)) throw TransportDomainError.conflict('CUSTOMER_AR_ORDER_ALREADY_CONFIRMED', 'Don da duoc A xac nhan');
    const pending = this.pending.get(command.orderId);
    if (!pending) throw TransportDomainError.denied('CUSTOMER_AR_ORDER_NOT_ELIGIBLE', 'Don khong o hang doi doi soat');
    const id = randomUUID(); const confirmedAt = now(); const documentId = randomUUID();
    const reconciliation: CustomerReconciliation = { id, orderId: command.orderId, customerId: pending.customerId, batchLineId: command.batchLineId,
      proposedAmount: command.proposedAmount, confirmedAmount: command.confirmedAmount, differenceAmount: differenceAmount(command.proposedAmount, command.confirmedAmount),
      currencyCode: command.currencyCode, businessDate: command.businessDate, dueDate: command.dueDate, differenceReason: command.differenceReason,
      confirmationReference: command.confirmationReference, evidenceRefs: [...command.evidenceRefs], sourceId: command.sourceId,
      sourceFingerprint: command.sourceFingerprint, confirmedBy: command.confirmedBy, confirmedAt, settlementDocumentId: documentId };
    this.reconciliations.set(id, reconciliation); this.documents.set(documentId, { customerId: pending.customerId, currencyCode: command.currencyCode, grossAmount: command.confirmedAmount, dueDate: command.dueDate });
    if (command.batchLineId) this.resolveLine(command.batchLineId, 'CONFIRMED', command.confirmedBy, command.sourceId, command.sourceFingerprint, null, id);
    return { reconciliation, replayed: false };
  }

  async createBatch(command: CreateReconciliationBatchCommand) {
    const replay = [...this.batches.values()].find((value) => value.sourceId === command.sourceId);
    if (replay) { this.assertReplay(replay.sourceFingerprint, command.sourceFingerprint, 'CUSTOMER_AR_SOURCE_FINGERPRINT_CONFLICT'); return { batch: replay, replayed: true }; }
    const orders = command.orderIds.map((id) => this.pending.get(id));
    if (orders.some((entry) => !entry || entry.customerId !== command.customerId || entry.currencyCode !== command.currencyCode)) throw TransportDomainError.denied('CUSTOMER_AR_ORDER_NOT_ELIGIBLE', 'Batch co don khong hop le');
    const id = randomUUID(); const batch: CustomerReconciliationBatch = { id, customerId: command.customerId, currencyCode: command.currencyCode, status: 'DRAFT',
      periodStart: command.periodStart, periodEnd: command.periodEnd, reference: command.reference, note: command.note, sourceId: command.sourceId,
      sourceFingerprint: command.sourceFingerprint, createdBy: command.createdBy, createdAt: now(), closedBy: null, closedAt: null,
      lines: orders.map((entry) => ({ id: randomUUID(), batchId: id, orderId: entry!.orderId, orderCode: entry!.orderCode,
        proposedAmount: entry!.proposedAmount, currencyCode: entry!.currencyCode, state: 'PENDING', resolutionReason: null,
        resolvedBy: null, resolvedAt: null, resolutionSourceId: null, reconciliationId: null })) };
    this.batches.set(id, batch); return { batch, replayed: false };
  }

  private resolveLine(lineId: string, state: 'CONFIRMED' | 'DEFERRED', actor: string, sourceId: string, fingerprint: string, reason: string | null, reconciliationId: string | null): void {
    const batch = [...this.batches.values()].find((value) => value.lines.some((line) => line.id === lineId)); if (!batch) return;
    const lines = batch.lines.map((line) => line.id === lineId ? { ...line, state, resolutionReason: reason, resolvedBy: actor, resolvedAt: now(), resolutionSourceId: sourceId, reconciliationId } : line);
    this.batches.set(batch.id, { ...batch, lines });
  }
  async deferBatchLine(command: DeferBatchLineCommand) { const batch = this.batches.get(command.batchId); const line = batch?.lines.find((value) => value.id === command.lineId); if (!batch || !line) throw TransportDomainError.notFound('CUSTOMER_AR_BATCH_LINE_NOT_FOUND', 'Khong thay dong batch'); if (line.state !== 'PENDING') { if (line.state === 'DEFERRED' && line.resolutionSourceId === command.sourceId) return batch; throw TransportDomainError.conflict('CUSTOMER_AR_BATCH_LINE_ALREADY_RESOLVED', 'Dong da xu ly'); } this.resolveLine(line.id, 'DEFERRED', command.actor, command.sourceId, command.sourceFingerprint, command.reason, null); return this.batches.get(batch.id)!; }
  async closeBatch(batchId: string, actor: string) { const batch = this.batches.get(batchId); if (!batch) throw TransportDomainError.notFound('CUSTOMER_AR_BATCH_NOT_FOUND', 'Khong thay batch'); if (batch.status === 'CLOSED') return batch; if (batch.lines.some((line) => line.state === 'PENDING')) throw TransportDomainError.denied('CUSTOMER_AR_BATCH_NOT_DRAFT', 'Batch con dong pending'); const closed = { ...batch, status: 'CLOSED' as const, closedBy: actor, closedAt: now() }; this.batches.set(batchId, closed); return closed; }
  async findBatch(id: string) { return this.batches.get(id) ?? null; }
  async listBatches(customerId?: string) { return [...this.batches.values()].filter((entry) => !customerId || entry.customerId === customerId); }

  async recordPayment(command: RecordPaymentCommand) { const replay = [...this.payments.values()].find((value) => value.sourceId === command.sourceId); if (replay) { this.assertReplay(replay.sourceFingerprint, command.sourceFingerprint, 'CUSTOMER_PAYMENT_SOURCE_FINGERPRINT_CONFLICT'); return { payment: replay, replayed: true }; } const payment: CustomerPayment = { id: randomUUID(), customerId: command.customerId, amount: command.amount, currencyCode: command.currencyCode, receivedAt: command.receivedAt.toISOString(), businessDate: command.businessDate, externalRef: command.externalRef, note: command.note, recordedBy: command.recordedBy, sourceId: command.sourceId, sourceFingerprint: command.sourceFingerprint, createdAt: now() }; this.payments.set(payment.id, payment); return { payment, replayed: false }; }
  async allocatePayment(command: AllocatePaymentCommand) { const replay = [...this.allocations.values()].find((value) => value.sourceId === command.sourceId); if (replay) { this.assertReplay(replay.sourceFingerprint, command.sourceFingerprint, 'CUSTOMER_PAYMENT_ALLOCATION_SOURCE_FINGERPRINT_CONFLICT'); return { allocation: replay, replayed: true }; } const payment = await this.paymentBalance(command.paymentId); const document = this.documents.get(command.documentId); if (!payment) throw TransportDomainError.notFound('CUSTOMER_PAYMENT_NOT_FOUND', 'Khong thay payment'); if (!document) throw TransportDomainError.notFound('CUSTOMER_AR_RECEIVABLE_NOT_FOUND', 'Khong thay cong no'); if (payment.payment.customerId !== document.customerId) throw TransportDomainError.denied('CUSTOMER_AR_CUSTOMER_MISMATCH', 'Khac khach'); if (payment.payment.currencyCode !== document.currencyCode) throw TransportDomainError.denied('CUSTOMER_AR_CURRENCY_MISMATCH', 'Khac loai tien'); const documentUsed = allocationBalance([...this.allocations.values()].filter((entry) => entry.documentId === command.documentId)); if (command.amount > payment.unallocatedAmount) throw TransportDomainError.denied('CUSTOMER_PAYMENT_ALLOCATION_EXCEEDS_BALANCE', 'Vuot payment'); if (command.amount > document.grossAmount - documentUsed) throw TransportDomainError.denied('CUSTOMER_PAYMENT_ALLOCATION_EXCEEDS_OUTSTANDING', 'Vuot cong no'); const allocation: CustomerPaymentAllocation = { id: randomUUID(), paymentId: command.paymentId, documentId: command.documentId, kind: 'APPLY', amount: command.amount, businessDate: command.businessDate, reversesId: null, sourceId: command.sourceId, sourceFingerprint: command.sourceFingerprint, note: command.note, recordedBy: command.recordedBy, createdAt: now() }; this.allocations.set(allocation.id, allocation); return { allocation, replayed: false }; }
  async releaseAllocation(command: ReleasePaymentAllocationCommand) { const replay = [...this.allocations.values()].find((value) => value.sourceId === command.sourceId); if (replay) { this.assertReplay(replay.sourceFingerprint, command.sourceFingerprint, 'CUSTOMER_PAYMENT_ALLOCATION_SOURCE_FINGERPRINT_CONFLICT'); return { allocation: replay, replayed: true }; } const target = this.allocations.get(command.allocationId); if (!target || target.kind !== 'APPLY') throw TransportDomainError.notFound('CUSTOMER_PAYMENT_ALLOCATION_NOT_FOUND', 'Khong thay phan bo'); if ([...this.allocations.values()].some((value) => value.reversesId === target.id)) throw TransportDomainError.conflict('CUSTOMER_PAYMENT_ALLOCATION_ALREADY_RELEASED', 'Da release'); const allocation: CustomerPaymentAllocation = { ...target, id: randomUUID(), kind: 'RELEASE', reversesId: target.id, businessDate: command.businessDate, sourceId: command.sourceId, sourceFingerprint: command.sourceFingerprint, note: command.note, recordedBy: command.recordedBy, createdAt: now() }; this.allocations.set(allocation.id, allocation); return { allocation, replayed: false }; }
  async findReconciliationByOrder(orderId: string) { return [...this.reconciliations.values()].find((entry) => entry.orderId === orderId) ?? null; }
  async findPayment(id: string) { return this.payments.get(id) ?? null; }
  async paymentBalance(id: string): Promise<CustomerPaymentBalance | null> { const payment = this.payments.get(id); if (!payment) return null; const allocations = [...this.allocations.values()].filter((entry) => entry.paymentId === id); const allocatedAmount = allocationBalance(allocations); return { payment, allocations, allocatedAmount, unallocatedAmount: payment.amount - allocatedAmount }; }
  async listPaymentBalances(customerId?: string) { const rows = [...this.payments.values()].filter((entry) => !customerId || entry.customerId === customerId); return (await Promise.all(rows.map((entry) => this.paymentBalance(entry.id)))).filter((value): value is CustomerPaymentBalance => value !== null); }
  async listReceivablePositions(asOf: BusinessDate, customerId?: string): Promise<CustomerReceivablePosition[]> { return [...this.documents.entries()].filter(([, doc]) => !customerId || doc.customerId === customerId).map(([documentId, doc]) => { const reconciliation = [...this.reconciliations.values()].find((entry) => entry.settlementDocumentId === documentId) ?? null; const allocatedAmount = allocationBalance([...this.allocations.values()].filter((entry) => entry.documentId === documentId)); const outstandingAmount = doc.grossAmount - allocatedAmount; const status = outstandingAmount === 0 ? 'PAID' : doc.dueDate === asOf ? 'DUE' : doc.dueDate && doc.dueDate < asOf ? 'OVERDUE' : 'NOT_YET_DUE'; return { reconciliation, documentId, customerId: doc.customerId, currencyCode: doc.currencyCode, grossAmount: doc.grossAmount, allocatedAmount, outstandingAmount, dueDate: doc.dueDate, status }; }); }
  private assertReplay(actual: string, expected: string, reason: Parameters<typeof TransportDomainError.denied>[0]): void { if (actual !== expected) throw TransportDomainError.denied(reason, 'Idempotency fingerprint conflict'); }
}
