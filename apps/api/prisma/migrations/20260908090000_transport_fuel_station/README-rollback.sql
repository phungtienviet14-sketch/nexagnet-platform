-- DUONG LUI cua `20260908090000_transport_fuel_station` (Lane C / C1 — Issue #236).
--
-- Chay tay khi can quay ve hinh dang truoc migration. KHONG phai mot migration Prisma — de o day
-- de nguoi truc doc duoc trong luc su co, khong phai de chay tu dong.
--
-- MIGRATION NAY CHI THEM: hai bang moi, mot kieu enum moi, va chin cot NULLABLE tren
-- `TransportFuelSupplier`. Khong cot cu nao bi doi ten, doi kieu hay siet rang buoc; khong bang cu
-- nao tro khoa ngoai vao hai bang moi. Nen duong lui khong co buoc nao "co the that bai vi du lieu".
--
-- CAI THAT SU MAT KHI LUI: toan bo danh tinh cay xang da nhap (tram, bi danh) va sieu du lieu hop
-- dong cua nha cung cap. PHIEU DO DAU, BANG KE, KY DOI SOAT va BAN GIAO CONG NO KHONG bi anh
-- huong — khong cot nao cua chung tro sang hai bang nay, va `TransportFuelSupplier` giu nguyen moi
-- cot no da co truoc migration.
--
-- THU TU CO Y: xoa bang con truoc bang cha (khoa ngoai `CASCADE` chi lo phan xoa HANG, khong lo
-- phan xoa BANG), va xoa kieu enum SAU khi cot dung no da bien mat.
--
-- Truoc khi chay, DEM da:
--
--     SELECT count(*) FROM "TransportFuelStationAlias";
--     SELECT count(*) FROM "TransportFuelStation";
--     SELECT count(*) FROM "TransportFuelSupplier" WHERE "contractNo" IS NOT NULL;

DROP TABLE IF EXISTS "TransportFuelStationAlias";
DROP TABLE IF EXISTS "TransportFuelStation";

ALTER TABLE "TransportFuelSupplier"
  DROP CONSTRAINT IF EXISTS "TransportFuelSupplier_paymentTermDays_range",
  DROP CONSTRAINT IF EXISTS "TransportFuelSupplier_contractDates_iso",
  DROP CONSTRAINT IF EXISTS "TransportFuelSupplier_contract_period_order";

ALTER TABLE "TransportFuelSupplier"
  DROP COLUMN IF EXISTS "contactName",
  DROP COLUMN IF EXISTS "contactEmail",
  DROP COLUMN IF EXISTS "contractNo",
  DROP COLUMN IF EXISTS "contractStartDate",
  DROP COLUMN IF EXISTS "contractEndDate",
  DROP COLUMN IF EXISTS "paymentTermDays",
  DROP COLUMN IF EXISTS "termsNote",
  DROP COLUMN IF EXISTS "ingestChannels",
  DROP COLUMN IF EXISTS "ingestAccountRef";

DROP TYPE IF EXISTS "TransportFuelIngestChannel";
