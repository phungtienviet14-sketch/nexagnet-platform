import type { UniqueIndexRef } from '../storage-conflict.js';

/**
 * UNIQUE cua `TX-07b` — de `PrismaDriverSettlementRepository` dich mot `P2002` thanh dung mot ly do
 * cua mien, va de storage spec doi chieu duoc voi migration.
 */
export const CASHOUT_ONE_REVERSAL_PER_TARGET: UniqueIndexRef = {
  indexName: 'TransportDriverCashout_reversesId_key',
  model: 'TransportDriverCashout',
  column: 'reversesId',
};

export const CASHOUT_CORRELATION_KEY: UniqueIndexRef = {
  indexName: 'TransportDriverCashout_correlationKey_key',
  model: 'TransportDriverCashout',
  column: 'correlationKey',
};

export const CASHOUT_ONE_ALLOCATION_PER_FUND_ENTRY: UniqueIndexRef = {
  indexName: 'TransportDriverCashoutAllocation_driverFundEntryId_key',
  model: 'TransportDriverCashoutAllocation',
  column: 'driverFundEntryId',
};

export const DRIVER_SETTLEMENT_UNIQUE_INDEXES: readonly UniqueIndexRef[] = [
  CASHOUT_ONE_REVERSAL_PER_TARGET,
  CASHOUT_CORRELATION_KEY,
  CASHOUT_ONE_ALLOCATION_PER_FUND_ENTRY,
];

/**
 * TEN TRIGGER — nhan dien bang van ban cua thong bao loi.
 *
 * Cung ky thuat voi `PAYSLIP_POSTED_IMMUTABLE_TRIGGER` cua `TX-07`: Prisma khong cho ra ma loi co
 * cau truc cho mot `RAISE EXCEPTION` cua plpgsql, nen ten trigger duoc NHUNG vao chinh cau thong
 * bao, va do la cho duy nhat doc lai duoc no.
 */
export const CASHOUT_IMMUTABLE_TRIGGER = 'transport_driver_cashout_immutable';
export const CASHOUT_ALLOCATION_FROZEN_TRIGGER = 'transport_driver_cashout_allocation_frozen';

export const isPostedCashoutMutation = (error: unknown): boolean =>
  error instanceof Error && error.message.includes(CASHOUT_IMMUTABLE_TRIGGER);

export const isFrozenAllocationMutation = (error: unknown): boolean =>
  error instanceof Error && error.message.includes(CASHOUT_ALLOCATION_FROZEN_TRIGGER);
