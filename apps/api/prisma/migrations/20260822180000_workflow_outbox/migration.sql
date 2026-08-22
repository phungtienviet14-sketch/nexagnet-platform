-- Outbox giao dich cho workflow engine (22/08/2026).
--
-- Bai toan: `Order` commit vao Postgres nghiep vu, roi tien trinh chet TRUOC khi kip goi engine.
-- Hai ben nam o hai co so du lieu khac nhau nen khong co giao dich chung; bat ky thiet ke
-- "commit xong roi goi engine" nao cung co cua so nay va no khong thu ve 0 duoc.
--
-- Hang duoi day duoc ghi TRONG CUNG `$transaction` voi thay doi nghiep vu, nen chet o dau cung
-- nhat quan: chet truoc commit thi ca hai khong ton tai; chet sau commit thi hang van con va
-- tick sau gui no di.
--
-- THEM MOI HOAN TOAN (additive-only): khong sua bang/cot nao dang co, nen rollback code khong
-- keo theo rollback DB.

CREATE TYPE "WorkflowOutboxStatus" AS ENUM ('pending', 'claimed', 'dispatched', 'failed', 'cancelled');

CREATE TABLE IF NOT EXISTS "WorkflowOutbox" (
    "id" TEXT NOT NULL,
    -- Khoa thao tac cua Nexagnet. Chinh rang buoc UNIQUE nay lam cho "xep hai lan" vo hai.
    "operationKey" TEXT NOT NULL,
    "workflowKey" TEXT NOT NULL,
    -- Ghim tai thoi diem XEP HANG: su kien cua hom qua phai chay bang phien ban cua hom qua.
    "workflowVersion" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "metadata" JSONB NOT NULL,
    "traceId" TEXT,
    "status" "WorkflowOutboxStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL,
    "baseBackoffSeconds" INTEGER NOT NULL,
    "nextAttemptAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "claimedBy" TEXT,
    "claimExpiresAt" TIMESTAMP(3),
    "dispatchedAt" TIMESTAMP(3),
    "engineRunId" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowOutbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WorkflowOutbox_operationKey_key" ON "WorkflowOutbox"("operationKey");

-- Duong doc chinh cua dispatcher: hang dang cho va da toi han.
CREATE INDEX IF NOT EXISTS "WorkflowOutbox_status_nextAttemptAt_idx" ON "WorkflowOutbox"("status", "nextAttemptAt");
-- Thu hoi lease cua worker da chet.
CREATE INDEX IF NOT EXISTS "WorkflowOutbox_claimExpiresAt_idx" ON "WorkflowOutbox"("claimExpiresAt");
-- Tra cuu tu console: "don nay da giao cho engine chua?".
CREATE INDEX IF NOT EXISTS "WorkflowOutbox_entityType_entityId_idx" ON "WorkflowOutbox"("entityType", "entityId");
