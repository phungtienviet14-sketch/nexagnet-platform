-- SO CAI QUYET DINH NGHIEP VU (Business Decision Ledger v0) — DI CHUYEN THUAN THEM MOI.
--
-- KHONG mot dong nao trong tep nay dung toi mot bang da co. Khong DROP, khong ALTER cot cu,
-- khong doi kieu, khong reset. Ba bang moi + bon enum moi + cac khoa ngoai cua chinh chung.
--
-- MOC THOI GIAN: 20260831030000 nam SAU ca hai di chuyen 20260830140000 (source_management_foundation
-- va transport_costing) da co tren main. HAI di chuyen do TRUNG moc thoi gian nhau — do la binh
-- thuong va khong hong gi, vi Prisma dinh danh mot di chuyen bang CA TEN THU MUC chu khong bang
-- moc thoi gian. Dung suy ra tu do rang moc thoi gian la du de dinh danh.
--
-- KHOA NGOAI DUY NHAT CHI RA NGOAI khoi cum nay la
--   BusinessDecisionFactRef.factId -> BusinessFact.id  ON DELETE RESTRICT
-- CO Y dung RESTRICT chu khong CASCADE hay SET NULL: mot ban su that DA TUNG duoc dung de ra
-- quyet dinh thi khong con xoa duoc. CASCADE se xoa mat chinh bang chung; SET NULL se de lai mot
-- quyet dinh "dua tren mot su that khong ten" — ca hai deu la viet lai lich su.
--
-- Bang khong co hang nao truoc khi ap, nen khong co du lieu nao can chuyen doi.

-- CreateEnum
CREATE TYPE "BusinessDecisionStatus" AS ENUM ('RECORDED', 'SUPERSEDED', 'CORRECTED');

-- CreateEnum
CREATE TYPE "BusinessDecisionActorKind" AS ENUM ('DETERMINISTIC_RULE', 'HUMAN', 'LLM_RECOMMENDATION', 'SYSTEM_CONSEQUENCE');

-- CreateEnum
CREATE TYPE "BusinessDecisionCriticality" AS ENUM ('FINANCIAL_OR_AUTHORIZATION', 'BUSINESS_STANDARD', 'ADVISORY');

-- CreateEnum
CREATE TYPE "BusinessDecisionRelationKind" AS ENUM ('PARENT_DECISION', 'APPROVAL', 'RESULTING_ENTITY');

-- CreateTable
CREATE TABLE "BusinessDecision" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "decisionPoint" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorKind" "BusinessDecisionActorKind" NOT NULL,
    "actorRef" TEXT,
    "criticality" "BusinessDecisionCriticality" NOT NULL DEFAULT 'BUSINESS_STANDARD',
    "policyRef" TEXT,
    "policyVersion" TEXT,
    "modelProvider" TEXT,
    "modelRef" TEXT,
    "releaseSha" TEXT,
    "traceId" TEXT,
    "spanId" TEXT,
    "workflowRunId" TEXT,
    "approvalRef" TEXT,
    "status" "BusinessDecisionStatus" NOT NULL DEFAULT 'RECORDED',
    "idempotencyKey" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "supersedesId" TEXT,
    "detail" JSONB,

    CONSTRAINT "BusinessDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessDecisionFactRef" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "factId" TEXT NOT NULL,
    "factDomain" TEXT NOT NULL,
    "factKey" TEXT NOT NULL,
    "factStatusAtUse" TEXT NOT NULL,
    "sourceId" TEXT,
    "sourceKey" TEXT,
    "sourceVersion" TEXT,

    CONSTRAINT "BusinessDecisionFactRef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessDecisionRelation" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "kind" "BusinessDecisionRelationKind" NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "BusinessDecisionRelation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BusinessDecision_supersedesId_key" ON "BusinessDecision"("supersedesId");

-- CreateIndex
CREATE INDEX "BusinessDecision_tenantId_subjectType_subjectId_occurredAt_idx" ON "BusinessDecision"("tenantId", "subjectType", "subjectId", "occurredAt");

-- CreateIndex
CREATE INDEX "BusinessDecision_tenantId_decisionPoint_occurredAt_idx" ON "BusinessDecision"("tenantId", "decisionPoint", "occurredAt");

-- CreateIndex
CREATE INDEX "BusinessDecision_tenantId_traceId_idx" ON "BusinessDecision"("tenantId", "traceId");

-- CreateIndex
CREATE INDEX "BusinessDecision_tenantId_workflowRunId_idx" ON "BusinessDecision"("tenantId", "workflowRunId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessDecision_tenantId_idempotencyKey_key" ON "BusinessDecision"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "BusinessDecisionFactRef_factId_idx" ON "BusinessDecisionFactRef"("factId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessDecisionFactRef_decisionId_factId_key" ON "BusinessDecisionFactRef"("decisionId", "factId");

-- CreateIndex
CREATE INDEX "BusinessDecisionRelation_targetType_targetId_idx" ON "BusinessDecisionRelation"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessDecisionRelation_decisionId_kind_targetType_targetI_key" ON "BusinessDecisionRelation"("decisionId", "kind", "targetType", "targetId");

-- AddForeignKey
ALTER TABLE "BusinessDecision" ADD CONSTRAINT "BusinessDecision_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "BusinessDecision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessDecisionFactRef" ADD CONSTRAINT "BusinessDecisionFactRef_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "BusinessDecision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessDecisionFactRef" ADD CONSTRAINT "BusinessDecisionFactRef_factId_fkey" FOREIGN KEY ("factId") REFERENCES "BusinessFact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessDecisionRelation" ADD CONSTRAINT "BusinessDecisionRelation_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "BusinessDecision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

