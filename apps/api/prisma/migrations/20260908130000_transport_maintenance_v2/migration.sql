-- ===========================================================================
-- TX-06b MAINTENANCE v2 (Lane D, Issue #237)
--
-- CHI THEM. Khong cot nao bi doi ten, doi kieu hay bo di; moi cot moi deu
-- nullable tru `kind`, va `kind` co `DEFAULT` cong mot lan backfill TAT DINH.
--
-- KHONG co cong chan dieu chuyen nao trong tep nay, va do la co y: `Q-05`
-- (*"cai gi THAT SU cam dieu mot xe di"*) chua co cau tra loi, va #237 noi ro
-- *"do not invent a hard block"*. Thu duy nhat tranche nay them ve phia do la
-- mot phep DOC co ten (`dispatch-readiness.ts`) voi danh sach chan RONG.
-- ===========================================================================

-- CreateEnum
CREATE TYPE "TransportMaintenanceWorkOrderKind" AS ENUM ('SCHEDULED_SERVICE', 'REPAIR', 'ROADSIDE_BREAKDOWN');

-- AlterTable
ALTER TABLE "TransportMaintenanceWorkOrder"
  ADD COLUMN "kind" "TransportMaintenanceWorkOrderKind" NOT NULL DEFAULT 'REPAIR',
  ADD COLUMN "vendorName" TEXT,
  ADD COLUMN "vendorPhone" TEXT,
  ADD COLUMN "partsCost" BIGINT,
  ADD COLUMN "labourCost" BIGINT,
  ADD COLUMN "evidenceLocator" TEXT,
  ADD COLUMN "tripId" TEXT,
  ADD COLUMN "plannedDate" VARCHAR(10),
  ADD COLUMN "plannedOdoKm" INTEGER;

-- ---------------------------------------------------------------------------
-- BACKFILL TAT DINH — phep suy DUY NHAT khong bia gi them.
--
-- Mot hang cu khong co cach nao noi ban chat cua no ngoai viec no co theo mot
-- ke hoach hay khong. `planId IS NOT NULL` => bao duong theo lich; con lai giu
-- `REPAIR` cua `DEFAULT`.
--
-- KHONG doan `ROADSIDE_BREAKDOWN` cho hang nao: khong cot nao cua ban cu mang
-- thong tin do, va doan no se sinh ra mot con so "so lan chet doc duong" khong
-- co that.
--
-- Chay lai duoc: lenh nay la mot phep gan tat dinh tren cung mot vi tu.
-- ---------------------------------------------------------------------------

UPDATE "TransportMaintenanceWorkOrder"
   SET "kind" = 'SCHEDULED_SERVICE'
 WHERE "planId" IS NOT NULL;

-- CreateIndex
CREATE INDEX "TransportMaintenanceWorkOrder_kind_idx" ON "TransportMaintenanceWorkOrder"("kind");

-- CreateIndex
CREATE INDEX "TransportMaintenanceWorkOrder_tripId_idx" ON "TransportMaintenanceWorkOrder"("tripId");

-- AddForeignKey
ALTER TABLE "TransportMaintenanceWorkOrder" ADD CONSTRAINT "TransportMaintenanceWorkOrder_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "TransportTrip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- BAN CHAT PHAI KHOP VOI KE HOACH.
--
--   `SCHEDULED_SERVICE`  <=> co `planId`
--   `ROADSIDE_BREAKDOWN`  => khong co `planId`
--   `REPAIR`              => khong co `planId`
--
-- Thieu rang buoc nay thi ton tai duoc mot "bao duong theo lich" khong thuoc
-- lich nao — mot hang doc len van hop le, va lam bao cao "chi phi co ke hoach"
-- dem ca nhung lan sua dot xuat.
-- ---------------------------------------------------------------------------

ALTER TABLE "TransportMaintenanceWorkOrder"
  ADD CONSTRAINT "TransportMaintenanceWorkOrder_kind_plan_shape"
  CHECK (("kind" = 'SCHEDULED_SERVICE') = ("planId" IS NOT NULL));

-- ---------------------------------------------------------------------------
-- CHI `ROADSIDE_BREAKDOWN` DUOC TRO TOI MOT CHUYEN.
--
-- `tripId` tra loi mot cau rat hep: *"lan hong nay lam dut chuyen nao"*. Mot
-- lenh bao duong theo lich mang `tripId` se lam phep dem "chuyen bi dut vi hong
-- xe" cong ca nhung lan xe vao xuong theo ke hoach.
-- ---------------------------------------------------------------------------

ALTER TABLE "TransportMaintenanceWorkOrder"
  ADD CONSTRAINT "TransportMaintenanceWorkOrder_trip_only_roadside"
  CHECK ("tripId" IS NULL OR "kind" = 'ROADSIDE_BREAKDOWN');

-- ---------------------------------------------------------------------------
-- XUONG SUA — so dien thoai khong dung mot minh.
--
-- Mot so dien thoai khong ten la mot o du lieu khong tra loi duoc cau hoi nao;
-- nguoc lai thi duoc (biet ten xuong ma chua co so).
-- ---------------------------------------------------------------------------

ALTER TABLE "TransportMaintenanceWorkOrder"
  ADD CONSTRAINT "TransportMaintenanceWorkOrder_vendor_shape"
  CHECK ("vendorPhone" IS NULL OR "vendorName" IS NOT NULL);

-- ---------------------------------------------------------------------------
-- PHU TUNG + CONG THO PHAI KHOP TONG — nhung chi khi CA BA cung co mat.
--
-- Khong ep co mat: mot lenh sua nho chi co tong, va bat nguoi nhap tach doi
-- moi dong la bat ho bia so. Cai bi cam la mot bo BA so KHONG khop nhau —
-- luc do khong ai biet con so nao da di vao bao cao.
--
-- Khoang tien khop `money()` cua mien, va khong am: mot khoan phu tung am
-- khong bieu dien duoc bang mot hoa don xuong.
-- ---------------------------------------------------------------------------

ALTER TABLE "TransportMaintenanceWorkOrder"
  ADD CONSTRAINT "TransportMaintenanceWorkOrder_parts_labour_range"
  CHECK (
    ("partsCost" IS NULL OR "partsCost" BETWEEN 0 AND 9007199254740991)
    AND ("labourCost" IS NULL OR "labourCost" BETWEEN 0 AND 9007199254740991)
  );

ALTER TABLE "TransportMaintenanceWorkOrder"
  ADD CONSTRAINT "TransportMaintenanceWorkOrder_cost_parts_labour"
  CHECK (
    "costAmount" IS NULL
    OR "partsCost" IS NULL
    OR "labourCost" IS NULL
    OR "costAmount" = "partsCost" + "labourCost"
  );

-- ---------------------------------------------------------------------------
-- MOC DEN HAN DA CHUP — ngay nghiep vu dang `YYYY-MM-DD` (`INV-25`), odo khong am.
-- ---------------------------------------------------------------------------

ALTER TABLE "TransportMaintenanceWorkOrder"
  ADD CONSTRAINT "TransportMaintenanceWorkOrder_planned_shape"
  CHECK (
    ("plannedDate" IS NULL OR "plannedDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
    AND ("plannedOdoKm" IS NULL OR "plannedOdoKm" >= 0)
  );
