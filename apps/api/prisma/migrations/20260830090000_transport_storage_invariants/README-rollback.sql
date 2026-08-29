-- DUONG LUI cua `20260830090000_transport_storage_invariants`.
--
-- Chay tay khi can quay ve hinh dang truoc migration. KHONG phai mot migration Prisma — de o day
-- de nguoi truc doc duoc trong luc su co, khong phai de chay tu dong.
--
-- CANH BAO DUY NHAT DANG KE: buoc cuoi (`BIGINT` -> `INTEGER`) chi an toan khi MOI gia tri
-- `freightAmount` dang co deu <= 2.147.483.647. Kiem truoc:
--
--   SELECT count(*) FROM "TransportTrip" WHERE "freightAmount" > 2147483647;
--
-- Neu con > 0 thi lui kieu cot se lam MAT du lieu — xu ly cac hang do truoc, dung ep kieu.
-- Bo hai unique mot phan thi khong mat gi, nhung ke tu do bat bien "mot ban dang hieu luc" quay ve
-- chi con duoc service giu, tuc khong con dung khi co hai nguoi ghi cung luc.

DROP INDEX IF EXISTS "TransportTripAssignment_activeTrip_key";
DROP INDEX IF EXISTS "TransportVehicleAssignment_activeVehicle_key";

ALTER TABLE "TransportTrip"  DROP CONSTRAINT IF EXISTS "TransportTrip_businessDate_iso";
ALTER TABLE "TransportDriver" DROP CONSTRAINT IF EXISTS "TransportDriver_licenceExpiry_iso";
ALTER TABLE "TransportTrip"  DROP CONSTRAINT IF EXISTS "TransportTrip_freightAmount_money_range";

ALTER TABLE "TransportTrip" ALTER COLUMN "freightAmount" TYPE INTEGER;
