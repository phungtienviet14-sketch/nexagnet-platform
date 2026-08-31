-- DUONG LUI cua `20260830140000_transport_costing`.
--
-- Chay tay khi can quay ve hinh dang truoc migration. KHONG phai mot migration Prisma — de o day de
-- nguoi truc doc duoc trong luc su co, khong phai de chay tu dong.
--
-- ---------------------------------------------------------------------------
-- CANH BAO DUY NHAT DANG KE — BUOC 2 CUA DUONG LUI NAY XOA DU LIEU TAI CHINH.
--
-- Khac han duong lui cua T2.1 (chi bo rang buoc, khong dong nao mat): nam bang cua T3 CHUA CHINH so
-- cai. Xoa bang la xoa moi but toan quy, moi dong gia thanh chuyen va moi anh chup ky. `INV-20`
-- khong dung lai duoc tu mot ban khong con hang nao.
--
-- BAT BUOC dem truoc khi bo comment bat cu lenh xoa bang nao o BUOC 2:
--
--   SELECT
--     (SELECT count(*) FROM "TransportDriverFundEntry")          AS but_toan_quy,
--     (SELECT count(*) FROM "TransportTripExpense")              AS dong_gia_thanh,
--     (SELECT count(*) FROM "TransportDriverFundPeriodSnapshot") AS anh_chup_ky;
--
-- Neu bat cu con so nao > 0 thi DUNG. Xuat du lieu ra truoc (`COPY ... TO`), roi moi quyet.
--
-- Neu chi can GO RANG BUOC ma GIU du lieu — tinh huong thuong gap hon nhieu — thi chay DUNG khoi
-- BUOC 1 roi dung lai. Luc do bang van con, ung dung van chay, chi khong con DB chan gi: dau but
-- toan, hai lop cua mot khoan chi va chong lap ky quay ve chi con duoc service giu, tuc khong con
-- dung khi co hai nguoi ghi cung luc.
--
-- BUOC 2 duoc de o dang COMMENT co chu dich: de khong ai dan ca tep nay vao `psql` roi mat so cai.
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- BUOC 1 — go rang buoc, GIU du lieu. An toan, dao nguoc duoc bang chinh migration.
-- ===========================================================================

ALTER TABLE "TransportDriverFundPeriod"
  DROP CONSTRAINT IF EXISTS "TransportDriverFundPeriod_no_overlap";
ALTER TABLE "TransportDriverFundPeriod"
  DROP CONSTRAINT IF EXISTS "TransportDriverFundPeriod_dates_iso";

ALTER TABLE "TransportDriverFundPeriodSnapshot"
  DROP CONSTRAINT IF EXISTS "TransportDriverFundPeriodSnapshot_balance_sum";
ALTER TABLE "TransportDriverFundPeriodSnapshot"
  DROP CONSTRAINT IF EXISTS "TransportDriverFundPeriodSnapshot_money_range";

ALTER TABLE "TransportTripExpense"
  DROP CONSTRAINT IF EXISTS "TransportTripExpense_fund_leg";
ALTER TABLE "TransportTripExpense"
  DROP CONSTRAINT IF EXISTS "TransportTripExpense_reversal_kind";
ALTER TABLE "TransportTripExpense"
  DROP CONSTRAINT IF EXISTS "TransportTripExpense_sign_by_kind";
ALTER TABLE "TransportTripExpense"
  DROP CONSTRAINT IF EXISTS "TransportTripExpense_businessDate_iso";
ALTER TABLE "TransportTripExpense"
  DROP CONSTRAINT IF EXISTS "TransportTripExpense_amount_money_range";

ALTER TABLE "TransportDriverFundEntry"
  DROP CONSTRAINT IF EXISTS "TransportDriverFundEntry_reversal_kind";
ALTER TABLE "TransportDriverFundEntry"
  DROP CONSTRAINT IF EXISTS "TransportDriverFundEntry_sign_by_kind";
ALTER TABLE "TransportDriverFundEntry"
  DROP CONSTRAINT IF EXISTS "TransportDriverFundEntry_businessDate_iso";
ALTER TABLE "TransportDriverFundEntry"
  DROP CONSTRAINT IF EXISTS "TransportDriverFundEntry_amount_money_range";

-- ===========================================================================
-- BUOC 2 — XOA BANG. Bo comment CHI SAU KHI da dem va da xuat du lieu. Doc canh bao o tren.
--
-- Thu tu nguoc chieu khoa ngoai: `TransportTripExpense` truoc `TransportDriverFundEntry` vi no tro
-- toi bang do; `TransportDriverFundEntry` tu tro toi chinh no (`reversalOfId`) nen mot lenh la du.
-- ===========================================================================

-- DROP TABLE IF EXISTS "TransportDriverFundPeriodSnapshot";
-- DROP TABLE IF EXISTS "TransportDriverFundPeriod";
-- DROP TABLE IF EXISTS "TransportTripExpense";
-- DROP TABLE IF EXISTS "TransportDriverFundEntry";
-- DROP TABLE IF EXISTS "TransportDriverFundAccount";

-- DROP TYPE IF EXISTS "TransportFundPeriodStatus";
-- DROP TYPE IF EXISTS "TransportExpenseFundingSource";
-- DROP TYPE IF EXISTS "TransportTripExpenseKind";
-- DROP TYPE IF EXISTS "TransportDriverFundEntryKind";

-- ===========================================================================
-- BUOC 3 — extension. CO Y KHONG go tu dong.
--
-- `btree_gist` co the dang duoc dung boi mot rang buoc khac ma nguoi truc khong biet. Kiem truoc:
--
--   SELECT conname, conrelid::regclass FROM pg_constraint WHERE contype = 'x';
--
-- Rong thi moi chay:  DROP EXTENSION IF EXISTS btree_gist;
-- ===========================================================================
