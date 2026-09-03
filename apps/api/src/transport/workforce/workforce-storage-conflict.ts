import type { UniqueIndexRef } from '../storage-conflict.js';

/**
 * UNIQUE MOT PHAN cua `transport-workforce` — de `PrismaWorkforceRepository` dich mot `P2002`
 * thanh dung mot ly do cua mien, va de storage spec doi chieu duoc voi migration.
 */
export const PAYSLIP_ONE_ORIGINAL_PER_RUN_DRIVER: UniqueIndexRef = {
  indexName: 'TransportPayslip_one_original_per_run_driver',
  model: 'TransportPayslip',
  column: 'driverId',
};

export const PAYSLIP_ONE_REVERSAL_PER_TARGET: UniqueIndexRef = {
  indexName: 'TransportPayslip_one_reversal_per_target',
  model: 'TransportPayslip',
  column: 'correctsId',
};

export const WORKFORCE_UNIQUE_INDEXES: readonly UniqueIndexRef[] = [
  PAYSLIP_ONE_ORIGINAL_PER_RUN_DRIVER,
  PAYSLIP_ONE_REVERSAL_PER_TARGET,
];

/**
 * TEN RANG BUOC/TRIGGER khong phai unique — nhan dien bang van ban cua thong bao loi.
 *
 * Cung ky thuat voi `FUEL_MATCH_NO_SELF_SOURCE` cua T4: Prisma khong cho ra ma loi co cau truc cho
 * mot `RAISE EXCEPTION` cua plpgsql, nen ten trigger duoc NHUNG vao chinh cau thong bao, va do la
 * cho duy nhat doc lai duoc no.
 */
export const PAYSLIP_POSTED_IMMUTABLE_TRIGGER = 'TransportPayslip_posted_immutable';
export const PAYSLIP_COMPONENT_FROZEN_TRIGGER = 'TransportPayslip_component_frozen';
export const PAYROLL_PERIOD_NO_OVERLAP_CONSTRAINT = 'TransportPayrollPeriod_no_overlap';

export const isPostedPayslipMutation = (error: unknown): boolean =>
  error instanceof Error && error.message.includes(PAYSLIP_POSTED_IMMUTABLE_TRIGGER);

export const isFrozenComponentMutation = (error: unknown): boolean =>
  error instanceof Error && error.message.includes(PAYSLIP_COMPONENT_FROZEN_TRIGGER);

export const isOverlappingPayrollPeriod = (error: unknown): boolean =>
  error instanceof Error && error.message.includes(PAYROLL_PERIOD_NO_OVERLAP_CONSTRAINT);
