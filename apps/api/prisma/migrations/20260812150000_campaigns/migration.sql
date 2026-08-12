-- Durable campaign lifecycle and per-target delivery ledger.
CREATE TYPE "CampaignStatus" AS ENUM ('draft', 'approved', 'scheduled', 'running', 'completed', 'partially_failed', 'cancelled');
CREATE TYPE "CampaignDeliveryStatus" AS ENUM ('pending', 'claimed', 'sent', 'failed', 'cancelled');
CREATE TYPE "CampaignKind" AS ENUM ('one_off', 'recurring', 'birthday', 'lunar_month_start', 'lunar_full_moon');

CREATE TABLE "Campaign" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "kind" "CampaignKind" NOT NULL DEFAULT 'one_off',
  "templateKey" TEXT,
  "recurrence" JSONB,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "status" "CampaignStatus" NOT NULL DEFAULT 'draft',
  "approvedBy" TEXT,
  "approvedAt" TIMESTAMP(3),
  "windowStart" TIMESTAMP(3),
  "windowEnd" TIMESTAMP(3),
  "scheduledAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CampaignTarget" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "groupId" TEXT,
  "chatId" TEXT NOT NULL,
  "displayName" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignTarget_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CampaignDelivery" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "status" "CampaignDeliveryStatus" NOT NULL DEFAULT 'pending',
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "nextAttemptAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "claimedAt" TIMESTAMP(3),
  "claimedBy" TEXT,
  "claimExpiresAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "lastError" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CampaignDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CampaignTarget_campaignId_chatId_key" ON "CampaignTarget"("campaignId", "chatId");
CREATE INDEX "CampaignTarget_groupId_idx" ON "CampaignTarget"("groupId");
CREATE UNIQUE INDEX "CampaignDelivery_targetId_key" ON "CampaignDelivery"("targetId");
CREATE UNIQUE INDEX "CampaignDelivery_idempotencyKey_key" ON "CampaignDelivery"("idempotencyKey");
CREATE INDEX "Campaign_status_scheduledAt_idx" ON "Campaign"("status", "scheduledAt");
CREATE INDEX "CampaignDelivery_status_scheduledFor_nextAttemptAt_idx" ON "CampaignDelivery"("status", "scheduledFor", "nextAttemptAt");
CREATE INDEX "CampaignDelivery_claimExpiresAt_idx" ON "CampaignDelivery"("claimExpiresAt");
CREATE INDEX "CampaignDelivery_campaignId_status_idx" ON "CampaignDelivery"("campaignId", "status");

ALTER TABLE "CampaignTarget" ADD CONSTRAINT "CampaignTarget_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignTarget" ADD CONSTRAINT "CampaignTarget_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CampaignDelivery" ADD CONSTRAINT "CampaignDelivery_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignDelivery" ADD CONSTRAINT "CampaignDelivery_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "CampaignTarget"("id") ON DELETE CASCADE ON UPDATE CASCADE;
