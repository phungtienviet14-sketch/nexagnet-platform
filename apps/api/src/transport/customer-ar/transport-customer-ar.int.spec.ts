import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../config/prisma.service.js';
import {
  AcceptanceCounterpartyFactsAdapter,
  AcceptanceMovementFactsAdapter,
  NoOperationalDocumentsAdapter,
} from '../acceptance/acceptance-facts.port.js';
import { CommercialAcceptanceService } from '../acceptance/acceptance.service.js';
import { PrismaAcceptanceRepository } from '../acceptance/prisma-acceptance.repository.js';
import { PrismaCounterpartyRepository } from '../counterparty/prisma-counterparty.repository.js';
import { PrismaMovementRepository } from '../movement/prisma-movement.repository.js';
import { settlementDocumentFingerprint } from '../settlement/settlement-documents.js';
import { PrismaSettlementRepository } from '../settlement/prisma-settlement.repository.js';
import {
  customerPaymentAllocationFingerprint,
  customerPaymentFingerprint,
  customerReconciliationBatchFingerprint,
  customerReconciliationFingerprint,
} from './customer-ar-documents.js';
import { CustomerArReadService } from './customer-ar-read.service.js';
import { cleanupCustomerArFixtures } from './customer-ar-test-cleanup.js';
import { PrismaCustomerArRepository } from './prisma-customer-ar.repository.js';
describe.runIf(process.env.RUN_PRISMA_IT === '1')(
  'Customer reconciliation, receivable va payment tren Postgres — Issue #292',
  () => {
    const prisma = new PrismaService();
    const settlement = new PrismaSettlementRepository(prisma);
    const repository = new PrismaCustomerArRepository(prisma);
    const acceptance = new CommercialAcceptanceService(
      new PrismaAcceptanceRepository(prisma),
      new AcceptanceMovementFactsAdapter(new PrismaMovementRepository(prisma)),
      new NoOperationalDocumentsAdapter(),
      new AcceptanceCounterpartyFactsAdapter(new PrismaCounterpartyRepository(prisma)),
      { timeZone: 'Asia/Ho_Chi_Minh' },
    );
    const read = new CustomerArReadService(repository);
    const PREFIX = 'IT-Q292';
    const ACTOR = `${PREFIX}-ketoan`;
    const CUSTOMER_NAME = `${PREFIX}-khach`;
    const BUSINESS_DATE = '2026-09-09' as const;
    const state = { customerId: '', otherCustomerId: '' };
    let serial = 0;
    const cleanup = () => cleanupCustomerArFixtures(prisma, CUSTOMER_NAME, PREFIX);
    async function completedOrder(amount: number, customerId = state.customerId) {
      serial += 1;
      const order = await prisma.transportOrder.create({
        data: {
          code: `${PREFIX}-order-${serial}`,
          status: 'FULFILLED',
          businessDate: BUSINESS_DATE,
          customerId,
          originLabel: 'Ha Noi',
          destinationLabel: 'Hai Phong',
          freightAmount: BigInt(amount),
          currencyCode: 'VND',
        },
      });
      await acceptance.decide({
        orderId: order.id,
        outcome: 'APPROVED',
        reasonCode: 'DOCUMENT_RECEIVED',
        basis: 'EXTERNAL_PHYSICAL_CONFIRMATION',
        evidenceRefs: [],
        externalNote: 'B giu ban goc phieu giao',
        counterpartyId: null,
        supersedesId: null,
        idempotencyKey: `${PREFIX}-accept-${serial}`,
        authUserId: ACTOR,
      });
      return order;
    }
    async function confirm(
      order: { id: string },
      amount: number,
      sourceId: string,
      batchLineId: string | null = null,
      proposedAmount = amount,
    ) {
      const confirmationReference = `${PREFIX}-A-${sourceId}`;
      const dueDate = '2026-10-09' as const;
      const sourceFingerprint = customerReconciliationFingerprint({
        orderId: order.id,
        batchLineId,
        proposedAmount,
        confirmedAmount: amount,
        currencyCode: 'VND',
        businessDate: BUSINESS_DATE,
        differenceReason: null,
        confirmationReference,
        evidenceRefs: [],
      });
      const documentFingerprint = settlementDocumentFingerprint({
        direction: 'RECEIVABLE',
        flow: 'CUSTOMER_FREIGHT',
        counterpartyKind: 'CUSTOMER',
        counterpartyId: state.customerId,
        kind: 'ORIGINAL',
        signedAmount: amount,
        currencyCode: 'VND',
        businessDate: BUSINESS_DATE,
        dueDate,
        tripId: null,
        adjustsId: null,
      });
      return repository.confirmOrder({
        orderId: order.id,
        batchLineId,
        proposedAmount,
        confirmedAmount: amount,
        currencyCode: 'VND',
        businessDate: BUSINESS_DATE,
        dueDate,
        differenceReason: null,
        confirmationReference,
        evidenceRefs: [],
        sourceContext: 'CUSTOMER_RECONCILIATION',
        sourceId,
        sourceFingerprint,
        confirmedBy: ACTOR,
        document: {
          direction: 'RECEIVABLE',
          flow: 'CUSTOMER_FREIGHT',
          counterpartyKind: 'CUSTOMER',
          counterpartyId: state.customerId,
          signedAmount: amount,
          currencyCode: 'VND',
          businessDate: BUSINESS_DATE,
          dueDate,
          tripId: null,
          sourceContext: 'CUSTOMER_RECONCILIATION',
          sourceId: order.id,
          sourceFingerprint: documentFingerprint,
          invoiceRef: null,
          note: null,
          recordedBy: ACTOR,
        },
      });
    }
    async function payment(amount: number, sourceId: string, currencyCode = 'VND') {
      const receivedAt = new Date('2026-09-09T03:00:00.000Z');
      const externalRef = `${PREFIX}-bank-${sourceId}`;
      return repository.recordPayment({
        customerId: state.customerId,
        amount,
        currencyCode,
        receivedAt,
        businessDate: BUSINESS_DATE,
        externalRef,
        note: null,
        recordedBy: ACTOR,
        sourceContext: 'CUSTOMER_PAYMENT',
        sourceId,
        sourceFingerprint: customerPaymentFingerprint({
          customerId: state.customerId,
          amount,
          currencyCode,
          receivedAt: receivedAt.toISOString(),
          businessDate: BUSINESS_DATE,
          externalRef,
        }),
      });
    }
    async function allocate(
      paymentId: string,
      documentId: string,
      amount: number,
      sourceId: string,
    ) {
      return repository.allocatePayment({
        paymentId,
        documentId,
        amount,
        businessDate: BUSINESS_DATE,
        sourceContext: 'CUSTOMER_PAYMENT_ALLOCATION',
        sourceId,
        sourceFingerprint: customerPaymentAllocationFingerprint({
          paymentId,
          documentId,
          kind: 'APPLY',
          amount,
          businessDate: BUSINESS_DATE,
          reversesId: null,
        }),
        note: null,
        recordedBy: ACTOR,
      });
    }

    beforeAll(async () => {
      await cleanup();
      const customer = await prisma.transportCustomer.create({
        data: { name: `${CUSTOMER_NAME}-A` },
      });
      const other = await prisma.transportCustomer.create({ data: { name: `${CUSTOMER_NAME}-B` } });
      state.customerId = customer.id;
      state.otherCustomerId = other.id;
      await settlement.upsertCustomerTerms({
        customerId: customer.id,
        paymentTermDays: 30,
        creditLimit: null,
        currencyCode: 'VND',
        updatedBy: ACTOR,
      });
    });

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });
    it('ke toan ket thuc Order chi tao pending reconciliation, CHUA tao cong no chinh thuc', async () => {
      const order = await completedOrder(11_000_000);

      expect(
        await prisma.transportSettlementDocument.count({
          where: { sourceId: order.id, flow: 'CUSTOMER_FREIGHT' },
        }),
      ).toBe(0);
      expect(
        await prisma.transportCustomerReconciliation.count({ where: { orderId: order.id } }),
      ).toBe(0);
      const pending = await repository.pendingOrders();
      expect(pending).toContainEqual(
        expect.objectContaining({
          orderId: order.id,
          customerId: state.customerId,
          proposedAmount: 11_000_000,
        }),
      );
    });

    it('A co the xac nhan tung dong trong batch, defer dong con lai va dong batch co audit', async () => {
      const orders = await Promise.all(Array.from({ length: 10 }, (_, index) => completedOrder(7_000_000 + index)));
      const sourceId = `${PREFIX}-batch`;
      const orderIds = orders.map((order) => order.id);
      const sourceFingerprint = customerReconciliationBatchFingerprint({
        customerId: state.customerId,
        orderIds,
        currencyCode: 'VND',
        periodStart: BUSINESS_DATE,
        periodEnd: BUSINESS_DATE,
      });
      const created = await repository.createBatch({
        customerId: state.customerId,
        orderIds,
        currencyCode: 'VND',
        periodStart: BUSINESS_DATE,
        periodEnd: BUSINESS_DATE,
        reference: `${PREFIX}-statement`,
        note: null,
        sourceContext: 'CUSTOMER_RECONCILIATION_BATCH',
        sourceId,
        sourceFingerprint,
        createdBy: ACTOR,
      });
      const replay = await repository.createBatch({
        customerId: state.customerId,
        orderIds,
        currencyCode: 'VND',
        periodStart: BUSINESS_DATE,
        periodEnd: BUSINESS_DATE,
        reference: `${PREFIX}-statement`,
        note: null,
        sourceContext: 'CUSTOMER_RECONCILIATION_BATCH',
        sourceId,
        sourceFingerprint,
        createdBy: ACTOR,
      });
      expect(replay).toMatchObject({ replayed: true, batch: { id: created.batch.id } });

      const disputed = created.batch.lines.find((line) => line.orderId === orders[9]!.id)!;
      await expect(confirm(orders[0]!, 7_000_000, `${PREFIX}-batch-bypass`)).rejects
        .toMatchObject({ reason: 'CUSTOMER_AR_ORDER_ALREADY_IN_BATCH' });
      await expect(prisma.$transaction(async (tx) => {
        const order = orders[0]!;
        const identity = { direction: 'RECEIVABLE' as const, flow: 'CUSTOMER_FREIGHT' as const,
          counterpartyKind: 'CUSTOMER' as const, counterpartyId: state.customerId,
          kind: 'ORIGINAL' as const, signedAmount: 7_000_000, currencyCode: 'VND',
          businessDate: BUSINESS_DATE, dueDate: null, tripId: null, adjustsId: null };
        const document = await tx.transportSettlementDocument.create({ data: { ...identity,
          status: 'POSTED', signedAmount: 7_000_000n, sourceContext: 'CUSTOMER_RECONCILIATION',
          sourceId: order.id, sourceFingerprint: settlementDocumentFingerprint(identity),
          invoiceRef: null, note: null, recordedBy: ACTOR } });
        const reconciliationIdentity = { orderId: order.id, batchLineId: null,
          proposedAmount: 7_000_000, confirmedAmount: 7_000_000, currencyCode: 'VND',
          businessDate: BUSINESS_DATE, differenceReason: null, confirmationReference: null,
          evidenceRefs: [] as readonly string[] };
        await tx.transportCustomerReconciliation.create({ data: {
          orderId: order.id, customerId: state.customerId, batchLineId: null,
          proposedAmount: 7_000_000n, confirmedAmount: 7_000_000n, differenceAmount: 0n,
          currencyCode: 'VND', businessDate: BUSINESS_DATE, dueDate: null,
          differenceReason: null, confirmationReference: null, evidenceRefs: [],
          sourceContext: 'CUSTOMER_RECONCILIATION', sourceId: `${PREFIX}-raw-batch-bypass`,
          sourceFingerprint: customerReconciliationFingerprint(reconciliationIdentity),
          confirmedBy: ACTOR, settlementDocumentId: document.id,
        } });
      })).rejects.toThrow(/pending reconciliation batch line/i);
      await expect(prisma.transportCustomerReconciliationBatchLine.update({ where: { id: disputed.id },
        data: { state: 'CONFIRMED', resolvedBy: ACTOR, resolvedAt: new Date(),
          resolutionSourceId: `${PREFIX}-forged-line`, resolutionFingerprint: 'forged' } }))
        .rejects.toThrow(/requires reconciliation audit/i);
      for (const [index, order] of orders.slice(0, 9).entries()) {
        const line = created.batch.lines.find((entry) => entry.orderId === order.id)!;
        await confirm(order, 7_000_000 + index, `${PREFIX}-batch-confirm-${index}`, line.id);
      }
      await repository.deferBatchLine({
        batchId: created.batch.id,
        lineId: disputed.id,
        reason: 'A chua ky dong nay',
        sourceId: `${PREFIX}-batch-defer`,
        sourceFingerprint: JSON.stringify([created.batch.id, disputed.id, 'DEFER', 'A chua ky dong nay']),
        actor: ACTOR,
      });
      const closed = await repository.closeBatch(created.batch.id, ACTOR);

      expect(closed).toMatchObject({
        status: 'CLOSED',
        closedBy: ACTOR,
        lines: expect.arrayContaining([expect.objectContaining({ id: disputed.id, state: 'DEFERRED' })]),
      });
      expect(closed.lines.filter((line) => line.state === 'CONFIRMED')).toHaveLength(9);
      expect(await prisma.transportSettlementDocument.count({
        where: { sourceId: { in: orderIds }, flow: 'CUSTOMER_FREIGHT' },
      })).toBe(9);
    });

    it('A xac nhan sinh dung MOT official settlement document; replay va conflict deu co kieu', async () => {
      const order = await completedOrder(12_000_000);
      const sourceIds = [`${PREFIX}-confirm-race-a`, `${PREFIX}-confirm-race-b`];
      const race = await Promise.allSettled(sourceIds.map((id) => confirm(order, 12_000_000, id)));
      expect(race.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(race.filter((result) => result.status === 'rejected')).toHaveLength(1);
      const winner = race.find((result) => result.status === 'fulfilled')!;
      const first = winner.value;
      const sourceId = first.reconciliation.sourceId;
      const replay = await confirm(order, 12_000_000, sourceId);

      expect(first.replayed).toBe(false);
      expect(replay.replayed).toBe(true);
      expect(replay.reconciliation.id).toBe(first.reconciliation.id);
      expect(
        await prisma.transportSettlementDocument.count({
          where: { sourceId: order.id, flow: 'CUSTOMER_FREIGHT', kind: 'ORIGINAL' },
        }),
      ).toBe(1);
      expect(
        await prisma.transportCustomerReconciliation.count({ where: { orderId: order.id } }),
      ).toBe(1);
      const otherOrder = await completedOrder(10_000_000);
      await expect(confirm(otherOrder, 1_000_000, `${PREFIX}-hidden-variance`, null, 1_000_000)).rejects
        .toMatchObject({ reason: 'CUSTOMER_AR_PROPOSED_AMOUNT_MISMATCH' });
      const difference = await confirm(otherOrder, 9_000_000, `${PREFIX}-difference`, null, 10_000_000);
      expect(difference.reconciliation).toMatchObject({
        proposedAmount: 10_000_000, confirmedAmount: 9_000_000, differenceAmount: 1_000_000,
      });

      await expect(confirm(order, 11_500_000, sourceId)).rejects.toMatchObject({
        reason: 'CUSTOMER_AR_SOURCE_FINGERPRINT_CONFLICT',
      });

      // Conflict khong duoc de lai mot settlement document mo coi.
      expect(
        await prisma.transportSettlementDocument.count({
          where: { sourceId: order.id, flow: 'CUSTOMER_FREIGHT', kind: 'ORIGINAL' },
        }),
      ).toBe(1);
    });

    it('ky CUSTOMER_FREIGHT dang dong bang chan ca official receivable va rollback document', async () => {
      const activeOrder = await completedOrder(3_000_000);
      const activeReceivable = await confirm(activeOrder, 3_000_000, `${PREFIX}-before-frozen`);
      const activePayment = await payment(2_000_000, `${PREFIX}-payment-before-frozen`);
      const activeAllocation = await allocate(activePayment.payment.id,
        activeReceivable.reconciliation.settlementDocumentId, 1_000_000, `${PREFIX}-allocation-before-frozen`);
      const order = await completedOrder(4_000_000);
      const existing = await settlement.findPeriodCovering('CUSTOMER_FREIGHT', BUSINESS_DATE);
      const period = existing ?? await settlement.openPeriod({
        flow: 'CUSTOMER_FREIGHT', startDate: BUSINESS_DATE, endDate: BUSINESS_DATE,
      });
      await settlement.transitionPeriod({ periodId: period.id, to: 'CLOSING', actor: ACTOR, reason: null });
      try {
        await expect(confirm(order, 4_000_000, `${PREFIX}-frozen`)).rejects.toMatchObject({
          reason: 'SETTLEMENT_PERIOD_FROZEN',
        });
        await expect(payment(1_000_000, `${PREFIX}-payment-frozen`)).rejects.toMatchObject({
          reason: 'SETTLEMENT_PERIOD_FROZEN',
        });
        await expect(allocate(activePayment.payment.id,
          activeReceivable.reconciliation.settlementDocumentId, 1_000_000,
          `${PREFIX}-allocation-frozen`)).rejects.toMatchObject({ reason: 'SETTLEMENT_PERIOD_FROZEN' });
        await expect(repository.releaseAllocation({ allocationId: activeAllocation.allocation.id,
          businessDate: BUSINESS_DATE, sourceContext: 'CUSTOMER_PAYMENT_ALLOCATION_RELEASE',
          sourceId: `${PREFIX}-release-frozen`, sourceFingerprint: 'release-frozen', note: null,
          recordedBy: ACTOR })).rejects.toMatchObject({ reason: 'SETTLEMENT_PERIOD_FROZEN' });
        expect(await prisma.transportSettlementDocument.count({ where: { sourceId: order.id } })).toBe(0);
      } finally {
        await settlement.transitionPeriod({ periodId: period.id, to: 'OPEN', actor: ACTOR, reason: 'test cleanup' });
      }
    });

    it('DB khong cho gan reconciliation vao settlement document cua khach/so tien khac', async () => {
      const order = await completedOrder(5_000_000);
      const sourceId = `${PREFIX}-wrong-document`;
      const wrongFingerprint = settlementDocumentFingerprint({
        direction: 'RECEIVABLE',
        flow: 'CUSTOMER_FREIGHT',
        counterpartyKind: 'CUSTOMER',
        counterpartyId: state.otherCustomerId,
        kind: 'ORIGINAL',
        signedAmount: 1_000_000,
        currencyCode: 'VND',
        businessDate: BUSINESS_DATE,
        dueDate: null,
        tripId: null,
        adjustsId: null,
      });
      await expect(settlement.recogniseDocument({ direction: 'RECEIVABLE', flow: 'CUSTOMER_FREIGHT', counterpartyKind: 'CUSTOMER',
        counterpartyId: state.otherCustomerId, signedAmount: 1_000_000, currencyCode: 'VND',
        businessDate: BUSINESS_DATE, dueDate: null, tripId: null, sourceContext: 'TRIP_RECONCILED',
        sourceId, sourceFingerprint: wrongFingerprint, invoiceRef: null, note: null, recordedBy: ACTOR }))
        .rejects.toThrow(/requires customer reconciliation/i);
      const wrongDocument = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('ALTER TABLE "TransportSettlementDocument" DISABLE TRIGGER USER');
        const row = await tx.transportSettlementDocument.create({ data: {
          direction: 'RECEIVABLE', flow: 'CUSTOMER_FREIGHT', counterpartyKind: 'CUSTOMER',
          counterpartyId: state.otherCustomerId, kind: 'ORIGINAL', status: 'POSTED',
          signedAmount: BigInt(1_000_000), currencyCode: 'VND', businessDate: BUSINESS_DATE,
          dueDate: null, tripId: null, sourceContext: 'TRIP_RECONCILED', sourceId,
          sourceFingerprint: wrongFingerprint, invoiceRef: null, note: null, recordedBy: ACTOR,
        } });
        await tx.$executeRawUnsafe('ALTER TABLE "TransportSettlementDocument" ENABLE TRIGGER USER');
        return row;
      });

      await expect(
        prisma.transportCustomerReconciliation.create({
          data: {
            orderId: order.id,
            customerId: state.customerId,
            proposedAmount: BigInt(5_000_000),
            confirmedAmount: BigInt(5_000_000),
            differenceAmount: BigInt(0),
            currencyCode: 'VND',
            businessDate: BUSINESS_DATE,
            dueDate: null,
            evidenceRefs: [],
            sourceContext: 'CUSTOMER_RECONCILIATION',
            sourceId,
            sourceFingerprint: `${PREFIX}-wrong-link-fingerprint`,
            confirmedBy: ACTOR,
            settlementDocumentId: wrongDocument.id,
          },
        }),
      ).rejects.toThrow(/settlement document/i);
      expect(
        await prisma.transportCustomerReconciliation.count({ where: { orderId: order.id } }),
      ).toBe(0);
    });

    it('prepayment giu credit chua phan bo; payment va receivable deu many-to-many, co partial', async () => {
      const prepayment = await payment(25_000_000, `${PREFIX}-prepay`);
      expect((await payment(25_000_000, `${PREFIX}-prepay`)).replayed).toBe(true);
      await expect(payment(24_000_000, `${PREFIX}-prepay`)).rejects.toMatchObject({
        reason: 'CUSTOMER_PAYMENT_SOURCE_FINGERPRINT_CONFLICT',
      });
      expect(await repository.paymentBalance(prepayment.payment.id)).toMatchObject({
        allocatedAmount: 0,
        unallocatedAmount: 25_000_000,
      });

      const orderOne = await completedOrder(10_000_000);
      const orderTwo = await completedOrder(25_000_000);
      const receivableOne = await confirm(orderOne, 10_000_000, `${PREFIX}-m2m-r1`);
      const receivableTwo = await confirm(orderTwo, 25_000_000, `${PREFIX}-m2m-r2`);
      const laterPayment = await payment(15_000_000, `${PREFIX}-m2m-p2`);

      await allocate(
        prepayment.payment.id,
        receivableOne.reconciliation.settlementDocumentId,
        5_000_000,
        `${PREFIX}-m2m-a1`,
      );
      await allocate(
        prepayment.payment.id,
        receivableTwo.reconciliation.settlementDocumentId,
        10_000_000,
        `${PREFIX}-m2m-a2`,
      );
      await allocate(
        laterPayment.payment.id,
        receivableOne.reconciliation.settlementDocumentId,
        5_000_000,
        `${PREFIX}-m2m-a3`,
      );
      await allocate(
        laterPayment.payment.id,
        receivableTwo.reconciliation.settlementDocumentId,
        10_000_000,
        `${PREFIX}-m2m-a4`,
      );

      expect(await repository.paymentBalance(prepayment.payment.id)).toMatchObject({
        allocatedAmount: 15_000_000,
        unallocatedAmount: 10_000_000,
      });
      expect(await repository.paymentBalance(laterPayment.payment.id)).toMatchObject({
        allocatedAmount: 15_000_000,
        unallocatedAmount: 0,
      });
      expect(
        await settlement.findChain(receivableOne.reconciliation.settlementDocumentId),
      ).toMatchObject({
        grossAmount: 10_000_000,
        outstandingAmount: 0,
      });
      await expect(prisma.transportSettlementAllocation.create({ data: { documentId: receivableOne.reconciliation.settlementDocumentId, amount: BigInt(1),
        businessDate: BUSINESS_DATE, method: 'BANK', sourceContext: 'IT_FORGED_LEGACY',
        sourceId: `${PREFIX}-legacy-overallocate`, note: null, recordedBy: ACTOR } }))
        .rejects.toThrow(/exceeds customer receivable outstanding/i);
      const usdPayment = await payment(1_000_000, `${PREFIX}-usd`, 'USD');
      await expect(allocate(usdPayment.payment.id, receivableTwo.reconciliation.settlementDocumentId,
        1_000_000, `${PREFIX}-currency-mismatch`)).rejects.toMatchObject({ reason: 'CUSTOMER_AR_CURRENCY_MISMATCH' });
      expect(
        await settlement.findChain(receivableTwo.reconciliation.settlementDocumentId),
      ).toMatchObject({
        grossAmount: 25_000_000,
        outstandingAmount: 5_000_000,
      });

      const summary = await read.summary('2026-09-30', state.customerId);
      const ownedDocuments = new Set([
        receivableOne.reconciliation.settlementDocumentId,
        receivableTwo.reconciliation.settlementDocumentId,
      ]);
      const ownedReceivables = summary.receivables.filter((entry) =>
        ownedDocuments.has(entry.documentId),
      );
      expect(ownedReceivables.reduce((total, entry) => total + entry.grossAmount, 0)).toBe(
        35_000_000,
      );
      expect(ownedReceivables.reduce((total, entry) => total + entry.outstandingAmount, 0)).toBe(
        5_000_000,
      );
      const overdue = await read.summary('2026-10-10', state.customerId);
      expect(overdue.receivables.find((entry) => entry.documentId === receivableTwo.reconciliation.settlementDocumentId))
        .toMatchObject({ outstandingAmount: 5_000_000, status: 'OVERDUE' });
      const ownedPayments = summary.payments.filter((entry) =>
        [prepayment.payment.id, laterPayment.payment.id].includes(entry.payment.id),
      );
      expect(ownedPayments.reduce((total, entry) => total + entry.unallocatedAmount, 0)).toBe(
        10_000_000,
      );
    });

    it('hai allocation dong thoi khong the cung tieu mot payment balance', async () => {
      const orderOne = await completedOrder(10_000_000);
      const orderTwo = await completedOrder(10_000_000);
      const receivableOne = await confirm(orderOne, 10_000_000, `${PREFIX}-race-r1`);
      const receivableTwo = await confirm(orderTwo, 10_000_000, `${PREFIX}-race-r2`);
      const incoming = await payment(10_000_000, `${PREFIX}-race-payment`);

      const outcomes = await Promise.allSettled([
        allocate(
          incoming.payment.id,
          receivableOne.reconciliation.settlementDocumentId,
          7_000_000,
          `${PREFIX}-race-a1`,
        ),
        allocate(
          incoming.payment.id,
          receivableTwo.reconciliation.settlementDocumentId,
          7_000_000,
          `${PREFIX}-race-a2`,
        ),
      ]);

      expect(outcomes.filter((entry) => entry.status === 'fulfilled')).toHaveLength(1);
      expect(outcomes.filter((entry) => entry.status === 'rejected')).toHaveLength(1);
      expect(outcomes.find((entry) => entry.status === 'rejected')).toMatchObject({
        reason: expect.objectContaining({ reason: 'CUSTOMER_PAYMENT_ALLOCATION_EXCEEDS_BALANCE' }),
      });
      expect(await repository.paymentBalance(incoming.payment.id)).toMatchObject({
        allocatedAmount: 7_000_000,
        unallocatedAmount: 3_000_000,
      });
      expect(
        await prisma.transportCustomerPaymentAllocation.count({
          where: { paymentId: incoming.payment.id, kind: 'APPLY' },
        }),
      ).toBe(1);
    });

    it('release la mot audit row moi, khong sua allocation cu', async () => {
      const order = await completedOrder(9_000_000);
      const receivable = await confirm(order, 9_000_000, `${PREFIX}-release-r`);
      const incoming = await payment(9_000_000, `${PREFIX}-release-p`);
      const applied = await allocate(
        incoming.payment.id,
        receivable.reconciliation.settlementDocumentId,
        9_000_000,
        `${PREFIX}-release-apply`,
      );

      const releaseSourceId = `${PREFIX}-release-row`;
      const released = await repository.releaseAllocation({
        allocationId: applied.allocation.id,
        businessDate: BUSINESS_DATE,
        sourceContext: 'CUSTOMER_PAYMENT_ALLOCATION_RELEASE',
        sourceId: releaseSourceId,
        sourceFingerprint: customerPaymentAllocationFingerprint({
          paymentId: applied.allocation.paymentId,
          documentId: applied.allocation.documentId,
          kind: 'RELEASE',
          amount: 9_000_000,
          businessDate: BUSINESS_DATE,
          reversesId: applied.allocation.id,
        }),
        note: 'Nhap nham cong no',
        recordedBy: ACTOR,
      });

      expect(released.allocation).toMatchObject({
        kind: 'RELEASE',
        reversesId: applied.allocation.id,
      });
      expect(await repository.paymentBalance(incoming.payment.id)).toMatchObject({
        allocatedAmount: 0,
        unallocatedAmount: 9_000_000,
      });
      expect(
        await settlement.findChain(receivable.reconciliation.settlementDocumentId),
      ).toMatchObject({
        outstandingAmount: 9_000_000,
      });
      expect(
        await prisma.transportCustomerPaymentAllocation.count({
          where: { paymentId: incoming.payment.id },
        }),
      ).toBe(2);
    });

    it('reconciliation, payment va allocation da ghi deu khong UPDATE/DELETE duoc bang SQL tho', async () => {
      const order = await completedOrder(8_000_000);
      const receivable = await confirm(order, 8_000_000, `${PREFIX}-audit-r`);
      const incoming = await payment(8_000_000, `${PREFIX}-audit-p`);
      const applied = await allocate(
        incoming.payment.id,
        receivable.reconciliation.settlementDocumentId,
        3_000_000,
        `${PREFIX}-audit-a`,
      );
      const legacyAllocation = await prisma.transportSettlementAllocation.create({ data: {
        documentId: receivable.reconciliation.settlementDocumentId, amount: 1_000_000n,
        businessDate: BUSINESS_DATE, method: 'BANK', sourceContext: 'IT_LEGACY_PAYMENT',
        sourceId: `${PREFIX}-audit-legacy-a`, note: null, recordedBy: ACTOR,
      } });

      await expect(
        prisma.$executeRawUnsafe(
          'UPDATE "TransportCustomerReconciliation" SET "differenceReason" = $1 WHERE "id" = $2',
          'silent rewrite',
          receivable.reconciliation.id,
        ),
      ).rejects.toThrow(/append[-_]only/);
      await expect(prisma.transportSettlementAllocation.update({ where: { id: legacyAllocation.id },
        data: { amount: 2_000_000n } })).rejects.toThrow(/append[-_]only/);
      await expect(prisma.transportSettlementAllocation.delete({ where: { id: legacyAllocation.id } }))
        .rejects.toThrow(/append[-_]only/);
      await expect(prisma.transportSettlementDocument.update({ where: { id: receivable.reconciliation.settlementDocumentId },
        data: { status: 'REVERSED' } })).rejects.toThrow(/requires a complete reversal audit row/i);
      await expect(
        prisma.$executeRawUnsafe(
          'UPDATE "TransportCustomerPayment" SET "note" = $1 WHERE "id" = $2',
          'silent rewrite',
          incoming.payment.id,
        ),
      ).rejects.toThrow(/append[-_]only/);
      await expect(
        prisma.$executeRawUnsafe(
          'DELETE FROM "TransportCustomerPaymentAllocation" WHERE "id" = $1',
          applied.allocation.id,
        ),
      ).rejects.toThrow(/append[-_]only/);

      expect(
        await prisma.transportCustomerReconciliation.findUnique({
          where: { id: receivable.reconciliation.id },
        }),
      ).toMatchObject({ differenceReason: null });
      expect(
        await prisma.transportCustomerPayment.findUnique({ where: { id: incoming.payment.id } }),
      ).toMatchObject({ note: null });
      expect(
        await prisma.transportCustomerPaymentAllocation.findUnique({
          where: { id: applied.allocation.id },
        }),
      ).not.toBeNull();
    });

    it('legacy CUSTOMER_FREIGHT document van doc va nhan payment qua cung allocation ledger', async () => {
      const sourceId = `${PREFIX}-legacy-document`;
      const fingerprint = settlementDocumentFingerprint({
        direction: 'RECEIVABLE',
        flow: 'CUSTOMER_FREIGHT',
        counterpartyKind: 'CUSTOMER',
        counterpartyId: state.customerId,
        kind: 'ORIGINAL',
        signedAmount: 6_000_000,
        currencyCode: 'VND',
        businessDate: BUSINESS_DATE,
        dueDate: '2026-10-09',
        tripId: null,
        adjustsId: null,
      });
      const legacy = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('ALTER TABLE "TransportSettlementDocument" DISABLE TRIGGER USER');
        const row = await tx.transportSettlementDocument.create({ data: {
          direction: 'RECEIVABLE', flow: 'CUSTOMER_FREIGHT', counterpartyKind: 'CUSTOMER',
          counterpartyId: state.customerId, kind: 'ORIGINAL', status: 'POSTED',
          signedAmount: BigInt(6_000_000), currencyCode: 'VND', businessDate: BUSINESS_DATE,
          dueDate: '2026-10-09', tripId: null, sourceContext: 'TRIP_RECONCILED', sourceId,
          sourceFingerprint: fingerprint, invoiceRef: null,
          note: 'Legacy receivable khong co reconciliation row', recordedBy: ACTOR,
        } });
        await tx.$executeRawUnsafe('ALTER TABLE "TransportSettlementDocument" ENABLE TRIGGER USER');
        return row;
      });
      const incoming = await payment(4_000_000, `${PREFIX}-legacy-payment`);

      await allocate(
        incoming.payment.id,
        legacy.id,
        4_000_000,
        `${PREFIX}-legacy-allocation`,
      );

      expect(await settlement.findChain(legacy.id)).toMatchObject({
        grossAmount: 6_000_000,
        outstandingAmount: 2_000_000,
      });
      const summary = await read.summary('2026-09-30', state.customerId);
      expect(summary.receivables).toContainEqual(
        expect.objectContaining({
          documentId: legacy.id,
          reconciliation: null,
          outstandingAmount: 2_000_000,
        }),
      );
    });
  },
);
