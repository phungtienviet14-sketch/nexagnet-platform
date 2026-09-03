import type { UniqueIndexRef } from '../storage-conflict.js';

/**
 * UNIQUE MOT PHAN cua `transport-asset-compliance` — khai o day de `PrismaAssetComplianceRepository`
 * dich duoc mot `P2002` thanh dung mot ly do cua mien, va de
 * `transport-asset-workforce-storage.spec.ts` doi chieu duoc danh sach nay voi migration.
 */
export const MAINTENANCE_ONE_OPEN_WORK_ORDER_PER_PLAN: UniqueIndexRef = {
  indexName: 'TransportMaintenanceWorkOrder_one_open_per_plan',
  model: 'TransportMaintenanceWorkOrder',
  column: 'planId',
};

export const ASSET_COMPLIANCE_UNIQUE_INDEXES: readonly UniqueIndexRef[] = [
  MAINTENANCE_ONE_OPEN_WORK_ORDER_PER_PLAN,
];
