-- DUONG LUI cua `20260922100000_transport_fuel_run_first` (`#364`).
--
-- ===========================================================================
-- DOC TRUOC KHI CHAY
--
-- 1. Tra `tripId` ve `NOT NULL` CHI lam duoc khi KHONG con phieu Run-first nao. Moi phieu khai
--    tren vong chay (khong chuyen v1) se lam lenh `SET NOT NULL` o duoi CHET — va do la dung: lui
--    migration khong duoc lang le xoa su kien do dau that. Dem truoc:
--
--      SELECT count(*) FROM "TransportFuelEntry" WHERE "tripId" IS NULL;
--
--    Khac 0 thi DUNG LAI: ban ung dung CU khong doc duoc cac phieu do, va duong dung la tien len,
--    khong phai lui.
--
-- 2. Bo `TransportFuelCostAttribution` la bo toan bo quyet dinh phan bo gia thanh nhien lieu cua
--    phieu Run-first. Ket xuat truoc neu con so khac 0:
--
--      SELECT count(*) FROM "TransportFuelCostAttribution";
--      \copy (SELECT * FROM "TransportFuelCostAttribution") TO 'fuel-cost-attribution.csv' CSV HEADER
--
--    Cong no nha cung cap, Quy lai xe va gia thanh chuyen v1 KHONG phu thuoc bang nay, nen bo no
--    khong lam doi mot con so nao o ba so do.
--
-- 3. Bo `runId`/`legId` la bo ngu canh van hanh da khai tren phieu. Ket xuat truoc:
--
--      SELECT count(*) FROM "TransportFuelEntry" WHERE "runId" IS NOT NULL;
--
-- ===========================================================================

BEGIN;

DROP TRIGGER IF EXISTS "transport_fuel_cost_attribution_append_only" ON "TransportFuelCostAttribution";
DROP FUNCTION IF EXISTS "transport_fuel_cost_attribution_append_only"();
DROP TRIGGER IF EXISTS "transport_fuel_cost_attribution_guard" ON "TransportFuelCostAttribution";
DROP FUNCTION IF EXISTS "transport_fuel_cost_attribution_guard"();
DROP TABLE IF EXISTS "TransportFuelCostAttribution";
DROP TYPE IF EXISTS "TransportFuelCostAttributionKind";
DROP TYPE IF EXISTS "TransportFuelCostTargetKind";

DROP TRIGGER IF EXISTS "transport_fuel_entry_run_context" ON "TransportFuelEntry";
DROP FUNCTION IF EXISTS "transport_fuel_entry_run_context"();

ALTER TABLE "TransportFuelEntry" DROP CONSTRAINT IF EXISTS "TransportFuelEntry_cost_expense_needs_trip";
ALTER TABLE "TransportFuelEntry" DROP CONSTRAINT IF EXISTS "TransportFuelEntry_driver_cash_needs_trip";
ALTER TABLE "TransportFuelEntry" DROP CONSTRAINT IF EXISTS "TransportFuelEntry_one_context_kind";
ALTER TABLE "TransportFuelEntry" DROP CONSTRAINT IF EXISTS "TransportFuelEntry_leg_needs_run";
ALTER TABLE "TransportFuelEntry" DROP CONSTRAINT IF EXISTS "TransportFuelEntry_legId_fkey";
ALTER TABLE "TransportFuelEntry" DROP CONSTRAINT IF EXISTS "TransportFuelEntry_runId_fkey";
DROP INDEX IF EXISTS "TransportFuelEntry_legId_idx";
DROP INDEX IF EXISTS "TransportFuelEntry_runId_idx";
ALTER TABLE "TransportFuelEntry" DROP COLUMN IF EXISTS "legId";
ALTER TABLE "TransportFuelEntry" DROP COLUMN IF EXISTS "runId";

-- Chet o day neu con phieu Run-first — xem muc 1 o tren. Khong co duong vong.
ALTER TABLE "TransportFuelEntry" ALTER COLUMN "tripId" SET NOT NULL;

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260922100000_transport_fuel_run_first';

COMMIT;
