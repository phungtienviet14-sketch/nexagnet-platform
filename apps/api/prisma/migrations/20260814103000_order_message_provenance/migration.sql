-- Preserve the legacy Order.messageId pointer while adding complete multi-message provenance.
CREATE TABLE "OrderMessage" (
    "orderId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderMessage_pkey" PRIMARY KEY ("orderId", "messageId")
);

CREATE INDEX "OrderMessage_messageId_idx" ON "OrderMessage"("messageId");

ALTER TABLE "OrderMessage"
  ADD CONSTRAINT "OrderMessage_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderMessage"
  ADD CONSTRAINT "OrderMessage_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "OrderMessage" ("orderId", "messageId")
SELECT "id", "messageId" FROM "Order" WHERE "messageId" IS NOT NULL
ON CONFLICT ("orderId", "messageId") DO NOTHING;
