-- `transport-toll` (`TX-08` mo rong, Lane J / #269) — NAP DU LIEU ETC (VETC / ePass).
--
-- KHONG bang nao o day sinh cong no, phai tra hay mot but toan nao. ETC la CONG TY TRA
-- (#229 §8, #237), va khong bang nao co cot `driverId`.
--
-- Nghien cuu + phan loai bang chung: `docs/kien-truc/transport-etc-ingestion.md`

-- CreateEnum
CREATE TYPE "TransportTollProvider" AS ENUM ('VETC', 'EPASS', 'OTHER');

-- CreateEnum
CREATE TYPE "TransportTollSourceKind" AS ENUM ('API', 'STATEMENT_FILE', 'INVOICE_PDF', 'MANUAL');

-- CreateEnum
CREATE TYPE "TransportTollTransactionKind" AS ENUM ('TOLL_PASS', 'TOP_UP', 'ACCOUNT_FEE', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "TransportTollLinkProvenance" AS ENUM ('MANUAL', 'STATEMENT_DECLARED');

-- CreateEnum
CREATE TYPE "TransportTollParseStatus" AS ENUM ('ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TransportTollRejectReason" AS ENUM ('TOLL_ROW_UNPARSEABLE', 'TOLL_ROW_MISSING_AMOUNT', 'TOLL_ROW_AMOUNT_INVALID', 'TOLL_ROW_MISSING_DATE', 'TOLL_ROW_DATE_INVALID', 'TOLL_ROW_ACCOUNT_MISSING', 'TOLL_ROW_PLATE_MISSING', 'TOLL_ROW_KIND_UNKNOWN');

-- CreateEnum
CREATE TYPE "TransportTollMatchState" AS ENUM ('MATCHED', 'ACCOUNT_UNRESOLVED', 'VEHICLE_UNRESOLVED', 'AMBIGUOUS', 'DUPLICATE_CANDIDATE');

-- CreateEnum
CREATE TYPE "TransportTollReviewState" AS ENUM ('PENDING', 'CONFIRMED', 'REOPENED');

-- CreateEnum
CREATE TYPE "TransportTollReviewAction" AS ENUM ('RESOLVE_VEHICLE', 'CONFIRM', 'FLAG_DUPLICATE', 'CLEAR_DUPLICATE', 'REOPEN');

-- CreateTable
CREATE TABLE "TransportTollAccount" (
    "id" TEXT NOT NULL,
    "provider" "TransportTollProvider" NOT NULL,
    "accountNo" TEXT NOT NULL,
    "holderName" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportTollAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportTollAccountVehicleLink" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "providerVehicleRef" TEXT,
    "effectiveFrom" VARCHAR(10) NOT NULL,
    "effectiveTo" VARCHAR(10),
    "provenance" "TransportTollLinkProvenance" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3),
    "closedBy" TEXT,

    CONSTRAINT "TransportTollAccountVehicleLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportTollImport" (
    "id" TEXT NOT NULL,
    "provider" "TransportTollProvider" NOT NULL,
    "sourceKind" "TransportTollSourceKind" NOT NULL,
    "sourceLabel" TEXT NOT NULL,
    "sourceDigest" VARCHAR(64) NOT NULL,
    "periodStart" VARCHAR(10),
    "periodEnd" VARCHAR(10),
    "rowCount" INTEGER NOT NULL,
    "acceptedCount" INTEGER NOT NULL,
    "rejectedCount" INTEGER NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedBy" TEXT NOT NULL,

    CONSTRAINT "TransportTollImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportTollTransactionCandidate" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "provider" "TransportTollProvider" NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "parseStatus" "TransportTollParseStatus" NOT NULL,
    "rejectReason" "TransportTollRejectReason",
    "accountNoRaw" TEXT NOT NULL,
    "accountId" TEXT,
    "kind" "TransportTollTransactionKind",
    "vehiclePlateRaw" TEXT NOT NULL,
    "vehicleId" TEXT,
    "passedAt" TIMESTAMP(3),
    "businessDate" VARCHAR(10),
    "signedAmount" BIGINT,
    "currencyCode" VARCHAR(3) NOT NULL DEFAULT 'VND',
    "stationLabel" TEXT,
    "providerRef" TEXT,
    "fingerprint" VARCHAR(64),
    "matchState" "TransportTollMatchState",
    "reviewState" "TransportTollReviewState" NOT NULL DEFAULT 'PENDING',
    "duplicateOfCandidateId" TEXT,
    "rawValues" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportTollTransactionCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportTollReviewDecision" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "action" "TransportTollReviewAction" NOT NULL,
    "actor" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "previousVehicleId" TEXT,
    "nextVehicleId" TEXT,
    "previousMatchState" "TransportTollMatchState",
    "nextMatchState" "TransportTollMatchState",
    "duplicateOfCandidateId" TEXT,

    CONSTRAINT "TransportTollReviewDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TransportTollAccount_provider_accountNo_key" ON "TransportTollAccount"("provider", "accountNo");

-- CreateIndex
CREATE INDEX "TransportTollAccount_provider_active_idx" ON "TransportTollAccount"("provider", "active");

-- CreateIndex
CREATE INDEX "TransportTollAccountVehicleLink_accountId_effectiveTo_idx" ON "TransportTollAccountVehicleLink"("accountId", "effectiveTo");

-- CreateIndex
CREATE INDEX "TransportTollAccountVehicleLink_vehicleId_effectiveTo_idx" ON "TransportTollAccountVehicleLink"("vehicleId", "effectiveTo");

-- CreateIndex
CREATE UNIQUE INDEX "TransportTollImport_provider_sourceDigest_key" ON "TransportTollImport"("provider", "sourceDigest");

-- CreateIndex
CREATE INDEX "TransportTollImport_provider_importedAt_idx" ON "TransportTollImport"("provider", "importedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TransportTollTransactionCandidate_importId_rowNumber_key" ON "TransportTollTransactionCandidate"("importId", "rowNumber");

-- CreateIndex
CREATE INDEX "TransportTollTransactionCandidate_provider_fingerprint_idx" ON "TransportTollTransactionCandidate"("provider", "fingerprint");

-- CreateIndex
CREATE INDEX "TransportTollTransactionCandidate_accountId_businessDate_idx" ON "TransportTollTransactionCandidate"("accountId", "businessDate");

-- CreateIndex
CREATE INDEX "TransportTollTransactionCandidate_matchState_reviewState_idx" ON "TransportTollTransactionCandidate"("matchState", "reviewState");

-- CreateIndex
CREATE INDEX "TransportTollTransactionCandidate_vehicleId_businessDate_idx" ON "TransportTollTransactionCandidate"("vehicleId", "businessDate");

-- CreateIndex
CREATE INDEX "TransportTollReviewDecision_candidateId_at_idx" ON "TransportTollReviewDecision"("candidateId", "at");

-- CreateIndex
CREATE INDEX "TransportTollReviewDecision_actor_at_idx" ON "TransportTollReviewDecision"("actor", "at");

-- AddForeignKey
ALTER TABLE "TransportTollAccountVehicleLink" ADD CONSTRAINT "TransportTollAccountVehicleLink_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TransportTollAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportTollAccountVehicleLink" ADD CONSTRAINT "TransportTollAccountVehicleLink_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "TransportVehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportTollTransactionCandidate" ADD CONSTRAINT "TransportTollTransactionCandidate_importId_fkey" FOREIGN KEY ("importId") REFERENCES "TransportTollImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportTollTransactionCandidate" ADD CONSTRAINT "TransportTollTransactionCandidate_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TransportTollAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportTollTransactionCandidate" ADD CONSTRAINT "TransportTollTransactionCandidate_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "TransportVehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportTollReviewDecision" ADD CONSTRAINT "TransportTollReviewDecision_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "TransportTollTransactionCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =====================================================================
-- BAT BIEN PHAP LY — ND 119/2024/ND-CP Dieu 11 khoan 3
--
--   "Moi tai khoan giao thong co the su dung de chi tra cho NHIEU phuong tien tham gia giao thong
--    thuoc so huu cua chu phuong tien; moi phuong tien tham gia giao thong CHI DUOC NHAN CHI TRA
--    TU MOT TAI KHOAN GIAO THONG."
--
-- Nua sau la thu duoc cuong che o day. Mot xe chi duoc co DUNG MOT doan dang mo, KE CA khi hai
-- doan do thuoc HAI TAI KHOAN KHAC NHAU — nen unique nay dat tren `vehicleId` mot minh, khong
-- tren `(accountId, vehicleId)`. Dat tren cap se cho phep dung cai ma dieu luat cam.
--
-- NHIEU doan DA DONG cua cung mot xe van ghi duoc — do chinh la lich su "xe doi tai khoan" ma
-- #269 J2 doi phai giu.
CREATE UNIQUE INDEX "TransportTollAccountVehicleLink_activeVehicle_key"
  ON "TransportTollAccountVehicleLink"("vehicleId")
  WHERE "effectiveTo" IS NULL;

-- Mot khoang thoi gian phai di ve phia truoc. Khac `TransportVehicleOwnershipInterest` o mot cho:
-- o day HAI DAU DEU TINH (ngay nghiep vu, khong phai khoanh khac), nen mot doan mot ngay
-- (`from == to`) la hop le va co that — mot chiec xe doi tai khoan trong ngay.
ALTER TABLE "TransportTollAccountVehicleLink"
  ADD CONSTRAINT "TransportTollAccountVehicleLink_period_order"
  CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom");

-- Tien di ra ngoai bang JSON, va `number` cua JavaScript chi dem chinh xac toi 2^53-1. Cho DB rong
-- hon mien se lam mot hang doc len khong con bieu dien duoc — va no hong luc DOC, cho khong ai nhin.
ALTER TABLE "TransportTollTransactionCandidate"
  ADD CONSTRAINT "TransportTollTransactionCandidate_amount_range"
  CHECK ("signedAmount" IS NULL OR "signedAmount" BETWEEN -9007199254740991 AND 9007199254740991);

-- Mot dong DOC DUOC phai co du ngay, so tien va loai; mot dong BI TU CHOI phai noi duoc vi sao.
-- Hai menh de nay chan dung mot thu: mot hang "da doc duoc" nhung rong ruot, thu se di tiep vao
-- vong phan loai roi khop voi mot cai gi do.
ALTER TABLE "TransportTollTransactionCandidate"
  ADD CONSTRAINT "TransportTollTransactionCandidate_parse_shape"
  CHECK (
    ("parseStatus" = 'ACCEPTED' AND "rejectReason" IS NULL
      AND "businessDate" IS NOT NULL AND "signedAmount" IS NOT NULL AND "kind" IS NOT NULL)
    OR
    ("parseStatus" = 'REJECTED' AND "rejectReason" IS NOT NULL)
  );
