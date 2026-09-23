-- ===========================================================================
-- `#371` — MOT gia tri enum, va KHONG GI KHAC.
--
-- Cung khuon voi `20260923100000_transport_driver_fund_run_expense_kind`: `ALTER TYPE ... ADD VALUE`
-- chay duoc trong mot giao dich tu PG 12, nhung gia tri MOI khong duoc SU DUNG trong chinh giao dich
-- do — va Prisma boc moi tep migration trong mot giao dich. Migration ke tiep
-- (`20260923120100_transport_fuel_match_payable_entry_only`) khong nhac ten gia tri nay, nhung tach
-- rieng de khong ai phai kiem lai dieu do moi lan sua tep kia.
--
-- `IF NOT EXISTS` de mot lan chay lai (khoi phuc tu backup, moi truong da co gia tri) khong lam dung
-- ca chuoi migration.
-- ===========================================================================

ALTER TYPE "TransportFuelDiscrepancyKind" ADD VALUE IF NOT EXISTS 'PAYMENT_METHOD_CONFLICT';
