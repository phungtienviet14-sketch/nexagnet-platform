-- CreateEnum
CREATE TYPE "TransportOrderStatus" AS ENUM ('OPEN', 'FULFILLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TransportVehicleRunStatus" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TransportRunLegKind" AS ENUM ('LOADED', 'EMPTY');

-- CreateEnum
CREATE TYPE "TransportRunLegStatus" AS ENUM ('PLANNED', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "TransportOrder" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "TransportOrderStatus" NOT NULL DEFAULT 'OPEN',
    "businessDate" VARCHAR(10) NOT NULL,
    "customerId" TEXT,
    "originLabel" TEXT NOT NULL,
    "destinationLabel" TEXT NOT NULL,
    "cargoDescription" TEXT,
    "freightAmount" BIGINT,
    "currencyCode" VARCHAR(3) NOT NULL DEFAULT 'VND',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,

    CONSTRAINT "TransportOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportVehicleRun" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "status" "TransportVehicleRunStatus" NOT NULL DEFAULT 'PLANNED',
    "businessDate" VARCHAR(10) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,

    CONSTRAINT "TransportVehicleRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportRunAssignment" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "assignedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransportRunAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportRunLeg" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "kind" "TransportRunLegKind" NOT NULL,
    "status" "TransportRunLegStatus" NOT NULL DEFAULT 'PLANNED',
    "orderId" TEXT,
    "originLabel" TEXT NOT NULL,
    "destinationLabel" TEXT NOT NULL,
    "businessDate" VARCHAR(10) NOT NULL,
    "distanceKm" INTEGER,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportRunLeg_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportTripRunLegLink" (
    "tripId" TEXT NOT NULL,
    "legId" TEXT NOT NULL,
    "projectedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransportTripRunLegLink_pkey" PRIMARY KEY ("tripId")
);

-- CreateIndex
CREATE UNIQUE INDEX "TransportOrder_code_key" ON "TransportOrder"("code");

-- CreateIndex
CREATE INDEX "TransportOrder_status_idx" ON "TransportOrder"("status");

-- CreateIndex
CREATE INDEX "TransportOrder_businessDate_idx" ON "TransportOrder"("businessDate");

-- CreateIndex
CREATE INDEX "TransportOrder_customerId_idx" ON "TransportOrder"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "TransportVehicleRun_code_key" ON "TransportVehicleRun"("code");

-- CreateIndex
CREATE INDEX "TransportVehicleRun_status_idx" ON "TransportVehicleRun"("status");

-- CreateIndex
CREATE INDEX "TransportVehicleRun_businessDate_idx" ON "TransportVehicleRun"("businessDate");

-- CreateIndex
CREATE INDEX "TransportVehicleRun_vehicleId_idx" ON "TransportVehicleRun"("vehicleId");

-- CreateIndex
CREATE INDEX "TransportRunAssignment_runId_effectiveTo_idx" ON "TransportRunAssignment"("runId", "effectiveTo");

-- CreateIndex
CREATE INDEX "TransportRunAssignment_driverId_idx" ON "TransportRunAssignment"("driverId");

-- CreateIndex
CREATE UNIQUE INDEX "TransportRunLeg_runId_sequence_key" ON "TransportRunLeg"("runId", "sequence");

-- CreateIndex
CREATE INDEX "TransportRunLeg_orderId_idx" ON "TransportRunLeg"("orderId");

-- CreateIndex
CREATE INDEX "TransportRunLeg_kind_idx" ON "TransportRunLeg"("kind");

-- CreateIndex
CREATE INDEX "TransportRunLeg_businessDate_idx" ON "TransportRunLeg"("businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "TransportTripRunLegLink_legId_key" ON "TransportTripRunLegLink"("legId");

-- AddForeignKey
ALTER TABLE "TransportOrder" ADD CONSTRAINT "TransportOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "TransportCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportVehicleRun" ADD CONSTRAINT "TransportVehicleRun_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "TransportVehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportRunAssignment" ADD CONSTRAINT "TransportRunAssignment_runId_fkey" FOREIGN KEY ("runId") REFERENCES "TransportVehicleRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportRunAssignment" ADD CONSTRAINT "TransportRunAssignment_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "TransportDriver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportRunLeg" ADD CONSTRAINT "TransportRunLeg_runId_fkey" FOREIGN KEY ("runId") REFERENCES "TransportVehicleRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportRunLeg" ADD CONSTRAINT "TransportRunLeg_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "TransportOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportTripRunLegLink" ADD CONSTRAINT "TransportTripRunLegLink_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "TransportTrip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportTripRunLegLink" ADD CONSTRAINT "TransportTripRunLegLink_legId_fkey" FOREIGN KEY ("legId") REFERENCES "TransportRunLeg"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- RANG BUOC TANG LUU TRU -- Prisma khong co cu phap cho `CHECK` lan cho `WHERE` tren index, nen
-- chung song o day.
--
-- `transport-movement-storage.spec.ts` doc chinh tep nay va do neu mot ten bien mat. Ly do da ghi
-- o khoi canh bao dau muc Transport trong `schema.prisma`: `prisma migrate dev` sinh migration
-- bang cach diff schema voi DB va SE sinh lenh XOA tat ca chung neu ai do chay no roi commit thang.
-- ---------------------------------------------------------------------------------------------

-- BAT BIEN TRUNG TAM CUA TRANCHE. Mot chang chay rong KHONG duoc mang nghia vu thuong mai.
--
-- Neu rang buoc nay chi song o tang mien thi mot lan ghi thang DB (seed, sua tay luc truc, mot
-- migration sau nay) gan duoc mot don vao chang rong -- va tu do moi con so km rong, ty le rong,
-- doanh thu/km deu sai ma khong ai biet no sai. Chieu nguoc lai KHONG bi cam: `D-01` viet mot
-- chang co hang *CO THE* tro toi mot don, khong phai *PHAI*.
ALTER TABLE "TransportRunLeg"
  ADD CONSTRAINT "TransportRunLeg_empty_carries_no_order"
  CHECK ("kind" = 'LOADED' OR "orderId" IS NULL);

-- Thu tu chang bat dau tu 1. `@@unique([runId, sequence])` cam trung, khong cam so 0 hay so am --
-- va mot chang so 0 lam moi cach doc "chang dau tien" trong bao cao lech di mot buoc.
ALTER TABLE "TransportRunLeg"
  ADD CONSTRAINT "TransportRunLeg_sequence_positive" CHECK ("sequence" >= 1);

-- Km khong am. NULL VAN DUOC PHEP va co nghia rieng: "chua biet", khong phai 0. Phep gop phan
-- tich (`summariseRunDistance`) dem rieng so chang thieu km thay vi coi NULL la khong.
ALTER TABLE "TransportRunLeg"
  ADD CONSTRAINT "TransportRunLeg_distance_non_negative"
  CHECK ("distanceKm" IS NULL OR "distanceKm" >= 0);

-- Cung khoang voi `money()` va voi `TransportTrip_freightAmount_money_range`: cot la BIGINT nen DB
-- nhan duoc so lon hon `Number.MAX_SAFE_INTEGER`, nhung tang mien doc ra bang `number` -- mot hang
-- ngoai khoang nay se lam tron am tham khi doc.
ALTER TABLE "TransportOrder"
  ADD CONSTRAINT "TransportOrder_freightAmount_money_range"
  CHECK ("freightAmount" IS NULL OR ("freightAmount" BETWEEN -9007199254740991 AND 9007199254740991));

-- Ma doc duoc khong duoc rong hay toan khoang trang: no la thu nguoi dung go de tim lai mot nghia
-- vu / mot vong chay, va cot UNIQUE nen mot chuoi rong chiem mat cho cua ban ghi that.
ALTER TABLE "TransportOrder"
  ADD CONSTRAINT "TransportOrder_code_not_blank" CHECK (btrim("code") <> '');

ALTER TABLE "TransportVehicleRun"
  ADD CONSTRAINT "TransportVehicleRun_code_not_blank" CHECK (btrim("code") <> '');

-- MOT ban phan cong DANG hieu luc cho moi vong chay. Cung mau, cung ly do va cung han che voi
-- `TransportTripAssignment_activeTrip_key`: no cam ban THU HAI dang hieu luc, khong cam nhieu ban
-- DA DONG -- lich su la thu `GD-06` doi phai giu. Giao dich dong-roi-mo trong repository la dung
-- voi MOT nguoi ghi; unique mot phan nay la thu duy nhat dung voi HAI nguoi ghi cung luc.
CREATE UNIQUE INDEX "TransportRunAssignment_activeRun_key"
  ON "TransportRunAssignment"("runId") WHERE "effectiveTo" IS NULL;
