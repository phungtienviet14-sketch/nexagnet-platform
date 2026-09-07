-- CreateEnum
CREATE TYPE "TransportOperationalProofKind" AS ENUM ('START', 'DELIVERY');

-- CreateEnum
CREATE TYPE "TransportProofPhotoCaptureMode" AS ENUM ('LIVE_CAMERA', 'GALLERY', 'UNKNOWN');

-- HAI CAU LENH DA BI GO KHOI BAN SINH TU DONG, CO Y — LAN THU HAI.
--
-- `prisma migrate diff` lai sinh:
--   ALTER TABLE "DealerPriceOverride" ALTER COLUMN "updatedAt" DROP DEFAULT;
--   ALTER TABLE "User"                ALTER COLUMN "updatedAt" DROP DEFAULT;
--
-- Do la do lech CO SAN giua lich su migration va lieu do, tren hai bang cua HAI MIEN KHAC. Lan
-- truoc (`20260907170000_transport_proof_tracking`) chung cung da bi go, va bai kiem
-- "KHONG dong vao bang cua mien khac" da bat dung chung o lan nay.
--
-- Chung se con quay lai o moi lan `migrate diff` cho toi khi chu so huu hai bang do viet mot
-- migration RIENG. Do la viec cua ho, khong phai cua mot tranche van tai.

-- CreateTable
CREATE TABLE "TransportOperationalProof" (
    "id" TEXT NOT NULL,
    "kind" "TransportOperationalProofKind" NOT NULL,
    "tripId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "observationId" TEXT NOT NULL,
    "sessionId" TEXT,
    "clientEventId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "businessDate" VARCHAR(10) NOT NULL,
    "note" TEXT,
    "recordedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMP(3),
    "withdrawnBy" TEXT,

    CONSTRAINT "TransportOperationalProof_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportProofPhoto" (
    "id" TEXT NOT NULL,
    "proofId" TEXT NOT NULL,
    "locator" TEXT NOT NULL,
    "captureMode" "TransportProofPhotoCaptureMode" NOT NULL DEFAULT 'UNKNOWN',
    "contentType" TEXT,
    "byteSize" INTEGER,
    "capturedAt" TIMESTAMP(3),
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMP(3),
    "withdrawnBy" TEXT,

    CONSTRAINT "TransportProofPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TransportOperationalProof_observationId_key" ON "TransportOperationalProof"("observationId");

-- CreateIndex
CREATE INDEX "TransportOperationalProof_tripId_kind_idx" ON "TransportOperationalProof"("tripId", "kind");

-- CreateIndex
CREATE INDEX "TransportOperationalProof_driverId_businessDate_idx" ON "TransportOperationalProof"("driverId", "businessDate");

-- CreateIndex
CREATE INDEX "TransportOperationalProof_businessDate_idx" ON "TransportOperationalProof"("businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "TransportOperationalProof_trip_kind_event_key" ON "TransportOperationalProof"("tripId", "kind", "clientEventId");

-- CreateIndex
CREATE INDEX "TransportProofPhoto_proofId_idx" ON "TransportProofPhoto"("proofId");

-- CreateIndex
CREATE INDEX "TransportProofPhoto_proofId_withdrawnAt_idx" ON "TransportProofPhoto"("proofId", "withdrawnAt");

-- AddForeignKey
ALTER TABLE "TransportOperationalProof" ADD CONSTRAINT "TransportOperationalProof_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "TransportTrip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportOperationalProof" ADD CONSTRAINT "TransportOperationalProof_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "TransportDriver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportOperationalProof" ADD CONSTRAINT "TransportOperationalProof_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "TransportLocationObservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportProofPhoto" ADD CONSTRAINT "TransportProofPhoto_proofId_fkey" FOREIGN KEY ("proofId") REFERENCES "TransportOperationalProof"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- RANG BUOC TANG LUU TRU — `transport-operational-proof-storage.spec.ts` doc CHINH TEP NAY.
-- ---------------------------------------------------------------------------------------------

ALTER TABLE "TransportOperationalProof"
  ADD CONSTRAINT "TransportOperationalProof_businessDate_iso"
  CHECK ("businessDate" ~ '^\d{4}-\d{2}-\d{2}$');

-- Ma su kien rong lam khoa chan bam-hai-lan vo hieu: moi chung cu rong se dung chung mot khoa.
ALTER TABLE "TransportOperationalProof"
  ADD CONSTRAINT "TransportOperationalProof_clientEventId_not_blank"
  CHECK (btrim("clientEventId") <> '');

-- BIA MO phai co CA HAI hoac KHONG CO GI.
--
-- Mot chung cu bi rut ma khong biet AI rut la mot ban ghi khong tra loi duoc cau hoi duy nhat
-- nguoi ta se hoi khi mo no ra sau nay. Va mot `withdrawnBy` khong kem `withdrawnAt` thi khong
-- noi duoc chung cu con hieu luc hay khong.
ALTER TABLE "TransportOperationalProof"
  ADD CONSTRAINT "TransportOperationalProof_withdrawal_shape"
  CHECK (("withdrawnAt" IS NULL AND "withdrawnBy" IS NULL) OR ("withdrawnAt" IS NOT NULL AND "withdrawnBy" IS NOT NULL));

ALTER TABLE "TransportProofPhoto"
  ADD CONSTRAINT "TransportProofPhoto_withdrawal_shape"
  CHECK (("withdrawnAt" IS NULL AND "withdrawnBy" IS NULL) OR ("withdrawnAt" IS NOT NULL AND "withdrawnBy" IS NOT NULL));

ALTER TABLE "TransportProofPhoto"
  ADD CONSTRAINT "TransportProofPhoto_locator_not_blank"
  CHECK (btrim("locator") <> '');

ALTER TABLE "TransportProofPhoto"
  ADD CONSTRAINT "TransportProofPhoto_byteSize_positive"
  CHECK ("byteSize" IS NULL OR "byteSize" > 0);

