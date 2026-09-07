-- DUONG LUI cua `20260908130000_transport_maintenance_v2` (TX-06b — Issue #237).
--
-- Chay tay khi can quay ve hinh dang truoc migration. KHONG phai mot migration Prisma — de o day
-- de nguoi truc doc duoc trong luc su co, khong phai de chay tu dong.
--
-- MIGRATION NAY CHI THEM: mot kieu enum, chin cot (tam nullable + `kind` co `DEFAULT`), hai chi
-- muc, mot khoa ngoai va nam `CHECK`. Khong hang nao bi xoa, khong cot cu nao bi doi.
--
-- CAI THAT SU MAT KHI LUI, va phai dem truoc khi chay:
--
--   · ten/so dien thoai xuong sua da nhap;
--   · tach phu tung / cong tho (cot `costAmount` TONG van con nguyen);
--   · tham chieu bang chung (anh hoa don xuong);
--   · lien ket lan hong doc duong -> chuyen bi dut;
--   · moc den han da chup luc mo lenh;
--   · va ban chat cua tung lenh (`SCHEDULED_SERVICE` / `REPAIR` / `ROADSIDE_BREAKDOWN`).
--
-- Cot `kind` co the dung lai duoc bang backfill cua chinh migration (`planId IS NOT NULL`), NHUNG
-- `ROADSIDE_BREAKDOWN` thi KHONG: khong cot nao khac mang thong tin do. Neu da co hang mang gia tri
-- do, cho xuat ra truoc:
--
--     SELECT count(*) FROM "TransportMaintenanceWorkOrder" WHERE "kind" = 'ROADSIDE_BREAKDOWN';
--     SELECT count(*) FROM "TransportMaintenanceWorkOrder" WHERE "vendorName" IS NOT NULL;
--     SELECT count(*) FROM "TransportMaintenanceWorkOrder" WHERE "partsCost" IS NOT NULL;
--     SELECT count(*) FROM "TransportMaintenanceWorkOrder" WHERE "evidenceLocator" IS NOT NULL;
--     SELECT count(*) FROM "TransportMaintenanceWorkOrder" WHERE "tripId" IS NOT NULL;
--
-- Khac voi duong lui cua `20260908120000`, o day KHONG buoc nao co the that bai vi du lieu: moi
-- lenh duoi la mot phep bo, va Postgres bo duoc bat ke noi dung.

ALTER TABLE "TransportMaintenanceWorkOrder"
  DROP CONSTRAINT IF EXISTS "TransportMaintenanceWorkOrder_planned_shape",
  DROP CONSTRAINT IF EXISTS "TransportMaintenanceWorkOrder_cost_parts_labour",
  DROP CONSTRAINT IF EXISTS "TransportMaintenanceWorkOrder_parts_labour_range",
  DROP CONSTRAINT IF EXISTS "TransportMaintenanceWorkOrder_vendor_shape",
  DROP CONSTRAINT IF EXISTS "TransportMaintenanceWorkOrder_trip_only_roadside",
  DROP CONSTRAINT IF EXISTS "TransportMaintenanceWorkOrder_kind_plan_shape",
  DROP CONSTRAINT IF EXISTS "TransportMaintenanceWorkOrder_tripId_fkey";

DROP INDEX IF EXISTS "TransportMaintenanceWorkOrder_tripId_idx";
DROP INDEX IF EXISTS "TransportMaintenanceWorkOrder_kind_idx";

ALTER TABLE "TransportMaintenanceWorkOrder"
  DROP COLUMN IF EXISTS "plannedOdoKm",
  DROP COLUMN IF EXISTS "plannedDate",
  DROP COLUMN IF EXISTS "tripId",
  DROP COLUMN IF EXISTS "evidenceLocator",
  DROP COLUMN IF EXISTS "labourCost",
  DROP COLUMN IF EXISTS "partsCost",
  DROP COLUMN IF EXISTS "vendorPhone",
  DROP COLUMN IF EXISTS "vendorName",
  DROP COLUMN IF EXISTS "kind";

DROP TYPE IF EXISTS "TransportMaintenanceWorkOrderKind";
