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

/**
 * TEN TRIGGER — bat bien khong phai unique, nhan dien bang van ban cua thong bao loi.
 *
 * Cung ky thuat voi `PAYSLIP_POSTED_IMMUTABLE_TRIGGER` cua `transport-workforce`: Prisma khong
 * cho ra ma loi co cau truc cho mot `RAISE EXCEPTION` cua plpgsql, nen ten trigger duoc NHUNG
 * vao chinh cau thong bao, va day la cho duy nhat doc lai duoc no.
 *
 * Hai trigger nay giu cung mot dieu tu hai phia: mot lenh sua va ke hoach cua no phai noi ve
 * CUNG mot xe, va khong ai go duoc rang buoc do bang cach doi xe cua chinh ke hoach.
 */
export const MAINTENANCE_WORK_ORDER_PLAN_SAME_VEHICLE_TRIGGER =
  'TransportMaintenanceWorkOrder_plan_same_vehicle';
export const MAINTENANCE_PLAN_VEHICLE_IMMUTABLE_TRIGGER =
  'TransportMaintenancePlan_vehicle_immutable';
