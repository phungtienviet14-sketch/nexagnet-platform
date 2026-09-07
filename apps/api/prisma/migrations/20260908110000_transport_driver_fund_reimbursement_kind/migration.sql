-- ===========================================================================
-- TX-07b (Lane D, Issue #237) — MOT gia tri enum, va KHONG GI KHAC.
--
-- Tep nay co dung mot cau lenh, va do la mot rang buoc cua Postgres chu khong
-- phai mot lua chon thanh my: `ALTER TYPE ... ADD VALUE` chay duoc trong mot
-- giao dich tu PG 12, nhung gia tri MOI khong duoc SU DUNG trong chinh giao
-- dich do. Prisma boc moi tep migration trong mot giao dich.
--
-- Migration ke tiep (`20260908120000_transport_driver_settlement`) phai viet
-- lai `CHECK "TransportDriverFundEntry_sign_by_kind"` — mot bieu thuc co NHAC
-- TEN 'REIMBURSEMENT'. Neu hai viec do nam cung mot tep, Postgres tu choi voi
-- `unsafe use of new value "REIMBURSEMENT" of enum type`.
--
-- `IF NOT EXISTS` de mot lan chay lai (khoi phuc tu backup, moi truong da co
-- gia tri) khong lam dung ca chuoi migration.
-- ===========================================================================

ALTER TYPE "TransportDriverFundEntryKind" ADD VALUE IF NOT EXISTS 'REIMBURSEMENT';
