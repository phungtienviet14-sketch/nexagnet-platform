-- DUONG LUI cua `20260909100000_transport_fuel_receipt_image`.
--
-- ===========================================================================
-- DOC KY MOT DIEU TRUOC KHI CHAY: MOT NUA CUA LAN DI KHONG LUI DUOC
--
-- Postgres KHONG CO `ALTER TYPE ... DROP VALUE`. Bon gia tri enum ma lan di nay them vao
-- (`RECEIPT_IMAGE`, `UNSUPPORTED_MEDIA_TYPE`, `EXTRACTION_UNAVAILABLE`,
-- `EXTRACTION_MALFORMED_OUTPUT`) se O LAI trong kieu du lieu vinh vien.
--
-- Do KHONG phai mot su co. Mot gia tri enum khong duoc ma nao ghi vao la mot gia tri chet: no khong
-- ton mot byte du lieu nao va khong doi hanh vi cua bat ky truy van nao. Cach duy nhat de xoa han
-- la dung mot kieu moi roi `ALTER TABLE ... TYPE` ca hai bang — mot thao tac KHOA BANG, dat hon
-- nhieu lan so voi cai loi ma no sua.
--
-- Nen duong lui THAT SU la: bo cot `confidence`, va de bon gia tri enum nam yen.
--
-- ===========================================================================
-- TRUOC KHI CHAY: DEM CAI SAP MAT
--
--   SELECT count(*) FROM "TransportFuelCandidate" WHERE "confidence" IS NOT NULL;
--   SELECT count(*) FROM "TransportFuelDocument"  WHERE "kind" = 'RECEIPT_IMAGE';
--
-- Con so thu nhat la so ung vien se MAT muc tin — sau khi lui, chung khong con phan biet duoc voi
-- ung vien doc tu hoa don XML da ky. Neu con so do khac 0, hay ket xuat truoc:
--
--   \copy (SELECT id, "documentId", "lineNumber", confidence FROM "TransportFuelCandidate"
--          WHERE confidence IS NOT NULL) TO 'confidence-backup.csv' CSV HEADER
--
-- Con so thu hai la so chung tu ANH da nhap. Chung O LAI sau khi lui, va do la dung: chung la bang
-- chung rang mot thu gi do da den. Chung chi mat phan muc tin.

ALTER TABLE "TransportFuelCandidate"
  DROP CONSTRAINT IF EXISTS "TransportFuelCandidate_confidence_is_object";

ALTER TABLE "TransportFuelCandidate" DROP COLUMN IF EXISTS "confidence";

-- KHONG co lenh nao cho bon gia tri enum. Xem khoi dau tep.
