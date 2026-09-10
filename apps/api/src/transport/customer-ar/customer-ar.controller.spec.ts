import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { CapabilityId } from '@netviet/tenant';
import { describe, expect, it } from 'vitest';
import { buildAppComposition } from '../../app-composition.js';
import { ROLES_KEY } from '../../auth/roles.decorator.js';
import type { AuthenticatedRequest } from '../../auth/session.types.js';
import { TRANSPORT_ACTION_KEY } from '../transport-action.guard.js';
import { CustomerArController } from './customer-ar.controller.js';
import type { CustomerArReadService } from './customer-ar-read.service.js';
import type { CustomerArService } from './customer-ar.service.js';

const request = (id = 'accountant-1') =>
  ({ authUser: { id, role: 'ACCOUNTING' } }) as unknown as AuthenticatedRequest;

function fakeServices() {
  const calls: Array<{ method: string; input: unknown }> = [];
  const capture =
    (method: string, result: unknown) =>
    (...args: unknown[]) => {
      const input = args.length <= 1 ? args[0] : args;
      calls.push({ method, input });
      return Promise.resolve(result);
    };
  const service = {
    pendingReconciliation: capture('pendingReconciliation', []),
    listBatches: capture('listBatches', []),
    paymentBalance: capture('paymentBalance', { payment: { id: 'pay-1' } }),
    confirmOrder: capture('confirmOrder', { reconciliation: { id: 'rec-1' }, replayed: false }),
    createBatch: capture('createBatch', { batch: { id: 'batch-1' }, replayed: false }),
    resolveBatch: capture('resolveBatch', { batch: { id: 'batch-1' }, replayed: false }),
    recordPayment: capture('recordPayment', { payment: { id: 'pay-1' }, replayed: false }),
    allocatePayment: capture('allocatePayment', { allocation: { id: 'alloc-1' }, replayed: false }),
    releaseAllocation: capture('releaseAllocation', {
      allocation: { id: 'release-1' },
      replayed: false,
    }),
  };
  const read = { summary: capture('summary', { asOf: '2026-09-09' }) };
  return {
    calls,
    service,
    read,
    controller: new CustomerArController(
      service as unknown as CustomerArService,
      read as unknown as CustomerArReadService,
    ),
  };
}

describe('#292 — bien HTTP doi soat khach hang', () => {
  it('xac nhan Order lay actor tu phien, khoa nguon tu idempotency va khong nhan customerId', async () => {
    const { controller, calls } = fakeServices();
    await controller.confirmOrder(
      'order-1',
      {
        confirmedAmount: 9_000_000,
        businessDate: '2026-09-09',
        differenceReason: 'A xac nhan lai khoi luong',
        idempotencyKey: 'confirm-order-1',
      },
      request(),
    );

    expect(calls).toEqual([
      {
        method: 'confirmOrder',
        input: expect.objectContaining({
          orderId: 'order-1',
          confirmedAmount: 9_000_000,
          currencyCode: 'VND',
          sourceId: 'confirm-order-1',
          actor: 'accountant-1',
        }),
      },
    ]);

    expect(() =>
      controller.confirmOrder(
        'order-1',
        {
          customerId: 'forged-customer',
          proposedAmount: 1,
          confirmedAmount: 1,
          businessDate: '2026-09-09',
          idempotencyKey: 'confirm-order-2',
        },
        request(),
      ),
    ).toThrow(BadRequestException);
  });

  it('tu choi proposedAmount do caller tu khai va ngay lich khong ton tai', () => {
    const { controller, calls } = fakeServices();
    expect(() =>
      controller.confirmOrder(
        'order-1',
        {
          proposedAmount: 10_000_000,
          confirmedAmount: 10_000_000,
          businessDate: '2026-02-30',
          idempotencyKey: 'confirm-order-1',
        },
        request(),
      ),
    ).toThrow(BadRequestException);
    expect(calls).toEqual([]);
  });

  it('batch co the xac nhan mot dong va tam hoan dong khac trong cung lenh', async () => {
    const { controller, calls } = fakeServices();
    await controller.resolveBatch(
      'batch-1',
      {
        idempotencyKey: 'resolve-batch-1',
        decisions: [
          {
            lineId: 'line-1',
            action: 'CONFIRM',
            confirmedAmount: 9_000_000,
            businessDate: '2026-09-09',
          },
          { lineId: 'line-2', action: 'DEFER', reason: 'Thieu bien ban giao nhan' },
        ],
      },
      request('admin-1'),
    );

    expect(calls).toEqual([
      {
        method: 'resolveBatch',
        input: expect.objectContaining({
          batchId: 'batch-1',
          sourceId: 'resolve-batch-1',
          actor: 'admin-1',
          decisions: [
            expect.objectContaining({ lineId: 'line-1', action: 'CONFIRM' }),
            expect.objectContaining({
              lineId: 'line-2',
              action: 'DEFER',
              reason: 'Thieu bien ban giao nhan',
            }),
          ],
        }),
      },
    ]);
  });

  it('batch co ky doi soat thi bat buoc du ca hai moc ngay', () => {
    const { controller, calls } = fakeServices();
    expect(() =>
      controller.createBatch(
        {
          customerId: 'customer-1',
          orderIds: ['order-1'],
          periodStart: '2026-09-01',
          idempotencyKey: 'batch-period-1',
        },
        request(),
      ),
    ).toThrow(BadRequestException);
    expect(calls).toEqual([]);
  });

  it('thanh toan la su kien co timestamp may chu parse, khong co recordedBy trong body', async () => {
    const { controller, calls } = fakeServices();
    await controller.recordPayment(
      {
        customerId: 'customer-1',
        amount: 500_000_000,
        receivedAt: '2026-09-09T08:00:00+07:00',
        businessDate: '2026-09-09',
        externalRef: 'BANK-001',
        idempotencyKey: 'payment-bank-001',
      },
      request(),
    );

    expect(calls).toEqual([
      {
        method: 'recordPayment',
        input: expect.objectContaining({
          customerId: 'customer-1',
          amount: 500_000_000,
          receivedAt: new Date('2026-09-09T08:00:00+07:00'),
          sourceId: 'payment-bank-001',
          actor: 'accountant-1',
        }),
      },
    ]);

    expect(() =>
      controller.recordPayment(
        {
          customerId: 'customer-1',
          amount: 1,
          receivedAt: '2026-09-09T08:00:00+07:00',
          businessDate: '2026-09-09',
          idempotencyKey: 'payment-bank-002',
          recordedBy: 'admin-1',
        },
        request(),
      ),
    ).toThrow(BadRequestException);
  });

  it('phan bo nham documentId va sua bang RELEASE bat bien', async () => {
    const { controller, calls } = fakeServices();
    await controller.allocatePayment(
      'payment-1',
      {
        documentId: 'receivable-document-1',
        amount: 300_000_000,
        businessDate: '2026-09-09',
        idempotencyKey: 'allocate-payment-1',
      },
      request(),
    );
    await controller.releaseAllocation(
      'allocation-1',
      {
        businessDate: '2026-09-10',
        note: 'Phan bo nham chung tu',
        idempotencyKey: 'release-allocation-1',
      },
      request('admin-1'),
    );

    expect(calls[0]).toEqual({
      method: 'allocatePayment',
      input: expect.objectContaining({
        paymentId: 'payment-1',
        documentId: 'receivable-document-1',
        amount: 300_000_000,
      }),
    });
    expect(calls[1]).toEqual({
      method: 'releaseAllocation',
      input: expect.objectContaining({
        allocationId: 'allocation-1',
        sourceId: 'release-allocation-1',
        actor: 'admin-1',
      }),
    });
  });

  it('doc hang cho/summary co pham vi customer va summary bat buoc asOf', async () => {
    const { controller, calls } = fakeServices();
    await controller.pending({ customerId: 'customer-1' });
    await controller.summary({ asOf: '2026-09-09', customerId: 'customer-1' });

    expect(calls).toEqual([
      { method: 'pendingReconciliation', input: 'customer-1' },
      { method: 'summary', input: ['2026-09-09', 'customer-1'] },
    ]);
    expect(() => controller.summary({ customerId: 'customer-1' })).toThrow(BadRequestException);
  });

  it('thanh toan khong ton tai ra 404', async () => {
    const service = { paymentBalance: () => Promise.resolve(null) };
    const controller = new CustomerArController(
      service as unknown as CustomerArService,
      {} as CustomerArReadService,
    );
    await expect(controller.payment('missing')).rejects.toThrow(NotFoundException);
  });
});

describe('#292 — ma quyen cua tung route', () => {
  it.each([
    ['pending', 'transport.customer_reconciliation.read'],
    ['batches', 'transport.customer_reconciliation.read'],
    ['summary', 'transport.customer_reconciliation.read'],
    ['payment', 'transport.customer_payment.read'],
    ['confirmOrder', 'transport.customer_reconciliation.confirm'],
    ['createBatch', 'transport.customer_reconciliation.confirm'],
    ['resolveBatch', 'transport.customer_reconciliation.confirm'],
    ['recordPayment', 'transport.customer_payment.record'],
    ['allocatePayment', 'transport.customer_payment.allocate'],
    ['releaseAllocation', 'transport.customer_payment.correct'],
  ] as const)('%s doi %s va chi mo cho ADMIN/ACCOUNTING', (method, action) => {
    const handler = CustomerArController.prototype[method];
    expect(Reflect.getMetadata(TRANSPORT_ACTION_KEY, handler)).toBe(action);
    expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual(['ADMIN', 'ACCOUNTING']);
  });
});

describe('#292 — composition theo capability', () => {
  const namesFor = (capabilities: readonly CapabilityId[]) => {
    const composition = buildAppComposition(capabilities);
    return [
      ...composition.controllers.map((entry) => entry.name),
      ...composition.imports.map((entry) =>
        typeof entry === 'function' ? entry.name : String((entry as { name?: string }).name ?? ''),
      ),
    ];
  };

  it('den cung transport-settlement', () => {
    const names = namesFor([
      'transport-core',
      'transport-costing',
      'transport-fuel',
      'transport-acceptance',
      'transport-settlement',
    ]);
    expect(names).toContain('CustomerArController');
    expect(names).toContain('CustomerArModule');
  });

  it('bien mat khi tenant khong bat transport-settlement', () => {
    const names = namesFor([
      'transport-core',
      'transport-costing',
      'transport-fuel',
      'transport-acceptance',
    ]);
    expect(names).not.toContain('CustomerArController');
    expect(names).not.toContain('CustomerArModule');
  });
});
