-- DUONG LUI cua `20260908150000_transport_fuel_document` (Lane C / C2 — Issue #236).
--
-- Chay tay khi can quay ve hinh dang truoc migration. KHONG phai mot migration Prisma — de o day
-- de nguoi truc doc duoc trong luc su co, khong phai de chay tu dong.
--
-- MIGRATION NAY CHI THEM: hai bang moi, nam kieu enum moi, va MOT rang buoc them tren bang tram
-- cua C1. Khong cot nao cua T4 (phieu, bang ke, ky doi soat, ban giao) bi cham.
--
-- CAI THAT SU MAT KHI LUI: toan bo chung tu nguon da nhap va cac ung vien doc ra tu chung. Dieu do
-- KHONG lam mat mot dong tien nao — ung vien chua bao gio la su that tai chinh (`INV-C2-NOMONEY`):
-- chung khong co chan gia thanh, khong vao doi soat, khong vao ban giao cong no. Nhap lai cung bo
-- tep se dung lai dung bo ung vien do, vi phep doc la TAT DINH.
--
-- LUU Y VE RANG BUOC NULL ISLAND: go no di se cho phep tram xang quay lai toa do (0, 0), tuc lech
-- khoi luat cua `apps/api/src/transport/geo/geo-point.ts` (Lane B). Neu chi muon lui phan C2 ma
-- giu dong bo voi Lane B, HAY BO QUA lenh cuoi cung cua tep nay.
--
-- Truoc khi chay, DEM da:
--
--     SELECT count(*) FROM "TransportFuelCandidate";
--     SELECT status, count(*) FROM "TransportFuelDocument" GROUP BY status;

DROP TABLE IF EXISTS "TransportFuelCandidate";
DROP TABLE IF EXISTS "TransportFuelDocument";

DROP TYPE IF EXISTS "TransportFuelHintSource";
DROP TYPE IF EXISTS "TransportFuelStationMatch";
DROP TYPE IF EXISTS "TransportFuelDocumentRejectReason";
DROP TYPE IF EXISTS "TransportFuelDocumentStatus";
DROP TYPE IF EXISTS "TransportFuelDocumentKind";

-- Xem luu y o tren truoc khi chay dong nay.
ALTER TABLE "TransportFuelStation"
  DROP CONSTRAINT IF EXISTS "TransportFuelStation_not_null_island";
