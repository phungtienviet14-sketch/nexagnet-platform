-- Pha 6 — mach hoi thoai theo TUNG KHACH trong mot nhom (21/08/2026).
--
-- Khoa duy nhat la (chatId, senderExternalId), KHONG phai chatId: mot nhom Zalo co 200 dai ly
-- cung ban tin, khoa theo nhom nghia la cau tra loi "20 cai" cua nguoi nay dien vao don nhap cua
-- nguoi kia. Day la bat bien cua ca tinh nang, nen no duoc dat o tang DB chu khong chi trong code.
CREATE TABLE IF NOT EXISTS "ConversationThread" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "senderExternalId" TEXT NOT NULL,
    "senderDisplayName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'collecting',
    "draft" JSONB NOT NULL,
    "awaitingSlots" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "askCount" INTEGER NOT NULL DEFAULT 0,
    "lastQuestion" TEXT,
    "lastOrderId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationThread_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ConversationThread_chatId_senderExternalId_key"
    ON "ConversationThread"("chatId", "senderExternalId");

-- Console liet ke "dang cho ai tra loi gi" trong mot nhom.
CREATE INDEX IF NOT EXISTS "ConversationThread_chatId_status_idx"
    ON "ConversationThread"("chatId", "status");

-- Don dep mach het han: quet theo moc het han, khong quet ca bang.
CREATE INDEX IF NOT EXISTS "ConversationThread_expiresAt_idx"
    ON "ConversationThread"("expiresAt");
