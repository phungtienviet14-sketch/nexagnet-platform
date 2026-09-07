-- DUONG LUI cua `20260908120000_transport_driver_settlement` (TX-07b — Issue #237).
--
-- Chay tay khi can quay ve hinh dang truoc migration. KHONG phai mot migration Prisma — de o day
-- de nguoi truc doc duoc trong luc su co, khong phai de chay tu dong.
--
-- MIGRATION NAY CHI THEM, tru DUNG MOT ngoai le: `TransportDriverFundEntry_sign_by_kind` bi viet
-- lai de NHAN THEM loai `REIMBURSEMENT`. Duong lui phai thu hep no lai — va buoc do CO THE THAT
-- BAI vi du lieu, khac han duong lui cua `20260907140000_transport_counterparty`.
--
-- THU TU BAT BUOC, va ly do:
--
--   1. bo hai bang moi TRUOC. Chung tro khoa ngoai sang `TransportDriverFundEntry`, nen bo chung
--      sau se lam buoc 3 vuong khoa ngoai.
--   2. DAO cac but toan hoan ung TRUOC khi thu hep rang buoc. Khong duoc `DELETE` chung: `INV-20`
--      cam xoa mot but toan da ghi, va mot lan chi tien mat da xay ra ngoai doi that. Neu con hang
--      `kind = 'REIMBURSEMENT'`, buoc 3 se that bai — DO LA HANH VI DUNG, khong phai loi.
--   3. thu hep rang buoc dau.
--
-- KIEU ENUM `TransportDriverFundEntryKind` KHONG bo gia tri `REIMBURSEMENT` duoc: Postgres khong co
-- `ALTER TYPE ... DROP VALUE`. Bo no doi hoi tao mot kieu moi, doi cot, doi lai — mot thao tac khoa
-- bang tren mot bang so cai dang co du lieu. Gia tri thua nam lai trong kieu la VO HAI: khong hang
-- nao mang no sau buoc 2, va rang buoc o buoc 3 chan moi hang moi. Nen duong lui DUNG lai o day.
--
-- Truoc khi chay, DEM da:
--
--     SELECT count(*) FROM "TransportDriverCashout";
--     SELECT count(*) FROM "TransportDriverCashoutAllocation";
--     SELECT count(*) FROM "TransportDriverFundEntry" WHERE "kind" = 'REIMBURSEMENT';

-- 1 --------------------------------------------------------------------------
DROP TRIGGER IF EXISTS "transport_driver_cashout_allocation_frozen" ON "TransportDriverCashoutAllocation";
DROP FUNCTION IF EXISTS "transport_driver_cashout_allocation_frozen"();
DROP TRIGGER IF EXISTS "transport_driver_cashout_immutable" ON "TransportDriverCashout";
DROP FUNCTION IF EXISTS "transport_driver_cashout_immutable"();

DROP TABLE IF EXISTS "TransportDriverCashoutAllocation";
DROP TABLE IF EXISTS "TransportDriverCashout";

DROP TYPE IF EXISTS "TransportDriverCashoutAllocationSource";
DROP TYPE IF EXISTS "TransportDriverCashoutStatus";
DROP TYPE IF EXISTS "TransportDriverCashoutKind";

-- 2 --------------------------------------------------------------------------
-- MOT DONG DAO CHO MOI BUT TOAN HOAN UNG, khong phai mot lenh `DELETE`.
--
-- Chay TAY sau khi doc lai tung hang: moi hang o day la mot lan tien that da roi khoi cong ty, va
-- mot ban dao sai lam so du lai xe sai theo chieu nguoc lai. Neu khong con hang nao, bo qua.
--
--     INSERT INTO "TransportDriverFundEntry"
--       ("id", "accountId", "kind", "signedAmount", "currencyCode", "businessDate",
--        "correlationKey", "reversalOfId", "note", "recordedBy", "createdAt")
--     SELECT
--       gen_random_uuid()::text, e."accountId", 'REVERSAL', -e."signedAmount", e."currencyCode",
--       to_char(now(), 'YYYY-MM-DD'), 'rollback-tx07b:' || e."id", e."id",
--       'Dao khi lui migration TX-07b', '<nguoi truc>', now()
--     FROM "TransportDriverFundEntry" e
--     WHERE e."kind" = 'REIMBURSEMENT'
--       AND NOT EXISTS (SELECT 1 FROM "TransportDriverFundEntry" r WHERE r."reversalOfId" = e."id");

-- 3 --------------------------------------------------------------------------
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
  );
