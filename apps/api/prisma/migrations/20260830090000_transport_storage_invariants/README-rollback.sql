-- DUONG LUI cua `20260830090000_transport_storage_invariants`.
--
-- Chay tay khi can quay ve hinh dang truoc migration. KHONG phai mot migration Prisma — de o day
-- de nguoi truc doc duoc trong luc su co, khong phai de chay tu dong.
--
-- CANH BAO DUY NHAT DANG KE: buoc cuoi (`BIGINT` -> `INTEGER`) chi chay duoc khi MOI gia tri
-- `freightAmount` dang co nam gon trong khoang `INTEGER` CO DAU. Khoang tien cua mien la
-- +-(2^53-1), tuc CO PHIA AM — mot precheck chi nhin phia duong se bo sot dung nua so hang chan
-- duong lui. Kiem CA HAI phia:
--
--   SELECT count(*) FROM "TransportTrip"
--    WHERE "freightAmount" IS NOT NULL
--      AND "freightAmount" NOT BETWEEN -2147483648 AND 2147483647;
--
-- Neu con > 0 thi DUNG chay buoc cuoi: xu ly cac hang do truoc.
--
-- PostgreSQL KHONG im lang cat bot o day. Do tren PostgreSQL 16.15 (30/08/2026): mot bang co hang
-- `-3000000000` thi `ALTER ... TYPE INTEGER` dung lai voi `ERROR: integer out of range` va bang
-- giu nguyen ca bon hang. Precheck ton tai de NHIN THAY rui ro do TRUOC khi go ALTER — bao mot con
-- so dem duoc, thay vi mot lenh do giua luc su co — chu khong phai de chan mot phep cat bot lang le.
--
-- Bo hai unique mot phan thi khong mat du lieu, nhung ke tu do bat bien "toi da mot ban dang hieu
-- luc" quay ve chi con duoc service giu, tuc khong con dung khi co hai nguoi ghi cung luc.

DROP INDEX IF EXISTS "TransportTripAssignment_activeTrip_key";
DROP INDEX IF EXISTS "TransportVehicleAssignment_activeVehicle_key";

ALTER TABLE "TransportTrip"  DROP CONSTRAINT IF EXISTS "TransportTrip_businessDate_iso";
ALTER TABLE "TransportDriver" DROP CONSTRAINT IF EXISTS "TransportDriver_licenceExpiry_iso";
ALTER TABLE "TransportTrip"  DROP CONSTRAINT IF EXISTS "TransportTrip_freightAmount_money_range";

ALTER TABLE "TransportTrip" ALTER COLUMN "freightAmount" TYPE INTEGER;
