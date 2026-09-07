-- CreateEnum
CREATE TYPE "TransportAssetStakeholderKind" AS ENUM ('PERSON', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "TransportVehicleOperationalControl" AS ENUM ('INTERNAL_OPERATED', 'EXTERNAL_CARRIER');

-- AlterTable
ALTER TABLE "TransportVehicle"
  ADD COLUMN "operationalControl" "TransportVehicleOperationalControl" NOT NULL DEFAULT 'INTERNAL_OPERATED',
  ADD COLUMN "ownershipRegisterComplete" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "TransportAssetStakeholder" (
    "id" TEXT NOT NULL,
    "kind" "TransportAssetStakeholderKind" NOT NULL,
    "displayName" TEXT NOT NULL,
    "status" "TransportPartyStatus" NOT NULL DEFAULT 'ACTIVE',
    "note" TEXT,
    "authUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportAssetStakeholder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportVehicleOwnershipInterest" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "stakeholderId" TEXT NOT NULL,
    "ownershipBasisPoints" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "recordedBy" TEXT NOT NULL,
    "recordedNote" TEXT,
    "closedBy" TEXT,
    "closedNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransportVehicleOwnershipInterest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TransportAssetStakeholder_authUserId_key" ON "TransportAssetStakeholder"("authUserId");

-- CreateIndex
CREATE INDEX "TransportAssetStakeholder_status_idx" ON "TransportAssetStakeholder"("status");

-- CreateIndex
CREATE INDEX "TransportVehicleOwnershipInterest_vehicleId_effectiveTo_idx" ON "TransportVehicleOwnershipInterest"("vehicleId", "effectiveTo");

-- CreateIndex
CREATE INDEX "TransportVehicleOwnershipInterest_stakeholderId_effectiveTo_idx" ON "TransportVehicleOwnershipInterest"("stakeholderId", "effectiveTo");

-- AddForeignKey
ALTER TABLE "TransportVehicleOwnershipInterest" ADD CONSTRAINT "TransportVehicleOwnershipInterest_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "TransportVehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportVehicleOwnershipInterest" ADD CONSTRAINT "TransportVehicleOwnershipInterest_stakeholderId_fkey" FOREIGN KEY ("stakeholderId") REFERENCES "TransportAssetStakeholder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- RANG BUOC TANG LUU TRU — Prisma khong co cu phap cho `CHECK` lan cho unique MOT PHAN, nen chung
-- song o day.
--
-- `transport-asset-ownership-storage.spec.ts` doc chinh tep nay va do neu mot ten bien mat. Ly do:
-- `prisma migrate dev` sinh migration bang cach diff schema voi DB va SE sinh lenh xoa ca bon neu
-- ai do chay no roi commit thang.
-- ---------------------------------------------------------------------------------------------

-- Ten ben huu quan khong duoc rong hay toan khoang trang. Mot hang ten rong khong tra loi duoc cau
-- hoi duy nhat ma bang nay ton tai de tra loi ("ai la chu"), va no lot qua moi kiem o tang tren neu
-- nguoi goi gui mot chuoi khoang trang.
ALTER TABLE "TransportAssetStakeholder"
  ADD CONSTRAINT "TransportAssetStakeholder_displayName_not_blank"
  CHECK (btrim("displayName") <> '');

-- DIEM CO BAN: so NGUYEN trong 1..10000 (0,01% .. 100%).
--
-- Chan `0` va chan so am o day chu khong chi o tang dich vu, vi mot ty le `0` la mot cau noi mo ho
-- ("khong so huu gi" hay "chua biet"?) va mot ty le am khong co nghia nao ca. Chan `> 10000` vi mot
-- nguoi khong so huu duoc hon ca chiec xe.
--
-- Cot la `INTEGER`, khong phai `NUMERIC`/`DOUBLE`: ba lan cong `33.33` roi so voi `100` la mot phep
-- so sanh khong bao gio dung, con ba lan cong `3333` roi so voi `10000` thi luon dung mot cau tra
-- loi. Bat bien tong (khi so dang ky duoc KHAI la day du) dua han vao dieu do.
ALTER TABLE "TransportVehicleOwnershipInterest"
  ADD CONSTRAINT "TransportVehicleOwnershipInterest_bps_range"
  CHECK ("ownershipBasisPoints" >= 1 AND "ownershipBasisPoints" <= 10000);

-- Mot khoang thoi gian phai di ve phia truoc. Mot ban ghi co `effectiveTo` <= `effectiveFrom` se
-- lam moi phep hoi "ai so huu xe nay tai thoi diem T" tra ve mot tap rong o dung khoang do, va
-- khong co gi trong du lieu noi len rang hang do sai.
ALTER TABLE "TransportVehicleOwnershipInterest"
  ADD CONSTRAINT "TransportVehicleOwnershipInterest_period_order"
  CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom");

-- MOT ban DANG hieu luc cho moi cap `(xe, ben huu quan)`.
--
-- Unique MOT PHAN, cung khuon `TransportVehicleAssignment_activeVehicle_key` cua `TX-01`. No cuong
-- che DUNG MOT dieu: khong ai co hai ty le song song tren cung mot xe — neu co, tong so huu se dem
-- doi mot nguoi va bat bien 10000 diem se sai ma khong bao loi o dau ca.
--
-- NHIEU ban DA DONG cua cung mot cap van ghi duoc, va do chinh la LICH SU ma #242 E2 doi phai giu.
CREATE UNIQUE INDEX "TransportVehicleOwnershipInterest_activePair_key"
  ON "TransportVehicleOwnershipInterest"("vehicleId", "stakeholderId")
  WHERE "effectiveTo" IS NULL;
