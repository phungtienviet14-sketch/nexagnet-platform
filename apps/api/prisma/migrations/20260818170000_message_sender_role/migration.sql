-- Pha 1 — lich su hoi thoai co nhan vai.
-- `direction` da duoc them o 20260815140000_message_direction nhung thieu trong schema.prisma;
-- migration nay chi bo sung `senderRole` + index cua so hoi thoai.
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "senderRole" TEXT NOT NULL DEFAULT 'customer';

-- Cua so hoi thoai doc theo (chatId, sentAt DESC) — khong co index nay thi moi tin phai quet ca nhom.
CREATE INDEX IF NOT EXISTS "Message_chatId_sentAt_idx" ON "Message"("chatId", "sentAt");
