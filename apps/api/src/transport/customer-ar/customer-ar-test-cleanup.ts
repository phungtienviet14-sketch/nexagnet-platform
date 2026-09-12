import type { PrismaService } from '../../config/prisma.service.js';

/** Xoa fixture AR co tien to rieng; chi dung bo Postgres integration test. */
export async function cleanupCustomerArFixtures(
  prisma: PrismaService,
  customerNamePrefix: string,
  tripCodePrefix: string,
): Promise<void> {
  const customers = await prisma.transportCustomer.findMany({
    where: { name: { startsWith: customerNamePrefix } }, select: { id: true },
  });
  const customerIds = customers.map((row) => row.id);
  if (customerIds.length === 0) return;
  const orders = await prisma.transportOrder.findMany({
    where: { customerId: { in: customerIds } }, select: { id: true },
  });
  const orderIds = orders.map((row) => row.id);
  const documents = await prisma.transportSettlementDocument.findMany({
    where: { counterpartyId: { in: customerIds } }, select: { id: true },
  });
  const documentIds = documents.map((row) => row.id);
  const acceptances = await prisma.transportCommercialAcceptance.findMany({
    where: { orderId: { in: orderIds } }, select: { id: true },
  });
  const acceptanceIds = acceptances.map((row) => row.id);

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      'ALTER TABLE "TransportCustomerPaymentAllocation" DISABLE TRIGGER USER',
    );
    await tx.transportCustomerPaymentAllocation.deleteMany({ where: { OR: [
      { payment: { customerId: { in: customerIds } } }, { documentId: { in: documentIds } },
    ] } });
    await tx.$executeRawUnsafe(
      'ALTER TABLE "TransportCustomerPaymentAllocation" ENABLE TRIGGER USER',
    );
    await tx.$executeRawUnsafe('ALTER TABLE "TransportCustomerPayment" DISABLE TRIGGER USER');
    await tx.transportCustomerPayment.deleteMany({ where: { customerId: { in: customerIds } } });
    await tx.$executeRawUnsafe('ALTER TABLE "TransportCustomerPayment" ENABLE TRIGGER USER');
    await tx.$executeRawUnsafe(
      'ALTER TABLE "TransportCustomerReconciliation" DISABLE TRIGGER USER',
    );
    await tx.transportCustomerReconciliation.deleteMany({ where: { customerId: { in: customerIds } } });
    await tx.$executeRawUnsafe(
      'ALTER TABLE "TransportCustomerReconciliation" ENABLE TRIGGER USER',
    );
  });

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      'ALTER TABLE "TransportCustomerReconciliationBatchLine" DISABLE TRIGGER USER',
    );
    await tx.transportCustomerReconciliationBatchLine.deleteMany({
      where: { batch: { customerId: { in: customerIds } } },
    });
    await tx.$executeRawUnsafe(
      'ALTER TABLE "TransportCustomerReconciliationBatchLine" ENABLE TRIGGER USER',
    );
    await tx.$executeRawUnsafe(
      'ALTER TABLE "TransportCustomerReconciliationBatch" DISABLE TRIGGER USER',
    );
    await tx.transportCustomerReconciliationBatch.deleteMany({ where: { customerId: { in: customerIds } } });
    await tx.$executeRawUnsafe(
      'ALTER TABLE "TransportCustomerReconciliationBatch" ENABLE TRIGGER USER',
    );
  });
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('ALTER TABLE "TransportSettlementAllocation" DISABLE TRIGGER USER');
    await tx.transportSettlementAllocation.deleteMany({ where: { documentId: { in: documentIds } } });
    await tx.$executeRawUnsafe('ALTER TABLE "TransportSettlementAllocation" ENABLE TRIGGER USER');
  });
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('ALTER TABLE "TransportSettlementDocument" DISABLE TRIGGER USER');
    await tx.transportSettlementDocument.deleteMany({
      where: { id: { in: documentIds }, kind: { not: 'ORIGINAL' } },
    });
    await tx.transportSettlementDocument.deleteMany({ where: { id: { in: documentIds } } });
    await tx.$executeRawUnsafe('ALTER TABLE "TransportSettlementDocument" ENABLE TRIGGER USER');
  });
  await prisma.transportCustomerTerms.deleteMany({ where: { customerId: { in: customerIds } } });

  if (acceptanceIds.length > 0) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        'ALTER TABLE "TransportCommercialAcceptanceDecision" DISABLE TRIGGER USER',
      );
      await tx.transportCommercialAcceptanceDecision.deleteMany({
        where: { acceptanceId: { in: acceptanceIds } },
      });
      await tx.$executeRawUnsafe(
        'ALTER TABLE "TransportCommercialAcceptanceDecision" ENABLE TRIGGER USER',
      );
    });
  }
  await prisma.transportCommercialAcceptance.deleteMany({ where: { id: { in: acceptanceIds } } });
  await prisma.transportTripOrderLink.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.transportOrder.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.transportTrip.deleteMany({ where: { code: { startsWith: `${tripCodePrefix}-trip` } } });
  await prisma.transportCustomer.deleteMany({ where: { id: { in: customerIds } } });
}
