-- `#317` LANE V-FUEL-RESIDUAL — tram tren to khai (G1), quyet dinh doi soat chi-ghi-them (G0),
-- xung dot so hoa don (G4). Quyet dinh nguon: `OWNER_DECISIONS_2026_09_17` o `#295`.
--
-- ---------------------------------------------------------------------------
-- MOT CHIEU, KHONG XOA HANG NAO, KHONG DOI KIEU COT NAO. Lan di nay chi:
--   · them MOT gia tri enum (`INVOICE_CONFLICT`);
--   · them HAI cot NULL duoc (`TransportFuelEntry.stationId`, `TransportFuelDiscrepancy.supersedesId`);
--   · them hai khoa ngoai, hai index, mot `CHECK` va hai trigger.
-- Moi hang dang co deu hop le ngay sau lan di: hai cot moi la `NULL`, va trigger chi kiem hang
-- DUOC GHI sau thoi diem nay. Duong lui o `README-rollback.sql` cung thu muc.
--
-- PHAN 1 duoc SINH RA boi `prisma migrate diff`, KHONG go tay — tru `IF NOT EXISTS` o lenh enum,
-- cung khuon `20260909100000_transport_fuel_receipt_image`. PHAN 2/3 thi nguoc lai: Prisma khong co
-- cu phap cho `CHECK` hay trigger.

-- ===========================================================================
-- PHAN 1 — DDL SINH RA TU `schema.prisma`
-- ===========================================================================

-- AlterEnum
-- `ALTER TYPE ... ADD VALUE` khong duoc DUNG gia tri vua them trong cung giao dich. Lan di nay khong
-- dung no o dau ca — gia tri chi duoc ghi boi ung dung sau khi migration da commit.
ALTER TYPE "TransportFuelDiscrepancyKind" ADD VALUE IF NOT EXISTS 'INVOICE_CONFLICT';

-- AlterTable
ALTER TABLE "TransportFuelEntry" ADD COLUMN     "stationId" TEXT;

-- AlterTable
ALTER TABLE "TransportFuelDiscrepancy" ADD COLUMN     "supersedesId" TEXT;

-- CreateIndex
CREATE INDEX "TransportFuelEntry_stationId_idx" ON "TransportFuelEntry"("stationId");

-- CreateIndex
CREATE UNIQUE INDEX "TransportFuelDiscrepancy_supersedesId_key" ON "TransportFuelDiscrepancy"("supersedesId");

-- AddForeignKey
ALTER TABLE "TransportFuelEntry" ADD CONSTRAINT "TransportFuelEntry_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "TransportFuelStation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportFuelDiscrepancy" ADD CONSTRAINT "TransportFuelDiscrepancy_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "TransportFuelDiscrepancy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ===========================================================================
-- PHAN 2 — G0: QUYET DINH DOI SOAT LA LICH SU, CHI GHI THEM
-- ===========================================================================
--
-- Truoc lan di nay, mot quyet dinh `ACCEPT_SUPPLIER_AMOUNT` da ghi khong bo ra duoc: mo lai ky roi
-- quyet lai KHONG lam tong duoc chap nhan giam (xem `OPEN_BLOCKERS` G0 cua `#295`). Cach sua "de"
-- la dua quyet dinh cu ve `PENDING` hoac xoa no roi quyet lai — va do dung la cai chu so huu cam:
-- *"Khong reset/xoa lich su ve PENDING"*.
--
-- Nen doi y la THEM mot hang `RESOLVED` moi co `supersedesId` tro ve quyet dinh cu, va CSDL tu choi
-- moi lan sua hay xoa mot hang da quyet. Hang `PENDING` van la ket qua cua MAY — lan chay so khop
-- lai van xoa va ghi lai chung nhu truoc.

-- Hinh dang cua mot lan thay the: chi mot quyet dinh DA GHI moi thay the duoc, chi tren mot DONG
-- bang ke (quyet dinh hieu luc duoc tinh theo `statementLineId`), va khong tu thay the chinh no.
ALTER TABLE "TransportFuelDiscrepancy"
  ADD CONSTRAINT "TransportFuelDiscrepancy_supersession_shape"
  CHECK (
    "supersedesId" IS NULL
    OR ("status" = 'RESOLVED' AND "statementLineId" IS NOT NULL AND "supersedesId" <> "id")
  );

-- Mot `CHECK` chi doc duoc hang cua chinh no. Hai dieu duoi day so HAI hang (hang cu va hang moi),
-- nen chung song trong trigger — cung ly do voi `transport_fuel_match_no_self_source`.
--
--   1. hang cu da `RESOLVED` thi KHONG `UPDATE`, KHONG `DELETE` — ke ca qua mot khoa ngoai
--      `ON DELETE SET NULL/CASCADE`: khong duong san xuat nao xoa phieu, dong bang ke hay ky doi
--      soat, va mot lenh xoa cha lang le viet lai lich su quyet dinh la dung loai hong ma trigger
--      nay ton tai de chan. Cleanup cua bo kiem thu tu tat trigger trong mot giao dich;
--   2. hang moi chi thay the duoc mot quyet dinh DA GHI cua CUNG ky va CUNG dong bang ke.
CREATE OR REPLACE FUNCTION "transport_fuel_discrepancy_decision_append_only"()
RETURNS TRIGGER AS $$
DECLARE
  target RECORD;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD."status" = 'RESOLVED' THEN
    RAISE EXCEPTION
      'transport_fuel_discrepancy_decision_append_only: quyet dinh % da ghi — ghi mot quyet dinh thay the, khong sua/xoa (#317 G0)',
      OLD."id"
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  IF NEW."supersedesId" IS NOT NULL THEN
    SELECT "reconciliationId", "statementLineId", "status" INTO target
    FROM "TransportFuelDiscrepancy"
    WHERE "id" = NEW."supersedesId";

    IF NOT FOUND
      OR target."status" <> 'RESOLVED'
      OR target."reconciliationId" <> NEW."reconciliationId"
      OR target."statementLineId" IS DISTINCT FROM NEW."statementLineId" THEN
      RAISE EXCEPTION
        'transport_fuel_discrepancy_supersession_scope: % khong thay the duoc % — phai la quyet dinh da ghi cua cung ky, cung dong bang ke',
        NEW."id", NEW."supersedesId"
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "transport_fuel_discrepancy_decision_append_only"
  BEFORE INSERT OR UPDATE OR DELETE ON "TransportFuelDiscrepancy"
  FOR EACH ROW EXECUTE FUNCTION "transport_fuel_discrepancy_decision_append_only"();

-- ===========================================================================
-- PHAN 3 — G1: TRAM TREN TO KHAI PHAI THUOC DUNG NHA CUNG CAP CUA PHIEU
-- ===========================================================================
--
-- Khoa ngoai o PHAN 1 chi noi "tram ton tai". Dieu can giu con hep hon: tram phai la cua hang cua
-- CHINH nha cung cap ghi tren phieu. Mot phieu `supplierId = A` mang tram cua nha cung cap B se di
-- vao doi soat bang ke cua A voi mot dia diem cua B — bao cao "tram nao ban bao nhieu" noi doi ma
-- khong ai thay.
--
-- Prisma khong khai duoc mot quan he TUY CHON ghep `(stationId, supplierId)` khi `supplierId` bat
-- buoc, va mot khoa ngoai ghep viet tay se bi `prisma migrate diff` cua lan sau sinh lenh xoa. Nen o
-- day la mot trigger. Tang mien kiem truoc (`FUEL_STATION_SUPPLIER_MISMATCH`); trigger la luoi cuoi.
CREATE OR REPLACE FUNCTION "transport_fuel_entry_station_supplier"()
RETURNS TRIGGER AS $$
DECLARE
  station_supplier TEXT;
BEGIN
  IF NEW."stationId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT "supplierId" INTO station_supplier
  FROM "TransportFuelStation"
  WHERE "id" = NEW."stationId";

  IF station_supplier IS DISTINCT FROM NEW."supplierId" THEN
    RAISE EXCEPTION
      'TransportFuelEntry_station_supplier: tram % khong thuoc nha cung cap % cua phieu %',
      NEW."stationId", NEW."supplierId", NEW."id"
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "transport_fuel_entry_station_supplier"
  BEFORE INSERT OR UPDATE OF "stationId", "supplierId" ON "TransportFuelEntry"
  FOR EACH ROW EXECUTE FUNCTION "transport_fuel_entry_station_supplier"();
