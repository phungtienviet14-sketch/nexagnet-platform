-- KHONG dung toi mot bang nao da co. Di chuyen thuan THEM MOI.
--
-- Prisma sinh ra o day them hai dong sua bang CO SAN:
--   ALTER TABLE "DealerPriceOverride" ALTER COLUMN "updatedAt" DROP DEFAULT;
--   ALTER TABLE "User"                ALTER COLUMN "updatedAt" DROP DEFAULT;
--
-- CA HAI DA BI GO BO KHOI DAY, co chu y. Chung khong phai he qua cua thay doi nay: hai bang do
-- da lech san tren `main` tu 12/08/2026 (migration 20260812154500 va 20260812162000 dat
-- DEFAULT CURRENT_TIMESTAMP, con schema khai `@updatedAt` khong kem `@default`). Bat ky lan
-- `migrate dev` nao tren `main` hom nay cung sinh ra dung hai dong do.
--
-- `DealerPriceOverride` thuoc quyen mot task khac (xem muc 20 hop dong nhiem vu) — task nen tang
-- khong duoc sua no. Va cuon mot ban va cham cua bang khac vao mot di chuyen "them moi" se lam
-- nguoi doc PR khong con doc duoc pham vi that cua no.
--
-- Do lech nay VAN CON MO va can mot chu so huu rieng.

-- CreateEnum
CREATE TYPE "SourceStatus" AS ENUM ('RECEIVED', 'NORMALIZED', 'REVIEWED', 'APPROVED', 'EFFECTIVE', 'SUPERSEDED', 'REJECTED', 'QUARANTINED');

-- CreateEnum
CREATE TYPE "SourceOrigin" AS ENUM ('CUSTOMER_PROVIDED', 'CUSTOMER_SIGNED', 'INTERNAL_DERIVED', 'INTERNAL_TEST', 'THIRD_PARTY');

-- CreateEnum
CREATE TYPE "SourceAuthority" AS ENUM ('L1_CONTRACTUAL', 'L2_CUSTOMER_PUBLISHED', 'L3_CUSTOMER_INTERNAL', 'L4_PRE_CONTRACT', 'L5_DERIVED');

-- CreateEnum
CREATE TYPE "DataClassification" AS ENUM ('PUBLIC', 'INTERNAL', 'BUSINESS_SENSITIVE', 'PII', 'SECRET');

-- CreateEnum
CREATE TYPE "ApprovalLevel" AS ENUM ('INTERNAL_ACCEPTED', 'CUSTOMER_CONFIRMED');

-- CreateEnum
CREATE TYPE "BusinessFactStatus" AS ENUM ('PROPOSED', 'WORKING_ASSUMPTION', 'CONFIRMED', 'SUPERSEDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "BusinessConflictStatus" AS ENUM ('OPEN', 'RESOLVED', 'SUPERSEDED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "BusinessConflictImpact" AS ENUM ('BLOCKING', 'DEGRADING', 'ADVISORY');

-- AlterTable

-- AlterTable

-- CreateTable
CREATE TABLE "BusinessSource" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "origin" "SourceOrigin" NOT NULL,
    "authority" "SourceAuthority" NOT NULL,
    "classification" "DataClassification" NOT NULL,
    "status" "SourceStatus" NOT NULL DEFAULT 'RECEIVED',
    "locator" TEXT,
    "contentHash" TEXT,
    "byteSize" INTEGER,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "supersedesId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessFact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "status" "BusinessFactStatus" NOT NULL DEFAULT 'PROPOSED',
    "classification" "DataClassification" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceLocus" TEXT,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "assumptionRationale" TEXT,
    "assumptionRisk" TEXT,
    "assumptionReversibility" TEXT,
    "assumptionOwner" TEXT,
    "supersedesId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessFact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessConflict" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conflictKey" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "subjectKey" TEXT,
    "summary" TEXT NOT NULL,
    "impact" "BusinessConflictImpact" NOT NULL DEFAULT 'BLOCKING',
    "status" "BusinessConflictStatus" NOT NULL DEFAULT 'OPEN',
    "recommendedFactId" TEXT,
    "recommendationReason" TEXT,
    "resolvedFactId" TEXT,
    "resolutionActor" TEXT,
    "resolutionRef" TEXT,
    "resolutionNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessConflict_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessConflictFact" (
    "conflictId" TEXT NOT NULL,
    "factId" TEXT NOT NULL,

    CONSTRAINT "BusinessConflictFact_pkey" PRIMARY KEY ("conflictId","factId")
);

-- CreateTable
CREATE TABLE "BusinessApproval" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "level" "ApprovalLevel" NOT NULL,
    "actor" TEXT NOT NULL,
    "evidenceRef" TEXT NOT NULL,
    "note" TEXT,
    "sourceId" TEXT,
    "factId" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessRequiredFact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requiresConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessRequiredFact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BusinessSource_supersedesId_key" ON "BusinessSource"("supersedesId");

-- CreateIndex
CREATE INDEX "BusinessSource_tenantId_status_idx" ON "BusinessSource"("tenantId", "status");

-- CreateIndex
CREATE INDEX "BusinessSource_tenantId_sourceKey_receivedAt_idx" ON "BusinessSource"("tenantId", "sourceKey", "receivedAt");

-- CreateIndex
CREATE INDEX "BusinessSource_tenantId_classification_idx" ON "BusinessSource"("tenantId", "classification");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessSource_tenantId_sourceKey_contentHash_key" ON "BusinessSource"("tenantId", "sourceKey", "contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessFact_supersedesId_key" ON "BusinessFact"("supersedesId");

-- CreateIndex
CREATE INDEX "BusinessFact_tenantId_domain_key_status_idx" ON "BusinessFact"("tenantId", "domain", "key", "status");

-- CreateIndex
CREATE INDEX "BusinessFact_tenantId_status_idx" ON "BusinessFact"("tenantId", "status");

-- CreateIndex
CREATE INDEX "BusinessFact_sourceId_idx" ON "BusinessFact"("sourceId");

-- CreateIndex
CREATE INDEX "BusinessConflict_tenantId_status_impact_idx" ON "BusinessConflict"("tenantId", "status", "impact");

-- CreateIndex
CREATE INDEX "BusinessConflict_tenantId_domain_subjectKey_idx" ON "BusinessConflict"("tenantId", "domain", "subjectKey");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessConflict_tenantId_conflictKey_key" ON "BusinessConflict"("tenantId", "conflictKey");

-- CreateIndex
CREATE INDEX "BusinessConflictFact_factId_idx" ON "BusinessConflictFact"("factId");

-- CreateIndex
CREATE INDEX "BusinessApproval_tenantId_decidedAt_idx" ON "BusinessApproval"("tenantId", "decidedAt");

-- CreateIndex
CREATE INDEX "BusinessApproval_sourceId_idx" ON "BusinessApproval"("sourceId");

-- CreateIndex
CREATE INDEX "BusinessApproval_factId_idx" ON "BusinessApproval"("factId");

-- CreateIndex
CREATE INDEX "BusinessRequiredFact_tenantId_capability_idx" ON "BusinessRequiredFact"("tenantId", "capability");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessRequiredFact_tenantId_capability_domain_key_key" ON "BusinessRequiredFact"("tenantId", "capability", "domain", "key");

-- AddForeignKey
ALTER TABLE "BusinessSource" ADD CONSTRAINT "BusinessSource_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "BusinessSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessFact" ADD CONSTRAINT "BusinessFact_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "BusinessSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessFact" ADD CONSTRAINT "BusinessFact_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "BusinessFact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessConflictFact" ADD CONSTRAINT "BusinessConflictFact_conflictId_fkey" FOREIGN KEY ("conflictId") REFERENCES "BusinessConflict"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessConflictFact" ADD CONSTRAINT "BusinessConflictFact_factId_fkey" FOREIGN KEY ("factId") REFERENCES "BusinessFact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessApproval" ADD CONSTRAINT "BusinessApproval_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "BusinessSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessApproval" ADD CONSTRAINT "BusinessApproval_factId_fkey" FOREIGN KEY ("factId") REFERENCES "BusinessFact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
