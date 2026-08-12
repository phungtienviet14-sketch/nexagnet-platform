-- DATA-6: runtime dealer status/metadata, effective private deals, and append-only remap history.
CREATE TYPE "DealerStatus" AS ENUM ('active', 'inactive');

ALTER TABLE "Dealer"
  ADD COLUMN "status" "DealerStatus" NOT NULL DEFAULT 'active',
  ADD COLUMN "metadata" JSONB;

ALTER TABLE "DealerPriceOverride"
  ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "effectiveFrom" TIMESTAMP(3),
  ADD COLUMN "effectiveTo" TIMESTAMP(3),
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "DealerPriceOverride_enabled_effectiveFrom_effectiveTo_idx"
  ON "DealerPriceOverride"("enabled", "effectiveFrom", "effectiveTo");

CREATE TABLE "GroupMappingHistory" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "previousDealerId" TEXT,
  "nextDealerId" TEXT,
  "previousStatus" "GroupMappingStatus" NOT NULL,
  "nextStatus" "GroupMappingStatus" NOT NULL,
  "source" TEXT NOT NULL,
  "actor" TEXT NOT NULL,
  "requestId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GroupMappingHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GroupMappingHistory_groupId_createdAt_idx"
  ON "GroupMappingHistory"("groupId", "createdAt");

ALTER TABLE "GroupMappingHistory"
  ADD CONSTRAINT "GroupMappingHistory_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "Group"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
