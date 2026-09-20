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

  /**
   * `#296` — mot `cuid` KHONG duoc phep la nhan nghiep vu.
   *
   * Ba o nhap cu doi ke toan go `customerId`, `paymentId` va `documentId`. Bo bai nay khoa cai
   * thay the chung: nhan da ghep san, doc duoc, va ID chi con nam trong `value` cua o chon.
   */
  const CUSTOMERS = [
    { id: 'cus-nam-phong', name: 'Công ty Nam Phong' },
    { id: 'cus-hai-ha', name: 'Hải Hà Logistics' },
  ];
  const ORDERS = [{ id: 'order-1', code: 'SO-2026-0001' }];

  const summaryWith = (input: {
    readonly receivables: Parameters<typeof toCustomerArWorkspace>[0]['summary']['receivables'];
    readonly payments: Parameters<typeof toCustomerArWorkspace>[0]['summary']['payments'];
  }) => ({
    asOf: '2026-09-20',
    customerId: null,
    pendingReconciliationAmount: 0,
    officialReceivableAmount: 0,
    outstandingAmount: 0,
    notYetDueAmount: 0,
    dueAmount: 0,
    overdueAmount: 0,
    paidAmount: 0,
    unallocatedCreditAmount: 0,
    ...input,
  });

  const payment = (over: Record<string, unknown>) => ({
    payment: {
      id: 'pay-1',
      customerId: 'cus-nam-phong',
      amount: 5_000_000,
      currencyCode: 'VND',
      receivedAt: '2026-09-20T01:00:00.000Z',
      businessDate: '2026-09-20',
      externalRef: 'VCB-9911',
      note: null,
      recordedBy: 'ke-toan',
      sourceId: 'src',
      sourceFingerprint: 'fp',
      createdAt: '2026-09-20T01:00:00.000Z',
      ...over,
    },
    allocations: [],
    allocatedAmount: 0,
    unallocatedAmount: 5_000_000,
  });

  it('gives every money row a label a person can read, and keeps the id out of it', () => {
    const model = toCustomerArWorkspace({
      asOf: '2026-09-20',
      pending: [
        {
          orderId: 'order-1',
          orderCode: 'SO-2026-0001',
          customerId: 'cus-nam-phong',
          proposedAmount: 5_000_000,
          currencyCode: 'VND',
          businessDate: '2026-09-20',
        },
      ],
      batches: [],
      customers: CUSTOMERS,
      orders: ORDERS,
      summary: summaryWith({
        receivables: [
          {
            reconciliation: { orderId: 'order-1' },
            documentId: 'doc-1',
            customerId: 'cus-nam-phong',
            currencyCode: 'VND',
            grossAmount: 5_000_000,
            allocatedAmount: 0,
            outstandingAmount: 5_000_000,
            dueDate: '2026-10-05',
            status: 'NOT_YET_DUE',
          },
        ],
        payments: [payment({})],
      }),
    });

    expect(model.pendingRows[0]?.customerName).toBe('Công ty Nam Phong');
    expect(model.paymentChoices).toEqual([
      {
        id: 'pay-1',
        customerId: 'cus-nam-phong',
        currencyCode: 'VND',
        unallocatedAmount: 5_000_000,
        label:
          'Công ty Nam Phong · 5.000.000 VND · nhận 20/09/2026 · còn 5.000.000 VND chưa phân bổ · VCB-9911',
      },
    ]);
    expect(model.receivableChoices).toEqual([
      {
        documentId: 'doc-1',
        customerId: 'cus-nam-phong',
        currencyCode: 'VND',
        outstandingAmount: 5_000_000,
        label: 'SO-2026-0001 · Công ty Nam Phong · còn 5.000.000 VND · chưa đến hạn (hạn 05/10/2026)',
      },
    ]);
    for (const choice of [...model.paymentChoices, ...model.receivableChoices]) {
      expect(choice.label).not.toContain('cus-nam-phong');
      expect(choice.label).not.toContain('doc-1');
      expect(choice.label).not.toContain('pay-1');
    }
  });

  /**
   * Mot khoan da phan bo het van nam trong so, nhung dua no vao o chon la moi ke toan lam mot viec
   * ma may chu se tu choi. Cung the voi mot chung tu da thu du.
   */
  it('offers only money that can still move', () => {
    const model = toCustomerArWorkspace({
      asOf: '2026-09-20',
      pending: [],
      batches: [],
      customers: CUSTOMERS,
      orders: ORDERS,
      summary: summaryWith({
        receivables: [
          {
            reconciliation: { orderId: 'order-1' },
            documentId: 'doc-paid',
            customerId: 'cus-nam-phong',
            currencyCode: 'VND',
            grossAmount: 5_000_000,
            allocatedAmount: 5_000_000,
            outstandingAmount: 0,
            dueDate: null,
            status: 'PAID',
          },
        ],
        payments: [{ ...payment({ id: 'pay-used' }), allocatedAmount: 5_000_000, unallocatedAmount: 0 }],
      }),
    });

    expect(model.paymentChoices).toEqual([]);
    expect(model.receivableChoices).toEqual([]);
  });

  /** Khach khong con trong danh muc: noi that, chu KHONG roi ve chinh `customerId`. */
  it('never falls back to the raw id when a customer is missing from the directory', () => {
    const model = toCustomerArWorkspace({
      asOf: '2026-09-20',
      pending: [],
      batches: [],
      customers: [],
      orders: [],
      summary: summaryWith({
        receivables: [
          {
            reconciliation: null,
            documentId: 'doc-x',
            customerId: 'cus-go-roi',
            currencyCode: 'VND',
            grossAmount: 1_000_000,
            allocatedAmount: 0,
            outstandingAmount: 1_000_000,
            dueDate: null,
            status: 'DUE',
          },
        ],
        payments: [],
      }),
    });

    const label = model.receivableChoices[0]?.label ?? '';
    expect(label).toContain('Chứng từ chưa gắn đơn');
    expect(label).toContain('Khách không còn trong danh mục');
    expect(label).not.toContain('cus-go-roi');
  });
});
