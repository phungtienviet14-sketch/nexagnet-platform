-- DUONG LUI cua `20260909140000_transport_asset_ownership` (TX-08 — Issue #242, Lane E).
--
-- Chay tay khi can quay ve hinh dang truoc migration. KHONG phai mot migration Prisma — de o day
-- de nguoi truc doc duoc trong luc su co, khong phai de chay tu dong.
--
-- MIGRATION NAY CHI THEM: hai bang moi, hai kieu enum moi, va HAI COT moi tren `TransportVehicle`.
-- No khong sua mot cot dang co nao, khong doi kieu, khong doi rang buoc dang co, va khong bang cu
-- nao tro khoa ngoai vao hai bang moi.
--
-- HAI COT tren `TransportVehicle` la cho duy nhat migration nay cham vao mot bang DANG CHAY. Ca
-- hai deu `NOT NULL DEFAULT`, nen moi hang cu nhan gia tri mac dinh va khong duong ghi nao dang co
-- phai doi: `operationalControl = 'INTERNAL_OPERATED'` (dung voi toan bo doi xe B dang van hanh) va
-- `ownershipRegisterComplete = false` (dung: chua ai khai so dang ky nao la day du).
--
-- CAI THUC SU MAT KHI LUI: toan bo ho so ben huu quan, TOAN BO LICH SU SO HUU da nhap, va phan
-- loai quyen dieu hanh cua tung xe. Du lieu xe o `TransportVehicle` KHONG bi anh huong ngoai hai
-- cot bi bo.
--
-- Truoc khi chay, DEM da:
--
--     SELECT count(*) FROM "TransportAssetStakeholder";
--     SELECT count(*) FROM "TransportVehicleOwnershipInterest";
--     SELECT "operationalControl", count(*) FROM "TransportVehicle" GROUP BY 1;

DROP TABLE IF EXISTS "TransportVehicleOwnershipInterest";
DROP TABLE IF EXISTS "TransportAssetStakeholder";

ALTER TABLE "TransportVehicle"
  DROP COLUMN IF EXISTS "ownershipRegisterComplete",
  DROP COLUMN IF EXISTS "operationalControl";

DROP TYPE IF EXISTS "TransportVehicleOperationalControl";
DROP TYPE IF EXISTS "TransportAssetStakeholderKind";
