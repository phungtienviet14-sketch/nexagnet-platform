-- CreateEnum
CREATE TYPE "CustomerRank" AS ENUM ('dai_ly', 'ctv', 'khach_le', 'unknown');

-- CreateEnum
CREATE TYPE "OperationalRole" AS ENUM ('khach_hang', 'sale', 'ke_toan', 'quan_ly', 'ksnb', 'bpvh', 'ky_thuat', 'unknown');

-- CreateEnum
CREATE TYPE "ParticipantHandlingMode" AS ENUM ('inherit_group', 'process', 'ignore', 'manual_review');

-- CreateEnum
CREATE TYPE "ParticipantSource" AS ENUM ('zca_sync', 'manual');

-- CreateEnum
CREATE TYPE "RuleConfigStatus" AS ENUM ('draft', 'preview', 'active', 'archived');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "ruleConfigVersion" INTEGER;

-- CreateTable
CREATE TABLE "GroupParticipant" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "externalUserId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "zaloName" TEXT,
    "avatarUrl" TEXT,
    "customerRank" "CustomerRank" NOT NULL DEFAULT 'unknown',
    "operationalRole" "OperationalRole" NOT NULL DEFAULT 'unknown',
    "handlingMode" "ParticipantHandlingMode" NOT NULL DEFAULT 'inherit_group',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "source" "ParticipantSource" NOT NULL DEFAULT 'zca_sync',
    "lastSeenAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleConfigVersion" (
    "id" TEXT NOT NULL,
    "version" SERIAL NOT NULL,
    "status" "RuleConfigStatus" NOT NULL DEFAULT 'draft',
    "payload" JSONB NOT NULL,
    "createdBy" TEXT,
    "activatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),

    CONSTRAINT "RuleConfigVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GroupParticipant_groupId_externalUserId_key" ON "GroupParticipant"("groupId", "externalUserId");

-- CreateIndex
CREATE INDEX "GroupParticipant_groupId_active_idx" ON "GroupParticipant"("groupId", "active");

-- CreateIndex
CREATE INDEX "GroupParticipant_externalUserId_idx" ON "GroupParticipant"("externalUserId");

-- CreateIndex
CREATE UNIQUE INDEX "RuleConfigVersion_version_key" ON "RuleConfigVersion"("version");

-- CreateIndex
CREATE INDEX "RuleConfigVersion_status_idx" ON "RuleConfigVersion"("status");

-- Only one active configuration is permitted; drafts and archives may coexist.
CREATE UNIQUE INDEX "RuleConfigVersion_one_active_key" ON "RuleConfigVersion"("status") WHERE "status" = 'active';

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actor_idx" ON "AuditLog"("actor");

-- AddForeignKey
ALTER TABLE "GroupParticipant" ADD CONSTRAINT "GroupParticipant_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
