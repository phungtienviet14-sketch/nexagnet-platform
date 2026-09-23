-- DUONG LUI cua `20260923110000_transport_fuel_run_first_driver_cash` (`#369` R-4) va cua
-- `20260923100000_transport_driver_fund_run_expense_kind`.
--
-- Chay TAY khi can quay ve hinh dang truoc `#369`. KHONG phai mot migration Prisma — de o day de
-- nguoi truc doc duoc trong luc su co, khong phai de chay tu dong.
--
-- ===========================================================================
-- DOC TRUOC KHI CHAY — duong lui CHI SACH khi CHUA CO mot lan ghi nao cua `#369`
--
-- 1. Moi but toan `RUN_EXPENSE` la mot lan TIEN THAT lai xe da bo ra cho mot lan do dau. So cai la
--    chi-ghi-them (`INV-20`): khong `DELETE`, va mot dong DAO cung khong xoa duoc dong goc. Nen khi
--    con DU MOT hang `RUN_EXPENSE` (ke ca da dao), duong lui KHONG thu hep duoc
--    `TransportDriverFundEntry_sign_by_kind` va KHONG bo duoc ngu canh vong chay cua no — lenh o duoi
--    se CHET, va DO LA HANH VI DUNG. Duong dung khi do la TIEN LEN.
--
--      SELECT count(*) FROM "TransportDriverFundEntry" WHERE "kind" = 'RUN_EXPENSE';
--      SELECT count(*) FROM "TransportDriverFundEntry" WHERE "runId" IS NOT NULL;
--
-- 2. Tra lai `CHECK TransportFuelEntry_driver_cash_needs_trip` (`#364`) se CHET neu con phieu
--    Run-first `DRIVER_CASH` (ban ung dung CU khong nhan dang phieu do):
--
--      SELECT count(*) FROM "TransportFuelEntry" WHERE "tripId" IS NULL AND "paymentMethod" = 'DRIVER_CASH';
--
-- 3. KIEU ENUM `TransportDriverFundEntryKind` KHONG bo gia tri `RUN_EXPENSE` duoc: Postgres khong co
--    `ALTER TYPE ... DROP VALUE`, va tao lai kieu la mot thao tac khoa bang tren so cai dang co du
--    lieu. Gia tri thua nam lai la VO HAI: `CHECK` duoi day chan moi hang moi mang no. Cung ket luan
--    voi duong lui cua `REIMBURSEMENT` (`20260908120000_transport_driver_settlement`).
--
-- Ca ba con so o muc 1-2 bang 0 thi chay khoi duoi. Khac 0 thi DUNG LAI.
-- ===========================================================================

BEGIN;

DROP TRIGGER IF EXISTS "transport_fuel_entry_driver_fund_leg" ON "TransportFuelEntry";
DROP FUNCTION IF EXISTS "transport_fuel_entry_driver_fund_leg"();
ALTER TABLE "TransportFuelEntry" DROP CONSTRAINT IF EXISTS "TransportFuelEntry_driver_fund_leg_shape";
DROP INDEX IF EXISTS "TransportFuelEntry_driverFundEntryId_key";
ALTER TABLE "TransportFuelEntry" DROP COLUMN IF EXISTS "driverFundEntryId";

-- Chet o day neu con phieu Run-first `DRIVER_CASH` — xem muc 2. Khong co duong vong.
ALTER TABLE "TransportFuelEntry"
  ADD CONSTRAINT "TransportFuelEntry_driver_cash_needs_trip"
  CHECK ("paymentMethod" <> 'DRIVER_CASH' OR "tripId" IS NOT NULL);

DROP TRIGGER IF EXISTS "transport_driver_fund_entry_run_context" ON "TransportDriverFundEntry";
DROP FUNCTION IF EXISTS "transport_driver_fund_entry_run_context"();
ALTER TABLE "TransportDriverFundEntry" DROP CONSTRAINT IF EXISTS "TransportDriverFundEntry_run_expense_shape";
ALTER TABLE "TransportDriverFundEntry" DROP CONSTRAINT IF EXISTS "TransportDriverFundEntry_leg_needs_run";
ALTER TABLE "TransportDriverFundEntry" DROP CONSTRAINT IF EXISTS "TransportDriverFundEntry_one_context_kind";

-- Chet o day neu con but toan `RUN_EXPENSE` — xem muc 1. `DELETE` KHONG phai duong vong.
ALTER TABLE "TransportDriverFundEntry"
  DROP CONSTRAINT "TransportDriverFundEntry_sign_by_kind";
ALTER TABLE "TransportDriverFundEntry"
  ADD CONSTRAINT "TransportDriverFundEntry_sign_by_kind"
  CHECK (
    ("kind" = 'ADVANCE' AND "signedAmount" > 0)
    OR ("kind" = 'RETURN' AND "signedAmount" < 0)
    OR ("kind" = 'TRIP_EXPENSE' AND "signedAmount" < 0)
    OR ("kind" = 'ADJUSTMENT' AND "signedAmount" <> 0)
    OR ("kind" = 'REVERSAL' AND "signedAmount" <> 0)
    OR ("kind" = 'REIMBURSEMENT' AND "signedAmount" > 0)
  );

ALTER TABLE "TransportDriverFundEntry" DROP CONSTRAINT IF EXISTS "TransportDriverFundEntry_legId_fkey";
ALTER TABLE "TransportDriverFundEntry" DROP CONSTRAINT IF EXISTS "TransportDriverFundEntry_runId_fkey";
DROP INDEX IF EXISTS "TransportDriverFundEntry_legId_idx";
DROP INDEX IF EXISTS "TransportDriverFundEntry_runId_idx";
ALTER TABLE "TransportDriverFundEntry" DROP COLUMN IF EXISTS "legId";
ALTER TABLE "TransportDriverFundEntry" DROP COLUMN IF EXISTS "runId";

DELETE FROM "_prisma_migrations"
WHERE "migration_name" IN (
  '20260923110000_transport_fuel_run_first_driver_cash',
  '20260923100000_transport_driver_fund_run_expense_kind'
);

COMMIT;
