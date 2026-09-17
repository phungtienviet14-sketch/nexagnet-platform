-- DUONG LUI cua `20260917100000_transport_fuel_residual` (`#317`).
--
-- ===========================================================================
-- DOC TRUOC KHI CHAY
--
-- 1. Postgres KHONG CO `ALTER TYPE ... DROP VALUE`. Gia tri `INVOICE_CONFLICT` O LAI trong kieu
--    `TransportFuelDiscrepancyKind` vinh vien. Mot gia tri enum khong ai ghi la mot gia tri chet.
--    Neu da co hang mang gia tri do, ban ung dung CU se khong doc duoc chung — dem truoc:
--
--      SELECT count(*) FROM "TransportFuelDiscrepancy" WHERE "kind" = 'INVOICE_CONFLICT';
--
-- 2. Bo `supersedesId` la bo CHUOI quyet dinh. Ban ung dung CU cong MOI quyet dinh
--    `ACCEPT_SUPPLIER_AMOUNT` (ke ca quyet dinh da bi thay the) vao tong duoc chap nhan, nen lan
--    DONG KY ke tiep sau khi lui co the phat mot ban giao TANG tien tro lai. Dem va ket xuat truoc:
--
--      SELECT count(*) FROM "TransportFuelDiscrepancy" WHERE "supersedesId" IS NOT NULL;
--      \copy (SELECT id, "reconciliationId", "statementLineId", resolution, "supersedesId",
--             "resolvedAt", "resolvedBy" FROM "TransportFuelDiscrepancy"
--             WHERE "supersedesId" IS NOT NULL) TO 'fuel-decision-chain.csv' CSV HEADER
--
-- 3. Bo `stationId` la bo tram lai xe da khai tren phieu. Ket xuat truoc neu con so khac 0:
--
--      SELECT count(*) FROM "TransportFuelEntry" WHERE "stationId" IS NOT NULL;
--
-- ===========================================================================

BEGIN;

DROP TRIGGER IF EXISTS "transport_fuel_entry_station_supplier" ON "TransportFuelEntry";
DROP FUNCTION IF EXISTS "transport_fuel_entry_station_supplier"();

DROP TRIGGER IF EXISTS "transport_fuel_discrepancy_decision_append_only" ON "TransportFuelDiscrepancy";
DROP FUNCTION IF EXISTS "transport_fuel_discrepancy_decision_append_only"();

ALTER TABLE "TransportFuelDiscrepancy" DROP CONSTRAINT IF EXISTS "TransportFuelDiscrepancy_supersession_shape";
ALTER TABLE "TransportFuelDiscrepancy" DROP CONSTRAINT IF EXISTS "TransportFuelDiscrepancy_supersedesId_fkey";
DROP INDEX IF EXISTS "TransportFuelDiscrepancy_supersedesId_key";
ALTER TABLE "TransportFuelDiscrepancy" DROP COLUMN IF EXISTS "supersedesId";

ALTER TABLE "TransportFuelEntry" DROP CONSTRAINT IF EXISTS "TransportFuelEntry_stationId_fkey";
DROP INDEX IF EXISTS "TransportFuelEntry_stationId_idx";
ALTER TABLE "TransportFuelEntry" DROP COLUMN IF EXISTS "stationId";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260917100000_transport_fuel_residual';

COMMIT;
