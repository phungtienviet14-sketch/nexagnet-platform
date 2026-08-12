-- DATA-5: versioned price periods. Preserve all old rows without inventing a month.
CREATE TYPE "PricePeriodStatus" AS ENUM ('draft', 'active', 'archived');

CREATE TABLE "PricePeriod" (
    "id" TEXT NOT NULL,
    "validMonth" TEXT,
    "status" "PricePeriodStatus" NOT NULL DEFAULT 'draft',
    "source" TEXT,
    "note" TEXT,
    "createdBy" TEXT,
    "activatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "activatedAt" TIMESTAMP(3),
    CONSTRAINT "PricePeriod_pkey" PRIMARY KEY ("id")
);

INSERT INTO "PricePeriod" ("id", "validMonth", "status", "source", "updatedAt", "activatedAt")
SELECT 'migrated-' || replace("validMonth", '-', ''), "validMonth", 'active'::"PricePeriodStatus", 'migration', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Price"
WHERE "validMonth" IS NOT NULL
GROUP BY "validMonth";

INSERT INTO "PricePeriod" ("id", "validMonth", "status", "source", "updatedAt")
SELECT 'migrated-unassigned', NULL, 'archived'::"PricePeriodStatus", 'migration', CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "Price" WHERE "validMonth" IS NULL);

ALTER TABLE "Price" ADD COLUMN "id" TEXT;
ALTER TABLE "Price" ADD COLUMN "periodId" TEXT;

UPDATE "Price"
SET "id" = 'migrated-price-' || md5("sku" || coalesce("validMonth", 'unassigned')),
    "periodId" = CASE
      WHEN "validMonth" IS NULL THEN 'migrated-unassigned'
      ELSE 'migrated-' || replace("validMonth", '-', '')
    END;

ALTER TABLE "Price" DROP CONSTRAINT "Price_pkey";
ALTER TABLE "Price" DROP COLUMN "validMonth";
ALTER TABLE "Price" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "Price" ALTER COLUMN "periodId" SET NOT NULL;
ALTER TABLE "Price" ADD CONSTRAINT "Price_pkey" PRIMARY KEY ("id");
ALTER TABLE "Price" ADD CONSTRAINT "Price_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PricePeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Price_periodId_sku_key" ON "Price"("periodId", "sku");
CREATE INDEX "Price_sku_idx" ON "Price"("sku");
CREATE INDEX "PricePeriod_validMonth_idx" ON "PricePeriod"("validMonth");
CREATE INDEX "PricePeriod_status_idx" ON "PricePeriod"("status");
CREATE UNIQUE INDEX "PricePeriod_one_active_per_month" ON "PricePeriod"("validMonth") WHERE "status" = 'active' AND "validMonth" IS NOT NULL;
