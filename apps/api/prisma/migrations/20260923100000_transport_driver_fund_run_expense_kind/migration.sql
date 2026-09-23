-- ===========================================================================
-- `#369` R-4 — MOT gia tri enum, va KHONG GI KHAC.
--
-- Cung ly do voi `20260908110000_transport_driver_fund_reimbursement_kind`: `ALTER TYPE ... ADD
-- VALUE` chay duoc trong mot giao dich tu PG 12, nhung gia tri MOI khong duoc SU DUNG trong chinh
-- giao dich do — va Prisma boc moi tep migration trong mot giao dich. Migration ke tiep
-- (`20260923110000_transport_fuel_run_first_driver_cash`) viet lai
-- `CHECK "TransportDriverFundEntry_sign_by_kind"` co NHAC TEN 'RUN_EXPENSE'; neu hai viec do nam
-- cung mot tep, Postgres tu choi voi `unsafe use of new value "RUN_EXPENSE" of enum type`.
--
-- `IF NOT EXISTS` de mot lan chay lai (khoi phuc tu backup, moi truong da co gia tri) khong lam
-- dung ca chuoi migration.
-- ===========================================================================

ALTER TYPE "TransportDriverFundEntryKind" ADD VALUE IF NOT EXISTS 'RUN_EXPENSE';
