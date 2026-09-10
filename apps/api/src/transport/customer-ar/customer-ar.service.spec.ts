import { describe, expect, it } from 'vitest';
import type { SettlementOrderCompletionGate } from '../settlement/settlement-order-completion.port.js';
import type { SettlementRepository } from '../settlement/settlement.repository.js';
import { CustomerArService } from './customer-ar.service.js';
import { InMemoryCustomerArRepository } from './in-memory-customer-ar.repository.js';

describe('CustomerArService batch lifecycle', () => {
  it('giu batch DRAFT khi A moi resolve mot phan, khong tra loi loi sau khi da ghi audit', async () => {
    const repository = new InMemoryCustomerArRepository();
    for (const orderId of ['order-1', 'order-2']) {
      repository.seedPending({ orderId, orderCode: orderId, customerId: 'customer-1',
        proposedAmount: 1_000_000, currencyCode: 'VND', businessDate: '2026-09-09' });
    }
    const service = new CustomerArService(
      repository,
      { findCustomerTerms: () => Promise.resolve(null) } as unknown as SettlementRepository,
      { eligibilityForOrder: () => Promise.resolve({ kind: 'ELIGIBLE' }) } as unknown as SettlementOrderCompletionGate,
    );
    const { batch } = await service.createBatch({ customerId: 'customer-1', orderIds: ['order-1', 'order-2'],
      sourceId: 'create-batch-1', actor: 'accountant-1' });
    const result = await service.resolveBatch({ batchId: batch.id,
      decisions: [{ lineId: batch.lines[0]!.id, action: 'DEFER', reason: 'Cho chung tu' }],
      sourceId: 'resolve-partial-1', actor: 'accountant-1' });

    expect(result.status).toBe('DRAFT');
    expect(result.lines.map((line) => line.state).sort()).toEqual(['DEFERRED', 'PENDING']);
  });

  it('lay proposed amount tu Order pending va bat buoc audit khi A xac nhan chenh lech', async () => {
    const repository = new InMemoryCustomerArRepository();
    repository.seedPending({ orderId: 'order-1', orderCode: 'ORD-1', customerId: 'customer-1',
      proposedAmount: 10_000_000, currencyCode: 'VND', businessDate: '2026-09-09' });
    const service = new CustomerArService(
      repository,
      { findCustomerTerms: () => Promise.resolve(null) } as unknown as SettlementRepository,
      { eligibilityForOrder: () => Promise.resolve({ kind: 'ELIGIBLE' }) } as unknown as SettlementOrderCompletionGate,
    );

    await expect(service.confirmOrder({ orderId: 'order-1', confirmedAmount: 9_000_000,
      businessDate: '2026-09-09', sourceId: 'confirm-order-1', actor: 'accountant-1' }))
      .rejects.toMatchObject({ reason: 'CUSTOMER_AR_DIFFERENCE_BASIS_REQUIRED' });
  });
});
